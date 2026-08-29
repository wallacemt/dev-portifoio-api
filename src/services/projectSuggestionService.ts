import { SkillRepository } from "../repository/skillRepository";
import type { GithubRepoSummary, ProjectSuggestion } from "../types/github";
import { extractJsonFromText } from "../utils/jsonExtractor";
import { QuotaManager } from "../utils/quotaManager";
import { TranslationService } from "./aiService";
import { GithubService } from "./githubService";

// GitHub reports every language present in a repo (config files, generated
// code, ...); the first few by byte count are the actual stack — the rest is
// noise a project's "techs" field shouldn't carry.
const MAX_TECHS = 8;
// Keeps the OpenRouter prompt small — a full README can run to tens of KB and
// the model only needs enough context to write a short title/description.
const MAX_README_CHARS = 4000;
const QUOTA_ERROR_REGEX = /429|quota|Too Many Requests/;

/**
 * Drafts a new-project form from a GitHub repo: real stack from GitHub's own
 * language breakdown (no guessing), title/description from the README via
 * the existing OpenRouter integration (best-effort — falls back to the repo
 * name and an empty description if IA isn't configured or fails). Nothing is
 * persisted here; the owner reviews/edits the draft before the existing
 * POST /projects/private/create call ever runs.
 */
export class ProjectSuggestionService {
  private skillRepository = new SkillRepository();

  async listRepos(username: string): Promise<GithubRepoSummary[]> {
    const repos = await GithubService.listRepos(username);
    return repos.filter((repo) => !repo.fork);
  }

  async suggest(username: string, repo: string, ownerId: string): Promise<ProjectSuggestion> {
    const [languages, readme, ownerStacks] = await Promise.all([
      GithubService.getLanguages(username, repo),
      GithubService.getReadme(username, repo),
      this.getOwnerStacks(ownerId),
    ]);

    const techs = languages.slice(0, MAX_TECHS).map((lang) => lang.toLowerCase());
    const missingSkills = techs.filter((tech) => !ownerStacks.includes(tech));

    const { title, description } = await this.draftTitleAndDescription(repo, readme);

    return { title, description, techs, missingSkills };
  }

  private async getOwnerStacks(ownerId: string): Promise<string[]> {
    const skills = await this.skillRepository.findAllSkillsNoFilter(ownerId);
    return skills.map((skill) => skill.stack.toLowerCase());
  }

  private async draftTitleAndDescription(repo: string, readme: string | null): Promise<{ title: string; description: string }> {
    const fallback = { title: this.humanizeRepoName(repo), description: "" };

    if (!TranslationService.isConfigured() || !readme) return fallback;

    const canMakeRequest = await QuotaManager.canMakeRequest();
    if (!canMakeRequest) return fallback;

    try {
      const model = await TranslationService.resolveModel();
      const prompt = this.buildPrompt(repo, readme);

      await QuotaManager.recordRequest();
      const text = await TranslationService.callOpenRouter(prompt, model);
      const parsed = extractJsonFromText(text) as { title?: unknown; description?: unknown };
      QuotaManager.recordSuccess();

      if (typeof parsed.title !== "string" || typeof parsed.description !== "string") return fallback;
      return { title: parsed.title || fallback.title, description: parsed.description };
    } catch (error) {
      // Best-effort: any IA failure (network, model, malformed JSON) falls
      // back to the repo name — the suggestion flow must never 500 just
      // because the LLM step failed.
      const isQuotaError = error instanceof Error && QUOTA_ERROR_REGEX.test(error.message);
      QuotaManager.recordFailure(isQuotaError);
      return fallback;
    }
  }

  private buildPrompt(repo: string, readme: string): string {
    const trimmedReadme = readme.slice(0, MAX_README_CHARS);
    return `
Com base no README abaixo do repositório "${repo}", gere um rascunho para um card de portfólio.

Rules:
- Output valid JSON only, shape: {"title": string, "description": string}.
- No markdown, no explanations.
- "title" is a short, human-readable project name (not the raw repo slug).
- "description" is 1-3 sentences in Portuguese, summarizing what the project does.

README:
${trimmedReadme}
`;
  }

  private humanizeRepoName(repo: string): string {
    return repo
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
