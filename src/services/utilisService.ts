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
      name: "Home",
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

const servicesItems = {
  desenvolvimento_aplicacoes_web: {
    name: "Desenvolvimento de Aplicações Web",
    description: "Criação de aplicações web modernas e responsivas.",
    details: "Uso de tecnologias como React, Next.js e Tailwind CSS.",
  },
  desenvolvimento_apis_rest: {
    name: "Desenvolvimento de APIs REST",
    description: "Criação de APIs escaláveis e seguras.",
    details: "Uso de Node.js, Express, Spring Boot e autenticação JWT.",
  },
  desenvolvimento_frontend: {
    name: "Desenvolvimento Frontend",
    description: "Implementação de interfaces dinâmicas e interativas.",
    details: "Especialista em React, Tailwind e animações com Framer Motion.",
  },
  desenvolvimento_backend: {
    name: "Desenvolvimento Backend",
    description: "Criação de servidores robustos e performáticos.",
    details: "Trabalho com bancos SQL e NoSQL, além de microsserviços.",
  },
  integracao_apis_terceiros: {
    name: "Integração com APIs de Terceiros",
    description: "Conexão com serviços como TMDb e Stripe.",
    details: "Uso de Axios, GraphQL e otimização de requisições.",
  },
  documentacao_projetos: {
    name: "Documentação de Projetos",
    description: "Criação de documentação técnica detalhada.",
    details: "Utilização de Swagger, Postman e Notion para documentação.",
  },
  testes_unitarios: {
    name: "Testes Unitários e de Integração",
    description: "Implementação de testes para garantir a qualidade do código.",
    details: "Uso de Jest, Mocha e Cypress para testes automatizados.",
  },
  otimizacao_performance: {
    name: "Otimização de Performance",
    description: "Otimização de performance e otimização de recursos.",
    details: "Uso de práticas de otimização de performance e otimização de recursos.",
  },
};

const leguageApiReferenceUrl = "https://api.cognitive.microsofttranslator.com/languages?api-version=3.0";

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
      it: {
        name: "Italian",
        nativeName: "Italiano",
        dir: "ltr",
      },
    },
  ],
};
export class UtilisService {
  public getNavbarItems(): NavbarItens {
    return navbarItems;
  }
  public getServicesItems(): Record<string, { name: string; description: string; details: string }> {
    return servicesItems;
  }

  public async getLeguageApiReferenceUrl(): Promise<LanguageApiResponse> {
    return defaultLenguages;
  }
}
