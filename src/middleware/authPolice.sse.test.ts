import { describe, expect, it } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

// authPolice.ts imports ../env, which parses process.env eagerly with zod.
// Set required vars before requiring it below — `require` (unlike a static
// `import`) runs inline, so this executes first.
process.env.DATABASE_URL ??= "mongodb://localhost:27017/test";
process.env.PORT ??= "3000";
process.env.FRONTEND_URL ??= '["http://localhost:3000"]';
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.GEMINI_API_KEY ??= "test";
process.env.CLOUDINARY_CLOUD_NAME ??= "test";
process.env.CLOUDINARY_API_KEY ??= "test";
process.env.CLOUDINARY_API_SECRET ??= "test";
process.env.SELF_URL ??= "http://localhost:3000";
process.env.AI_MODEL ??= "test";

const { sseAuthPolice } = require("./authPolice");

function buildRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function buildReq(overrides: Partial<Request>): Request {
  return {
    headers: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

describe("sseAuthPolice", () => {
  const validToken = jwt.sign({ id: "owner-123" }, process.env.JWT_SECRET as string);

  it("authenticates via query param token (EventSource can't set headers)", () => {
    const req = buildReq({ query: { token: validToken } });
    const res = buildRes();
    let nextCalled = false;
    const next: NextFunction = () => {
      nextCalled = true;
    };

    sseAuthPolice(req, res, next);

    expect(nextCalled).toBe(true);
    expect(req.userId).toBe("owner-123");
  });

  it("still accepts a Bearer header when present", () => {
    const req = buildReq({ headers: { authorization: `Bearer ${validToken}` } });
    const res = buildRes();
    let nextCalled = false;
    sseAuthPolice(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.userId).toBe("owner-123");
  });

  it("rejects when no token is provided at all", () => {
    const req = buildReq({});
    const res = buildRes();
    sseAuthPolice(req, res, () => {
      throw new Error("next() should not be called");
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid/expired token", () => {
    const req = buildReq({ query: { token: "not-a-valid-jwt" } });
    const res = buildRes();
    sseAuthPolice(req, res, () => {
      throw new Error("next() should not be called");
    });

    expect(res.statusCode).toBe(401);
  });
});
