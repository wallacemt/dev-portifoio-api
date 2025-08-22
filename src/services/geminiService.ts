import Gemini from "gemini-ai-sdk";
import { env } from "../env";
import type { GeminiResponse } from "../types/aiTypes";
import { Exception } from "../utils/exception";
import { QuotaManager } from "../utils/quotaManager";
import { devDebugger } from "../utils/devDebugger";

const gemini = new Gemini(env.GEMINI_API_KEY || "");

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
          (detail) => detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
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
    additionalPrompt?: string
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
    additionalPrompt?: string
  ): string {
    return `
    Traduza as seguintes cadeias de caracteres JSON do objeto de ${sourceLang} para ${language}, preservando as chaves e a estrutura. Não traduza as chaves ou valores não-textuais, se a chave for título ou descrição ou qualquer outro tipo que contenha bastante texto ou informação relevante, traduza o valor para ${language} (Traduza todos os valores de texto somente o texto dentro das aspas, se forem valores monetários, números ou chave de moeda, aplique a conversão da moeda para ${language}). REGRA: retorne json, sem texto adicional.${
      additionalPrompt ? `${additionalPrompt}\n` : ""
    }:
    ${jsonString}`;
  }

  private async translateWithRetry(prompt: string, cacheKey: string, originalObj: object): Promise<object> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= TranslationService.MAX_RETRIES; attempt++) {
      try {
        QuotaManager.recordRequest();
        //biome-ignore lint: using for caution function
        const resp = await gemini.ask(prompt, {
          model: "gemini-2.0-flash-lite",
        });
        const response = resp as GeminiResponse;
        const text = response.response.candidates?.[0]?.content?.parts[0]?.text;
        const jsonText = text?.replace(/```json|```/g, "").trim();

        try {
          if (!jsonText) {
            throw new Error("Resposta do Gemini não é um JSON válido");
          }
          const translatedObj = JSON.parse(jsonText);
          QuotaManager.recordSuccess();
          TranslationService.cache.set(cacheKey, {
            data: translatedObj,
            timestamp: Date.now(),
            expires: Date.now() + TranslationService.CACHE_DURATION,
          });

          return translatedObj;
        } catch (_err) {
          devDebugger(`Resposta inválida do Gemini: ${response}`);

          QuotaManager.recordFailure(false);
          throw new Exception("Não foi possível interpretar a tradução", 500);
        }
      } catch (error) {
        lastError = error;
        const isQuotaError = TranslationService.isQuotaError(error as { status: number; message: string });
        QuotaManager.recordFailure(isQuotaError);

        if (isQuotaError) {
          if (attempt === TranslationService.MAX_RETRIES) {
            devDebugger("Translation quota exceeded, returning original object", originalObj, "warn");

            return originalObj;
          }
          const retryDelay = TranslationService.extractRetryDelay(
            error as {
              errorDetails: { "@type": string; detail: string; retryDelay: string }[];
            }
          );
          const backoffDelay = TranslationService.BASE_DELAY * 2 ** (attempt - 1);
          const delayTime = Math.max(retryDelay, backoffDelay);
          devDebugger(`Quota exceeded, waiting ${delayTime}ms before retry ${attempt + 1}`);

          await TranslationService.delay(delayTime);
        } else {
          break;
        }
      }
    }
    devDebugger("Error ao usar geminiAI após todas as tentativas", lastError, "error");
    throw new Exception("Error na tradução", 500);
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
}
