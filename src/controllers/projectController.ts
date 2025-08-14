import { type Request, type Response, Router } from "express";
import AuthPolice from "../middleware/authPolice";
import { TranslationService } from "../services/geminiService";
import { ProjectService } from "../services/projectService";
import type { CreateProject, ProjectFilter, UpdateProjec } from "../types/projects";

import errorFilter from "../utils/isCustomError";
import { projectFilterSchema } from "../validations/projectValidation";

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Operações de CRUD para projetos do portfólio com funcionalidades de filtro, paginação e tradução automática
 */

export class ProjectController {
  routerPrivate: Router;
  routerPublic: Router;
  private projectService = new ProjectService();
  private translationService = new TranslationService();
  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }

  private routesPublic() {
    this.routerPublic.get("/owner/:ownerId", this.getAllProject.bind(this));
    this.routerPublic.get("/owner/:ownerId/techs", this.getAllTechs.bind(this));
  }
  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.post("/create", this.create.bind(this));
    this.routerPrivate.put("/:id/update", this.update.bind(this));
    this.routerPrivate.delete("/:id/delete", this.delete.bind(this));
    this.routerPrivate.put("/:id/handle-activate", this.handleActivate.bind(this));
  }

  async getAllProject(req: Request, res: Response) {
    const { language } = req.query as { language?: string };

    const parseResult = projectFilterSchema.safeParse(req.query);

    if (parseResult.success) {
      const filters: ProjectFilter = parseResult.data;
      try {
        const result = await this.projectService.findAllProjects(req.params.ownerId || "", filters);

        if (language && language !== "pt") {
          try {
            const translated = await this.translationService.translateObject(result, language, "pt");
            res.status(200).json(translated);
          } catch (e) {
            errorFilter(e, res);
          }
        } else {
          res.status(200).json(result);
        }
      } catch (error) {
        errorFilter(error, res);
      }
    } else {
      res.status(400).json({ error: parseResult.error.issues.map((i) => i.message) });
    }
  }
  async create(req: Request, res: Response) {
    try {
      const project: CreateProject = req.body;
      project.ownerId = req.userId;
      project.lastUpdate = new Date();
      project.techs = project.techs.map((tech) => tech.toLowerCase());

      const projectCreated = await this.projectService.createProject(project);
      res.status(201).json({ message: "Projeto criado com sucesso", projectCreated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  async update(req: Request, res: Response) {
    try {
      const project: UpdateProjec = req.body;
      project.lastUpdate = new Date();
      const projectUpdated = await this.projectService.updateProject(project, req.params.id || "");
      res.status(200).json({ message: "Projeto atualizado com sucesso", projectUpdated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  async delete(req: Request, res: Response) {
    try {
      await this.projectService.deleteProject(req.params.id || "");
      res.status(200).json({ message: "Projeto deletado com sucesso" });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  async handleActivate(req: Request, res: Response) {
    try {
      const project = await this.projectService.handleActivateOrDesactivateProject(req.params.id || "");
      res.status(200).json({ message: "Projeto atualizado com sucesso", project });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  async getAllTechs(req: Request, res: Response) {
    try {
      const result = await this.projectService.getAllTechs(req.params.ownerId || "");
      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
