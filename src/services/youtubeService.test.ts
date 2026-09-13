import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { YoutubeService } from "./youtubeService";

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>wallaceodev</title>
 <entry>
  <id>yt:video:abc123</id>
  <yt:videoId>abc123</yt:videoId>
  <title>AWS Quest V2.0 &amp; mais novidades</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
  <published>2026-08-03T15:00:06+00:00</published>
  <media:group>
   <media:thumbnail url="https://i1.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:def456</id>
  <yt:videoId>def456</yt:videoId>
  <title>Segundo vídeo</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=def456"/>
  <published>2026-07-20T10:00:00+00:00</published>
  <media:group>
   <media:thumbnail url="https://i1.ytimg.com/vi/def456/hqdefault.jpg" width="480" height="360"/>
  </media:group>
 </entry>
</feed>`;

describe("YoutubeService.listRecentVideos", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses id, title (decoding XML entities), publishedAt and thumbnail per entry", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => SAMPLE_FEED } as Response);

    const videos = await YoutubeService().listRecentVideos();

    expect(videos).toEqual([
      {
        id: "abc123",
        title: "AWS Quest V2.0 & mais novidades",
        publishedAt: "2026-08-03T15:00:06+00:00",
        thumbnailUrl: "https://i1.ytimg.com/vi/abc123/hqdefault.jpg",
        url: "https://www.youtube.com/watch?v=abc123",
      },
      {
        id: "def456",
        title: "Segundo vídeo",
        publishedAt: "2026-07-20T10:00:00+00:00",
        thumbnailUrl: "https://i1.ytimg.com/vi/def456/hqdefault.jpg",
        url: "https://www.youtube.com/watch?v=def456",
      },
    ]);
  });

  it("respects the limit", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => SAMPLE_FEED } as Response);

    const videos = await YoutubeService().listRecentVideos(1);

    expect(videos).toHaveLength(1);
    expect(videos[0]?.id).toBe("abc123");
  });

  it("returns no videos when YouTube has retired the feed", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(YoutubeService().listRecentVideos()).resolves.toEqual([]);
  });

  it("still throws for transient upstream failures", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(YoutubeService().listRecentVideos()).rejects.toThrow();
  });
});
