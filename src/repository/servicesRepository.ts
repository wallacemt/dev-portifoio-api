import { prisma } from "../prisma/prismaClient";

export class ServicesRepository {
  async getAllServices() {
    return await prisma.service.findMany({
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
}
