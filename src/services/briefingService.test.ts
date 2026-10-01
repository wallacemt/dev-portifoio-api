// biome-ignore-all lint/nursery/noAwaitInLoop: cases intentionally run sequentially against shared mocks.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { briefing } from '@prisma/client';
import Redis from 'ioredis';
import { BriefingRepository } from '../repository/briefingRepository';
// biome-ignore lint/performance/noNamespaceImport: module namespace is required for spyOn.
import * as redisClient from '../utils/redisClient';
import { BriefingService } from './briefingService';

const payload = {
  language: 'pt-BR' as const,
  highlights: Array.from({ length: 5 }, (_, i) => ({
    position: i + 1,
    category: 'software-engineering' as const,
    headline: 'Nova funcionalidade disponível',
    summary: 'Uma atualização relevante para os desenvolvedores.',
    whyItMatters: 'Permite melhorar o trabalho diário.',
    source: { name: 'Fonte', url: 'https://example.com/news' },
  })),
};
const saved: briefing = {
  id: '507f1f77bcf86cd799439011',
  date: new Date('2026-10-01T00:00:00.000Z'),
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  ...payload,
  highlights: payload.highlights.map((item) => ({ ...item, imageUrl: null })),
};

function setup() {
  const client = new Redis({ lazyConnect: true });
  const redis = {
    get: jest.spyOn(client, 'get').mockResolvedValue(null),
    set: jest.spyOn(client, 'set').mockResolvedValue('OK'),
    del: jest.spyOn(client, 'del').mockResolvedValue(1),
  };
  jest.spyOn(redisClient, 'getRedisClient').mockReturnValue(client);
  const byDate = jest
    .spyOn(BriefingRepository.prototype, 'findByDate')
    .mockResolvedValue(null);
  const latest = jest
    .spyOn(BriefingRepository.prototype, 'findLatest')
    .mockResolvedValue(saved);
  const upsert = jest
    .spyOn(BriefingRepository.prototype, 'upsert')
    .mockResolvedValue(saved);
  return { redis, byDate, latest, upsert, service: new BriefingService() };
}
beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => {
    /* Silence expected operational logs during tests. */
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('BriefingService', () => {
  it('normalizes dates, sorts positions and caches only after saving MongoDB', async () => {
    const { redis, service, upsert } = setup();
    upsert.mockImplementation(() => {
      expect(redis.set).not.toHaveBeenCalled();
      return Promise.resolve(saved);
    });
    expect(
      await service.upsert('2026-10-01', {
        ...payload,
        highlights: [...payload.highlights].reverse(),
      })
    ).toEqual(saved);
    expect(upsert).toHaveBeenCalledWith(saved.date, payload);
    expect(redis.set.mock.calls).toContainEqual([
      'briefing:date:2026-10-01',
      JSON.stringify(saved),
      'EX',
      604_800,
    ]);
    expect(redis.set.mock.calls).toContainEqual([
      'briefing:current',
      JSON.stringify(saved),
      'EX',
      172_800,
    ]);
  });
  it('keeps the latest briefing current when updating an older date', async () => {
    const { redis, service, latest } = setup();
    const newer = { ...saved, date: new Date('2026-10-02T00:00:00.000Z') };
    latest.mockResolvedValue(newer);
    await service.upsert('2026-10-01', payload);
    expect(redis.set.mock.calls).toContainEqual([
      'briefing:current',
      JSON.stringify(newer),
      'EX',
      172_800,
    ]);
  });
  it('returns cache hits without reading MongoDB and preserves date types', async () => {
    const { redis, service, latest, byDate } = setup();
    redis.get.mockResolvedValue(JSON.stringify(saved));
    expect(await service.getCurrent()).toEqual(saved);
    expect(await service.getByDate('2026-10-01')).toEqual(saved);
    expect(latest).not.toHaveBeenCalled();
    expect(byDate).not.toHaveBeenCalled();
  });
  it('fills a cache miss from MongoDB, including date lookups', async () => {
    const { service, redis, byDate } = setup();
    byDate.mockResolvedValue(saved);
    expect(await service.getCurrent()).toEqual(saved);
    expect(await service.getByDate('2026-10-01')).toEqual(saved);
    expect(byDate).toHaveBeenCalledWith(saved.date);
    expect(redis.set).toHaveBeenCalledTimes(2);
  });
  it('returns null without caching when no briefing exists', async () => {
    const { service, redis, latest } = setup();
    latest.mockResolvedValue(null);
    expect(await service.getCurrent()).toBeNull();
    expect(await service.getByDate('2026-10-01')).toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('survives Redis read/write/delete failures', async () => {
    const { service, redis, byDate } = setup();
    redis.get.mockRejectedValue(new Error('offline'));
    redis.set.mockRejectedValue(new Error('offline'));
    redis.del.mockRejectedValue(new Error('offline'));
    byDate.mockResolvedValue(saved);
    expect(await service.getCurrent()).toEqual(saved);
    expect(await service.getByDate('2026-10-01')).toEqual(saved);
    expect(await service.upsert('2026-10-01', payload)).toEqual(saved);
  });
  it('falls back on corrupt cached data or absent Redis configuration', async () => {
    const { service, redis } = setup();
    for (const value of ['{broken', 'null', '{"id":"incomplete"}']) {
      redis.get.mockResolvedValue(value);
      expect(await service.getCurrent()).toEqual(saved);
    }
    jest.spyOn(redisClient, 'getRedisClient').mockReturnValue(null);
    expect(await service.getCurrent()).toEqual(saved);
    expect(await service.upsert('2026-10-01', payload)).toEqual(saved);
  });
  it('never caches a failed database write', async () => {
    const { service, redis, upsert } = setup();
    upsert.mockRejectedValue(new Error('MongoDB unavailable'));
    await expect(service.upsert('2026-10-01', payload)).rejects.toThrow(
      'MongoDB unavailable'
    );
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('rejects invalid dates before touching cache or database', async () => {
    const { service, redis, byDate } = setup();
    for (const date of [
      '2026-02-29',
      '2026-99-80',
      '2026-04-31',
      '2026-1-01',
    ]) {
      await expect(service.upsert(date, payload)).rejects.toThrow(
        'Data inválida'
      );
      await expect(service.getByDate(date)).rejects.toThrow('Data inválida');
    }
    expect(redis.get).not.toHaveBeenCalled();
    expect(byDate).not.toHaveBeenCalled();
    await service.upsert('2028-02-29', payload);
    expect(byDate).toHaveBeenCalledWith(new Date('2028-02-29T00:00:00.000Z'));
  });
});
