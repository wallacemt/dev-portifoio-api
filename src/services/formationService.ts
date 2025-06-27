import { ZodError } from "zod";
import { FormationRepository } from "../repository/formationRepository";
import { FormationAddRequest, FormationType, FormationUpdate } from "../types/formation";
import { Exception } from "../utils/exception";
import { formationSchema, formationSchemaOptional } from "../validations/formationValidation";

export class FormationService {
  private formationRepository = new FormationRepository();

  public findAllFormations(ownerId: string) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    return this.formationRepository.findAllFormations(ownerId);
  }

  public async addFormation(formation: FormationAddRequest) {
    try {
      formationSchema.parse(formation);
      return await this.formationRepository.addFormation(formation);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  public async getAllTypes() {
    const formationType = Object.values(FormationType) as string[];
    const types = { formationType };
    return types;
  }

  public async updateFormation(formation: FormationUpdate, formationId: string) {
    if (!formationId || formationId === ":id") throw new Exception("ID da formação invalida", 400);
    if (!(await this.formationRepository.findById(formationId))) throw new Exception("Formação não encontrado", 404);
    try {
      formationSchemaOptional.parse(formation);
      return await this.formationRepository.updateFormation(formation, formationId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  public async deleteFormation(formationId: string) {
    if (!formationId || formationId === ":id") throw new Exception("ID da formação invalida", 400);
    if (!(await this.formationRepository.findById(formationId))) throw new Exception("Formação não encontrado", 404);

    return await this.formationRepository.deleteFormation(formationId);
  }
}
