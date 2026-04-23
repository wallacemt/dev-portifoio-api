import Gemini from "gemini-ai-sdk";
import { env } from "../env";
import type { GeminiResponse, GeminiModel } from "../types/aiTypes";
import { Exception } from "../utils/exception";
import { QuotaManager } from "../utils/quotaManager";
import { devDebugger } from "../utils/devDebugger";
const gemini = new Gemini(env.GEMINI_API_KEY || "");
const GEMINI_MODEL = env.AI_MODEL;
interface CacheItem {
  data: object;
  timestamp: number;
  expires: number;
}

export class TranslationService {
  private static cache = new Map<string, CacheItem>();
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000;
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY = 1000;

  private static readonly MAX_TOKENS_PER_REQUEST = 2000;
  private static readonly MAX_CHUNK_SIZE = 6000;

  /**
   * Estima o número de tokens aproximado baseado no comprimento do texto
   */
  static estimateTokens(text: string): number {
    // Estimativa: ~4 caracteres por token em média
    return Math.ceil(text.length / 4);
  }

  /**
   * Verifica se o objeto é muito grande para uma única requisição
   */
  private static isObjectTooLarge(obj: object): boolean {
    const jsonString = JSON.stringify(obj);
    const estimatedTokens = TranslationService.estimateTokens(jsonString);
    return (
      estimatedTokens > TranslationService.MAX_TOKENS_PER_REQUEST ||
      jsonString.length > TranslationService.MAX_CHUNK_SIZE
    );
  }

  /**
   * Divide um objeto grande em chunks menores baseado em suas propriedades
   */
  private static chunkObject(obj: object): object[] {
    if (Array.isArray(obj)) {
      return TranslationService.chunkArray(obj);
    }

    const entries = Object.entries(obj);
    const chunks: object[] = [];

    let currentChunk: Record<string, object> = {};
    let currentSize = 2; // Para as chaves {}

    for (const [key, value] of entries) {
      const entrySize = JSON.stringify({ [key]: value }).length;

      // Se adicionar esta entrada exceder o limite, finaliza o chunk atual
      if (currentSize + entrySize > TranslationService.MAX_CHUNK_SIZE && Object.keys(currentChunk).length > 0) {
        chunks.push({ ...currentChunk });
        currentChunk = {};
        currentSize = 2;
      }

      currentChunk[key] = value;
      currentSize += entrySize;
    }

    // Adiciona o último chunk se não estiver vazio
    if (Object.keys(currentChunk).length > 0) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [obj];
  }

  /**
   * Divide um array grande em chunks menores
   */
  //biome-ignore lint: this, type any
  private static chunkArray(arr: any[]): any[][] {
    //biome-ignore lint: this, type any
    const chunks: any[][] = [];
    //biome-ignore lint: this, type any
    let currentChunk: any[] = [];
    let currentSize = 2;

    for (const item of arr) {
      const itemSize = JSON.stringify(item).length;

      // Se adicionar este item exceder o limite, finaliza o chunk atual
      if (currentSize + itemSize > TranslationService.MAX_CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push([...currentChunk]);
        currentChunk = [];
        currentSize = 2;
      }

      currentChunk.push(item);
      currentSize += itemSize;
    }

    // Adiciona o último chunk se não estiver vazio
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [arr];
  }

  /**
   * Reconstrói o objeto original a partir dos chunks traduzidos
   */
  private static mergeChunks(originalObj: object, translatedChunks: object[]): object {
    if (Array.isArray(originalObj)) {
      //biome-ignore lint: this, type any
      const result: any[] = [];
      for (const chunk of translatedChunks) {
        if (Array.isArray(chunk)) {
          result.push(...chunk);
        }
      }
      return result;
    }
    // Se o original era um objeto, merge todas as propriedades
    //biome-ignore lint: this, type any
    const result: Record<string, any> = {};
    for (const chunk of translatedChunks) {
      if (typeof chunk === "object" && chunk !== null && !Array.isArray(chunk)) {
        Object.assign(result, chunk);
      }
    }
    return result;
  }

  private static getCacheKey(obj: object, language: string, sourceLang: string): string {
    return `${JSON.stringify(obj)}_${sourceLang}_${language}`;
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

    const cacheKey = TranslationService.getCacheKey(obj, lenguage, sourceLeng);
    const cached = TranslationService.cache.get(cacheKey);

    if (cached && Date.now() < cached.expires) {
      devDebugger(`Translation cache hit for: ${lenguage}`);
      return cached.data;
    }

    const canMakeRequest = await QuotaManager.canMakeRequest();
    if (!canMakeRequest) {
      devDebugger("Cannot make Gemini API request due to quota limits. Returning original object.", undefined, "warn");
      return obj;
    }

    this.cleanCache();

    // Verifica se o objeto é muito grande para uma única requisição
    if (TranslationService.isObjectTooLarge(obj)) {
      devDebugger(`Object too large, splitting into chunks for translation to ${lenguage}`);
      return await this.translateLargeObject(obj, lenguage, sourceLeng, aditionalPrompt);
    }

    // Tradução normal para objetos pequenos
    const jsonString = JSON.stringify(obj);
    const prompt = this.buildTranslationPrompt(jsonString, lenguage, sourceLeng, aditionalPrompt);

    return await this.translateWithRetry(prompt, cacheKey, obj);
  }

  /**
   * Traduz objetos grandes dividindo em chunks menores
   */
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

      // Traduz cada chunk individualmente
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue; // Skip undefined chunks

        const chunkCacheKey = TranslationService.getCacheKey({ chunk, index: i }, language, sourceLang);

        // Verifica cache para este chunk específico
        const cachedChunk = TranslationService.cache.get(chunkCacheKey);
        if (cachedChunk && Date.now() < cachedChunk.expires) {
          devDebugger(`Cache hit for chunk ${i + 1}/${chunks.length}`);
          translatedChunks.push(cachedChunk.data);
          continue;
        }

        //biome-ignore lint: this, await is correct
        const canMakeRequest = await QuotaManager.canMakeRequest();
        if (!canMakeRequest) {
          devDebugger(`Cannot translate chunk ${i + 1}, quota exceeded. Using original chunk.`, undefined, "warn");
          translatedChunks.push(chunk);
          continue;
        }

        devDebugger(`Translating chunk ${i + 1}/${chunks.length}`);

        const chunkJsonString = JSON.stringify(chunk);
        const chunkPrompt = this.buildTranslationPrompt(chunkJsonString, language, sourceLang, additionalPrompt);

        try {
          const translatedChunk = await this.translateWithRetry(chunkPrompt, chunkCacheKey, chunk);
          translatedChunks.push(translatedChunk);

          // Cache o chunk traduzido
          TranslationService.cache.set(chunkCacheKey, {
            data: translatedChunk,
            timestamp: Date.now(),
            expires: Date.now() + TranslationService.CACHE_DURATION,
          });
        } catch (error) {
          devDebugger(`Failed to translate chunk ${i + 1}, using original:`, error, "warn");
          translatedChunks.push(chunk);
        }

        // Pequena pausa entre chunks para não sobrecarregar a API
        if (i < chunks.length - 1) {
          await TranslationService.delay(500);
        }
      }

      // Reconstrói o objeto completo
      const mergedResult = TranslationService.mergeChunks(obj, translatedChunks);

      // Cache o resultado final
      const finalCacheKey = TranslationService.getCacheKey(obj, language, sourceLang);
      TranslationService.cache.set(finalCacheKey, {
        data: mergedResult,
        timestamp: Date.now(),
        expires: Date.now() + TranslationService.CACHE_DURATION,
      });

      devDebugger(`Successfully translated large object with ${chunks.length} chunks`);
      return mergedResult;
    } catch (error) {
      devDebugger("Error translating large object:", error, "error");
      return obj; // Retorna o objeto original em caso de erro
    }
  }

  /**
   * Constrói o prompt de tradução padronizado
   */
  private buildTranslationPrompt(
    jsonString: string,
    language: string,
    sourceLang: string,
    additionalPrompt?: string,
  ): string {
    return `You are a JSON transformer.

Translate all string values in the JSON from ${sourceLang} to ${language}.
- A Saida tem que ser um JSON valido e puro!
- Não precisar ter explicacoes, somente o json puro deve ser retornado!
       
${additionalPrompt ?? ""}

WHAT TO DO:
- Keep all keys exactly the same.
- Translate ONLY string values.
- Keep numbers, booleans, null unchanged.

INPUT:
${jsonString}

OUTPUT (strictly JSON, no text before or after): Exemple {} or []`;
  }
  //biome-ignore lint: this necessary
  private async translateWithRetry(basePrompt: string, cacheKey: string, originalObj: object): Promise<object> {
    let lastError: unknown;
    let prompt = basePrompt;

    for (let attempt = 1; attempt <= TranslationService.MAX_RETRIES; attempt++) {
      try {
        QuotaManager.recordRequest();
        //biome-ignore lint: this necessary
        const resp = await gemini.ask(prompt, {
          model: GEMINI_MODEL,
        });

        const response = resp as GeminiResponse;
        // 🔐 Extração segura do texto (evita quebra com múltiplos parts)
        const parts = response.response.candidates?.[0]?.content?.parts || [];
        const text = parts
          .map((p) => p.text || "")
          .join("")
          .trim();

        if (!text) {
          throw new Error("Resposta vazia do modelo");
        }

        devDebugger(`{ attempt:${attempt}, raw: ${text} }`);

        //  Se nem começa como JSON, força retry
        if (!(text.startsWith("{") || text.startsWith("["))) {
          throw new Error("Resposta não começou com JSON válido");
        }

        //  Parse resiliente
        const parsed = this.safeJSONParse(text);

        // ✅ sucesso
        QuotaManager.recordSuccess();

        TranslationService.cache.set(cacheKey, {
          data: parsed,
          timestamp: Date.now(),
          expires: Date.now() + TranslationService.CACHE_DURATION,
        });

        return parsed;
      } catch (error) {
        lastError = error;

        const isQuotaError = TranslationService.isQuotaError(error as { status: number; message: string });

        QuotaManager.recordFailure(isQuotaError);

        // 🧠 Se for erro de parse/formato → tenta corrigir com prompt mais rígido
        if (!isQuotaError) {
          devDebugger(`Attempt ${attempt} failed (format/parse). Retrying...`);

          if (attempt < TranslationService.MAX_RETRIES) {
            prompt = `${basePrompt}`;
            continue;
          }

          break;
        }

        // ⏳ tratamento de quota (mantido)
        if (isQuotaError) {
          if (attempt === TranslationService.MAX_RETRIES) {
            devDebugger("Quota exceeded, returning original object", originalObj, "warn");
            return originalObj;
          }

          const retryDelay = TranslationService.extractRetryDelay(
            error as {
              errorDetails: {
                "@type": string;
                detail: string;
                retryDelay: string;
              }[];
            },
          );

          const backoffDelay = TranslationService.BASE_DELAY * 2 ** (attempt - 1);

          const delayTime = Math.max(retryDelay, backoffDelay);

          devDebugger(`Quota exceeded, waiting ${delayTime}ms before retry ${attempt + 1}`);

          await TranslationService.delay(delayTime);
        }
      }
    }

    devDebugger("Erro final após retries, retornando original", lastError, "error");

    return originalObj;
  }
  private safeJSONParse(text: string) {
    devDebugger(text)
    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");

    let start = -1;

    if (firstBrace === -1) start = firstBracket;
    else if (firstBracket === -1) start = firstBrace;
    else start = Math.min(firstBrace, firstBracket);

    if (start === -1) {
      throw new Error("No JSON start found");
    }

    // tenta encontrar um JSON válido progressivamente
    for (let end = text.length; end > start; end--) {
      const candidate = text.slice(start, end);

      try {
        return JSON.parse(candidate);
      } catch (_) {
        // continua tentando
      }
    }

    throw new Error("No valid JSON could be parsed");
  }
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, item] of TranslationService.cache.entries()) {
      if (now >= item.expires) {
        TranslationService.cache.delete(key);
      }
    }
  }
  static clearCache(): void {
    TranslationService.cache.clear();
  }
  static getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number }>;
    chunkedTranslations: number;
  } {
    const now = Date.now();
    let chunkedTranslations = 0;

    const entries = Array.from(TranslationService.cache.entries()).map(([key, item]) => {
      // Conta traduções que foram divididas em chunks
      if (key.includes('"index"')) {
        chunkedTranslations++;
      }

      return {
        key: `${key.substring(0, 50)}...`,
        age: Math.round((now - item.timestamp) / 1000 / 60),
      };
    });

    return {
      size: TranslationService.cache.size,
      entries,
      chunkedTranslations,
    };
  }

  /**
   * Método para obter estatísticas de performance da tradução
   */
  static getTranslationStats(): {
    cacheSize: number;
    chunkedTranslations: number;
    estimatedTokensSaved: number;
  } {
    const stats = TranslationService.getCacheStats();

    const estimatedTokensSaved = Array.from(TranslationService.cache.values()).reduce((total, item) => {
      return total + TranslationService.estimateTokens(JSON.stringify(item.data));
    }, 0);

    return {
      cacheSize: stats.size,
      chunkedTranslations: stats.chunkedTranslations,
      estimatedTokensSaved,
    };
  }

  /**
   * Força limpeza de cache para traduções antigas ou chunks órfãos
   */
  static forceCleanCache(maxAge: number = 12 * 60 * 60 * 1000): void {
    // 12 horas padrão
    const now = Date.now();
    let removed = 0;

    for (const [key, item] of TranslationService.cache.entries()) {
      if (now - item.timestamp > maxAge) {
        TranslationService.cache.delete(key);
        removed++;
      }
    }

    devDebugger(`Force cleaned ${removed} old cache entries`);
  }

  /**
   * Lista os modelos disponíveis do Gemini, filtrando apenas os que suportam geração de texto
   */
  static async listModels(): Promise<GeminiModel[]> {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);

      if (!response.ok) {
        throw new Error(`Erro ao buscar modelos: ${response.statusText}`);
      }

      const data = (await response.json()) as { models: GeminiModel[] };

      // Filtra apenas modelos que suportam geração de conteúdo (texto)
      return data.models.filter((model) => model.supportedGenerationMethods.includes("generateContent"));
    } catch (error) {
      devDebugger("Erro ao listar modelos do Gemini:", error, "error");
      throw new Exception("Não foi possível listar os modelos do Gemini", 500);
    }
  }
}
