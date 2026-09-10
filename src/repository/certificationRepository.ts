import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma/prismaClient";
import type { CertificationAddRequest, CertificationUpdate } from "../types/badges";

export class CertificationRepository {
  async findAllCertifications(ownerId: string, filters: Prisma.certificationWhereInput = {}, skip?: number, take?: number) {
    return await prisma.certification.findMany({
      where: { ...filters, ownerId },
      orderBy: [{ issueDate: "desc" }, { id: "asc" }],
      skip,
      take,
    });
  }

  countCertifications(ownerId: string, filters: Prisma.certificationWhereInput) {
    return prisma.certification.count({ where: { ...filters, ownerId } });
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
