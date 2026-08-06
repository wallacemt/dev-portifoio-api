import { ZodError } from "zod";
import { getUiTexts } from "../i18n";
import { FormationRepository } from "../repository/formationRepository";
import { applyTranslations } from "../translation/applyTranslations";
import { enqueueTranslation, removeTranslations } from "../translation/enqueueTranslation";
import { FormationTypeValues, type FormationAddRequest, type FormationUpdate } from "../types/formation";
import { Exception } from "../utils/exception";
import { formationSchema, formationSchemaOptional } from "../validations/formationValidation";

export class FormationService {
  private formationRepository = new FormationRepository();

  async findAllFormations(ownerId: string, language?: string) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);

    const fetchedFormations = await this.formationRepository.findAllFormations(ownerId);
    const formations = await applyTranslations("formation", fetchedFormations, language);
    const texts = getUiTexts("formation", language);
    return { formations, texts };
  }

  async addFormation(formation: FormationAddRequest) {
    try {
      const formationData: FormationAddRequest = {
        ...formation,
        certificationUrl: formation.certificationUrl?.length ? formation.certificationUrl : undefined,
      };
      formationSchema.parse(formationData);
      const created = await this.formationRepository.addFormation(formationData);
      await enqueueTranslation("formation", created.id, created);
      return created;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "error for add formations", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  getAllTypes() {
    const types = { FormationTypeValues };
    return types;
  }

  async updateFormation(formation: FormationUpdate, formationId: string) {
    if (!formationId || formationId === ":id") throw new Exception("ID da formação invalida", 400);
    if (!(await this.formationRepository.findById(formationId))) throw new Exception("Formação não encontrado", 404);
    try {
      const formationData: FormationUpdate = {
        ...formation,
        initialDate: formation.initialDate && new Date(formation.initialDate),
        endDate: formation.endDate && new Date(formation.endDate),
        certificationUrl: formation.certificationUrl?.length ? formation.certificationUrl : undefined,
      };
      formationSchemaOptional.parse(formationData);
      const updated = await this.formationRepository.updateFormation(formationData, formationId);
      await enqueueTranslation("formation", updated.id, updated);
      return updated;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "error for update formations", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async deleteFormation(formationId: string) {
    if (!formationId || formationId === ":id") throw new Exception("ID da formação invalida", 400);
    if (!(await this.formationRepository.findById(formationId))) throw new Exception("Formação não encontrado", 404);

    const deleted = await this.formationRepository.deleteFormation(formationId);
    await removeTranslations("formation", formationId);
    return deleted;
  }

  async concludeFormation(formationId: string) {
    if (!formationId || formationId === ":id") throw new Exception("ID da formação invalida", 400);
    if (!(await this.formationRepository.findById(formationId))) throw new Exception("Formação não encontrado", 404);
    try {
      return await this.formationRepository.updateFormation({ concluded: true }, formationId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "error for update formations", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }
}
