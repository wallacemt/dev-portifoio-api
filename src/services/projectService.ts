import { ZodError } from "zod";
import { ProjectRepository } from "../repository/projectRepository";
import { CreateProject, Project, ProjectFilter, ProjectWithSkills, UpdateProjec } from "../types/projects";
import { Exception } from "../utils/exception";
import { projectSchema, projectSchemaOptional } from "../validations/projectValidation";
import { title } from "process";

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
  public async findAllProjects(ownerId: string, filters: ProjectFilter) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const { page, limit, tech, activate, orderBy, search } = filters;
    const skip = (page - 1) * limit;
    const where: any = {
      ownerId: ownerId,
      ...(activate !== undefined && { activate }),
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

    const projectsFinalForm = await Promise.all(
      projects.map(async (project: Project) => {
        const skills = await this.projectRepository.findHabilitiesWhereProject(project.id, ownerId);
        const reorderedScreenshots = [
          project.previewImage,
          ...project.screenshots.filter((img) => img !== project.previewImage),
        ];

        return {
          ...project,
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
            content: { backend: project.backend, frontend: project.frontend, deployment: project.deployment },
          },
          skills: {
            title: "Habilidades Utilizadas",
            content: skills,
          },
          cta: "Ver Projeto",
        };
      })
    );
    return {
      projects: projectsFinalForm,

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

  public async createProject(project: CreateProject): Promise<Project> {
    try {
      projectSchema.parse(project);
      return await this.projectRepository.createProject(project);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  public async updateProject(project: UpdateProjec, projectId: string): Promise<Project> {
    if (!projectId || projectId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.projectRepository.findProjectById(projectId))) throw new Exception("Projeto não encontrado", 404);
    try {
      projectSchemaOptional.parse(project);
      return await this.projectRepository.updateProject(project, projectId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  public async deleteProject(projectId: string): Promise<void> {
    if (!projectId || projectId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.projectRepository.findProjectById(projectId))) throw new Exception("Projeto não encontrado", 404);
    await this.projectRepository.deleteProject(projectId);
  }

  public async handleActivateOrDesactivateProject(projectId: string): Promise<Project> {
    if (!projectId || projectId === ":id") throw new Exception("ID do projeto invalido", 400);
    if (!(await this.projectRepository.findProjectById(projectId))) throw new Exception("Projeto não encontrado", 404);
    return await this.projectRepository.handleActivateOrDesactivate(projectId);
  }

  public async getAllTechs(ownerId: string) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);

    return await this.projectRepository.getAllTechsProjects(ownerId);
  }
}
