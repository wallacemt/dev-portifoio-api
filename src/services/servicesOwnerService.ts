import { getUiTexts } from "../i18n";
import { ServicesRepository } from "../repository/servicesRepository";
import { applyTranslations } from "../translation/applyTranslations";
import type { Service } from "../types/services";
import { Exception } from "../utils/exception";

export class ServicesOwnerService {
  private servicesRepository = new ServicesRepository();
  async getServicesItems(ownerId: string, language?: string) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const [services, connections] = await Promise.all([
      this.servicesRepository.getAllServices(ownerId),
      this.servicesRepository.getAllConnections(),
    ]);

    const serviceWithTech = await Promise.all(
      services.map(async (s: Service) => ({
        ...s,
        price: {
          min: s.priceMin,
          max: s.priceMax,
          currency: s.currency,
        },
        complexityTier: (() => {
          switch (s.complexity) {
            case "avançado":
              return 2;
            case "intermediario":
              return 1;
            default:
              return 0;
          }
        })(),
        technologies:
          s.category === "fullstack"
            ? await this.servicesRepository.getTechByCategory()
            : await this.servicesRepository.getTechByCategory(s.category),
      }))
    );

    const texts = getUiTexts("service", language);
    const translatedServices = await applyTranslations("service", serviceWithTech, language);
    return { services: translatedServices, connections, texts };
  }
}
