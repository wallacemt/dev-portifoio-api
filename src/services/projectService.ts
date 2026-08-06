import { ZodError } from "zod";
import { getUiTexts } from "../i18n";
import { ProjectRepository } from "../repository/projectRepository";
import type { CreateProject, Project, ProjectFilter, ProjectWhere, UpdateProjec } from "../types/projects";
import { Exception } from "../utils/exception";
import { projectSchema, projectSchemaOptional } from "../validations/projectValidation";

import { optimizeCloudinary } from "../utils/cloudinaryTransform";

export class ProjectService {
  private projectRepository = new ProjectRepository();

  /**
   * Adds a `previewVideoUrl` field mirroring the first entry of `videos`.
   *
   * ponytail: temporary compat shim so frontends still reading the old
   * single-video field keep working; drop once the frontend consumes
   * `videos` directly (see dev-portifolio#33).
   */
  private withLegacyPreviewVideoUrl<T extends { videos: string[] }>(project: T): T & { previewVideoUrl: string | null } {
    return { ...project, previewVideoUrl: project.videos[0] ?? null };
  }

  isMostRecent(project: Project): boolean {
    const today = new Date();
    const lastUpdate = project.lastUpdate || project.createdAt;
    return lastUpdate.getFullYear() === today.getFullYear() && lastUpdate.getMonth() === today.getMonth();
  }

  /**
   * Discriminates which date label a project's card should show, without
   * baking any formatted/localized string into the payload (ADR-01, D-02).
   * The frontend picks the text for this key from its own i18n dictionary.
   */
  private dateLabelKey(project: Project): "updatedAt" | "addedAt" {
    return project.lastUpdate && project.lastUpdate.getDate() !== project.createdAt.getDate()
      ? "updatedAt"
      : "addedAt";
  }

  /**
   * Find all projects for a given owner, with filters
   *
   * @param ownerId - The ID of the owner
   * @param filters - The filters to apply
   * @returns A list of projects, and pagination metadata
   * @throws {Exception} If the owner ID is invalid
   */
  async findAllProjects(ownerId: string, filters: ProjectFilter, language?: string) {
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
    const projectTexts = getUiTexts<{
      title: string;
      description: string;
      descriptionLabel: string;
      techsLabel: string;
      linksLabel: string;
      backendLabel: string;
      frontendLabel: string;
      deploymentLabel: string;
      skillsLabel: string;
      cta: string;
      isMostRecentText: string;
    }>("project", language);
    const texts = { title: projectTexts.title, description: projectTexts.description };
    const projectsFinalForm = await Promise.all(
      projects.map(async (project: Project) => {
        const skills = await this.projectRepository.findHabilitiesWhereProject(project.id, ownerId);
        const reorderedScreenshots = [
          optimizeCloudinary(project.previewImage),
          ...project.screenshots.filter((img) => img !== project.previewImage).map((img) => optimizeCloudinary(img)),
        ];

        return {
          ...this.withLegacyPreviewVideoUrl(project),
          previewImage: optimizeCloudinary(project.previewImage),
          isMostRecent: { isRecent: this.isMostRecent(project), text: projectTexts.isMostRecentText },
          screenshots: reorderedScreenshots,
          description: {
            title: projectTexts.descriptionLabel,
            content: project.description,
          },
          techs: {
            title: projectTexts.techsLabel,
            content: project.techs,
          },
          links: {
            title: projectTexts.linksLabel,
            content: {
              backend: { title: projectTexts.backendLabel, url: project.backend },
              frontend: { title: projectTexts.frontendLabel, url: project.frontend },
              deployment: { title: projectTexts.deploymentLabel, url: project.deployment },
            },
          },
          skills: {
            title: projectTexts.skillsLabel,
            content: skills,
          },
          cta: projectTexts.cta,

          dateLabelKey: this.dateLabelKey(project),
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
        deployment: project.deployment?.length ? project.deployment : undefined,
        frontend: project.frontend?.length ? project.frontend : undefined,
      };
      // videos is validated explicitly here (rather than relying on the ...project
      // spread above) so a future edit to projectData can't silently drop it.
      const validated = projectSchema.parse({ ...projectData, videos: project.videos });
      const res = await this.projectRepository.createProject({ ...project, videos: validated.videos });
      return this.withLegacyPreviewVideoUrl(res as Project);
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
      const projectData: UpdateProjec = {
        ...project,
        backend: project.backend?.length ? project.backend : undefined,
        deployment: project.deployment?.length ? project.deployment : undefined,
        frontend: project.frontend?.length ? project.frontend : undefined,
      };
      projectSchemaOptional.parse(projectData);
      const updated = await this.projectRepository.updateProject(projectData, projectId);
      return this.withLegacyPreviewVideoUrl(updated as Project);
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
