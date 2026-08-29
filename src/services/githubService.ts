import { env } from "../env";
import type { GithubRepoSummary } from "../types/github";
import { Exception } from "../utils/exception";

const GITHUB_API_URL = "https://api.github.com";

/**
 * Thin wrapper over the GitHub REST API (native `fetch`, no SDK — same
 * no-dependency pattern as TranslationService.callOpenRouter). Backs the
 * owner-projects "AI suggestion" feature: repo list, language breakdown
 * (the real stack, not a guess) and README, used to draft a new project.
 */
export class GithubService {
  private static headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    return headers;
  }

  static async listRepos(username: string): Promise<GithubRepoSummary[]> {
    const response = await fetch(`${GITHUB_API_URL}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100`, {
      headers: GithubService.headers(),
    });

    if (response.status === 404) throw new Exception("Usuário do GitHub não encontrado", 404);
    if (!response.ok) throw new Exception(`Erro ao buscar repositórios do GitHub (${response.status})`, 502);

    //biome-ignore lint: type any
    const repos = (await response.json()) as any[];
    return repos.map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      language: repo.language,
      updatedAt: repo.updated_at,
      fork: Boolean(repo.fork),
    }));
  }

  /** Bytes of code per language, most-used first — GitHub's own detection, not a heuristic. */
  static async getLanguages(username: string, repo: string): Promise<string[]> {
    const response = await fetch(`${GITHUB_API_URL}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/languages`, {
      headers: GithubService.headers(),
    });

    if (response.status === 404) throw new Exception("Repositório não encontrado", 404);
    if (!response.ok) throw new Exception(`Erro ao buscar linguagens do repositório (${response.status})`, 502);

    const languages = (await response.json()) as Record<string, number>;
    return Object.entries(languages)
      .sort(([, a], [, b]) => b - a)
      .map(([language]) => language);
  }

  /** Best-effort: returns null when the repo has no README instead of throwing. */
  static async getReadme(username: string, repo: string): Promise<string | null> {
    const response = await fetch(`${GITHUB_API_URL}/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/readme`, {
      headers: { ...GithubService.headers(), Accept: "application/vnd.github.raw+json" },
    });

    if (!response.ok) return null;
    return await response.text();
  }
}
