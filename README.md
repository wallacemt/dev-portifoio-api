# 🚀 Developer Portfolio Backend API

Uma API RESTful completa para portfólio pessoal, desenvolvida em TypeScript com Node.js, Express e Prisma ORM. A API oferece recursos de autenticação JWT, CRUD completo para projetos, habilidades e formações, além de tradução automática multi-idioma usando OpenRouter AI.

## 📋 Índice

- [Recursos](#recursos)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso](#uso)
- [API Endpoints](#api-endpoints)
- [Autenticação](#autenticação)
- [Tradução Multi-idioma](#tradução-multi-idioma)
- [Docker](#docker)
- [Testes](#testes)
- [Documentação da API](#documentação-da-api)
- [Contribuição](#contribuição)

## ✨ Recursos

### 🔐 Autenticação e Segurança

- Autenticação JWT com tokens de 7 dias
- Proteção contra ataques de força bruta (máx. 3 tentativas)
- Hash de senhas com Argon2
- Middleware de autenticação para rotas privadas

### 📊 Gerenciamento de Dados

- **Projetos**: CRUD completo com filtros, paginação e ativação/desativação
- **Habilidades**: Organização por stack e tipo com sub-habilidades
- **Formações**: Gerenciamento de certificações e cursos
- **Perfil do Owner**: Atualização de dados pessoais e profissionais

### 🌍 Tradução Automática

- Tradução automática usando OpenRouter AI
- Cache inteligente de 24 horas para otimização
- Gerenciamento de quota com rate limiting
- Fallback para dados originais quando quota esgotada
- Suporte a múltiplos idiomas

### 🛠️ Recursos Técnicos

- Arquitetura em camadas (Controller → Service → Repository)
- Validação de dados com Joi e Zod
- Documentação automática com Swagger
- Logs de requisições em desenvolvimento
- Tratamento centralizado de erros

## 🛠️ Tecnologias

### Backend

- **Node.js** - Runtime JavaScript
- **TypeScript** - Superset tipado do JavaScript
- **Express** - Framework web minimalista
- **Prisma ORM** - ORM moderno para TypeScript/JavaScript

### Banco de Dados

- **MongoDB** - Banco de dados NoSQL

### Autenticação e Segurança

- **JWT** - JSON Web Tokens para autenticação
- **Argon2** - Hash de senhas seguro
- **CORS** - Cross-Origin Resource Sharing

### IA e Tradução

- **OpenRouter** - Serviço de tradução automática (via `fetch` nativo, sem SDK)
- Sistema de cache e quota inteligente

### Testes e Documentação

- **Jest** - Framework de testes
- **Supertest** - Testes de API HTTP
- **Swagger** - Documentação automática da API

### DevOps

- **Docker** - Containerização
- **Docker Compose** - Orquestração de containers

## 📋 Pré-requisitos

- Node.js (versão 18 ou superior)
- npm ou yarn
- MongoDB (local ou Atlas)
- Docker (opcional)

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/wallacemt/dev-portifoio-api.git
cd dev-portifoio-api
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Ambiente
NODE_ENV=dev

# Banco de dados
MONGODB_URI=mongodb://localhost:27017/portfolio

# Servidor
PORT=8081
FRONTEND_URL=http://localhost:3000

# Autenticação
JWT_SECRET=sua_chave_jwt_super_secreta_aqui

# OpenRouter (para tradução) — https://openrouter.ai/keys
OPENROUTER_API_KEY=sua_chave_openrouter_aqui
AI_MODEL=google/gemma-4-31b-it:free
```

### 4. Configure o banco de dados

```bash
# Gera o cliente Prisma
npm run db:generate

# Sincroniza o schema com o banco
npm run db
```

## 🎯 Uso

### Desenvolvimento

```bash
# Inicia o servidor em modo desenvolvimento
npm run dev
```

### Produção

```bash
# Constrói o projeto
npm run build

# Inicia o servidor de produção
npm start
```

### Docker

```bash
# Inicia com Docker Compose
npm run prod:up

# Para o container
npm run prod:down
```

O servidor estará disponível em `http://localhost:8081`

### Worker de tradução

A tradução automática do conteúdo do owner (Blueprint-001) roda em um **processo
separado** do servidor HTTP — configurar `REDIS_URL` no `.env` não é suficiente,
o worker precisa ser efetivamente iniciado:

```bash
# Local, fora do Docker (precisa de um Redis rodando e alcançável via REDIS_URL)
bun run worker

# Rodar o backfill uma vez e encerrar (traduz o conteúdo já existente)
bun run worker:backfill
```

Via `docker compose up`, os serviços `redis` e `worker` já sobem junto com `app` —
nenhum passo manual extra é necessário nesse caso.

## 📡 API Endpoints

### 🔐 Autenticação (`/auth`)

```http
POST /auth/register      # Cadastro de novo owner
POST /auth/login         # Login do owner
GET  /auth               # Status da autenticação
```

### 👤 Owner (`/owner`)

```http
# Rotas públicas
GET  /owner/:ownerId     # Buscar dados do owner

# Rotas privadas (requer JWT)
PUT  /owner/private/update  # Atualizar dados do owner
```

### 🚀 Projetos (`/projects`)

```http
# Rotas públicas
GET  /projects/owner/:ownerId        # Listar projetos (com filtros)
GET  /projects/owner/:ownerId/techs  # Listar tecnologias usadas

# Rotas privadas (requer JWT)
POST /projects/private/create             # Criar projeto
PUT  /projects/private/:id/update         # Atualizar projeto
DELETE /projects/private/:id/delete       # Deletar projeto
PUT  /projects/private/:id/handle-activate # Ativar/desativar projeto
```

### 🛠️ Habilidades (`/skills`)

```http
# Rotas públicas
GET  /skills/owner/:ownerId  # Listar habilidades
GET  /skills/types           # Listar tipos de habilidades

# Rotas privadas (requer JWT)
POST /skills/private/create        # Criar habilidade
PUT  /skills/private/:id/update    # Atualizar habilidade
DELETE /skills/private/:id/delete  # Deletar habilidade
```

### 🎓 Formações (`/formations`)

```http
# Rotas públicas
GET  /formations/owner/:ownerId  # Listar formações
GET  /formations/types           # Listar tipos de formações

# Rotas privadas (requer JWT)
POST /formations/private/create        # Criar formação
PUT  /formations/private/:id/update    # Atualizar formação
DELETE /formations/private/:id/delete  # Deletar formação
```

### 🔧 Utilitários (`/utilis`)

```http
GET  /utilis/navbar     # Itens da navegação
GET  /utilis/services   # Lista de serviços oferecidos
GET  /utilis/languages  # Idiomas suportados para tradução
```

### 📊 Status (`/status`)

```http
GET  /status            # Status da aplicação e sistema
```

## 🔐 Autenticação

A API usa JWT (JSON Web Tokens) para autenticação. Para acessar rotas privadas:

1. **Registre-se ou faça login** para obter um token
2. **Inclua o token** no header das requisições:

```http
Authorization: Bearer seu_jwt_token_aqui
```

### Exemplo de registro:

```json
POST /auth/register
{
  "name": "João Silva",
  "email": "joao@exemplo.com",
  "password": "senha123",
  "about": "Desenvolvedor Full Stack",
  "occupation": "Software Engineer",
  "birthDate": "1990-01-01"
}
```

### Exemplo de login:

```json
POST /auth/login
{
  "email": "joao@exemplo.com",
  "password": "senha123"
}
```

## 🌍 Tradução Multi-idioma

A API oferece tradução automática usando OpenRouter AI:

### Como usar:

Adicione o parâmetro `language` em qualquer endpoint público:

```http
GET /projects/owner/123?language=en
GET /skills/owner/123?language=es
GET /formations/owner/123?language=fr
```

### Recursos de tradução:

- **Cache inteligente**: Traduções são cached por 24 horas
- **Gerenciamento de quota**: Proteção contra esgotamento da quota da API
- **Fallback automático**: Retorna dados originais se a tradução falhar
- **Rate limiting**: Controle automático de requisições

### Idiomas suportados:

Consulte `/utilis/languages` para lista completa de idiomas suportados.

## 🐳 Docker

### Configuração Docker

```dockerfile
# Dockerfile já configurado para produção
# Usa Node.js 22 Alpine para otimização
```

### Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "8081:8081"
    volumes:
      - ./src:/app/src
      - ./prisma:/app/prisma
```

### Comandos úteis:

```bash
# Construir e iniciar
docker compose up -d

# Ver logs
docker compose logs -f

# Parar containers
docker compose down
```

## 🧪 Testes

### Executar testes:

```bash
# Todos os testes
npm test

# Modo watch (desenvolvimento)
npm run test:watch
```

### Estrutura de testes:

- **Unit tests**: Testam serviços e funções isoladamente
- **Integration tests**: Testam endpoints da API
- **Mocks**: Prisma mockado para testes; parsing de IA coberto por testes unitários

## 📚 Documentação da API

### Swagger UI

Acesse a documentação interativa em:

```
http://localhost:8081/docs
```

### Recursos da documentação:

- **Explorar endpoints**: Interface interativa
- **Testar requisições**: Execute chamadas diretamente na documentação
- **Schemas**: Visualize modelos de dados
- **Autenticação**: Teste com JWT tokens

### OpenAPI Spec

A especificação OpenAPI está disponível em formato YAML em `/src/docs/`.

## 🏗️ Arquitetura

### Estrutura de pastas:

```
src/
├── controllers/     # Controladores HTTP
├── services/        # Lógica de negócio
├── repository/      # Acesso ao banco de dados
├── middleware/      # Middlewares (auth, logs)
├── validations/     # Validações de dados
├── types/           # Tipos TypeScript
├── utils/           # Utilitários
├── docs/            # Documentação Swagger
└── tests/           # Testes automatizados
```

### Fluxo de dados:

```
Request → Controller → Service → Repository → Database
                    ↓
Response ← Controller ← Service ← Repository ← Database
```

## 🔧 Scripts NPM

```json
{
  "dev": "Desenvolvimento com hot reload",
  "build": "Compilar TypeScript",
  "start": "Iniciar servidor de produção",
  "test": "Executar testes",
  "test:watch": "Testes em modo watch",
  "db": "Sincronizar schema do Prisma",
  "db:generate": "Gerar cliente Prisma",
  "db:studio": "Abrir Prisma Studio",
  "prod:up": "Docker Compose up",
  "prod:down": "Docker Compose down"
}
```

## 🌟 Recursos Avançados

### Quota Management

- Monitoramento automático de uso da API OpenRouter
- Rate limiting inteligente
- Logs detalhados de uso de quota

### Error Handling

- Tratamento centralizado de erros
- Códigos de status HTTP apropriados
- Mensagens de erro descritivas

### Security Features

- Proteção contra ataques de força bruta
- Validação rigorosa de dados de entrada
- Hash seguro de senhas com Argon2

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença ISC. Veja o arquivo `LICENSE` para mais detalhes.

## 👨‍💻 Autor
- GitHub: [@wallacemt](https://github.com/wallacemt)
- API em produção: [https://dev-portifoio-api.onrender.com](https://dev-portifoio-api.onrender.com)

---

⭐ Se este projeto foi útil para você, considere dar uma estrela no GitHub!
