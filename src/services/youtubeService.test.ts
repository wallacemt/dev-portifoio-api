import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { YoutubeService } from "./youtubeService";

const SAMPLE_RESPONSE = {
  items: [{ snippet: { resourceId: { videoId: "abc123" }, title: "AWS Quest V2.0", publishedAt: "2026-08-03T15:00:06Z", thumbnails: { high: { url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg" } } } }],
};

describe("YoutubeService.listRecentVideos", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("requests the YouTube Data API and maps summaries", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => SAMPLE_RESPONSE } as Response);
    await expect(YoutubeService().listRecentVideos(1)).resolves.toEqual([{ id: "abc123", title: "AWS Quest V2.0", publishedAt: "2026-08-03T15:00:06Z", thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg", url: "https://www.youtube.com/watch?v=abc123" }]);
    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(requestUrl.pathname).toBe("/youtube/v3/playlistItems");
    expect(requestUrl.searchParams.get("playlistId")).toBe("UUc5-Z-P3VOhC8_bR_F3TOkw");
    expect(requestUrl.searchParams.get("maxResults")).toBe("1");
  });

  it("falls back to available thumbnail sizes", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ items: [{ snippet: { resourceId: { videoId: "abc123" }, title: "Video", publishedAt: "2026-01-01", thumbnails: { default: { url: "https://default" } } } }] }) } as Response);
    await expect(YoutubeService().listRecentVideos()).resolves.toHaveLength(1);
  });

  it("throws for upstream failures", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 403 } as Response);
    await expect(YoutubeService().listRecentVideos()).rejects.toThrow("YouTube (403)");
  });
});
