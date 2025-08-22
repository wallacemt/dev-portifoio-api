import { prisma } from "../prisma/prismaClient";
import type { CreateProject, ProjectWhere, UpdateProjec } from "../types/projects";
import type { Skill } from "../types/skills";
import { SkillRepository } from "./skillRepository";

export class ProjectRepository {
  private skillRepo = new SkillRepository();
  async findAllProjects(where: ProjectWhere, skip: number, take: number, orderBy: "asc" | "desc") {
   
    return await prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: {
        createdAt: orderBy,
      },
    });
  }

  async findProjectById(projectId: string) {
    return await prisma.project.findUnique({ where: { id: projectId } });
  }

  async countProjects(where: ProjectWhere) {
    return await prisma.project.count({ where });
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
    const projectFind = await prisma.project.findUnique({
      where: { id: projectId },
    });
    return await prisma.project.update({
      where: { id: projectId },
      data: { activate: !projectFind?.activate },
    });
  }

  async findHabilitiesWhereProject(projectId: string, ownerId: string) {
    const project = await this.findProjectById(projectId);
    const habilities = await this.skillRepo.findAllSkillsNoFilter(ownerId);
    const relatedHabilities = habilities
      .filter((skill: Skill) => project?.techs.some((tech: string) => skill.title.toLowerCase() === tech.toLowerCase()))
      .map(({ id, image, title }: Skill) => ({ id, image, title }));
    return relatedHabilities;
  }

  async getAllTechsProjects(ownerId: string) {
    const projects = await prisma.project.findMany({
      where: { ownerId },
      select: {
        techs: true,
      },
    });

    const uniqueTechs = new Set<string>();

    for (const project of projects) {
      for (const tech of project.techs) {
        uniqueTechs.add(tech.toLowerCase());
      }
    }

    return Array.from(uniqueTechs);
  }
}
