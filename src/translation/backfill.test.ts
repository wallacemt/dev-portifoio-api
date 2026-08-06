import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { prisma } from "../prisma/prismaClient";
import { pickTranslatableFields } from "./translatableFields";
import { TranslationRepository } from "./translationRepository";
import { runBackfill } from "./backfill";

const project1 = { id: "project-1", title: "Projeto 1", description: "Descrição 1" };

/** Mirrors backfill.ts's private `hashTranslatableSubset` exactly, for test setup. */
function hashOf(project: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(pickTranslatableFields("project", project))).digest("hex");
}

/** Swaps prisma's per-entity `findMany` so the scan only ever sees `project1`, never Mongo. */
function withFakeEntities() {
  const originals = {
    project: prisma.project.findMany,
    skill: prisma.skill.findMany,
    formation: prisma.formation.findMany,
    badge: prisma.badge.findMany,
    certification: prisma.certification.findMany,
    owner: prisma.owner.findMany,
    service: prisma.service.findMany,
  };

  //biome-ignore lint/suspicious/noExplicitAny: test doubles, matching the delegate's actual runtime shape is not the point here
  (prisma.project as any).findMany = async () => [project1];
  //biome-ignore lint/suspicious/noExplicitAny: test double
  (prisma.skill as any).findMany = async () => [];
  //biome-ignore lint/suspicious/noExplicitAny: test double
  (prisma.formation as any).findMany = async () => [];
  //biome-ignore lint/suspicious/noExplicitAny: test double
  (prisma.badge as any).findMany = async () => [];
  //biome-ignore lint/suspicious/noExplicitAny: test double
  (prisma.certification as any).findMany = async () => [];
  //biome-ignore lint/suspicious/noExplicitAny: test double
  (prisma.owner as any).findMany = async () => [];
  //biome-ignore lint/suspicious/noExplicitAny: test double
  (prisma.service as any).findMany = async () => [];

  return () => {
    prisma.project.findMany = originals.project;
    prisma.skill.findMany = originals.skill;
    prisma.formation.findMany = originals.formation;
    prisma.badge.findMany = originals.badge;
    prisma.certification.findMany = originals.certification;
    prisma.owner.findMany = originals.owner;
    prisma.service.findMany = originals.service;
  };
}

describe("runBackfill (Fase 7 — RF-07)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is idempotent: running twice back-to-back enqueues nothing new the second time (AC-14)", async () => {
    const restore = withFakeEntities();
    const upsertSpy = jest.spyOn(TranslationRepository.prototype, "upsertPending").mockResolvedValue();
    // No rows exist yet for project-1 in any language, so the first pass enqueues all of them.
    jest.spyOn(TranslationRepository.prototype, "findExisting").mockResolvedValue(null);

    try {
      const first = await runBackfill();
      expect(first.scanned).toBe(1);
      expect(first.enqueued).toBeGreaterThan(0);

      // Second pass: pretend every row now exists with the same hash already stored.
      upsertSpy.mockClear();
      jest.spyOn(TranslationRepository.prototype, "findExisting").mockResolvedValue({
        id: "row-1",
        entity: "project",
        entityId: "project-1",
        language: "en",
        fields: {},
        sourceHash: hashOf(project1),
        status: "done",
        attempts: 0,
        lastError: null,
        // biome-ignore lint/suspicious/noExplicitAny: partial Prisma row shape is enough for this assertion
      } as any);

      const second = await runBackfill();
      expect(second.enqueued).toBe(0);
    } finally {
      restore();
    }
  });

  it("re-enqueues `failed` rows only when --retry-failed is requested", async () => {
    const restore = withFakeEntities();
    const upsertSpy = jest.spyOn(TranslationRepository.prototype, "upsertPending").mockResolvedValue();
    // Hash matches the source exactly — content hasn't changed, only the
    // previous attempt's outcome (`failed`) is what should gate re-enqueueing.
    jest.spyOn(TranslationRepository.prototype, "findExisting").mockResolvedValue({
      id: "row-1",
      entity: "project",
      entityId: "project-1",
      language: "en",
      fields: {},
      sourceHash: hashOf(project1),
      status: "failed",
      attempts: 3,
      lastError: "boom",
      // biome-ignore lint/suspicious/noExplicitAny: partial Prisma row shape is enough for this assertion
    } as any);

    try {
      const withoutFlag = await runBackfill({ retryFailed: false });
      expect(withoutFlag.enqueued).toBe(0);

      const withFlag = await runBackfill({ retryFailed: true });
      expect(withFlag.enqueued).toBeGreaterThan(0);
      expect(upsertSpy).toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
