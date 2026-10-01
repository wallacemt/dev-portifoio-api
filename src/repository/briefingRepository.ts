import { type briefing as Briefing, Prisma } from '@prisma/client';
import { prisma } from '../prisma/prismaClient';
import type { CreateBriefingInput } from '../validations/briefingValidations';

export class BriefingRepository {
  async findByDate(date: Date): Promise<Briefing | null> {
    return await prisma.briefing.findUnique({ where: { date } });
  }
  async findLatest(): Promise<Briefing | null> {
    return await prisma.briefing.findFirst({ orderBy: { date: 'desc' } });
  }
  async findMany(skip: number, take: number): Promise<Briefing[]> {
    return await prisma.briefing.findMany({
      skip,
      take,
      orderBy: { date: 'desc' },
    });
  }
  async upsert(date: Date, data: CreateBriefingInput) {
    try {
      return await prisma.briefing.upsert({
        where: { date },
        create: { date, ...data },
        update: data,
      });
    } catch (error) {
      // Concurrent first writes can race on MongoDB's unique date index.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return prisma.briefing.update({ where: { date }, data });
      }
      throw error;
    }
  }
}
