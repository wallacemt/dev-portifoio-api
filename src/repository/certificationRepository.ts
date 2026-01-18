import { prisma } from "../prisma/prismaClient";
import type { CertificationAddRequest, CertificationUpdate } from "../types/badges";

export class CertificationRepository {
  async findAllCertifications(ownerId: string) {
    return await prisma.certification.findMany({
      where: { ownerId },
      orderBy: { issueDate: "desc" },
    });
  }

  async findById(certificationId: string) {
    return await prisma.certification.findUnique({
      where: { id: certificationId },
    });
  }

  async addCertification(certification: CertificationAddRequest) {
    return await prisma.certification.create({
      data: { ...certification },
    });
  }

  async updateCertification(certification: CertificationUpdate, certificationId: string) {
    return await prisma.certification.update({
      where: { id: certificationId },
      data: { ...certification },
    });
  }

  async deleteCertification(certificationId: string) {
    return await prisma.certification.delete({
      where: { id: certificationId },
    });
  }
}
