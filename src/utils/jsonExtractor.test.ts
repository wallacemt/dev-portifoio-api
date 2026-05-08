import { describe, expect, it } from "@jest/globals";
import { extractJsonFromText, findMismatchPath, JsonExtractionError, validateTranslationShape } from "./jsonExtractor";

describe("extractJsonFromText", () => {
  it("parses pure JSON object", () => {
    const out = extractJsonFromText('{"a":1,"b":"x"}');
    expect(out).toEqual({ a: 1, b: "x" });
  });

  it("parses pure JSON array", () => {
    const out = extractJsonFromText("[1,2,3]");
    expect(out).toEqual([1, 2, 3]);
  });

  it("strips a single ```json fence", () => {
    const text = '```json\n{"foo":"bar"}\n```';
    expect(extractJsonFromText(text)).toEqual({ foo: "bar" });
  });

  it("strips an unlabeled ``` fence", () => {
    const text = '```\n{"foo":"bar"}\n```';
    expect(extractJsonFromText(text)).toEqual({ foo: "bar" });
  });

  it("prefers the LAST valid fenced block when several exist", () => {
    const text = [
      "First, here is the input:",
      "```json",
      '{"a":"old"}',
      "```",
      "And here is the translated answer:",
      "```json",
      '{"a":"new"}',
      "```",
    ].join("\n");
    expect(extractJsonFromText(text)).toEqual({ a: "new" });
  });

  it("falls back to balanced braces when there is no fence", () => {
    const text = 'Sure! The answer is {"hello":"bonjour"} — done.';
    expect(extractJsonFromText(text)).toEqual({ hello: "bonjour" });
  });

  it("ignores braces inside JSON strings (balanced parser must respect strings)", () => {
    const text = '{"emoji":"{not a brace}"}';
    expect(extractJsonFromText(text)).toEqual({ emoji: "{not a brace}" });
  });

  it("ignores escaped quotes inside strings", () => {
    const text = '{"phrase":"he said \\"hi\\""}';
    expect(extractJsonFromText(text)).toEqual({ phrase: 'he said "hi"' });
  });

  it("reproduces the production log: Gemma echoes prompt + emits two ```json blocks", () => {
    const original = {
      id: "685b41be6ba068f5fbe56d71",
      name: "Wallace Santana",
      welcomeMessage: "Olá, eu sou Wallace Santana!",
      buttons: { project: "Ver Projetos", curriculo: "Curriculo" },
    };
    const llmResponse = `*   Role: JSON transformer.
*   Task: Translate all string values from Portuguese (pt) to French (fr).

\`\`\`json
${JSON.stringify(original)}
\`\`\`

Final answer:

\`\`\`json
{
  "id": "685b41be6ba068f5fbe56d71",
  "name": "Wallace Santana",
  "welcomeMessage": "Bonjour, je suis Wallace Santana !",
  "buttons": { "project": "Voir les projets", "curriculo": "CV" }
}
\`\`\``;

    const out = extractJsonFromText(llmResponse) as Record<string, unknown>;
    expect(out.welcomeMessage).toBe("Bonjour, je suis Wallace Santana !");
    expect((out.buttons as Record<string, string>).project).toBe("Voir les projets");
  });

  it("handles arrays inside fenced blocks", () => {
    const text = '```json\n[{"a":1},{"a":2}]\n```';
    expect(extractJsonFromText(text)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("throws JsonExtractionError when there is no JSON", () => {
    expect(() => extractJsonFromText("Sorry, I cannot help with that.")).toThrow(JsonExtractionError);
  });

  it("throws on empty input", () => {
    expect(() => extractJsonFromText("")).toThrow(JsonExtractionError);
    expect(() => extractJsonFromText("   ")).toThrow(JsonExtractionError);
  });

  it("ignores invalid fenced content but still finds balanced JSON later", () => {
    const text = '```json\nthis is not json\n```\nbut here it is: {"x":1}';
    expect(extractJsonFromText(text)).toEqual({ x: 1 });
  });
});

describe("validateTranslationShape", () => {
  // ── Structural checks (the real protection) ─────────────────────────────

  it("accepts identical objects", () => {
    expect(validateTranslationShape({ a: "x", b: 1 }, { a: "y", b: 2 })).toBe(true);
  });

  it("rejects when keys differ", () => {
    expect(validateTranslationShape({ a: "x" }, { b: "x" })).toBe(false);
  });

  it("rejects when extra keys appear", () => {
    expect(validateTranslationShape({ a: "x" }, { a: "x", b: "y" })).toBe(false);
  });

  it("rejects when a key is missing", () => {
    expect(validateTranslationShape({ a: "x", b: "y" }, { a: "x" })).toBe(false);
  });

  it("rejects when root container types disagree (object vs array)", () => {
    expect(validateTranslationShape({ a: 1 }, [1])).toBe(false);
    expect(validateTranslationShape([1], { a: 1 })).toBe(false);
  });

  it("rejects when a nested value changes from object to primitive", () => {
    expect(validateTranslationShape({ x: { a: 1 } }, { x: "flat" })).toBe(false);
  });

  it("rejects when a nested value changes from primitive to object", () => {
    expect(validateTranslationShape({ x: "flat" }, { x: { a: 1 } })).toBe(false);
  });

  it("rejects nested key mismatch", () => {
    expect(validateTranslationShape({ user: { name: "W", age: 22 } }, { user: { name: "W" } })).toBe(false);
  });

  it("rejects arrays of different lengths", () => {
    expect(validateTranslationShape([1, 2], [1, 2, 3])).toBe(false);
  });

  // ── Primitive interchangeability (translation-safe) ──────────────────────

  it("allows string values to change (translation)", () => {
    expect(validateTranslationShape({ s: "olá" }, { s: "hello" })).toBe(true);
  });

  it("allows number values to change (model may return same or formatted)", () => {
    expect(validateTranslationShape({ n: 1 }, { n: 2 })).toBe(true);
  });

  it("allows null to stay null or become a string (optional field translation)", () => {
    expect(validateTranslationShape({ x: null }, { x: null })).toBe(true);
    expect(validateTranslationShape({ x: null }, { x: "n/a" })).toBe(true);
  });

  it("allows number to become string primitive (model coercion)", () => {
    expect(validateTranslationShape({ n: 42 }, { n: "42" })).toBe(true);
  });

  // ── Production regression: Date object via JSON round-trip ───────────────

  it("matches owner shape when birthDate is a JS Date (JSON round-trip regression)", () => {
    const original = {
      id: "685b41be6ba068f5fbe56d71",
      name: "Wallace Santana",
      email: "wallacesantanak0@gmail.com",
      birthDate: new Date("2003-12-24T02:00:00.000Z"),
      welcomeMessage: "Olá, eu sou Wallace Santana!",
    };
    const translated = {
      id: "685b41be6ba068f5fbe56d71",
      name: "Wallace Santana",
      email: "wallacesantanak0@gmail.com",
      birthDate: "2003-12-24T02:00:00.000Z",
      welcomeMessage: "Hello, I am Wallace Santana!",
    };
    const normalised = JSON.parse(JSON.stringify(original));
    expect(validateTranslationShape(normalised, translated)).toBe(true);
  });

  // ── Nested / complex shapes ───────────────────────────────────────────────

  it("validates arrays element by element", () => {
    expect(validateTranslationShape([{ a: "x" }, { a: "y" }], [{ a: "X" }, { a: "Y" }])).toBe(true);
  });

  it("handles deeply nested objects", () => {
    const o = { user: { name: "Wallace", age: 22, tags: ["dev", "fullstack"] } };
    const t = { user: { name: "Wallace", age: 22, tags: ["développeur", "fullstack"] } };
    expect(validateTranslationShape(o, t)).toBe(true);
  });

  it("matches the full production owner shape end-to-end", () => {
    const original = {
      id: "685b41be6ba068f5fbe56d71",
      name: "Wallace Santana",
      email: "wallacesantanak0@gmail.com",
      welcomeMessage: "Olá, eu sou Wallace Santana!",
      buttons: { project: "Ver Projetos", curriculo: "Curriculo" },
    };
    const translated = {
      id: "685b41be6ba068f5fbe56d71",
      name: "Wallace Santana",
      email: "wallacesantanak0@gmail.com",
      welcomeMessage: "Hello, I am Wallace Santana!",
      buttons: { project: "View Projects", curriculo: "Resume" },
    };
    expect(validateTranslationShape(original, translated)).toBe(true);
  });
});

describe("findMismatchPath", () => {
  it("returns null when shapes match", () => {
    expect(findMismatchPath({ a: "x", b: { c: 1 } }, { a: "y", b: { c: 2 } })).toBeNull();
  });

  it("reports missing key path", () => {
    const path = findMismatchPath({ a: 1, b: 2 }, { a: 1 });
    expect(path).not.toBeNull();
    expect(path).toContain("$");
  });

  it("reports nested key mismatch path", () => {
    const path = findMismatchPath({ user: { name: "W", age: 1 } }, { user: { name: "W" } });
    expect(path).toContain("$.user");
  });

  it("reports array length mismatch", () => {
    const path = findMismatchPath([1, 2, 3], [1, 2]);
    expect(path).not.toBeNull();
    expect(path).toContain("[]: length");
  });

  it("reports object vs primitive mismatch", () => {
    const path = findMismatchPath({ x: { a: 1 } }, { x: "flat" });
    expect(path).toContain("$.x");
  });
});
