import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const servicesData = [
  {
    sId: "frontend-dev",
    title: "Desenvolvimento Frontend",
    description: "Criação de interfaces modernas e responsivas com React, Next.js e tecnologias atuais.",
    icon: "🎨",
    technologies: ["React", "Next.js", "TypeScript", "Tailwind CSS"],
    category: "frontend",
    complexity: "intermediate",
    deliveryTime: "2-4 semanas",
    priceMin: 800,
    priceMax: 2500,
    currency: "R$",
  },
  {
    sId: "backend-dev",
    title: "Desenvolvimento Backend",
    description: "APIs robustas e escaláveis com Node.js, Express, e bancos de dados modernos.",
    icon: "⚙️",
    technologies: ["Node.js", "Express", "MongoDB", "PostgreSQL"],
    category: "backend",
    complexity: "advanced",
    deliveryTime: "3-6 semanas",
    priceMin: 1200,
    priceMax: 3500,
    currency: "R$",
  },
  {
    sId: "fullstack-app",
    title: "Aplicação Full Stack",
    description: "Desenvolvimento completo de aplicações web com frontend e backend integrados.",
    icon: "🚀",
    technologies: ["React", "Node.js", "MongoDB", "Docker"],
    category: "fullstack",
    complexity: "advanced",
    deliveryTime: "6-12 semanas",
    priceMin: 2500,
    priceMax: 8000,
    currency: "R$",
  },
  {
    sId: "mobile-app",
    title: "Aplicativo Mobile",
    description: "Desenvolvimento de aplicativos mobile nativos e híbridos para iOS e Android.",
    icon: "📱",
    technologies: ["React Native", "Expo", "Firebase", "TypeScript"],
    category: "mobile",
    complexity: "advanced",
    deliveryTime: "8-16 semanas",
    priceMin: 3000,
    priceMax: 10000,
    currency: "R$",
  },
  {
    sId: "devops-setup",
    title: "Configuração DevOps",
    description: "Configuração de pipelines CI/CD, containerização e deployment automatizado.",
    icon: "🔧",
    technologies: ["Docker", "AWS", "GitHub Actions", "Nginx"],
    category: "devops",
    complexity: "intermediate",
    deliveryTime: "1-3 semanas",
    priceMin: 600,
    priceMax: 2000,
    currency: "R$",
  },
  {
    sId: "api-integration",
    title: "Integração de APIs",
    description: "Integração com APIs externas, pagamentos, autenticação e serviços terceirizados.",
    icon: "🔗",
    technologies: ["REST API", "GraphQL", "OAuth", "Stripe"],
    category: "backend",
    complexity: "intermediate",
    deliveryTime: "1-2 semanas",
    priceMin: 400,
    priceMax: 1500,
    currency: "R$",
  },
];

async function main() {
  // Limpar dados existentes
  await prisma.connection.deleteMany({});
  await prisma.service.deleteMany({});

  // Criação dos serviços
  const services = await Promise.all(
    servicesData.map(async (service) => {
      return await prisma.service.create({
        data: service,
      });
    })
  );

  // Criar mapeamento de IDs personalizados para ObjectIds reais
  const serviceMap = services.reduce((map, service) => {
    const originalData = servicesData.find((s) => s.title === service.title);
    if (originalData) {
      map[originalData.sId] = service.id;
    }
    return map;
  }, {} as Record<string, string>);

  // Criando as conexões entre os serviços usando os IDs reais
  await prisma.connection.createMany({
    data: [
      { fromId: serviceMap["frontend-dev"], toId: serviceMap["fullstack-app"], type: "integration" },
      { fromId: serviceMap["backend-dev"], toId: serviceMap["fullstack-app"], type: "integration" },
      { fromId: serviceMap["fullstack-app"], toId: serviceMap["mobile-app"], type: "data-flow" },
      { fromId: serviceMap["backend-dev"], toId: serviceMap["api-integration"], type: "dependency" },
      { fromId: serviceMap["fullstack-app"], toId: serviceMap["devops-setup"], type: "dependency" },
      { fromId: serviceMap["mobile-app"], toId: serviceMap["api-integration"], type: "data-flow" },
    ],
  });

  console.log("Database seeded successfully!");
  console.log(`Created ${services.length} services`);
  console.log("Service mapping:", serviceMap);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
