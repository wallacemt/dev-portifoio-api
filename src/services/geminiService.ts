import Gemini from "gemini-ai-sdk";
import { Exception } from "../utils/exception";
import { GeminiResponse } from "../types/aiTypes";
import { env } from "../env";
import { QuotaManager } from "../utils/quotaManager";

const gemini = new Gemini(env.GEMINI_API_KEY || "");

interface CacheItem {
  data: Object;
  timestamp: number;
  expires: number;
}

export class TranslationService {
  private static cache = new Map<string, CacheItem>();
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000;
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY = 1000; 

  private static getCacheKey(obj: Object, language: string, sourceLang: string): string {
    return `${JSON.stringify(obj)}_${sourceLang}_${language}`;
  }

  private static isQuotaError(error: any): boolean {
    return (
      error.status === 429 ||
      (typeof error.message === "string" && error.message.includes("quota")) ||
      (typeof error.message === "string" && error.message.includes("Too Many Requests"))
    );
  }

  private static async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static extractRetryDelay(error: any): number {
    try {
      if (error.errorDetails) {
        const retryInfo = error.errorDetails.find(
          (detail: any) => detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
        );
        if (retryInfo?.retryDelay) {
          const delayStr = retryInfo.retryDelay.replace("s", "");
          return parseInt(delayStr) * 1000; 
        }
      }
    } catch (e) {
      console.warn("Could not extract retry delay from error:", e);
    }
    return 60000; 
  }

  public async translateObject(obj: Object, lenguage: string, sourceLeng = "pt"): Promise<Object> {
    if (!lenguage || lenguage === sourceLeng || !obj) return obj;
    const cacheKey = TranslationService.getCacheKey(obj, lenguage, sourceLeng);
    const cached = TranslationService.cache.get(cacheKey);

    if (cached && Date.now() < cached.expires) {
      console.log("Translation cache hit for:", lenguage);
      return cached.data;
    }
    const canMakeRequest = await QuotaManager.canMakeRequest();
    if (!canMakeRequest) {
      console.warn("Cannot make Gemini API request due to quota limits. Returning original object.");
      return obj;
    }
    this.cleanCache();

    const jsonString = JSON.stringify(obj);
    const prompt = `
    Translate the following JSON object's string values from ${sourceLeng} to ${lenguage}, preserving keys and structure. Do NOT translate keys or non-text values, if key for title translate value it to ${lenguage} (Translate all text values only the text inside the quotes).:
    ${jsonString}
    `;

    return this.translateWithRetry(prompt, cacheKey, obj);
  }

  private async translateWithRetry(prompt: string, cacheKey: string, originalObj: Object): Promise<Object> {
    let lastError: any;

    for (let attempt = 1; attempt <= TranslationService.MAX_RETRIES; attempt++) {
      try {
        QuotaManager.recordRequest();

        const resp = await gemini.ask(prompt, { model: "gemini-2.0-flash" });
        const response = resp as GeminiResponse;
        const text = response.response.candidates![0].content.parts[0].text;
        const jsonText = text.replace(/```json|```/g, "").trim();

        try {
          const translatedObj = JSON.parse(jsonText);
          QuotaManager.recordSuccess();
          TranslationService.cache.set(cacheKey, {
            data: translatedObj,
            timestamp: Date.now(),
            expires: Date.now() + TranslationService.CACHE_DURATION,
          });

          return translatedObj;
        } catch (parseError) {
          console.error("Resposta inválida do Gemini: ", response);
          QuotaManager.recordFailure(false);
          throw new Exception("Não foi possível interpretar a tradução", 500);
        }
      } catch (error) {
        lastError = error;
        const isQuotaError = TranslationService.isQuotaError(error);
        QuotaManager.recordFailure(isQuotaError);

        console.error(`Translation attempt ${attempt} failed:`, error);

        if (isQuotaError) {
          if (attempt === TranslationService.MAX_RETRIES) {
            console.warn("Translation quota exceeded, returning original object");
            return originalObj;
          }
          const retryDelay = TranslationService.extractRetryDelay(error);
          const backoffDelay = TranslationService.BASE_DELAY * Math.pow(2, attempt - 1);
          const delayTime = Math.max(retryDelay, backoffDelay);

          console.log(`Quota exceeded, waiting ${delayTime}ms before retry ${attempt + 1}`);
          await TranslationService.delay(delayTime);
        } else {
          break;
        }
      }
    }
    console.error("Error ao usar geminiAI após todas as tentativas", lastError);
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
  public static clearCache(): void {
    TranslationService.cache.clear();
    console.log("Translation cache cleared");
  }  public static getCacheStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(TranslationService.cache.entries()).map(([key, item]) => ({
      key: key.substring(0, 50) + "...", 
      age: Math.round((now - item.timestamp) / 1000 / 60), 
    }));

    return {
      size: TranslationService.cache.size,
      entries,
    };
  }
}
