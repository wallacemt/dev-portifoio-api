// Known crawler/bot signatures. Not exhaustive (no bot list ever is) — good
// enough to keep search engine and social-preview crawlers out of visitor
// counts. Add signatures here if a new one shows up in real traffic.
const BOT_USER_AGENT_PATTERN =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|curl|wget|python-requests|axios|postmanruntime|headlesschrome|phantomjs/i;

export function isBotUserAgent(userAgent: string): boolean {
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}
