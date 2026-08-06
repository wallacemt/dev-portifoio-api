import { getUiTexts } from "../i18n";
import type { LanguageApiResponse } from "../types/utils";

interface NavbarItem {
  name: string;
  path: string;
}
interface NavbarItens {
  itens: NavbarItem[];
  callText: string;
}

interface NavbarTexts {
  navbar: {
    items: {
      home: string;
      projects: string;
      skills: string;
      services: string;
      formation: string;
    };
    callText: string;
  };
}

// Route paths are structural, not translatable — only the labels come from i18n.
const navbarRoutes: { key: keyof NavbarTexts["navbar"]["items"]; path: string }[] = [
  { key: "home", path: "/" },
  { key: "projects", path: "/projects" },
  { key: "skills", path: "/skills" },
  { key: "services", path: "/services" },
  { key: "formation", path: "/formation" },
];

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
  getNavbarItems(language?: string): NavbarItens {
    const texts = getUiTexts<NavbarTexts>("utilis", language);
    return {
      itens: navbarRoutes.map(({ key, path }) => ({ name: texts.navbar.items[key], path })),
      callText: texts.navbar.callText,
    };
  }

  getLeguageApiReferenceUrl(): LanguageApiResponse {
    return defaultLenguages;
  }
}
