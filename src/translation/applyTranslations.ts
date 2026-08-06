import type { EntityName } from "./translatableFields";
import { TranslationRepository } from "./translationRepository";

const translationRepository = new TranslationRepository();

/**
 * Merges `done` translations onto `records` for the given language, in a
 * single query (RF-02). A record with no translation yet — still `pending`,
 * `failed`, or simply never enqueued — passes through untouched, serving its
 * original pt-BR content (RF-08, ADR-05).
 *
 * This file must NEVER import `TranslationService`: no read path may trigger
 * an LLM call. That invariant is verified by AC-15.
 */
export async function applyTranslations<T extends { id: string }>(
  entity: EntityName,
  records: T[],
  lang: string | undefined,
): Promise<T[]> {
  if (!lang || lang === "pt" || records.length === 0) return records;

  const ids = records.map((record) => record.id);
  const translations = await translationRepository.findDoneForEntities(entity, ids, lang);
  if (translations.length === 0) return records;

  const fieldsByEntityId = new Map(translations.map((row) => [row.entityId, row.fields]));

  return records.map((record) => {
    const fields = fieldsByEntityId.get(record.id);
    return fields ? { ...record, ...fields } : record;
  });
}
