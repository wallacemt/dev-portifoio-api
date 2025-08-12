import { type Request, type Response, Router } from 'express';
import AuthPolice from '../middleware/authPolice';
import { TranslationService } from '../services/geminiService';
import { SkillService } from '../services/skillService';
import type { SkillAddRequest, SkillUpdateRequest } from '../types/skills';
import errorFilter from '../utils/isCustomError';

/**
 * @swagger
 * tags:
 *   name: Skills
 *   description: Operações de CRUD para as Skills do Owner
 */
export class SkillController {
   routerPrivate: Router;
   routerPublic: Router;
  private skillService = new SkillService();
  private translationService = new TranslationService();
  constructor() {
    this.routerPrivate = Router();
    this.routerPublic = Router();
    this.routesPublic();
    this.routesPrivate();
  }
  private routesPublic() {
    this.routerPublic.get('/owner/:ownerId', this.getAllSkill.bind(this));
    this.routerPublic.get('/types', this.getAllTypes.bind(this));
  }
  private routesPrivate() {
    this.routerPrivate.use(AuthPolice);
    this.routerPrivate.post('/create', this.create.bind(this));
    this.routerPrivate.put('/:id/update', this.update.bind(this));
    this.routerPrivate.delete('/:id/delete', this.delete.bind(this));
  }

   async getAllTypes(_req: Request, res: Response) {
    try {
      const result = await this.skillService.getAllTypes();

      res.status(200).json(result);
    } catch (error) {
      errorFilter(error, res);
    }
  }

   async getAllSkill(req: Request, res: Response) {
    const { language } = req.query as { language?: string };
    try {
      const result = await this.skillService.findAllSkill(req.params.ownerId || "");
      if (language && language !== 'pt') {
        try {
          const translated = await this.translationService.translateObject(
            result,
            language,
            'pt'
          );
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

   async create(req: Request, res: Response) {
    try {
      const skill: SkillAddRequest = req.body;
      skill.ownerId = req.userId;
      const skillCreated = await this.skillService.addSkill(skill);
      res
        .status(201)
        .json({ message: 'Skill adicionada com sucesso', skillCreated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
   async update(req: Request, res: Response) {
    try {
      const project: SkillUpdateRequest = req.body;
      const projectUpdated = await this.skillService.updateSkill(
        project,
        req.params.id || ""
      );
      res
        .status(200)
        .json({ message: 'Skill atualizada com sucesso', projectUpdated });
    } catch (error) {
      errorFilter(error, res);
    }
  }
   async delete(req: Request, res: Response) {
    try {
      await this.skillService.deleteSkill(req.params.id || "");
      res.status(200).json({ message: 'Skill deletada com sucesso' });
    } catch (error) {
      errorFilter(error, res);
    }
  }
}
