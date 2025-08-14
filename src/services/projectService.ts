import { ZodError } from "zod";
import { ProjectRepository } from "../repository/projectRepository";
import type { CreateProject, Project, ProjectFilter, ProjectWhere, UpdateProjec } from "../types/projects";
import { Exception } from "../utils/exception";
import { projectSchema, projectSchemaOptional } from "../validations/projectValidation";

export class ProjectService {
  private projectRepository = new ProjectRepository();

  /**
   * Find all projects for a given owner, with filters
   *
   * @param ownerId - The ID of the owner
   * @param filters - The filters to apply
   * @returns A list of projects, and pagination metadata
   * @throws {Exception} If the owner ID is invalid
   */
  async findAllProjects(ownerId: string, filters: ProjectFilter) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const { page, limit, tech, activate, orderBy, search } = filters;
    const skip = (page - 1) * limit;
    const isAct = activate === undefined ? undefined : activate === "true";
    const where: ProjectWhere = {
      ownerId,
      ...(isAct !== undefined && { activate: isAct }),
      ...(tech && { techs: { has: tech.toLowerCase() } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [projects, total] = await Promise.all([
      this.projectRepository.findAllProjects(where, skip, limit, orderBy),
      this.projectRepository.countProjects(where),
    ]);
    const texts = {
      title: "Meus Projetos",
      description:
        "Projetos que desenvolvi ao longo da minha carreira, demonstrando minhas habilidades e experiências em diversas tecnologias.",
    };
    const projectsFinalForm = await Promise.all(
      projects.map(async (project: Project, idx: number) => {
        const skills = await this.projectRepository.findHabilitiesWhereProject(project.id, ownerId);
        const reorderedScreenshots = [
          project.previewImage,
          ...project.screenshots.filter((img) => img !== project.previewImage),
        ];

        return {
          ...project,
          isMostRecent: idx === 0,
          screenshots: reorderedScreenshots,
          description: {
            title: "Descrição",
            content: project.description,
          },
          techs: {
            title: "Tecnologias",
            content: project.techs,
          },
          links: {
            title: "Links do Projeto",
            content: {
              backend: { title: "Backend", url: project.backend },
              frontend: { title: "Frontend", url: project.frontend },
              deployment: { title: "Deployment", url: project.deployment },
            },
          },
          skills: {
            title: "Habilidades Utilizadas",
            content: skills,
          },
          cta: "Ver Projeto",
          lastUpdateText: project.lastUpdate
            ? "Ultima Atualização " +
              new Date(project.lastUpdate).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            : "Sem atualizações recentes",
        };
      })
    );
    return {
      projects: projectsFinalForm,
      texts,
      meta: {
        page,
        limit,
        total,
        hasNextPage: skip + projects.length < total,
      },
    };
  }

  /**
   * Creates a new project in the repository.
   *
   * @param project - The project details to create, should adhere to the CreateProject schema.
   * @returns The created project.
   * @throws {Exception} If the project data is invalid or if there is an error during creation.
   */

  async createProject(project: CreateProject): Promise<Project> {
    try {
      const projectData: CreateProject = {
        ...project,
        backend: project.backend?.length ? project.backend : undefined,
        frontend: project.frontend?.length ? project.frontend : undefined,
      };
      projectSchema.parse(projectData);
      const res = await this.projectRepository.createProject(project);
      return res as Project;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Error for create project", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async updateProject(project: UpdateProjec, projectId: string): Promise<Project> {
    if (!projectId || projectId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.projectRepository.findProjectById(projectId))) throw new Exception("Projeto não encontrado", 404);
    try {
      projectSchemaOptional.parse(project);
      return await this.projectRepository.updateProject(project, projectId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Error for update project", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!projectId || projectId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.projectRepository.findProjectById(projectId))) throw new Exception("Projeto não encontrado", 404);
    await this.projectRepository.deleteProject(projectId);
  }

  async handleActivateOrDesactivateProject(projectId: string): Promise<Project> {
    if (!projectId || projectId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.projectRepository.findProjectById(projectId))) throw new Exception("Projeto não encontrado", 404);
    return await this.projectRepository.handleActivateOrDesactivate(projectId);
  }

  async getAllTechs(ownerId: string) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);

    return await this.projectRepository.getAllTechsProjects(ownerId);
  }
}
