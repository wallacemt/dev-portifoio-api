import { ZodError } from "zod";
import { OwnerRepository } from "../repository/ownerRepository";
import { AnalyticsRepository } from "../repository/analyticsRepository";
import { OwnerAnalysisResponse, OwnerDataOptionalRequest, OwnerDataResponse } from "../types/owner";
import { Exception } from "../utils/exception";
import { ownerSchemaOptional } from "../validations/ownerValidations";
import { hashPassword, verifyPassword } from "../utils/hash";

export class OwnerService {
  private ownerRepository = new OwnerRepository();
  private analyticsRepository = new AnalyticsRepository();
  public async getOwner(
    ownerId: string
  ): Promise<OwnerDataResponse & { welcomeMessage: string; buttons: { project: string; curriculo: string } }> {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const owner = await this.ownerRepository.findById(ownerId);
    if (!owner) throw new Exception("Owner não  Encontrado!", 404);
    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      avatar: owner.avatar,
      about: owner.about,
      occupation: owner.occupation,
      birthDate: owner.birthDate,
      cvLinkPT: owner.cvLinkPT || null,
      cvLinkEN: owner.cvLinkEN || null,
      welcomeMessage: `Olá, eu sou ${owner.name}!`,
      buttons: {
        project: "Ver Projetos",
        curriculo: "Curriculo",
      },
    };
  }

  public async updateOwner(ownerUpdateData: OwnerDataOptionalRequest, ownerId: string) {
    try {
      ownerSchemaOptional.parse(ownerUpdateData);
      return await this.ownerRepository.updateOwner(ownerUpdateData, ownerId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }

  public async setSecretWord(ownerId: string, secretWord: string): Promise<void> {
    if (!secretWord || secretWord.length < 3) {
      throw new Exception("A palavra secreta deve ter pelo menos 3 caracteres", 400);
    }
    console.log("Setting secret word for ownerId:", ownerId);
    console.log("Secret word (plain):", secretWord);
    const hashedSecretWord = await hashPassword(secretWord);
    return await this.ownerRepository.setSecretWord(hashedSecretWord, ownerId);
  }

  public async verifySecretWord(ownerId: string, secretWord: string): Promise<{ status: number; isValid: boolean }> {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    if (!secretWord || secretWord.length < 3) {
      throw new Exception("A palavra secreta deve ter pelo menos 3 caracteres", 400);
    }
    const owner = await this.ownerRepository.findById(ownerId);
    if (!owner || !owner.secretWord) {
      throw new Exception("Owner não encontrado ou palavra secreta não definida", 404);
    }
    if (!(await verifyPassword(owner.secretWord, secretWord))) {
      throw new Exception("Palavra secreta incorreta", 401);
    }
    return { status: 200, isValid: true };
  }

  public async getOwnerAnalysis(ownerId: string): Promise<OwnerAnalysisResponse> {
    if (!ownerId) throw new Exception("ID de owner invalido", 400);

    const analysis = await this.ownerRepository.getOwnerAnalysis(ownerId);
    if (!analysis) throw new Exception("Owner não encontrado", 404);

    // Buscar analytics dos últimos 30 dias
    try {
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const today = new Date();
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [
        uniqueVisitors,
        totalPageViews,
        deviceBreakdown,
        topPages,
        bounceRate,
        avgTimeSpent,
        todayVisitors,
        weekAgoVisitors,
        realTimeData,
      ] = await Promise.all([
        this.analyticsRepository.getUniqueVisitors(ownerId, startDate, endDate),
        this.analyticsRepository.getTotalPageViews(ownerId, startDate, endDate),
        this.analyticsRepository.getDeviceBreakdown(ownerId, startDate, endDate),
        this.analyticsRepository.getTopPages(ownerId, startDate, endDate, 5),
        this.analyticsRepository.getBounceRate(ownerId, startDate, endDate),
        this.analyticsRepository.getAverageTimeSpent(ownerId, startDate, endDate),
        this.analyticsRepository.getUniqueVisitors(ownerId, today, today),
        this.analyticsRepository.getUniqueVisitors(ownerId, lastWeek, lastWeek),
        this.analyticsRepository.getRealTimeAnalytics(ownerId),
      ]);

      const weeklyGrowth = weekAgoVisitors > 0 ? ((todayVisitors - weekAgoVisitors) / weekAgoVisitors) * 100 : 0;

      return {
        projectsCount: analysis.projectsCount,
        skillsCount: analysis.skillsCount,
        formationsCount: analysis.formationsCount,
        servicesCount: analysis.servicesCount,
        analytics: {
          totalVisitors: uniqueVisitors,
          uniqueVisitors,
          pageViews: totalPageViews,
          bounceRate,
          avgTimeSpent,
          topPages,
          deviceBreakdown: {
            desktop: deviceBreakdown.desktop || 0,
            mobile: deviceBreakdown.mobile || 0,
            tablet: deviceBreakdown.tablet || 0,
          },
          recentActivity: {
            activeVisitors: realTimeData.activeVisitors,
            todayVisitors,
            weeklyGrowth,
          },
        },
      };
    } catch (analyticsError) {
      // Se houver erro nas analytics, retorna apenas os dados básicos
      console.error("Erro ao buscar analytics:", analyticsError);
      return {
        projectsCount: analysis.projectsCount,
        skillsCount: analysis.skillsCount,
        formationsCount: analysis.formationsCount,
        servicesCount: analysis.servicesCount,
      };
    }
  }
}
