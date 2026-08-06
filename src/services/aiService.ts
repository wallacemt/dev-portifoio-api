import { env } from "../env";
import { prisma } from "../prisma/prismaClient";
import type { OpenRouterChatCompletionResponse, OpenRouterModel } from "../types/aiTypes";
import { devDebugger } from "../utils/devDebugger";
import { Exception } from "../utils/exception";
import {
  extractJsonFromText,
  findMismatchPath,
  JsonExtractionError,
  validateTranslationShape,
} from "../utils/jsonExtractor";
import { QuotaManager } from "../utils/quotaManager";
import { getRedisClient } from "../utils/redisClient";
import { TranslationCache } from "./translationCacheService";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

const MODELS_CACHE_KEY = "openrouter:free-models";
const MODELS_CACHE_TTL_SECONDS = 60 * 60; // 1h — the free model catalog barely changes intra-day

// In-memory fallback for when Redis isn't configured, mirroring TranslationCache's pattern.
let memCachedModels: { data: OpenRouterModel[]; expires: number } | null = null;

// ponytail: single-tenant app (one portfolio owner), so "the owner's model"
// is just `prisma.owner.findFirst()` — no per-owner keying needed. Revisit
// if this ever becomes multi-tenant.
const OWNER_MODEL_CACHE_KEY = "owner:ai-model";
const OWNER_MODEL_CACHE_TTL_SECONDS = 120; // short: owner can change this via PATCH /ai-config anytime
const OWNER_MODEL_LOOKUP_TIMEOUT_MS = 2000; // bounds a slow/unreachable DB so translation never hangs on it
let memCachedOwnerModel: { value: string | null; expires: number } | null = null;

const FREE_MODEL_SUFFIX_REGEX = /:free$/i;

// `:free` OpenRouter models routinely ignore `response_format`, so requesting
// JSON mode from them buys nothing and would give a false sense of safety.
// `extractJsonFromText` (tolerant text scanning) is the real, primary parser
// for every model — this only adds a best-effort hint for models that might
// honor it.
function supportsJsonMode(model: string): boolean {
  return !FREE_MODEL_SUFFIX_REGEX.test(model);
}

class OpenRouterError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

export class TranslationService {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY = 1000;
  private static readonly MAX_TOKENS_PER_REQUEST = 2000;
  private static readonly MAX_CHUNK_SIZE = 6000;
  // Deduplicates concurrent requests for the same translation
  private static readonly inflight = new Map<string, Promise<object>>();

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private static isObjectTooLarge(obj: object): boolean {
    const jsonString = JSON.stringify(obj);
    const estimatedTokens = TranslationService.estimateTokens(jsonString);
    return (
      estimatedTokens > TranslationService.MAX_TOKENS_PER_REQUEST ||
      jsonString.length > TranslationService.MAX_CHUNK_SIZE
    );
  }

  //biome-ignore lint: type any
  private static chunkArray(arr: any[]): any[][] {
    //biome-ignore lint: type any
    const chunks: any[][] = [];
    //biome-ignore lint: type any
    let currentChunk: any[] = [];
    let currentSize = 2;

    for (const item of arr) {
      const itemSize = JSON.stringify(item).length;
      if (currentSize + itemSize > TranslationService.MAX_CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push([...currentChunk]);
        currentChunk = [];
        currentSize = 2;
      }
      currentChunk.push(item);
      currentSize += itemSize;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks.length > 0 ? chunks : [arr];
  }

  private static chunkObject(obj: object): object[] {
    if (Array.isArray(obj)) return TranslationService.chunkArray(obj);

    const chunks: object[] = [];
    let currentChunk: Record<string, object> = {};
    let currentSize = 2;

    for (const [key, value] of Object.entries(obj)) {
      const entrySize = JSON.stringify({ [key]: value }).length;
      if (currentSize + entrySize > TranslationService.MAX_CHUNK_SIZE && Object.keys(currentChunk).length > 0) {
        chunks.push({ ...currentChunk });
        currentChunk = {};
        currentSize = 2;
      }
      currentChunk[key] = value;
      currentSize += entrySize;
    }
    if (Object.keys(currentChunk).length > 0) chunks.push(currentChunk);
    return chunks.length > 0 ? chunks : [obj];
  }

  private static mergeChunks(originalObj: object, translatedChunks: object[]): object {
    if (Array.isArray(originalObj)) {
      //biome-ignore lint: type any
      const result: any[] = [];
      for (const chunk of translatedChunks) {
        if (Array.isArray(chunk)) result.push(...chunk);
      }
      return result;
    }
    //biome-ignore lint: type any
    const result: Record<string, any> = {};
    for (const chunk of translatedChunks) {
      if (typeof chunk === "object" && chunk !== null && !Array.isArray(chunk)) {
        Object.assign(result, chunk);
      }
    }
    return result;
  }

  private static isQuotaError(error: { status?: number; message?: string }): boolean {
    return (
      error.status === 429 ||
      (typeof error.message === "string" && error.message.includes("quota")) ||
      (typeof error.message === "string" && error.message.includes("Too Many Requests"))
    );
  }

  private static async delay(ms: number): Promise<void> {
    return await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async translateObject(obj: object, lenguage: string, sourceLeng = "pt"): Promise<object> {
    if (!lenguage || lenguage === sourceLeng || !obj) return obj;

    const cacheKey = TranslationCache.makeKey(obj, lenguage, sourceLeng);
    const cached = await TranslationCache.get(cacheKey);
    if (cached) {
      devDebugger(`Translation cache hit for: ${lenguage}`);
      return cached;
    }

    // Return the same in-progress promise for concurrent identical requests
    const existing = TranslationService.inflight.get(cacheKey);
    if (existing) {
      devDebugger(`Joining in-flight translation for: ${lenguage}`);
      return existing;
    }

    const promise = this._translate(obj, lenguage, sourceLeng,  cacheKey);
    TranslationService.inflight.set(cacheKey, promise);
    promise.finally(() => TranslationService.inflight.delete(cacheKey));
    return promise;
  }

  private async _translate(
    obj: object,
    lenguage: string,
    sourceLeng: string, 
    cacheKey: string,
  ): Promise<object> {
    // Same short-circuit GET /owner/private/ai-config already reports via
    // `available: false` — no key means no IA, not a 500. Checked before
    // the quota gate/chunking/fetch so a missing key never reaches
    // `callOpenRouter` (whose own check is just defense-in-depth for other
    // callers) and is never confused with a genuine provider error.
    if (!TranslationService.isConfigured()) {
      devDebugger("OPENROUTER_API_KEY não configurada — pulando tradução e retornando objeto original", undefined, "warn");
      return obj;
    }

    const canMakeRequest = await QuotaManager.canMakeRequest();
    if (!canMakeRequest) {
      devDebugger("Cannot make AI API request due to quota limits. Returning original object.", undefined, "warn");
      return obj;
    }

    if (TranslationService.isObjectTooLarge(obj)) {
      devDebugger(`Object too large, splitting into chunks for translation to ${lenguage}`);
      return await this.translateLargeObject(obj, lenguage, sourceLeng);
    }

    const jsonString = JSON.stringify(obj);
    const prompt = this.buildTranslationPrompt(jsonString, lenguage, sourceLeng);
    return await this.translateWithRetry(prompt, cacheKey, obj);
  }

  private async translateLargeObject(
    obj: object,
    language: string,
    sourceLang: string,
  ): Promise<object> {
    try {
      const chunks = TranslationService.chunkObject(obj);
      devDebugger(`Divided object into ${chunks.length} chunks for translation`);

      const translatedChunks: object[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;

        const chunkCacheKey = TranslationCache.makeKey({ chunk, index: i }, language, sourceLang);
        //biome-ignore lint/nursery/noAwaitInLoop: chunks must be processed sequentially to respect rate limits
        const cachedChunk = await TranslationCache.get(chunkCacheKey);
        if (cachedChunk) {
          devDebugger(`Cache hit for chunk ${i + 1}/${chunks.length}`);
          translatedChunks.push(cachedChunk);
          continue;
        }

        //biome-ignore lint: await is correct
        const canMakeRequest = await QuotaManager.canMakeRequest();
        if (!canMakeRequest) {
          devDebugger(`Cannot translate chunk ${i + 1}, quota exceeded. Using original chunk.`, undefined, "warn");
          translatedChunks.push(chunk);
          continue;
        }

        devDebugger(`Translating chunk ${i + 1}/${chunks.length}`);
        const chunkPrompt = this.buildTranslationPrompt(JSON.stringify(chunk), language, sourceLang);

        try {
          const translatedChunk = await this.translateWithRetry(chunkPrompt, chunkCacheKey, chunk);
          translatedChunks.push(translatedChunk);
        } catch (error) {
          devDebugger(`Failed to translate chunk ${i + 1}, using original:`, error, "warn");
          translatedChunks.push(chunk);
        }

        if (i < chunks.length - 1) await TranslationService.delay(500);
      }

      const mergedResult = TranslationService.mergeChunks(obj, translatedChunks);
      const finalCacheKey = TranslationCache.makeKey(obj, language, sourceLang);
      await TranslationCache.set(finalCacheKey, mergedResult);

      devDebugger(`Successfully translated large object with ${chunks.length} chunks`);
      return mergedResult;
    } catch (error) {
      devDebugger("Error translating large object:", error, "error");
      return obj;
    }
  }

  private buildTranslationPrompt(jsonString: string, language: string, sourceLang: string): string {
    // Best-effort hint reinforcing exact key preservation. `validateTranslationShape`
    // is the real enforcement; this only nudges the model in that direction.
    let keyConstraint = "";
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        if (keys.length > 0) {
          keyConstraint = `\n- The output object MUST contain EXACTLY these top-level keys and no others: ${keys.join(", ")}`;
        }
      }
    } catch {
      /* ignore — jsonString may be an array */
    }

    return `
Translate JSON string values from ${sourceLang} to ${language}.

Rules:
- Output valid JSON only.
- No explanations.
- No markdown.
- Keep identical structure.
- Keep all keys unchanged.
- Translate only natural language strings.
- Do not translate names, URLs, emails, IDs, dates or file paths.
- Keep numbers, booleans and null unchanged.${keyConstraint}

${jsonString}
`;
  }

  /**
   * Calls OpenRouter's OpenAI-compatible chat completions endpoint via
   * native `fetch` (Bun runtime — no SDK dependency).
   */
  private static async callOpenRouter(prompt: string, model: string): Promise<string> {
    if (!env.OPENROUTER_API_KEY) {
      throw new Exception("OPENROUTER_API_KEY não configurada", 500);
    }

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      top_p: 0.1,
      max_tokens: 8192,
    };
    if (supportsJsonMode(model)) body.response_format = { type: "json_object" };

    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.SELF_URL,
        "X-Title": "Portfolio API - Translation Service",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new OpenRouterError(response.status, `OpenRouter request failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as OpenRouterChatCompletionResponse;
    if (data.error) throw new OpenRouterError(500, data.error.message);

    return (data.choices?.[0]?.message?.content ?? "").trim();
  }

  //biome-ignore lint: necessary
  private async translateWithRetry(basePrompt: string, cacheKey: string, originalObj: object): Promise<object> {
    let lastError: unknown;
    const model = await TranslationService.resolveModel();

    for (let attempt = 1; attempt <= TranslationService.MAX_RETRIES; attempt++) {
      try {
        await QuotaManager.recordRequest();

        devDebugger(`[OpenRouter Pre Ask]: using model ${model}`);
        //biome-ignore lint: necessary
        const text = await TranslationService.callOpenRouter(basePrompt, model);

        if (!text) throw new Error("Resposta vazia do modelo");

        devDebugger(`[OpenRouter Response]: ${text}`);
        const parsed = extractJsonFromText(text) as object;
        const normalised = JSON.parse(JSON.stringify(originalObj)) as object;

        if (!validateTranslationShape(normalised, parsed)) {
          const where = findMismatchPath(normalised, parsed);
          devDebugger(`Shape mismatch at: ${where}`);
          throw new Error("Translation shape mismatch");
        }

        QuotaManager.recordSuccess();
        await TranslationCache.set(cacheKey, parsed);
        return parsed;
      } catch (error) {
        lastError = error;
        const isQuotaError = TranslationService.isQuotaError(error as { status?: number; message?: string });
        QuotaManager.recordFailure(isQuotaError);

        if (!isQuotaError) {
          let reason = "format/parse";
          if (error instanceof JsonExtractionError) reason = "extraction";
          else if (error instanceof Error && error.message.includes("shape")) reason = "shape mismatch";
          devDebugger(`Attempt ${attempt} failed (${reason}). Retrying...`);
          if (attempt < TranslationService.MAX_RETRIES) {
            await TranslationService.delay(TranslationService.BASE_DELAY * attempt);
            continue;
          }
          break;
        }

        if (attempt === TranslationService.MAX_RETRIES) {
          devDebugger("Quota exceeded, returning original object", originalObj, "warn");
          return originalObj;
        }

        const backoffDelay = TranslationService.BASE_DELAY * 2 ** (attempt - 1);
        devDebugger(`Quota exceeded, waiting ${backoffDelay}ms before retry ${attempt + 1}`);
        await TranslationService.delay(backoffDelay);
      }
    }

    devDebugger("Erro final após retries, retornando original", lastError, "error");
    return originalObj;
  }

  static async clearCache(): Promise<void> {
    await TranslationCache.clearAll();
  }

  static async getCacheStats() {
    return await TranslationCache.stats();
  }

  static isConfigured(): boolean {
    return Boolean(env.OPENROUTER_API_KEY);
  }

  /**
   * Resolves which model a translation call should use, in order:
   * the owner's configured `aiModel` → `env.AI_MODEL` (which itself
   * defaults to the hardcoded free Gemma model — see env.ts).
   *
   * Public translation routes (most of the 8 callers) have no `req.userId`,
   * so this reads the single owner directly rather than threading an id
   * through every caller.
   */
  static async resolveModel(): Promise<string> {
    const ownerModel = await TranslationService.getOwnerModel();
    return ownerModel || env.AI_MODEL;
  }

  private static async getOwnerModel(): Promise<string | null> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(OWNER_MODEL_CACHE_KEY);
        // Empty string is the cached sentinel for "owner has no aiModel set".
        if (cached !== null) return cached || null;
      } catch (err) {
        devDebugger(`Redis get error (owner model cache): ${(err as Error).message}`, undefined, "warn");
      }
    } else if (memCachedOwnerModel && Date.now() < memCachedOwnerModel.expires) {
      return memCachedOwnerModel.value;
    }

    try {
      // A slow/unreachable DB must never hang a translation request — bound
      // the lookup and fall back to env.AI_MODEL if it doesn't answer in time.
      const owner = await Promise.race([
        prisma.owner.findFirst({ select: { aiModel: true } }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out resolving owner.aiModel")), OWNER_MODEL_LOOKUP_TIMEOUT_MS),
        ),
      ]);
      const model = owner?.aiModel ?? null;

      if (redis) {
        try {
          await redis.set(OWNER_MODEL_CACHE_KEY, model ?? "", "EX", OWNER_MODEL_CACHE_TTL_SECONDS);
        } catch (err) {
          devDebugger(`Redis set error (owner model cache): ${(err as Error).message}`, undefined, "warn");
        }
      } else {
        memCachedOwnerModel = { value: model, expires: Date.now() + OWNER_MODEL_CACHE_TTL_SECONDS * 1000 };
      }

      return model;
    } catch (error) {
      // A DB hiccup shouldn't block translation — fall back to env.AI_MODEL.
      devDebugger("Erro ao buscar aiModel do owner:", error, "warn");
      return null;
    }
  }

  /** Called after `PATCH /owner/private/ai-config` so the new model applies immediately. */
  static async invalidateOwnerModelCache(): Promise<void> {
    memCachedOwnerModel = null;
    const redis = getRedisClient();
    if (!redis) return;
    try {
      await redis.del(OWNER_MODEL_CACHE_KEY);
    } catch (err) {
      devDebugger(`Redis del error (owner model cache): ${(err as Error).message}`, undefined, "warn");
    }
  }

  static async listModels(): Promise<OpenRouterModel[]> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(MODELS_CACHE_KEY);
        if (cached) return JSON.parse(cached) as OpenRouterModel[];
      } catch (err) {
        devDebugger(`Redis get error (models cache): ${(err as Error).message}`, undefined, "warn");
      }
    } else if (memCachedModels && Date.now() < memCachedModels.expires) {
      return memCachedModels.data;
    }

    try {
      const response = await fetch(OPENROUTER_MODELS_URL);
      if (!response.ok) throw new Error(`Erro ao buscar modelos: ${response.statusText}`);
      const data = (await response.json()) as { data: OpenRouterModel[] };
      const freeModels = data.data.filter((model) => model.pricing?.prompt === "0");

      if (redis) {
        try {
          await redis.set(MODELS_CACHE_KEY, JSON.stringify(freeModels), "EX", MODELS_CACHE_TTL_SECONDS);
        } catch (err) {
          devDebugger(`Redis set error (models cache): ${(err as Error).message}`, undefined, "warn");
        }
      } else {
        memCachedModels = { data: freeModels, expires: Date.now() + MODELS_CACHE_TTL_SECONDS * 1000 };
      }

      return freeModels;
    } catch (error) {
      devDebugger("Erro ao listar modelos do OpenRouter:", error, "error");
      throw new Exception("Não foi possível listar os modelos do OpenRouter", 500);
    }
  }

  /**
   * Validates a model id against the real, current OpenRouter free-model
   * catalog. Required before persisting any owner-supplied model string —
   * without this, `PATCH /owner/private/ai-config` would let a client write
   * an arbitrary value straight into the provider's `model` request field.
   */
  static async isValidModel(modelId: string): Promise<boolean> {
    if (!modelId) return false;
    const models = await TranslationService.listModels();
    return models.some((model) => model.id === modelId);
  }
}
