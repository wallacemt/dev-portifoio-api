const WWW_PREFIX = /^www\./;
const MOBILE_PREFIX = /^m\./;

/**
 * Validates that a string is a YouTube video URL in one of the accepted forms:
 * watch?v=, youtu.be/, /embed/ or /shorts/.
 */
export function isValidYoutubeUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(WWW_PREFIX, "").replace(MOBILE_PREFIX, "");

  if (host === "youtu.be") {
    return url.pathname.length > 1;
  }

  if (host === "youtube.com") {
    if (url.pathname === "/watch") return !!url.searchParams.get("v");
    if (url.pathname.startsWith("/embed/")) return url.pathname.length > "/embed/".length;
    if (url.pathname.startsWith("/shorts/")) return url.pathname.length > "/shorts/".length;
  }

  return false;
}
