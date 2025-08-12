import type { JsonValue } from "@prisma/client/runtime/library";
import { env } from "../env";
import { prisma } from "../prisma/prismaClient";

export class StatusService {
  async getStatus() {
    const database: {
      status: string;
      latencia: string;
      conexoes?: JsonValue;
      versao?: JsonValue;
      erro?: string;
    } = {
      status: "",
      latencia: "",
    };
    const server: {
      status: string;
      ambiente: string;
      timezone: string;
      versao_node: string;
      plataforma: string;
      regiao: string;
    } = {
      status: "healthy",
      ambiente: env.NODE_ENV || "development",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      versao_node: process.version,
      plataforma: process.platform,
      regiao: "oregon-us-west",
    };

    try {
      const start = Date.now();
      await prisma.$runCommandRaw({ ping: 1 });
      const latency = Date.now() - start;

      const stats = await prisma.$runCommandRaw({ serverStatus: 1 });
      database.status = "healthy";
      database.latencia = `${latency}ms`;
      database.conexoes = stats.connections;
      database.versao = stats.version;
    } catch (err: unknown) {
      database.status = "unhealthy";
      database.erro = (err as Error).message;
    }

    return {
      updatedAt: new Date().toISOString(),
      database,
      server,
    };
  }
}
