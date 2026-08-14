/**
 * Allowlist of which fields are free-text translatable per entity (ADR-03,
 * Bucket B/C in The-Blueprint-001 section 1 and 6). This is the single
 * source of truth for three consumers:
 *   - the hash used for change detection (enqueueTranslation.ts)
 *   - the payload actually sent to the LLM (worker.ts)
 *   - the fields merged back on read (applyTranslations.ts)
 *
 * A field NOT listed here is never sent to the LLM and never affects the
 * hash — allowlist over denylist, fail on the safe side (AC-13). This is
 * what keeps `techs`, every URL/id/date, and — critically —
 * `owner.password`/`secretWord`/`email` out of the provider payload.
 */
export const TRANSLATABLE = {
  project: ["title", "description"],
  // `title` is the skill's official/proper name (e.g. "MySQL", "React") —
  // translating it produces nonsense, so it's deliberately excluded.
  // `subSkils` are free-text descriptions and are translated.
  // `stack`/`type` are enum values used for filtering; `image` is a URL.
  skill: ["subSkils"],
  formation: ["title", "institution", "description"],
  badge: ["title", "description", "issuer"],
  certification: ["title", "description", "issuer"],
  owner: ["about", "occupation"], // `name` is a proper noun — not translated
  service: ["title", "description", "category", "complexity", "deliveryTime"],
} as const;

export type EntityName = keyof typeof TRANSLATABLE;

export function isEntityName(value: string): value is EntityName {
  return value in TRANSLATABLE;
}

/** Picks only the translatable fields of `source` that are present, in stable key order. */
export function pickTranslatableFields(entity: EntityName, source: Record<string, unknown>): Record<string, unknown> {
  const fields = TRANSLATABLE[entity] as readonly string[];
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) picked[field] = source[field];
  }
  return picked;
}
