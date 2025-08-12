import type { PrismaClient } from '@prisma/client';
import { type DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';

export const prismaMock =
  mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});
