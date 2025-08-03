import { service } from "@prisma/client";
import { ServicesRepository } from "../repository/servicesRepository";
import { Exception } from "../utils/exception";

export class ServicesOwnerService {
  private servicesRepository = new ServicesRepository();
  public async getServicesItems(ownerId: string) {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const [services, connections] = await Promise.all([
      this.servicesRepository.getAllServices(ownerId),
      this.servicesRepository.getAllConnections(),
    ]);

    const serviceWithTech = await Promise.all(
      services.map(async (s:service) => ({
        ...s,
        price: {
          min: s.priceMin,
          max: s.priceMax,
          currency: s.currency,
        },
        complexityTier: s.complexity === "avançado" ? 2 : s.complexity === "intermediario" ? 1 : 0,
        technologies:
          s.category === "fullstack"
            ? await this.servicesRepository.getTechByCategory()
            : await this.servicesRepository.getTechByCategory(s.category),
      }))
    );

    const texts = {
      title: "Meus Serviços",
      description:
        "Soluções completas em desenvolvimento fullstack, desde a concepção até a implementação, conectando todas as partes do seu projeto de forma eficiente.",
      cta: "Interessado em algum serviço? Vamos conversar sobre seu projeto!",
      ctaBtn: "Entrar em Contato",
    };
    return { services: serviceWithTech, connections, texts };
  }
}
