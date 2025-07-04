import git from "git-rev-sync";
import { prisma } from "../prisma/prismaClient";

export class StatusService {
  async getStatus() {
    const database: any = {};
    const server: any = {};
    const gitInfo: any = {};

    try {
      const start = Date.now();
      await prisma.$runCommandRaw({ ping: 1 });
      const latency = Date.now() - start;

      const stats = await prisma.$runCommandRaw({ serverStatus: 1 });

      database.status = "healthy";
      database.latência = `${latency}ms`;
      database.conexões = stats.connections;
      database.versão = stats.version;
    } catch (err: any) {
      database.status = "unhealthy";
      database.erro = err.message;
    }

    server.status = "healthy";
    server.ambiente = process.env.NODE_ENV || "development";
    server.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    server.versão_node = process.version;
    server.plataforma = process.platform;
    server.região = process.env.RENDER_REGION || "desconhecida";

    try {
      gitInfo.sha_commit = git.short();
      gitInfo.autor_último_commit = "Owner do repositório";
      gitInfo.branch = git.branch();
    } catch (err) {
      gitInfo.sha_commit = "unknown";
      gitInfo.autor_último_commit = "unknown";
      gitInfo.branch = "unknown";
      gitInfo.erro = "Git info não disponível no runtime";
      gitInfo.erro.details = err;
    }

    return {
      updatedAt: new Date().toISOString(),
      database,
      server,
      git: gitInfo,
    };
  }
}
