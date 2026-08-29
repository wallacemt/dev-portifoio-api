import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { SkillRepository } from "../repository/skillRepository";
import { ProjectSuggestionService } from "./projectSuggestionService";

function mockGithubAndOpenRouter(opts: {
  languages: Record<string, number>;
  readme?: string | null;
  aiContent?: string;
}) {
  return jest.spyOn(global, "fetch").mockImplementation((url) => {
    const href = url.toString();

    if (href.includes("/languages")) {
      return Promise.resolve({ ok: true, json: async () => opts.languages } as Response);
    }
    if (href.includes("/readme")) {
      if (opts.readme === null) return Promise.resolve({ ok: false, status: 404 } as Response);
      return Promise.resolve({ ok: true, text: async () => opts.readme ?? "# Sample readme" } as Response);
    }
    // OpenRouter chat completion
    return Promise.resolve({
      ok: true,
      json: async () => ({ choices: [{ message: { role: "assistant", content: opts.aiContent ?? "" } }] }),
    } as Response);
  });
}

describe("ProjectSuggestionService.suggest", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("detects the real stack from GitHub language bytes and flags techs missing from the owner's skills", async () => {
    jest.spyOn(SkillRepository.prototype, "findAllSkillsNoFilter").mockResolvedValue([
      // biome-ignore lint: partial skill fixture is enough for this diff
      { stack: "TypeScript" } as any,
    ]);
    mockGithubAndOpenRouter({
      languages: { TypeScript: 5000, CSS: 1200, HTML: 300 },
      readme: null,
    });

    const suggestion = await new ProjectSuggestionService().suggest("wallacemt", "portfolio", "owner-1");

    expect(suggestion.techs).toEqual(["typescript", "css", "html"]);
    expect(suggestion.missingSkills).toEqual(["css", "html"]);
  });

  it("falls back to a humanized repo name when there is no README", async () => {
    jest.spyOn(SkillRepository.prototype, "findAllSkillsNoFilter").mockResolvedValue([]);
    mockGithubAndOpenRouter({ languages: { Go: 1 }, readme: null });

    const suggestion = await new ProjectSuggestionService().suggest("wallacemt", "my-cool-api", "owner-1");

    expect(suggestion.title).toBe("My Cool Api");
    expect(suggestion.description).toBe("");
  });

  it("uses the model's title/description when the README yields valid JSON", async () => {
    jest.spyOn(SkillRepository.prototype, "findAllSkillsNoFilter").mockResolvedValue([]);
    mockGithubAndOpenRouter({
      languages: { Python: 1 },
      readme: "# My API\nDoes cool things.",
      aiContent: '{"title": "My API", "description": "Uma API que faz coisas legais."}',
    });

    const suggestion = await new ProjectSuggestionService().suggest("wallacemt", "my-api", "owner-1");

    expect(suggestion.title).toBe("My API");
    expect(suggestion.description).toBe("Uma API que faz coisas legais.");
  });
});
