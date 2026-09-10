import { afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { prisma } from '../prisma/prismaClient';
import {
  skillSchema,
  skillSchemaOptional,
} from '../validations/skillValidation';
import { BadgeController } from './badgeController';
import { CertificationController } from './certificationController';
import { FormationController } from './formationController';
import { SkillController } from './skillController';

const resources = [
  {
    path: 'skills',
    model: prisma.skill,
    controller: SkillController,
    field: 'stack',
  },
  {
    path: 'formations',
    model: prisma.formation,
    controller: FormationController,
    field: 'institution',
  },
  {
    path: 'badges',
    model: prisma.badge,
    controller: BadgeController,
    field: 'issuer',
  },
  {
    path: 'certifications',
    model: prisma.certification,
    controller: CertificationController,
    field: 'issuer',
  },
] as const;
const restores: (() => void)[] = [];
afterEach(() => {
  for (const restore of restores.splice(0)) restore();
});

// Prisma delegates are proxies: assign directly, like the existing repository tests.
function mockDelegate<T extends object, K extends keyof T>(
  model: T,
  key: K,
  result: unknown
) {
  const original = model[key];
  const mock = jest
    .fn<
      (args?: {
        where?: unknown;
        skip?: number;
        take?: number;
      }) => Promise<unknown>
    >()
    .mockResolvedValue(result);
  model[key] = mock as T[K];
  restores.push(() => {
    model[key] = original;
  });
  return mock;
}

for (const { path, model, controller, field } of resources) {
  describe(`GET /${path}/owner/:ownerId`, () => {
    function app() {
      return express().use(`/${path}`, new controller().routerPublic);
    }
    it('keeps unpaginated public requests and uses database pagination/count for filtered requests', async () => {
      const findMany = mockDelegate(model, 'findMany', []);
      const count = mockDelegate(model, 'count', 25);
      const all = await request(app()).get(`/${path}/owner/owner-1`);
      expect(all.status).toBe(200);
      expect(all.body[path]).toEqual([]);
      expect(all.body.meta).toBeUndefined();
      expect(findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { ownerId: 'owner-1' },
      });
      expect(findMany.mock.calls[0]?.[0]?.take).toBeUndefined();
      expect(count).not.toHaveBeenCalled();

      const page = await request(app())
        .get(`/${path}/owner/owner-1`)
        .query({ page: 2, limit: 10, search: ' Rust ' });
      expect(page.status).toBe(200);
      expect(page.body.meta).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        hasNextPage: true,
      });
      expect(findMany.mock.calls[1]?.[0]).toMatchObject({
        where: {
          ownerId: 'owner-1',
          OR: [
            { title: { contains: 'Rust', mode: 'insensitive' } },
            { [field]: { contains: 'Rust', mode: 'insensitive' } },
          ],
        },
        skip: 10,
        take: 10,
      });
      expect(count.mock.calls[0]?.[0]?.where).toEqual(
        findMany.mock.calls[1]?.[0]?.where
      );
      const beyond = await request(app())
        .get(`/${path}/owner/owner-1`)
        .query({ page: 4, limit: 10 });
      expect(beyond.body.meta.hasNextPage).toBe(false);
      const explicit = await request(app())
        .get(`/${path}/owner/owner-1`)
        .query({ pagination: 'true' });
      expect(explicit.body.meta.page).toBe(1);
      const disabled = await request(app())
        .get(`/${path}/owner/owner-1`)
        .query({ pagination: 'false', page: 2 });
      expect(disabled.body.meta).toBeUndefined();
    });
    it('rejects invalid pagination before accessing the database', async () => {
      const findMany = mockDelegate(model, 'findMany', []);
      await Promise.all(
        [
          { page: 'abc' },
          { page: '2x' },
          { page: '0' },
          { limit: '101' },
          { limit: '1.5' },
          { pagination: 'yes' },
        ].map(async (query) => {
          expect(
            (await request(app()).get(`/${path}/owner/owner-1`).query(query))
              .status
          ).toBe(400);
        })
      );
      expect(findMany).not.toHaveBeenCalled();
    });
  });
}

it('applies exact skill and formation filters without losing owner scope', async () => {
  const skill = mockDelegate(prisma.skill, 'findMany', []);
  const formation = mockDelegate(prisma.formation, 'findMany', []);
  const app = express()
    .use('/skills', new SkillController().routerPublic)
    .use('/formations', new FormationController().routerPublic);
  expect(
    (
      await request(app)
        .get('/skills/owner/owner-2')
        .query({ stack: 'desktop', type: 'framework' })
    ).status
  ).toBe(200);
  expect(skill.mock.calls[0]?.[0]?.where).toEqual({
    ownerId: 'owner-2',
    stack: 'desktop',
    type: 'framework',
  });
  expect(
    (
      await request(app)
        .get('/formations/owner/owner-2')
        .query({ type: 'course', concluded: 'false' })
    ).status
  ).toBe(200);
  expect(formation.mock.calls[0]?.[0]?.where).toEqual({
    ownerId: 'owner-2',
    type: 'course',
    concluded: false,
  });
  expect(
    (
      await request(app)
        .get('/skills/owner/owner-2')
        .query({ stack: 'invalid' })
    ).status
  ).toBe(400);
});

it('accepts Desktop for skill creation, updates and the public type catalog', async () => {
  expect(
    skillSchema.safeParse({
      title: 'Tauri',
      image: 'https://example.com/image.png',
      stack: 'desktop',
      type: 'framework',
      subSkils: ['Rust'],
      ownerId: 'owner-1',
    }).success
  ).toBe(true);
  expect(skillSchemaOptional.safeParse({ stack: 'desktop' }).success).toBe(
    true
  );
  const response = await request(
    express().use(new SkillController().routerPublic)
  ).get('/types');
  expect(response.body.StackTypeValues.Desktop).toBe('desktop');
});
