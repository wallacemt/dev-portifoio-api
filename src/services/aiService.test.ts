import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { TranslationService } from "./aiService";
import { QuotaManager } from "../utils/quotaManager";

/**
 * Integration tests for the OpenRouter-backed translation flow.
 *
 * `fetch` is mocked at the module boundary so these tests never hit the
 * network. They cover the response shapes OpenRouter's `:free` models are
 * known to produce (see `jsonExtractor.test.ts` for pure parsing cases) end
 * to end through `TranslationService.translateObject`.
 */
function mockChatCompletion(content: string) {
  return jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { role: "assistant", content } }] }),
  } as Response);
}

function mockChatCompletionError(status: number, body = "") {
  return jest.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status,
    statusText: "error",
    text: async () => body,
  } as Response);
}

describe("TranslationService.translateObject (OpenRouter flow)", () => {
  const original = { title: "Olá mundo", nested: { greeting: "Bom dia" } };

  beforeEach(async () => {
    // Rate limiting / daily-cap bookkeeping is QuotaManager's own concern —
    // these tests focus on request/response parsing, so keep the gate open.
    jest.spyOn(QuotaManager, "canMakeRequest").mockResolvedValue(true);
    // Every test reuses the same `original` object + language pair; without
    // clearing the cache, only the first test would ever call `fetch`.
    await TranslationService.clearCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses a ```json fenced response and returns the translated object", async () => {
    mockChatCompletion('```json\n{"title":"Hello world","nested":{"greeting":"Good morning"}}\n```');

    const service = new TranslationService();
    const result = await service.translateObject(original, "en", "pt");

    expect(result).toEqual({ title: "Hello world", nested: { greeting: "Good morning" } });
  });

  it("parses a pure JSON response with no fence", async () => {
    mockChatCompletion('{"title":"Hello world","nested":{"greeting":"Good morning"}}');

    const service = new TranslationService();
    const result = await service.translateObject(original, "en", "pt");

    expect(result).toEqual({ title: "Hello world", nested: { greeting: "Good morning" } });
  });

  it("parses JSON surrounded by prose (common on :free models that ignore 'no explanations')", async () => {
    mockChatCompletion(
      'Sure, here is the translation:\n{"title":"Hello world","nested":{"greeting":"Good morning"}}\nLet me know if you need anything else!',
    );

    const service = new TranslationService();
    const result = await service.translateObject(original, "en", "pt");

    expect(result).toEqual({ title: "Hello world", nested: { greeting: "Good morning" } });
  });

  it(
    "falls back to the original object after retries when the model returns truncated JSON",
    async () => {
      mockChatCompletion('{"title":"Hello world","nested":{"greeting":"Good mor');

      const service = new TranslationService();
      const result = await service.translateObject(original, "en", "pt");

      expect(result).toEqual(original);
    },
    10_000,
  );

  it(
    "falls back to the original object after retries when the shape doesn't match (dropped key)",
    async () => {
      mockChatCompletion('{"title":"Hello world"}');

      const service = new TranslationService();
      const result = await service.translateObject(original, "en", "pt");

      expect(result).toEqual(original);
    },
    10_000,
  );

  it(
    "falls back to the original object after retries when the model returns an empty response",
    async () => {
      mockChatCompletion("");

      const service = new TranslationService();
      const result = await service.translateObject(original, "en", "pt");

      expect(result).toEqual(original);
    },
    10_000,
  );

  it(
    "returns the original object without throwing when the provider replies 429 (quota exceeded)",
    async () => {
      mockChatCompletionError(429, "Rate limit exceeded");

      const service = new TranslationService();
      const result = await service.translateObject(original, "en", "pt");

      expect(result).toEqual(original);
    },
    10_000,
  );

  it("returns the original object unchanged when target language equals source language", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    const service = new TranslationService();
    const result = await service.translateObject(original, "pt", "pt");

    expect(result).toEqual(original);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
