import { Request, Response, Router } from "express";
import { ProjectService } from "../services/projectService";
import AuthPolice from "../middleware/authPolice";
import isCustomException from "../utils/isCustomError";
import { CreateProject, ProjectFilter, UpdateProjec } from "../types/projects";
import errorFilter from "../utils/isCustomError";
import { projectFilterSchema } from "../validations/projectValidation";
import { TranslationService } from "../services/geminiService";

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Operações de CRUD para projetos do portfólio com funcionalidades de filtro, paginação e tradução automática
*/

export class ProjectController {
  public routerPrivate: Router;
  public routerPublic: Router;
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
  }
  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.post("/create", this.create.bind(this));
    this.routerPrivate.put("/:id/update", this.update.bind(this));
    this.routerPrivate.delete("/:id/delete", this.delete.bind(this));
    this.routerPrivate.put("/:id/handle-activate", this.handleActivate.bind(this));
  }

  public async getAllProject(req: Request, res: Response) {
    const { lenguage } = req.query as { lenguage?: string };

    const parseResult = projectFilterSchema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.issues.map((i) => i.message) });
    } else {
      const filters: ProjectFilter = parseResult.data;
      try {
        const result = await this.projectService.findAllProjects(req.params.ownerId, filters);

        if (lenguage && lenguage != "pt") {
          try {
            const translated = await this.translationService.translateObject(result, lenguage, "pt");
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
    }
  }
  public async create(req: Request, res: Response) {
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
  public async update(req: Request, res: Response) {
    try {
      const project: UpdateProjec = req.body;
      const projectUpdated = await this.projectService.updateProject(project, req.params.id);
      res.status(200).json({ message: "Projeto atualizado com sucesso", projectUpdated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  public async delete(req: Request, res: Response) {
    try {
      await this.projectService.deleteProject(req.params.id);
      res.status(200).json({ message: "Projeto deletado com sucesso" });
    } catch (error) {
      errorFilter(error, res);
    }
  }
  public async handleActivate(req: Request, res: Response) {
    try {
      const project = await this.projectService.handleActivateOrDesactivateProject(req.params.id);
      res.status(200).json({ message: "Projeto atualizado com sucesso", project });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
