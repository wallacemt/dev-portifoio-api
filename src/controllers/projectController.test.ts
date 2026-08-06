import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { type Application } from "express";
import request from "supertest";
import { ProjectRepository } from "../repository/projectRepository";
import { TranslationService } from "../services/aiService";
import { TranslationRepository } from "../translation/translationRepository";
import { ProjectController } from "./projectController";

const fakeProject = {
  id: "project-1",
  title: "Portfolio project",
  description: "A description in Portuguese",
  techs: ["react"],
  screenshots: ["https://exemplo.com/preview.jpg"],
  previewImage: "https://exemplo.com/preview.jpg",
  deployment: null,
  backend: null,
  frontend: null,
  videos: [],
  activate: true,
  lastUpdate: null,
  ownerId: "owner-1",
  createdAt: new Date("2026-01-01"),
};

/** Swaps the repository calls findAllProjects hits, so this test never touches Mongo. */
function withFakeProjectRepository<T>(run: () => Promise<T>): Promise<T> {
  const originalFindAll = ProjectRepository.prototype.findAllProjects;
  const originalCount = ProjectRepository.prototype.countProjects;
  const originalHabilities = ProjectRepository.prototype.findHabilitiesWhereProject;

  ProjectRepository.prototype.findAllProjects = (async () => [fakeProject]) as typeof originalFindAll;
  ProjectRepository.prototype.countProjects = (async () => 1) as typeof originalCount;
  ProjectRepository.prototype.findHabilitiesWhereProject = (async () => []) as typeof originalHabilities;

  return run().finally(() => {
    ProjectRepository.prototype.findAllProjects = originalFindAll;
    ProjectRepository.prototype.countProjects = originalCount;
    ProjectRepository.prototype.findHabilitiesWhereProject = originalHabilities;
  });
}

/** Swaps the translation lookup so applyTranslations resolves without hitting Mongo either. */
function withFakeNoTranslations<T>(run: () => Promise<T>): Promise<T> {
  const original = TranslationRepository.prototype.findDoneForEntities;
  TranslationRepository.prototype.findDoneForEntities = (async () => []) as typeof original;
  return run().finally(() => {
    TranslationRepository.prototype.findDoneForEntities = original;
  });
}

function buildApp(): Application {
  const app = express();
  app.use("/projects", new ProjectController().routerPublic);
  return app;
}

// ADR-05 / AC-15: no public read route may ever call the LLM, in any
// circumstance — cold start, worker down, or translation still `pending`.
// This test fails the moment translateObject is called during this request,
// which is exactly what would happen if someone reintroduced the old
// synchronous-translation fallback on the read path.
describe("GET /projects/owner/:ownerId (AC-15)", () => {
  let translateSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    translateSpy = jest.spyOn(TranslationService.prototype, "translateObject");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("never calls TranslationService while serving a translated-language request", async () => {
    await withFakeProjectRepository(() =>
      withFakeNoTranslations(async () => {
        const response = await request(buildApp()).get("/projects/owner/owner-1").query({ language: "en" });

        expect(response.status).toBe(200);
        expect(translateSpy).not.toHaveBeenCalled();
      }),
    );
  });

  it("serves the original pt-BR content when no translation exists yet (AC-11/AC-16)", async () => {
    await withFakeProjectRepository(() =>
      withFakeNoTranslations(async () => {
        const response = await request(buildApp()).get("/projects/owner/owner-1").query({ language: "ja" });

        expect(response.status).toBe(200);
        expect(response.body.projects[0].description.content).toBe(fakeProject.description);
        expect(translateSpy).not.toHaveBeenCalled();
      }),
    );
  });
});
