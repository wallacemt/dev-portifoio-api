import { skill } from "@prisma/client";
import { prisma } from "../prisma/prismaClient";

export class ServicesRepository {
  async getAllServices(ownerId: string) {
    return await prisma.service.findMany({
      where: {
        ownerId,
      },
      orderBy: {
        title: "asc",
      },
    });
  }
  async getAllConnections() {
    return await prisma.connection.findMany({
      orderBy: {
        type: "asc",
      },
    });
  }

  async getTechByCategory(category?: string) {
    const data = await prisma.skill.findMany({
      where: {
        stack: category,
      },
      orderBy: {
        title: "asc",
      },
    });
    if (data.length === 0) {
      return [];
    }
    return [...data.map((skill: skill) => ({ title: skill.title, id: skill.id }))];
  }
}
