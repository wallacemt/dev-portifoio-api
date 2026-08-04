/**
 * Normaliza o referrer para o hostname (ex.: "https://google.com/search?q=x"
 * -> "google.com"), pra agrupar por domínio de origem de forma consistente.
 * Vazio ou inválido vira `undefined` ("acesso direto").
 */
export function normalizeReferrer(referrer?: string): string | undefined {
  if (!referrer) return;

  try {
    return new URL(referrer).hostname || undefined;
  } catch {
    return;
  }
}
