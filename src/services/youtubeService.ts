import { env } from "../env";
import type { YoutubeVideoSummary } from "../types/youtube";
import { Exception } from "../utils/exception";

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/playlistItems";

type YoutubePlaylistResponse = {
  items?: Array<{
    snippet?: { resourceId?: { videoId?: string }; title?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } } };
  }>;
};

/**
 * Uses playlistItems.list; each request costs one quota unit.
 */
export function YoutubeService() {
  async function listRecentVideos(limit = 6): Promise<YoutubeVideoSummary[]> {
    const params = new URLSearchParams({ key: env.YOUTUBE_API_KEY, playlistId: env.YOUTUBE_UPLOADS_PLAYLIST_ID, maxResults: String(Math.min(Math.max(Math.floor(limit), 1), 50)), part: "snippet" });
    const response = await fetch(`${YOUTUBE_API_URL}?${params}`);
    if (!response.ok) throw new Exception(`Erro ao buscar vídeos do YouTube (${response.status})`, 502);
    const data = (await response.json()) as YoutubePlaylistResponse;
    return (data.items ?? []).flatMap((item) => {
      const snippet = item.snippet;
      const id = snippet?.resourceId?.videoId;
      const thumbnailUrl = snippet?.thumbnails?.high?.url ?? snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url;
      if (!(id && snippet?.title && snippet.publishedAt && thumbnailUrl)) return [];
      return [{ id, title: snippet.title, publishedAt: snippet.publishedAt, thumbnailUrl, url: `https://www.youtube.com/watch?v=${id}` }];
    });
  }

  return { listRecentVideos };
}
