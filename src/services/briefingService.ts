import type { briefing as Briefing } from '@prisma/client';
import { z } from 'zod';
import { BriefingRepository } from '../repository/briefingRepository';
import { normalizeBriefingDate } from '../utils/briefingDate';
import { Exception } from '../utils/exception';
import { getRedisClient } from '../utils/redisClient';
import {
  briefingHighlightSchema,
  type CreateBriefingInput,
  createBriefingSchema,
} from '../validations/briefingValidations';

const CURRENT_TTL = 60 * 60 * 48;
const DATE_TTL = 60 * 60 * 24 * 7;
const cachedBriefingSchema = z.object({
  id: z.string(),
  date: z
    .string()
    .datetime()
    .transform((value) => new Date(value)),
  createdAt: z
    .string()
    .datetime()
    .transform((value) => new Date(value)),
  updatedAt: z
    .string()
    .datetime()
    .transform((value) => new Date(value)),
  language: z.literal('pt-BR'),
  highlights: z
    .array(
      briefingHighlightSchema.extend({
        imageUrl: briefingHighlightSchema.shape.imageUrl.nullable(),
      })
    )
    .length(5),
});

function log(event: string, detail: string) {
  // biome-ignore lint/suspicious/noConsole: operational events contain only cache keys or dates, never credentials.
  console.info(`${event} ${detail}`);
}

export class BriefingService {
  private briefingRepository = new BriefingRepository();

  private async readCache(key: string) {
    try {
      const cached = await getRedisClient()?.get(key);
      if (cached) {
        const briefing = cachedBriefingSchema.parse(JSON.parse(cached));
        log('briefing.cache.hit', key);
        return briefing;
      }
    } catch {
      log('briefing.cache.error', key);
    }
    log('briefing.cache.miss', key);
    return null;
  }

  private async writeCache(key: string, value: Briefing, ttl: number) {
    try {
      const redis = getRedisClient();
      if (!redis) return;
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
      log('briefing.cache.updated', key);
    } catch {
      log('briefing.cache.error', key);
      // Best effort: don't leave an older cached value after a failed replacement.
      try {
        await getRedisClient()?.del(key);
      } catch {
        /* MongoDB remains available. */
      }
    }
  }

  async upsert(dateString: string, data: CreateBriefingInput) {
    const date = normalizeBriefingDate(dateString);
    const parsed = createBriefingSchema.safeParse(data);
    if (!parsed.success)
      throw new Exception(
        parsed.error.issues.map((issue) => issue.message).join('; '),
        400
      );
    log('briefing.received', `date=${dateString}`);
    const existing = await this.briefingRepository.findByDate(date);
    const briefing = await this.briefingRepository.upsert(date, {
      ...parsed.data,
      highlights: [...parsed.data.highlights].sort(
        (a, b) => a.position - b.position
      ),
    });
    log(
      existing ? 'briefing.updated' : 'briefing.created',
      `date=${dateString}`
    );
    await this.writeCache(`briefing:date:${dateString}`, briefing, DATE_TTL);
    // A historical correction must not replace the most recent day's briefing.
    try {
      const latest = await this.briefingRepository.findLatest();
      if (latest)
        await this.writeCache('briefing:current', latest, CURRENT_TTL);
    } catch {
      log('briefing.cache.error', 'briefing:current');
      try {
        await getRedisClient()?.del('briefing:current');
      } catch {
        /* Best effort after persistence. */
      }
    }
    return briefing;
  }

  async getCurrent() {
    const cached = await this.readCache('briefing:current');
    if (cached) return cached;
    const briefing = await this.briefingRepository.findLatest();
    if (briefing)
      await this.writeCache('briefing:current', briefing, CURRENT_TTL);
    return briefing;
  }

  async getByDate(dateString: string) {
    const date = normalizeBriefingDate(dateString);
    const key = `briefing:date:${dateString}`;
    const cached = await this.readCache(key);
    if (cached) return cached;
    const briefing = await this.briefingRepository.findByDate(date);
    if (briefing) await this.writeCache(key, briefing, DATE_TTL);
    return briefing;
  }

  getHistory(page: number, limit: number) {
    return this.briefingRepository.findMany((page - 1) * limit, limit);
  }
}
