import swaggerJSDoc from 'swagger-jsdoc';

export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Developer Portfolio API',
      version: '1.0.0',
      description:
        'Documentação da API de portfólio pessoal com autenticação e CRUDs.',
    },
    servers: [
      {
        url: 'http://localhost:8081',
        description: 'Servidor de Desenvolvimento',
      },
      {
        url: 'https://dev-portifoio-api.onrender.com',
        description: 'Servidor de Produção',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    './src/controllers/**/*.ts',
    './src/docs/schemas/*.yaml',
    './src/docs/paths/*.yaml',
  ],
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);
