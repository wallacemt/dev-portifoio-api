//biome-ignore-all lint: one-off data migration script
/**
 * Data migration: previewVideoUrl (string) -> videos (string[])
 *
 * MongoDB via Prisma does not backfill existing documents when a schema
 * field gains a `@default([])` — that default only applies to documents
 * created after the change. Existing `project` documents still have the old
 * `previewVideoUrl` field and no `videos` field until this script runs.
 *
 * Safe to re-run: only touches documents that don't have `videos` yet.
 *
 * Usage (after deploying the new schema.prisma):
 *   bun run db:migrate-videos
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface LegacyProjectDoc {
  _id: { $oid: string };
  previewVideoUrl?: string;
}

async function migrate() {
  // ponytail: single find batch, no cursor pagination — personal portfolio
  // has a handful of projects, not worth the extra code. Add getMore-based
  // pagination if this ever needs to scale past a few thousand documents.
  const result = (await prisma.$runCommandRaw({
    find: "project",
    filter: { videos: { $exists: false } },
    batchSize: 10_000,
  })) as unknown as { cursor: { firstBatch: LegacyProjectDoc[] } };

  const pendingProjects = result.cursor.firstBatch;

  if (pendingProjects.length === 0) {
    console.log("No projects pending migration. Nothing to do.");
    return;
  }

  for (const doc of pendingProjects) {
    const videos = doc.previewVideoUrl ? [doc.previewVideoUrl] : [];
    await prisma.$runCommandRaw({
      update: "project",
      updates: [
        {
          q: { _id: doc._id },
          u: { $set: { videos }, $unset: { previewVideoUrl: "" } },
        },
      ],
    });
  }

  console.log(`Migrated ${pendingProjects.length} project(s) to the videos[] field.`);
}

migrate()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
