import { ZodError } from "zod";
import { FormationRepository } from "../repository/formationRepository";
import { FormationTypeValues, type FormationAddRequest, type FormationUpdate } from "../types/formation";
import { Exception } from "../utils/exception";
import { formationSchema, formationSchemaOptional } from "../validations/formationValidation";

export class FormationService {
  private formationRepository = new FormationRepository();

  async findAllFormations(ownerId: string) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);

    const formations = await this.formationRepository.findAllFormations(ownerId);
    const texts = {
      title: "Formação Acadêmica",
      description:
        "Minha jornada de aprendizado contínuo atravéz de cursos, certificações e formações que moldam minha expertise técnica.",
      formationStatsText: {
        inProgress: "Cursando",
        certificationText: "Ver certificado",
        conclude: "Concluido"
      },
      stats: {
        formations: "Formações",
        studyHours: "Horas de Estudo",
        institution: "Instituição",
        certificaos: "Certificados",
      },
    };
    return { formations, texts };
  }

  async addFormation(formation: FormationAddRequest) {
    try {
      const formationData: FormationAddRequest = {
        ...formation,
        certificationUrl: formation.certificationUrl?.length ? formation.certificationUrl : undefined,
      };
      formationSchema.parse(formationData);
      return await this.formationRepository.addFormation(formationData);
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
      return await this.formationRepository.updateFormation(formationData, formationId);
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

    return await this.formationRepository.deleteFormation(formationId);
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
