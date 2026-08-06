// biome-ignore-all lint/nursery/useJsonImportAttribute: project's "module": "commonjs"
// (tsconfig.json) doesn't support import attributes — see src/i18n/index.ts.
import { describe, expect, it } from "@jest/globals";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import italian from "./it.json";
import ja from "./ja.json";
import ko from "./ko.json";
import pt from "./pt.json";
import { getUiTexts } from "./index";
import zh from "./zh.json";

const locales: Record<string, object> = { pt, en, es, fr, ja, ko, zh, it: italian };

/** Recursively collects every leaf key path in an object, e.g. "project.dateLabel.updatedAt". */
function collectKeyPaths(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return collectKeyPaths(value, path);
    }
    return [path];
  });
}

describe("i18n locale files", () => {
  const ptKeyPaths = collectKeyPaths(pt).sort();

  for (const [lang, locale] of Object.entries(locales)) {
    it(`"${lang}" has exactly the same keys as "pt"`, () => {
      expect(collectKeyPaths(locale).sort()).toEqual(ptKeyPaths);
    });
  }
});

describe("getUiTexts", () => {
  it("returns the pt namespace when no language is given", () => {
    expect(getUiTexts("project", undefined)).toEqual(pt.project);
  });

  it("returns the pt namespace for lang='pt'", () => {
    expect(getUiTexts("skill", "pt")).toEqual(pt.skill);
  });

  it("returns the target language's namespace when it exists", () => {
    expect(getUiTexts("project", "en")).toEqual(en.project);
  });

  it("falls back to pt for an unknown language", () => {
    expect(getUiTexts("project", "xx-unknown")).toEqual(pt.project);
  });

  it("falls back to pt for an individual key missing from the target language", () => {
    const incompleteLang = { project: { title: "Title only" } };
    const originalProjects = (en as Record<string, unknown>).project;
    (en as Record<string, unknown>).project = incompleteLang.project;

    try {
      const result = getUiTexts<{ title: string; description: string }>("project", "en");
      expect(result.title).toBe("Title only");
      expect(result.description).toBe(pt.project.description);
    } finally {
      (en as Record<string, unknown>).project = originalProjects;
    }
  });

  it("throws for an unknown namespace", () => {
    expect(() => getUiTexts("does-not-exist", "en")).toThrow();
  });
});
