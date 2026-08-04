import { describe, expect, it } from "@jest/globals";
import { normalizeReferrer } from "./normalizeReferrer";

describe("normalizeReferrer", () => {
  it("extracts the hostname from a full URL", () => {
    expect(normalizeReferrer("https://www.google.com/search?q=portfolio")).toBe("www.google.com");
    expect(normalizeReferrer("https://github.com/wallacemt")).toBe("github.com");
  });

  it("treats empty/undefined referrer as direct access", () => {
    expect(normalizeReferrer(undefined)).toBeUndefined();
    expect(normalizeReferrer("")).toBeUndefined();
  });

  it("treats an invalid URL as direct access instead of throwing", () => {
    expect(normalizeReferrer("not-a-url")).toBeUndefined();
  });
});
