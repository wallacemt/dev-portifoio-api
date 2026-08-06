import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { prisma } from "../prisma/prismaClient";
import { env } from "../env";
import { QuotaManager } from "../utils/quotaManager";
import { TranslationRepository, type TranslationRow } from "./translationRepository";
import { processPendingBatch } from "./worker";

function mockChatCompletion(content: string) {
  return jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { role: "assistant", content } }] }),
  } as Response);
}

function fakeRow(overrides: Partial<TranslationRow> = {}): TranslationRow {
  return {
    id: "row-1",
    entity: "project",
    entityId: "project-1",
    language: "en",
    fields: {},
    sourceHash: "hash-1",
    status: "pending",
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

/** Swaps TranslationRepository methods so the worker never touches Mongo directly. */
function withFakeRepository(
  overrides: Partial<{
    findPendingBatch: (limit: number) => Promise<TranslationRow[]>;
    markDone: (id: string, fields: Record<string, unknown>) => Promise<void>;
    markFailedAttempt: (id: string, attempts: number, error: string) => Promise<void>;
    deleteForEntity: (entity: string, entityId: string) => Promise<void>;
  }>,
) {
  const originals = {
    findPendingBatch: TranslationRepository.prototype.findPendingBatch,
    markDone: TranslationRepository.prototype.markDone,
    markFailedAttempt: TranslationRepository.prototype.markFailedAttempt,
    deleteForEntity: TranslationRepository.prototype.deleteForEntity,
  };

  if (overrides.findPendingBatch) {
    TranslationRepository.prototype.findPendingBatch = overrides.findPendingBatch as typeof originals.findPendingBatch;
  }
  if (overrides.markDone) {
    TranslationRepository.prototype.markDone = overrides.markDone as typeof originals.markDone;
  }
  if (overrides.markFailedAttempt) {
    TranslationRepository.prototype.markFailedAttempt = overrides.markFailedAttempt as typeof originals.markFailedAttempt;
  }
  if (overrides.deleteForEntity) {
    TranslationRepository.prototype.deleteForEntity = overrides.deleteForEntity as typeof originals.deleteForEntity;
  }

  return () => {
    TranslationRepository.prototype.findPendingBatch = originals.findPendingBatch;
    TranslationRepository.prototype.markDone = originals.markDone;
    TranslationRepository.prototype.markFailedAttempt = originals.markFailedAttempt;
    TranslationRepository.prototype.deleteForEntity = originals.deleteForEntity;
  };
}

/** Swaps `prisma.project.findUnique` so `findSourceFields` never touches Mongo. */
function withFakeProjectSource(source: Record<string, unknown> | null) {
  const original = prisma.project.findUnique;
  //biome-ignore lint/suspicious/noExplicitAny: test double, matching the delegate's actual runtime shape is not the point here
  (prisma.project as any).findUnique = async () => source;
  return () => {
    prisma.project.findUnique = original;
  };
}

describe("processPendingBatch (Fase 5 — RF-05)", () => {
  beforeEach(async () => {
    await QuotaManager.clearMetrics();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("translates a pending row and marks it done", async () => {
    const restoreSource = withFakeProjectSource({ title: "Meu projeto", description: "Uma descrição" });
    const markDone = jest.fn<(id: string, fields: Record<string, unknown>) => Promise<void>>(async () => { /* no-op */ });
    const restoreRepo = withFakeRepository({
      findPendingBatch: async () => [fakeRow()],
      markDone,
    });
    mockChatCompletion(JSON.stringify({ title: "My project", description: "A description" }));

    try {
      const result = await processPendingBatch();

      expect(result).toEqual({ processed: 1, failed: 0, skippedByQuota: 0 });
      expect(markDone).toHaveBeenCalledWith("row-1", { title: "My project", description: "A description" });
    } finally {
      restoreSource();
      restoreRepo();
    }
  });

  it("increments attempts and never calls OpenRouter once the worker's own budget is exhausted (ADR-04/AC-08)", async () => {
    for (let i = 0; i < env.WORKER_DAILY_BUDGET; i++) {
      // biome-ignore lint/nursery/noAwaitInLoop: test setup, exhausting the counter sequentially on purpose
      await QuotaManager.recordRequest();
    }

    const fetchSpy = jest.spyOn(global, "fetch");
    const restoreRepo = withFakeRepository({
      findPendingBatch: async () => [fakeRow(), fakeRow({ id: "row-2" })],
    });

    try {
      const result = await processPendingBatch();

      expect(result).toEqual({ processed: 0, failed: 0, skippedByQuota: 2 });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      restoreRepo();
    }
  });

  it("deletes the row instead of retrying when the source record no longer exists", async () => {
    const restoreSource = withFakeProjectSource(null);
    const deleteForEntity = jest.fn<(entity: string, entityId: string) => Promise<void>>(async () => { /* no-op */ });
    const restoreRepo = withFakeRepository({
      findPendingBatch: async () => [fakeRow()],
      deleteForEntity,
    });

    try {
      const result = await processPendingBatch();

      expect(result).toEqual({ processed: 1, failed: 0, skippedByQuota: 0 });
      expect(deleteForEntity).toHaveBeenCalledWith("project", "project-1");
    } finally {
      restoreSource();
      restoreRepo();
    }
  });

  it(
    "increments attempts on failure without throwing (RNF-04)",
    async () => {
      const restoreSource = withFakeProjectSource({ title: "Meu projeto", description: "Uma descrição" });
      const markFailedAttempt = jest.fn<(id: string, attempts: number, error: string) => Promise<void>>(async () => { /* no-op */ });
      const restoreRepo = withFakeRepository({
        findPendingBatch: async () => [fakeRow({ attempts: 1 })],
        markFailedAttempt,
      });
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

      try {
        const result = await processPendingBatch();

        expect(result).toEqual({ processed: 0, failed: 1, skippedByQuota: 0 });
        expect(markFailedAttempt).toHaveBeenCalledWith("row-1", 2, expect.any(String));
      } finally {
        restoreSource();
        restoreRepo();
      }
    },
    10_000,
  );
});
