import { ZodError } from "zod";
import { getUiTexts } from "../i18n";
import { CertificationRepository } from "../repository/certificationRepository";
import { applyTranslations } from "../translation/applyTranslations";
import { enqueueTranslation, removeTranslations } from "../translation/enqueueTranslation";
import type { CertificationAddRequest, CertificationUpdate } from "../types/badges";
import { Exception } from "../utils/exception";
import { certificationSchema, certificationSchemaOptional } from "../validations/badgesValidation";

export class CertificationService {
  private certificationRepository = new CertificationRepository();

  async findAllCertifications(ownerId: string, language?: string) {
    if (!ownerId || ownerId === ":ownerId") {
      throw new Exception("ID de owner inválido", 400);
    }
    const texts = getUiTexts("certification", language);
    const fetchedCertifications = await this.certificationRepository.findAllCertifications(ownerId);
    const certifications = await applyTranslations("certification", fetchedCertifications, language);

    return { certifications, texts };
  }

  async findById(certificationId: string, language?: string) {
    if (!certificationId || certificationId === ":id") {
      throw new Exception("ID da certificação inválido", 400);
    }
    const certification = await this.certificationRepository.findById(certificationId);
    if (!certification) {
      throw new Exception("Certificação não encontrada", 404);
    }
    const [translated] = await applyTranslations("certification", [certification], language);
    return translated ?? certification;
  }

  async addCertification(certification: CertificationAddRequest) {
    try {
      const certificationData: CertificationAddRequest = {
        ...certification,
        expirationDate: certification.expirationDate ? certification.expirationDate : undefined,
        credentialId: certification.credentialId?.length ? certification.credentialId : undefined,
        badgeImageUrl: certification.badgeImageUrl?.length ? certification.badgeImageUrl : undefined,
        certificateFile: certification.certificateFile?.length ? certification.certificateFile : undefined,
      };
      certificationSchema.parse(certificationData);
      const created = await this.certificationRepository.addCertification(certificationData);
      await enqueueTranslation("certification", created.id, created);
      return created;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Erro ao adicionar certificação", 400);
      }
      throw new Exception(`Informe os dados corretamente: ${e}`, 400);
    }
  }

  async updateCertification(certification: CertificationUpdate, certificationId: string) {
    if (!certificationId || certificationId === ":id") {
      throw new Exception("ID da certificação inválido", 400);
    }

    const existingCertification = await this.certificationRepository.findById(certificationId);
    if (!existingCertification) {
      throw new Exception("Certificação não encontrada", 404);
    }

    try {
      const certificationData: CertificationUpdate = {
        ...certification,
        issueDate: certification.issueDate && new Date(certification.issueDate),
        expirationDate: certification.expirationDate && new Date(certification.expirationDate),
        credentialId: certification.credentialId?.length ? certification.credentialId : undefined,
        badgeImageUrl: certification.badgeImageUrl?.length ? certification.badgeImageUrl : undefined,
        certificateFile: certification.certificateFile?.length ? certification.certificateFile : undefined,
      };
      certificationSchemaOptional.parse(certificationData);
      const updated = await this.certificationRepository.updateCertification(certificationData, certificationId);
      await enqueueTranslation("certification", updated.id, updated);
      return updated;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "Erro ao atualizar certificação", 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  async deleteCertification(certificationId: string) {
    if (!certificationId || certificationId === ":id") {
      throw new Exception("ID da certificação inválido", 400);
    }

    const existingCertification = await this.certificationRepository.findById(certificationId);
    if (!existingCertification) {
      throw new Exception("Certificação não encontrada", 404);
    }

    const deleted = await this.certificationRepository.deleteCertification(certificationId);
    await removeTranslations("certification", certificationId);
    return deleted;
  }
}
