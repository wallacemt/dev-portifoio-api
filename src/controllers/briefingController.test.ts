// biome-ignore-all lint/style/noNonNullAssertion: payload() always creates five highlights.
// biome-ignore-all lint/nursery/noAwaitInLoop: cases intentionally run sequentially against shared mocks.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { type briefing, Prisma } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../env';
import { prisma } from '../prisma/prismaClient';
import { BriefingRepository } from '../repository/briefingRepository';
// biome-ignore lint/performance/noNamespaceImport: module namespace is required for spyOn.
import * as redisClient from '../utils/redisClient';
import { BriefingController } from './briefingController';

const serviceToken = 'test-briefing-service-token';
const payload = () => ({
  language: 'pt-BR',
  highlights: Array.from({ length: 5 }, (_, i) => ({
    position: i + 1,
    category: 'ai-technology',
    headline: 'Novidades em inteligência artificial',
    summary: 'Uma atualização relevante para o trabalho de desenvolvimento.',
    whyItMatters: 'Torna as ferramentas mais úteis.',
    source: { name: 'Fonte', url: 'https://example.com/news' },
    imageUrl: 'https://example.com/image.png',
  })),
});
const originalToken = process.env.BRIEFING_SERVICE_TOKEN;
const originalUpsert = prisma.briefing.upsert;
const originalUpdate = prisma.briefing.update;
const rows = new Map<string, briefing>();
let writes = 0;
function app() {
  const controller = new BriefingController();
  return express()
    .use(express.json())
    .use('/api/briefings', controller.routerPublic, controller.routerPrivate)
    .use('/api/integrations/briefings', controller.routerIntegration);
}
const put = () =>
  request(app())
    .put('/api/integrations/briefings/2026-10-01')
    .set('Authorization', `Bearer ${serviceToken}`);
const userToken = () => jwt.sign({ id: 'owner-1' }, env.JWT_SECRET);
beforeEach(() => {
  rows.clear();
  writes = 0;
  process.env.BRIEFING_SERVICE_TOKEN = serviceToken;
  jest.spyOn(console, 'info').mockImplementation(() => {
    /* Silence expected operational logs during tests. */
  });
  jest.spyOn(console, 'error').mockImplementation(() => {
    /* Silence expected operational logs during tests. */
  });
  jest.spyOn(redisClient, 'getRedisClient').mockReturnValue(null);
  jest
    .spyOn(BriefingRepository.prototype, 'findByDate')
    .mockImplementation(async (date) => rows.get(date.toISOString()) ?? null);
  jest
    .spyOn(BriefingRepository.prototype, 'findLatest')
    .mockImplementation(
      async () =>
        [...rows.values()].sort(
          (a, b) => b.date.getTime() - a.date.getTime()
        )[0] ?? null
    );
  // Exercise the real repository upsert contract; only the Prisma delegate is replaced.
  prisma.briefing.upsert = (({
    where,
    create,
    update,
  }: Prisma.briefingUpsertArgs) => {
    writes++;
    const key = new Date(where.date as Date).toISOString();
    const old = rows.get(key);
    const row = {
      id: '507f1f77bcf86cd799439011',
      createdAt: new Date(),
      ...old,
      ...(old ? update : create),
      updatedAt: new Date(),
    } as briefing;
    rows.set(key, row);
    return Promise.resolve(row);
  }) as unknown as typeof originalUpsert;
});
afterEach(() => {
  prisma.briefing.upsert = originalUpsert;
  prisma.briefing.update = originalUpdate;
  if (originalToken === undefined)
    Reflect.deleteProperty(process.env, 'BRIEFING_SERVICE_TOKEN');
  else process.env.BRIEFING_SERVICE_TOKEN = originalToken;
  jest.restoreAllMocks();
});

describe('Briefing HTTP routes', () => {
  it('rejects missing, malformed, incorrect, empty, and user JWT credentials', async () => {
    for (const token of [
      '',
      'Bearer wrong',
      `Basic ${serviceToken}`,
      `Bearer ${'x'.repeat(serviceToken.length)}`,
      `Bearer ${userToken()}`,
    ]) {
      const response = await request(app())
        .put('/api/integrations/briefings/2026-10-01')
        .set('Authorization', token)
        .send(payload());
      expect(response.status).toBe(401);
    }
    Reflect.deleteProperty(process.env, 'BRIEFING_SERVICE_TOKEN');
    expect((await put().send(payload())).status).toBe(401);
    expect(writes).toBe(0);
  });
  it('validates the date and all highlight constraints before persistence', async () => {
    const changes = [
      (body: ReturnType<typeof payload>) => {
        body.highlights.pop();
      },
      (body: ReturnType<typeof payload>) => {
        body.highlights.push({ ...body.highlights[0]! });
      },
      (body: ReturnType<typeof payload>) => {
        body.highlights[0]!.position = 2;
      },
      (body: ReturnType<typeof payload>) => {
        body.highlights[0]!.position = 0;
      },
      (body: ReturnType<typeof payload>) => {
        body.highlights[0]!.category = 'invalid';
      },
      (body: ReturnType<typeof payload>) => {
        body.highlights[0]!.source.url = 'invalid';
      },
      (body: ReturnType<typeof payload>) => {
        body.highlights[0]!.imageUrl = 'javascript:alert(1)';
      },
      (body: ReturnType<typeof payload>) => {
        body.highlights[0]!.summary = 'short';
      },
      (body: ReturnType<typeof payload>) => {
        body.language = 'en';
      },
    ];
    for (const change of changes) {
      const body = payload();
      change(body);
      expect((await put().send(body)).status).toBe(400);
    }
    expect((await put().send({})).status).toBe(400);
    for (const date of [
      '2026-99-80',
      '2026-02-29',
      '2026-04-31',
      '2026-1-01',
    ]) {
      expect(
        (
          await request(app())
            .put(`/api/integrations/briefings/${date}`)
            .set('Authorization', `Bearer ${serviceToken}`)
            .send(payload())
        ).status
      ).toBe(400);
    }
    expect(writes).toBe(0);
  });
  it('upserts by date without a body date, allows repeated categories and replaces content', async () => {
    const first = await put().send(payload());
    expect(first.status).toBe(200);
    expect(first.body.briefing.date).toBe('2026-10-01T00:00:00.000Z');
    const changed = payload();
    changed.highlights[0]!.headline = 'Título atualizado oficialmente';
    const second = await put().send(changed);
    expect(second.status).toBe(200);
    expect(second.body.briefing.id).toBe(first.body.briefing.id);
    expect(second.body.briefing.highlights[0].headline).toBe(
      changed.highlights[0]!.headline
    );
    expect(rows.size).toBe(1);
    expect(writes).toBe(2);
    const current = await request(app()).get('/api/briefings/current');
    expect(current.status).toBe(200);
    expect(current.body.highlights[0].headline).toBe(
      changed.highlights[0]!.headline
    );
  });
  it('returns 404 for absent current/date and protects date/history with JWT', async () => {
    expect((await request(app()).get('/api/briefings/current')).status).toBe(
      404
    );
    for (const path of ['/api/briefings', '/api/briefings/2026-10-01']) {
      expect((await request(app()).get(path)).status).toBe(401);
      expect(
        (
          await request(app())
            .get(path)
            .set('Authorization', `Bearer ${serviceToken}`)
        ).status
      ).toBe(401);
    }
    const dateGet = (date: string) =>
      request(app())
        .get(`/api/briefings/${date}`)
        .set('Authorization', `Bearer ${userToken()}`);
    expect((await dateGet('2026-10-01')).status).toBe(404);
    expect((await dateGet('2026-02-29')).status).toBe(400);
    await put().send(payload());
    expect((await dateGet('2026-10-01')).status).toBe(200);
  });
  it('paginates history and rejects oversized, negative, fractional or repeated parameters', async () => {
    const findMany = jest
      .spyOn(BriefingRepository.prototype, 'findMany')
      .mockResolvedValue([]);
    const get = (query = '') =>
      request(app())
        .get(`/api/briefings${query}`)
        .set('Authorization', `Bearer ${userToken()}`);
    expect((await get()).body).toEqual({ briefings: [], page: 1, limit: 10 });
    expect((await get('?page=2&limit=20')).status).toBe(200);
    expect(findMany).toHaveBeenLastCalledWith(20, 20);
    for (const query of [
      '?page=0',
      '?limit=51',
      '?limit=-1',
      '?page=1.5',
      '?page=NaN',
      '?page=2147483649',
      '?page=1&page=2',
    ]) {
      expect((await get(query)).status).toBe(400);
    }
  });
  it('returns 500 on MongoDB failure without pretending the briefing was saved', async () => {
    prisma.briefing.upsert = (() =>
      Promise.reject(
        new Error('database unavailable')
      )) as typeof originalUpsert;
    expect((await put().send(payload())).status).toBe(500);
    expect(rows.size).toBe(0);
  });
  it('retries a concurrent unique-date conflict as an update', async () => {
    prisma.briefing.upsert = (() =>
      Promise.reject(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6',
        })
      )) as typeof originalUpsert;
    const update = jest
      .fn<(args: Prisma.briefingUpdateArgs) => Promise<unknown>>()
      .mockResolvedValue({ id: 'existing' });
    prisma.briefing.update = update as unknown as typeof originalUpdate;
    const body = payload();
    await new BriefingRepository().upsert(
      new Date('2026-10-01T00:00:00.000Z'),
      { ...body, language: 'pt-BR', highlights: [] }
    );
    expect(update).toHaveBeenCalledWith({
      where: { date: new Date('2026-10-01T00:00:00.000Z') },
      data: { ...body, language: 'pt-BR', highlights: [] },
    });
  });
});
