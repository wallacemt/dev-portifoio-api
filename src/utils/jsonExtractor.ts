/**
 * Utilities to extract a JSON payload from a free-form LLM response and
 * validate that it preserves the structural "shape" of the original object.
 *
 * Some models (especially Gemma family) ignore JSON-only instructions and
 * emit reasoning prose, multiple ```json fenced blocks, or echo the prompt
 * back. This module is intentionally tolerant and prefers the last valid
 * JSON candidate found in the text.
 */

const FENCE_REGEX = /```(?:json|JSON)?\s*([\s\S]*?)```/g;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export class JsonExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonExtractionError";
  }
}

/**
 * Try `JSON.parse` and return the parsed value or a sentinel `null` when it
 * fails. Callers must distinguish parsed-null from a parse failure via the
 * boolean second slot.
 */
function tryParse(candidate: string): { ok: true; value: Json } | { ok: false } {
  const trimmed = candidate.trim();
  if (!trimmed) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(trimmed) as Json };
  } catch {
    return { ok: false };
  }
}

type ScanState = { depth: number; inString: boolean; isEscaping: boolean };

function advanceState(c: string, state: ScanState): "skip" | "open" | "close" {
  if (state.isEscaping) {
    state.isEscaping = false;
    return "skip";
  }
  if (c === "\\" && state.inString) {
    state.isEscaping = true;
    return "skip";
  }
  if (c === '"') {
    state.inString = !state.inString;
    return "skip";
  }
  if (state.inString) return "skip";
  if (c === "{" || c === "[") return "open";
  if (c === "}" || c === "]") return "close";
  return "skip";
}

/**
 * Find the closing index of a balanced `{...}` or `[...]` substring that
 * starts at `start`. Respects JSON string literals so braces inside strings
 * don't affect the depth counter. Returns -1 if not balanced.
 */
function findBalancedEnd(text: string, start: number): number {
  const state: ScanState = { depth: 0, inString: false, isEscaping: false };
  for (let i = start; i < text.length; i++) {
    const action = advanceState(text[i] ?? "", state);
    if (action === "open") state.depth++;
    else if (action === "close") {
      state.depth--;
      if (state.depth === 0) return i;
    }
  }
  return -1;
}

function* balancedJsonCandidates(text: string): Generator<string> {
  for (let start = 0; start < text.length; start++) {
    const ch = text[start];
    if (ch !== "{" && ch !== "[") continue;
    const end = findBalancedEnd(text, start);
    if (end !== -1) yield text.slice(start, end + 1);
  }
}

/**
 * Extract a JSON value from arbitrary text.
 *
 * Strategy (in order):
 *   1. Try every ```json fenced block, keep the LAST one that parses.
 *   2. If no fence worked, scan balanced {...}/[...] substrings, keep the
 *      LAST one that parses.
 *
 * The "last valid" preference is deliberate: when models produce reasoning
 * prose followed by the answer, the answer is at the bottom.
 */
export function extractJsonFromText(text: string): Json {
  if (typeof text !== "string" || text.trim() === "") {
    throw new JsonExtractionError("Empty response from model");
  }
  let lastFenced: { ok: true; value: Json } | undefined;
  for (const match of text.matchAll(FENCE_REGEX)) {
    const inner = match[1] ?? "";
    const parsed = tryParse(inner);
    if (parsed.ok) lastFenced = parsed;
  }
  if (lastFenced) return lastFenced.value;

  let lastBalanced: { ok: true; value: Json } | undefined;
  
  for (const candidate of balancedJsonCandidates(text)) {
    const parsed = tryParse(candidate);
    if (parsed.ok) lastBalanced = parsed;
  }
  if (lastBalanced) return lastBalanced.value;

  throw new JsonExtractionError("No valid JSON could be extracted from response");
}

type StructKind = "array" | "object" | "primitive";

function structKind(v: unknown): StructKind {
  if (Array.isArray(v)) return "array";
  if (v !== null && typeof v === "object") return "object";
  return "primitive";
}

function objectKeysMatch(
  o: Record<string, unknown>,
  t: Record<string, unknown>,
): boolean {
  const oKeys = Object.keys(o).sort();
  const tKeys = Object.keys(t).sort();
  if (oKeys.length !== tKeys.length) return false;
  for (let i = 0; i < oKeys.length; i++) {
    if (oKeys[i] !== tKeys[i]) return false;
  }
  return true;
}

type ObjMap = Record<string, unknown>;

function shapeArrayOk(o: unknown[], t: unknown[]): boolean {
  if (o.length !== t.length) return false;
  for (let i = 0; i < o.length; i++) {
    if (!validateTranslationShape(o[i], t[i])) return false;
  }
  return true;
}

function shapeObjOk(o: ObjMap, t: ObjMap): boolean {
  if (!objectKeysMatch(o, t)) return false;
  for (const k of Object.keys(o)) {
    if (!validateTranslationShape(o[k], t[k])) return false;
  }
  return true;
}

/**
 * Validate that the translated value preserves the *structural* shape of the
 * original:
 *   - Objects must have exactly the same keys (recursive).
 *   - Arrays must have the same length (recursive).
 *   - Primitives (null / string / number / boolean) are interchangeable —
 *     verifying exact values is intentionally out of scope. The model may
 *     return null where the original was null, a translated string for an
 *     optional null field, or the same ISO string from a JS Date round-trip.
 *
 * This guards against the model dropping keys, adding extra keys, or
 * returning a plain value instead of an object.
 */
export function validateTranslationShape(original: unknown, translated: unknown): boolean {
  const oKind = structKind(original);
  const tKind = structKind(translated);
  if (oKind !== tKind) return false;
  if (oKind === "array") return shapeArrayOk(original as unknown[], translated as unknown[]);
  if (oKind === "object") return shapeObjOk(original as ObjMap, translated as ObjMap);
  return true;
}

function mismatchArray(o: unknown[], t: unknown[], path: string): string | null {
  if (o.length !== t.length) return `${path}[]: length ${o.length} vs ${t.length}`;
  for (let i = 0; i < o.length; i++) {
    const sub = findMismatchPath(o[i], t[i], `${path}[${i}]`);
    if (sub) return sub;
  }
  return null;
}

function mismatchObj(o: ObjMap, t: ObjMap, path: string): string | null {
  const oKeys = Object.keys(o).sort();
  const tKeys = Object.keys(t).sort();
  if (JSON.stringify(oKeys) !== JSON.stringify(tKeys)) {
    return `${path}: keys [${oKeys}] vs [${tKeys}]`;
  }
  for (const k of oKeys) {
    const sub = findMismatchPath(o[k], t[k], `${path}.${k}`);
    if (sub) return sub;
  }
  return null;
}

/**
 * Return the JSON-path of the first structural mismatch, or null if shapes
 * match. Useful for debug logging.
 */
export function findMismatchPath(original: unknown, translated: unknown, path = "$"): string | null {
  const oKind = structKind(original);
  const tKind = structKind(translated);
  if (oKind !== tKind) return `${path}: expected ${oKind}, got ${tKind}`;
  if (oKind === "array") return mismatchArray(original as unknown[], translated as unknown[], path);
  if (oKind === "object") return mismatchObj(original as ObjMap, translated as ObjMap, path);
  return null;
}
