jest.mock("../prisma/prismaClient.ts", () => {
  const { prismaMock } = require("./mocks/prismaMock");
  return { prisma: prismaMock };
});

import request from "supertest";
import app from "../app";

jest.mock("gemini-ai-sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      ask: jest.fn().mockResolvedValue({ response: '{"translated": "ok"}' }),
    })),
  };
});

describe("Auth Routes", () => {
  const baseUrl = "/auth";
  it("shoud test the servser runing", async () => {
    const response = await request(app).get("/auth");
    expect(response.status).toBe(200);
  });

  it("Deve registrar novo owner com sucesso", async () => {
    const response = await request(app).post(`${baseUrl}/register`).send({
      name: "Joao Silva",
      email: "joaosilva@gmail.com",
      password: "joao@S1234",
      avatar: "https://github.com/joaoSilva.png",
      about: "Hello, I am the owner",
      occupation: "Desenvolvedor FullStack",
      birthDate: "1993/12/25",
    });
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Owner cadastrado com sucesso!");

    if (response.status !== 201) {
      console.error("Erro ao registrar owner:", response.body);
    }
  });

  
});
