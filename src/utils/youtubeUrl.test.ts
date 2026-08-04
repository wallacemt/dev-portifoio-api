import { describe, expect, it } from "@jest/globals";
import { isValidYoutubeUrl } from "./youtubeUrl";

describe("isValidYoutubeUrl", () => {
  it("accepts a standard watch URL", () => {
    expect(isValidYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts a youtu.be short link", () => {
    expect(isValidYoutubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts an embed URL", () => {
    expect(isValidYoutubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(true);
  });

  it("accepts a shorts URL", () => {
    expect(isValidYoutubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
  });

  it("rejects a URL from another domain", () => {
    expect(isValidYoutubeUrl("https://vimeo.com/123456")).toBe(false);
  });

  it("rejects a malformed string", () => {
    expect(isValidYoutubeUrl("not-a-url")).toBe(false);
  });

  it("rejects a watch URL without the v param", () => {
    expect(isValidYoutubeUrl("https://www.youtube.com/watch")).toBe(false);
  });
});
