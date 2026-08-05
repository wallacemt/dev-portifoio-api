import { describe, expect, it } from "@jest/globals";
import { ProjectRepository } from "../repository/projectRepository";
import type { CreateProject, Project } from "../types/projects";
import { ProjectService } from "./projectService";

/** Swaps ProjectRepository.createProject for a fake that just echoes back what it received. */
function withFakeCreateProject<T>(run: (calls: CreateProject[]) => Promise<T>): Promise<T> {
  const calls: CreateProject[] = [];
  const original = ProjectRepository.prototype.createProject;
  ProjectRepository.prototype.createProject = ((data: CreateProject) => {
    calls.push(data);
    return Promise.resolve({
      id: "project-1",
      createdAt: new Date(),
      activate: true,
      ...data,
      videos: data.videos ?? [],
    } as unknown as Project);
  }) as typeof ProjectRepository.prototype.createProject;

  return run(calls).finally(() => {
    ProjectRepository.prototype.createProject = original;
  });
}

const baseInput: Omit<CreateProject, "videos"> = {
  title: "Portfolio project",
  description: "A description long enough to pass validation",
  techs: ["react"],
  screenshots: ["https://exemplo.com/screenshot.jpg"],
  previewImage: "https://exemplo.com/preview.jpg",
  ownerId: "owner-1",
  lastUpdate: new Date(),
};

describe("ProjectService.createProject", () => {
  it("saves the videos sent by the caller instead of the schema's empty default", async () => {
    const videos = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/abcdefghijk"];

    await withFakeCreateProject(async (calls) => {
      const service = new ProjectService();
      const result = await service.createProject({ ...baseInput, videos });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.videos).toEqual(videos);
      expect(result.videos).toEqual(videos);
      expect(result.previewVideoUrl).toBe(videos[0]);
    });
  });

  it("defaults videos to an empty array when the caller doesn't send any", async () => {
    await withFakeCreateProject(async (calls) => {
      const service = new ProjectService();
      const result = await service.createProject({ ...baseInput });

      expect(calls[0]?.videos).toEqual([]);
      expect(result.previewVideoUrl).toBeNull();
    });
  });
});
