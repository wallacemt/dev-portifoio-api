import { env } from '../env';
import { Exception } from '../utils/exception';

export async function umamiGet<T>(
  path: string,
  query?: Record<string, string | number>
): Promise<T> {
  if (!(env.UMAMI_API_URL && env.UMAMI_API_KEY && env.UMAMI_WEBSITE_ID)) {
    throw new Exception('Analytics não configurado', 503);
  }
  try {
    const url = new URL(`/api${path}`, env.UMAMI_API_URL);
    for (const [key, value] of Object.entries(query ?? {}))
      url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.UMAMI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Umami respondeu ${response.status}`);
    return (await response.json()) as T;
  } catch {
    throw new Exception('Analytics indisponível', 502);
  }
}
