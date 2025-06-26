import { prisma } from "../prisma/prismaClient";
import { CreateProject, UpdateProjec } from "../types/projects";

export class ProjectRepository {
  async findAllProjects(where: any, skip: number, take: number, orderBy: "asc" | "desc") {
    return prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: {
        lastUpdate: orderBy,
      },
    });
  }

  async findProjectById(projectId: string) {
    return prisma.project.findUnique({ where: { id: projectId } });
  }

  async countProjects(where: any) {
    return prisma.project.count({ where });
  }

  async createProject(project: CreateProject) {
    return await prisma.project.create({ data: { ...project } });
  }
  async updateProject(project: UpdateProjec, projectId: string) {
    return await prisma.project.update({
      where: { id: projectId },
      data: { ...project },
    });
  }
  async deleteProject(projectId: string) {
    return await prisma.project.delete({ where: { id: projectId } });
  }

  async handleActivateOrDesactivate(projectId: string) {
    const projectFind = await prisma.project.findUnique({ where: { id: projectId } });
    projectFind;

    return await prisma.project.update({
      where: { id: projectId },
      data: { activate: !projectFind?.activate },
    });
  }
}
