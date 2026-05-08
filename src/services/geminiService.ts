import Gemini from "gemini-ai-sdk";
import { env } from "../env";
import type { GeminiModel, GeminiResponse } from "../types/aiTypes";
import { devDebugger } from "../utils/devDebugger";
import { Exception } from "../utils/exception";
import {
  extractJsonFromText,
  findMismatchPath,
  JsonExtractionError,
  validateTranslationShape,
} from "../utils/jsonExtractor";
import { QuotaManager } from "../utils/quotaManager";
import { TranslationCache } from "./translationCacheService";

const gemini = new Gemini(env.GEMINI_API_KEY || "");
const GEMINI_MODEL = env.AI_MODEL;
const SUPPORTS_JSON_MIME = /^gemini-/i.test(GEMINI_MODEL);

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

  private static isQuotaError(error: { status: number; message: string }): boolean {
    return (
      error.status === 429 ||
      (typeof error.message === "string" && error.message.includes("quota")) ||
      (typeof error.message === "string" && error.message.includes("Too Many Requests"))
    );
  }

  private static async delay(ms: number): Promise<void> {
    return await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static extractRetryDelay(error: {
    errorDetails: { "@type": string; detail: string; retryDelay: string }[];
  }): number {
    try {
      if (error.errorDetails) {
        const retryInfo = error.errorDetails.find(
          (detail) => detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
        );
        if (retryInfo?.retryDelay) {
          const delayStr = retryInfo.retryDelay.replace("s", "");
          return Number.parseInt(delayStr, 10) * 1000;
        }
      }
    } catch (e) {
      devDebugger("Could not extract retry delay from error:", e, "warn");
    }
    return 60_000;
  }

  async translateObject(obj: object, lenguage: string, sourceLeng = "pt", aditionalPrompt?: string): Promise<object> {
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

    const promise = this._translate(obj, lenguage, sourceLeng, aditionalPrompt, cacheKey);
    TranslationService.inflight.set(cacheKey, promise);
    promise.finally(() => TranslationService.inflight.delete(cacheKey));
    return promise;
  }

  private async _translate(
    obj: object,
    lenguage: string,
    sourceLeng: string,
    aditionalPrompt: string | undefined,
    cacheKey: string,
  ): Promise<object> {
    const canMakeRequest = await QuotaManager.canMakeRequest();
    if (!canMakeRequest) {
      devDebugger("Cannot make Gemini API request due to quota limits. Returning original object.", undefined, "warn");
      return obj;
    }

    if (TranslationService.isObjectTooLarge(obj)) {
      devDebugger(`Object too large, splitting into chunks for translation to ${lenguage}`);
      return await this.translateLargeObject(obj, lenguage, sourceLeng, aditionalPrompt);
    }

    const jsonString = JSON.stringify(obj);
    const prompt = this.buildTranslationPrompt(jsonString, lenguage, sourceLeng, aditionalPrompt);
    return await this.translateWithRetry(prompt, cacheKey, obj);
  }

  private async translateLargeObject(
    obj: object,
    language: string,
    sourceLang: string,
    additionalPrompt?: string,
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
        const chunkPrompt = this.buildTranslationPrompt(JSON.stringify(chunk), language, sourceLang, additionalPrompt);

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

  private buildTranslationPrompt(
    jsonString: string,
    language: string,
    sourceLang: string,
    additionalPrompt?: string,
  ): string {
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

    const extra = additionalPrompt ? `\nAdditional rules: ${additionalPrompt}\n` : "";
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
- Keep numbers, booleans and null unchanged.

${jsonString}
`;
  }

  //biome-ignore lint: necessary
  private async translateWithRetry(basePrompt: string, cacheKey: string, originalObj: object): Promise<object> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= TranslationService.MAX_RETRIES; attempt++) {
      try {
        QuotaManager.recordRequest();

        const generationConfig: Record<string, unknown> = {
          temperature: 0,
          topP: 0.1,
          maxOutputTokens: 8192,
        };
        if (SUPPORTS_JSON_MIME) generationConfig.responseMimeType = "application/json";
        devDebugger(`[Gemini Pre Ask]: using model ${GEMINI_MODEL}`);
        //biome-ignore lint: necessary
        const resp = await gemini.ask(basePrompt, {
          model: GEMINI_MODEL,
          generationConfig: generationConfig as never,
        });
        const response = resp as GeminiResponse;
        const parts = response.response.candidates?.[0]?.content?.parts || [];
        const text = parts
          .map((p) => p.text || "")
          .join("")
          .trim();

        if (!text) throw new Error("Resposta vazia do modelo");

        devDebugger(`[Gemini Response]: ${text}`);
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
        const isQuotaError = TranslationService.isQuotaError(error as { status: number; message: string });
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

        const retryDelay = TranslationService.extractRetryDelay(
          error as { errorDetails: { "@type": string; detail: string; retryDelay: string }[] },
        );
        const backoffDelay = TranslationService.BASE_DELAY * 2 ** (attempt - 1);
        devDebugger(`Quota exceeded, waiting ${Math.max(retryDelay, backoffDelay)}ms before retry ${attempt + 1}`);
        await TranslationService.delay(Math.max(retryDelay, backoffDelay));
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

  static async listModels(): Promise<GeminiModel[]> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      if (!response.ok) throw new Error(`Erro ao buscar modelos: ${response.statusText}`);
      const data = (await response.json()) as { models: GeminiModel[] };
      return data.models.filter((model) => model.supportedGenerationMethods.includes("generateContent"));
    } catch (error) {
      devDebugger("Erro ao listar modelos do Gemini:", error, "error");
      throw new Exception("Não foi possível listar os modelos do Gemini", 500);
    }
  }
}
