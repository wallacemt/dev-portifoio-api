/** GET /utilis/youtube-videos entry — parsed from the channel's public Atom feed. */
export interface YoutubeVideoSummary {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  url: string;
}
