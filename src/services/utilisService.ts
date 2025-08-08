import { ServicesRepository } from "../repository/servicesRepository";
import { LanguageApiResponse } from "../types/utils";

interface NavbarItem {
  name: string;
  path: string;
}
interface NavbarItens {
  itens: NavbarItem[];
  callText: string;
}
const navbarItems: NavbarItens = {
  itens: [
    {
      name: "Início",
      path: "/",
    },
    {
      name: "Projetos",
      path: "/projects",
    },
    {
      name: "Habilidades",
      path: "/skills",
    },
    {
      name: "Serviços",
      path: "/services",
    },
    {
      name: "Formação",
      path: "/formation",
    },
  ],
  callText: "Disponível para novos projetos",
};

const defaultLenguages: LanguageApiResponse = {
  translation: [
    {
      pt: {
        name: "Portuguese (Brazil)",
        nativeName: "Português (Brasil)",
        dir: "ltr",
      },
      en: {
        name: "English",
        nativeName: "English",
        dir: "ltr",
      },
      es: {
        name: "Spanish",
        nativeName: "Español",
        dir: "ltr",
      },
      fr: {
        name: "French",
        nativeName: "Français",
        dir: "ltr",
      },
      ja: {
        name: "Japanese",
        nativeName: "日本語",
        dir: "ltr",
      },
      ko: {
        name: "Korean",
        nativeName: "한국어",
        dir: "ltr",
      },
      zh: {
        name: "Chinese",
        nativeName: "中文",
        dir: "ltr",
      },
      it: {
        name: "Italian",
        nativeName: "Italiano",
        dir: "ltr",
      },
    },
  ],
};
export class UtilisService {
  private servicesRepository = new ServicesRepository();
  public getNavbarItems(): NavbarItens {
    return navbarItems;
  }

  public async getLeguageApiReferenceUrl(): Promise<LanguageApiResponse> {
    return defaultLenguages;
  }
}
