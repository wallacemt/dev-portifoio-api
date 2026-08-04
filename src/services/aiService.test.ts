import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { env } from "../env";
import { QuotaManager } from "../utils/quotaManager";
import { TranslationService } from "./aiService";

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
    // Model resolution (owner.aiModel → env.AI_MODEL) has its own describe
    // block below; skip the real DB lookup here so these tests stay fast
    // and focused on parsing.
    jest.spyOn(TranslationService, "resolveModel").mockResolvedValue(env.AI_MODEL);
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

describe("TranslationService.listModels (Redis/memory cache)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fetches the OpenRouter catalog once, filters to free models, and serves the second call from cache", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "free/model-a", name: "A", pricing: { prompt: "0", completion: "0" } },
          { id: "paid/model-b", name: "B", pricing: { prompt: "0.002", completion: "0.002" } },
        ],
      }),
    } as Response);

    const first = await TranslationService.listModels();
    const second = await TranslationService.listModels();

    expect(first).toEqual([{ id: "free/model-a", name: "A", pricing: { prompt: "0", completion: "0" } }]);
    expect(second).toEqual(first);
    // Second call must be served from cache (Redis, or the in-memory
    // fallback when REDIS_URL isn't set) rather than hitting OpenRouter again.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("TranslationService.isValidModel (security: model validation against the real catalog)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("accepts a model id that is present in the free-model catalog", async () => {
    jest.spyOn(TranslationService, "listModels").mockResolvedValue([
      { id: "google/gemma-4-31b-it:free", name: "Gemma", pricing: { prompt: "0", completion: "0" } },
    ]);

    expect(await TranslationService.isValidModel("google/gemma-4-31b-it:free")).toBe(true);
  });

  it("rejects a model id that isn't in the catalog — this is what stops an arbitrary client-supplied string from being persisted and later forwarded straight into the OpenRouter request body", async () => {
    jest.spyOn(TranslationService, "listModels").mockResolvedValue([
      { id: "google/gemma-4-31b-it:free", name: "Gemma", pricing: { prompt: "0", completion: "0" } },
    ]);

    expect(await TranslationService.isValidModel("some/made-up-model:free")).toBe(false);
    expect(await TranslationService.isValidModel("openai/gpt-4o")).toBe(false);
  });

  it("rejects an empty model id without calling the catalog", async () => {
    const listModelsSpy = jest.spyOn(TranslationService, "listModels");

    expect(await TranslationService.isValidModel("")).toBe(false);
    expect(listModelsSpy).not.toHaveBeenCalled();
  });
});

describe("TranslationService.resolveModel (owner.aiModel → env.AI_MODEL → default)", () => {
  // `getOwnerModel` is the private, DB-backed lookup (Prisma `owner.findFirst`,
  // cached). `resolveModel`'s own logic — "the owner's value wins, otherwise
  // env.AI_MODEL" — is what's under test here; that seam is mocked instead of
  // going through real Prisma because a Prisma model delegate is a Proxy, and
  // `bun test`'s jest-compat `spyOn` doesn't intercept methods on it (verified:
  // the same mock works fine under `npx jest`, so this is a `bun test`-specific
  // tooling gap, not a code issue). The DB timeout/fallback path itself
  // (`getOwnerModel`'s try/catch + 2s race) was verified by hand against a
  // real Mongo connection.
  const svc = TranslationService as unknown as { getOwnerModel(): Promise<string | null> };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the owner's configured aiModel when one is set", async () => {
    jest.spyOn(svc, "getOwnerModel").mockResolvedValue("meta-llama/llama-3.1-405b:free");

    expect(await TranslationService.resolveModel()).toBe("meta-llama/llama-3.1-405b:free");
  });

  it("falls back to env.AI_MODEL (which itself defaults to the hardcoded free Gemma model) when the owner has no aiModel configured", async () => {
    jest.spyOn(svc, "getOwnerModel").mockResolvedValue(null);

    expect(await TranslationService.resolveModel()).toBe(env.AI_MODEL);
  });
});
