/** Entry from GET https://api.github.com/users/{username}/repos */
export interface GithubRepoSummary {
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  updatedAt: string;
  fork: boolean;
}

/** GET /projects/private/github/suggest response — editable draft for the "create project" form. */
export interface ProjectSuggestion {
  title: string;
  description: string;
  techs: string[];
  missingSkills: string[];
}
