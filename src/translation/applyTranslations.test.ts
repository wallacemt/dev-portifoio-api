import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { applyTranslations } from "./applyTranslations";
import { TranslationRepository, type TranslationRow } from "./translationRepository";

function withFakeDoneTranslations(rows: TranslationRow[]) {
  const original = TranslationRepository.prototype.findDoneForEntities;
  const spy = jest.fn(async () => rows);
  TranslationRepository.prototype.findDoneForEntities = spy as typeof original;
  return { spy, restore: () => { TranslationRepository.prototype.findDoneForEntities = original; } };
}

describe("applyTranslations (Fase 6 — RF-02/RF-08, ADR-05)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("merges `done` fields onto matching records, in one query", async () => {
    const { spy, restore } = withFakeDoneTranslations([
      {
        id: "row-1",
        entity: "project",
        entityId: "p1",
        language: "en",
        fields: { title: "My project", description: "A description" },
        sourceHash: "hash",
        status: "done",
        attempts: 0,
        lastError: null,
      },
    ]);

    try {
      const result = await applyTranslations(
        "project",
        [
          { id: "p1", title: "Meu projeto", description: "Uma descrição", previewImage: "https://x.png" },
          { id: "p2", title: "Outro projeto", description: "Outra descrição", previewImage: "https://y.png" },
        ],
        "en",
      );

      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.find((p) => p.id === "p1")).toEqual({
        id: "p1",
        title: "My project",
        description: "A description",
        previewImage: "https://x.png",
      });
      // p2 has no `done` translation — passes through untouched (RF-08).
      expect(result.find((p) => p.id === "p2")?.title).toBe("Outro projeto");
    } finally {
      restore();
    }
  });

  it("passes records through untouched, without any query, when lang is undefined or 'pt'", async () => {
    const { spy, restore } = withFakeDoneTranslations([]);
    const records = [{ id: "p1", title: "Meu projeto" }];

    try {
      expect(await applyTranslations("project", records, undefined)).toBe(records);
      expect(await applyTranslations("project", records, "pt")).toBe(records);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
