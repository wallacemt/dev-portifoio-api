import Gemini from "gemini-ai-sdk";
import { Exception } from "../utils/exception";
import { GeminiResponse } from "../types/aiTypes";
const gemini = new Gemini(process.env.GEMINI_API_KEY || "");

export class TranslationService {
  public async translateObject(obj: Object, lenguage: string, sourceLeng = "pt"): Promise<Object> {
    if (!lenguage || lenguage === sourceLeng || !obj) return obj;

    const jsonString = JSON.stringify(obj);

    const prompt = `
    Translate the following JSON object's  string values from ${sourceLeng} to ${lenguage}, preserving keys and structure. Do NOT translate keys or non-text values:
    ${jsonString}
    `;
    try {
      const resp = await gemini.ask(prompt, { model: "gemini-2.0-flash" });

      const response = resp as GeminiResponse;
      const text = response.response.candidates![0].content.parts[0].text;
      const jsonText = text.replace(/```json|```/g, "").trim();
      console.log(jsonText);
      try {
        return JSON.parse(jsonText);
      } catch (e) {
        console.error("Resposta inválida do Gemini: ", response);
        throw new Exception("Não foi possível interpretar a tradução", 500);
      }
    } catch (e) {
      console.error("Error ao usar geminiAI", e);
      throw new Exception("Error na tradução", 500);
    }
  }
}
