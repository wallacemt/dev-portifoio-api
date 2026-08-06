// biome-ignore-all lint/nursery/useJsonImportAttribute: project's "module": "commonjs"
// (tsconfig.json) doesn't support import attributes — resolveJsonModule
// already covers static JSON typing under commonjs.
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import it from './it.json';
import ja from './ja.json';
import ko from './ko.json';
import pt from './pt.json';
import zh from './zh.json';

type Locale = Record<string, unknown>;

const FALLBACK_LANG = 'pt';

// Static UI text catalog (ADR-01) — no LLM call is involved in reading these.
const locales: Record<string, Locale> = { pt, en, es, fr, ja, ko, zh, it };

/**
 * Deep-merges `override` on top of `base`, keeping any key present in
 * `base` but missing (or `undefined`) in `override`. Used so a locale that
 * hasn't caught up with a newly added key still returns a usable value
 * instead of `undefined`.
 */
function mergeWithFallback(base: Locale, override: Locale | undefined): Locale {
  if (!override) return base;

  const merged: Locale = { ...base };
  for (const key of Object.keys(base)) {
    const baseValue = base[key];
    const overrideValue = override[key];

    if (overrideValue === undefined) continue;

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      merged[key] = mergeWithFallback(baseValue, overrideValue);
    } else {
      merged[key] = overrideValue;
    }
  }
  return merged;
}

function isPlainObject(value: unknown): value is Locale {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Looks up a namespace of static UI texts for the given language, falling
 * back to `pt` for any language that doesn't exist or is missing keys.
 *
 * @param namespace - top-level key in the locale files (e.g. "project", "skill")
 * @param lang - target language code (e.g. "en", "ja"); defaults to `pt` when absent
 */
export function getUiTexts<T = Record<string, unknown>>(
  namespace: string,
  lang: string | undefined
): T {
  const fallbackNamespace = pt[namespace as keyof typeof pt] as
    | Locale
    | undefined;
  if (!fallbackNamespace) {
    throw new Error(`Unknown i18n namespace: "${namespace}"`);
  }

  if (!lang || lang === FALLBACK_LANG) return fallbackNamespace as T;

  const targetLocale = locales[lang];
  const targetNamespace = targetLocale?.[namespace] as Locale | undefined;

  return mergeWithFallback(fallbackNamespace, targetNamespace) as T;
}

export const SUPPORTED_LANGUAGES = Object.keys(locales);
