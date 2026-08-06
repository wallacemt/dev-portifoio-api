import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { type Application } from "express";
import request from "supertest";
import { SkillRepository } from "../repository/skillRepository";
import { QuotaManager } from "../utils/quotaManager";
import { SkillController } from "./skillController";

/** Swaps SkillRepository.findAllSkills for a fake that never touches the DB. */
function withFakeFindAllSkills<T>(run: () => Promise<T>): Promise<T> {
  const original = SkillRepository.prototype.findAllSkills;
  SkillRepository.prototype.findAllSkills = (async () => ({
    skills: [],
    pagination: { total: 0, page: 1, limit: 10, totalPages: 0, hasNext: false, hasPrev: false },
  })) as typeof SkillRepository.prototype.findAllSkills;

  return run().finally(() => {
    SkillRepository.prototype.findAllSkills = original;
  });
}

function buildApp(): Application {
  const app = express();
  app.use("/skills", new SkillController().routerPublic);
  return app;
}

describe("GET /skills/owner/:ownerId (AC-01)", () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns localized labels for a non-pt language without calling OpenRouter or touching the quota counter", async () => {
    await withFakeFindAllSkills(async () => {
      const quotaBefore = QuotaManager.getQuotaStatus().dailyRequestsUsed;

      const response = await request(buildApp()).get("/skills/owner/owner-1").query({ language: "ja" });

      expect(response.status).toBe(200);
      expect(response.body.texts.title).toBe("私のスキル");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(QuotaManager.getQuotaStatus().dailyRequestsUsed).toBe(quotaBefore);
    });
  });
});
