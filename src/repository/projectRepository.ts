import { prisma } from "../prisma/prismaClient";
import { CreateProject, UpdateProjec } from "../types/projects";
import { Skill } from "../types/skills";
import { SkillRepository } from "./skillRepository";

export class ProjectRepository {
  private skillRepo = new SkillRepository();
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
    return await prisma.project.update({
      where: { id: projectId },
      data: { activate: !projectFind?.activate },
    });
  }

  async findHabilitiesWhereProject(projectId: string, ownerId: string) {
    const project = await this.findProjectById(projectId);
    const habilities = await this.skillRepo.findAllSkills(ownerId);
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

    projects.forEach((project: { techs: string[] }) => {
      project.techs.forEach((tech: string) => {
        uniqueTechs.add(tech.toLowerCase());
      });
    });

    return Array.from(uniqueTechs);
  }
}
