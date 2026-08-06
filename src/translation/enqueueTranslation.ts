import { createHash } from "node:crypto";
import { env } from "../env";
import { devDebugger } from "../utils/devDebugger";
import { type EntityName, pickTranslatableFields } from "./translatableFields";
import { TranslationRepository } from "./translationRepository";

const translationRepository = new TranslationRepository();

// A slow/unreachable Mongo must never hang the owner's write request (same
// bounded-timeout pattern as aiService's OWNER_MODEL_LOOKUP_TIMEOUT_MS) — the
// write already succeeded; enqueueing is best-effort and the backfill (Fase 7)
// recovers anything missed.
const ENQUEUE_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out ${label}`)), ENQUEUE_TIMEOUT_MS)),
  ]);
}

function hashTranslatableSubset(entity: EntityName, source: Record<string, unknown>): string {
  const subset = pickTranslatableFields(entity, source);
  return createHash("sha256").update(JSON.stringify(subset)).digest("hex");
}

/**
 * Marks `entityId` as needing (re)translation into every configured target
 * language (RF-03), but only when its translatable subset actually changed
 * (RF-04, ADR-03) — editing a non-translatable field (e.g. `previewImage`)
 * produces the same hash and enqueues nothing.
 *
 * Never throws (per Blueprint contract, section 8): a failure here must not
 * fail the owner's write request. The data was already persisted; the
 * translation is secondary and the backfill recovers any miss.
 */
export async function enqueueTranslation(
  entity: EntityName,
  entityId: string,
  source: Record<string, unknown>,
): Promise<void> {
  try {
    const sourceHash = hashTranslatableSubset(entity, source);

    await withTimeout(
      Promise.all(
        env.SUPPORTED_LANGUAGES.map(async (language) => {
          const existing = await translationRepository.findExisting(entity, entityId, language);
          // Same hash means the translatable subset hasn't changed — including
          // a `failed` row, which only recovers on real content change or an
          // explicit `--retry-failed` backfill (never on an unrelated write).
          if (existing && existing.sourceHash === sourceHash) return;
          await translationRepository.upsertPending(entity, entityId, language, sourceHash);
        }),
      ),
      `enqueueing translation for ${entity}/${entityId}`,
    );
  } catch (error) {
    devDebugger(`Failed to enqueue translation for ${entity}/${entityId}`, error, "warn");
  }
}

/** Removes every translation row for a deleted record (RF-06). Never throws, same reasoning as above. */
export async function removeTranslations(entity: EntityName, entityId: string): Promise<void> {
  try {
    await withTimeout(translationRepository.deleteForEntity(entity, entityId), `removing translations for ${entity}/${entityId}`);
  } catch (error) {
    devDebugger(`Failed to remove translations for ${entity}/${entityId}`, error, "warn");
  }
}
