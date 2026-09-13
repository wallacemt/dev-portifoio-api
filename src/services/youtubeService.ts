import { env } from "../env";
import type { YoutubeVideoSummary } from "../types/youtube";
import { Exception } from "../utils/exception";

const YOUTUBE_RSS_URL = "https://www.youtube.com/feeds/videos.xml";
const VIDEO_ID_REGEX = /<yt:videoId>([^<]+)<\/yt:videoId>/;
const TITLE_REGEX = /<title>([^<]+)<\/title>/;
const PUBLISHED_REGEX = /<published>([^<]+)<\/published>/;
const THUMBNAIL_REGEX = /<media:thumbnail url="([^"]+)"/;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Reads the channel's public Atom feed (no API key, no quota — same
 * no-dependency `fetch` pattern as GithubService). The feed is a stable,
 * well-known shape (every RSS reader consumes it), so a per-entry regex
 * extraction for the four fields we need is enough — not worth an XML
 * parser dependency for that.
 * ponytail: revisit with a real XML parser if more fields are ever needed.
 */
export function YoutubeService() {
  async function listRecentVideos(limit = 6): Promise<YoutubeVideoSummary[]> {
    const response = await fetch(`${YOUTUBE_RSS_URL}?channel_id=${encodeURIComponent(env.YOUTUBE_CHANNEL_ID)}`);
    // YouTube retired the public Atom feed (it now returns 404). Treat that
    // unavailable optional source as an empty result so it cannot break the
    // portfolio endpoint with a misleading 502.
    if (response.status === 404) return [];
    if (!response.ok) throw new Exception(`Erro ao buscar vídeos do YouTube (${response.status})`, 502);

    const xml = await response.text();
    const entries = xml.split("<entry>").slice(1, limit + 1);

    return entries
      .map((entry) => {
        const id = entry.match(VIDEO_ID_REGEX)?.[1];
        const title = entry.match(TITLE_REGEX)?.[1];
        const publishedAt = entry.match(PUBLISHED_REGEX)?.[1];
        const thumbnailUrl = entry.match(THUMBNAIL_REGEX)?.[1];
        if (!(id && title && publishedAt && thumbnailUrl)) return null;

        return {
          id,
          title: decodeXmlEntities(title),
          publishedAt,
          thumbnailUrl,
          url: `https://www.youtube.com/watch?v=${id}`,
        };
      })
      .filter((video): video is YoutubeVideoSummary => video !== null);
  }

  return { listRecentVideos };
}
