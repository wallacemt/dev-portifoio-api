export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  details: string;
  items: string[];
}

export const servicesData = {
  services: [
    {
      id: crypto.randomUUID(),
      name: "Desenvolvimento de Aplicações Web",
      description: "Criação de aplicações web modernas e responsivas.",
      details: "Uso de tecnologias como React, Next.js e Tailwind CSS.",
      items: [
        "Arquitetura SPA e SSR",
        "Utilização de hooks e context API",
        "Responsividade com Tailwind CSS",
        "Deploy com Vercel ou Netlify",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Desenvolvimento de APIs REST",
      description: "Criação de APIs escaláveis e seguras.",
      details: "Uso de Node.js, Express, Spring Boot e autenticação JWT.",
      items: [
        "Criação de rotas RESTful",
        "Autenticação com JWT",
        "Middleware para validação e logging",
        "Documentação com Swagger",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Desenvolvimento Frontend",
      description: "Implementação de interfaces dinâmicas e interativas.",
      details: "Especialista em React, Tailwind e animações com Framer Motion.",
      items: [
        "Componentização e reutilização de UI",
        "Gerenciamento de estado com Redux ou Context API",
        "Animações com Framer Motion",
        "Acessibilidade e boas práticas UX/UI",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Desenvolvimento Backend",
      description: "Criação de servidores robustos e performáticos.",
      details: "Trabalho com bancos SQL e NoSQL, além de microsserviços.",
      items: [
        "Arquitetura MVC",
        "Integração com bancos PostgreSQL e MongoDB",
        "Criação de microsserviços com Node.js ou Spring Boot",
        "Mensageria com RabbitMQ ou Kafka",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Integração com APIs de Terceiros",
      description: "Conexão com serviços como TMDb e Stripe.",
      details: "Uso de Axios, GraphQL e otimização de requisições.",
      items: [
        "Consumo de APIs REST e GraphQL",
        "Pagamentos com Stripe ou Mercado Pago",
        "Autenticação via OAuth (Google, GitHub)",
        "Tratamento de erros e timeouts",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Documentação de Projetos",
      description: "Criação de documentação técnica detalhada.",
      details: "Utilização de Swagger, Postman e Notion para documentação.",
      items: [
        "Especificação OpenAPI com Swagger",
        "Coleções organizadas no Postman",
        "Wiki de projetos no Notion",
        "Diagramas UML e ER",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Otimização de Performance",
      description: "Otimização de performance e otimização de recursos.",
      details: "Uso de práticas de otimização de performance e otimização de recursos.",
      items: [
        "Lazy loading de imagens e componentes",
        "Code splitting com Webpack ou Next.js",
        "Análise de performance com Lighthouse",
        "Minificação e compressão de assets",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "Testes Automatizados",
      description: "Garantia de qualidade através de testes automatizados.",
      details: "Utilização de Jest, React Testing Library, e Cypress.",
      items: [
        "Testes unitários com Jest",
        "Testes de integração com Supertest",
        "Testes e2e com Cypress",
        "Cobertura de testes e CI",
      ],
    },
    {
      id: crypto.randomUUID(),
      name: "DevOps e Deploy",
      description: "Automatização de processos e deploy contínuo.",
      details: "Trabalho com Docker, GitHub Actions e CI/CD.",
      items: [
        "Criação de containers com Docker",
        "Pipelines com GitHub Actions",
        "Deploy em ambientes como Vercel, Heroku, Render",
        "Monitoramento com LogRocket ou Sentry",
      ],
    },
  ],
};

