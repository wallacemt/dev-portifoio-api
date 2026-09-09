# Owner list queries (#26, #27)

`GET /skills|formations|badges|certifications/owner/:ownerId` keeps its named
array and localized `texts`. With no pagination parameters it returns all
matching records. `pagination=true`, `page` or `limit` enables database
pagination; explicit `pagination=false` disables it. Defaults: page 1, limit 10.
Page must be a positive integer up to 21474836; limit must be 1–100. Invalid
values return HTTP 400. Paginated responses add
`meta: { page, limit, total, hasNextPage }`, with total computed after filters.
Skills also preserves its legacy `pagination` object.

All lists accept `search` (trimmed, maximum 200 characters), matching title
case-insensitively. Skills additionally searches stack; formations institution;
badges and certifications issuer. Skills accepts exact `stack` and `type`
values from `/skills/types`; formations accepts `type` and `concluded=true|false`.
Filters always remain scoped to the route owner. Ordering preserves the existing
primary order and adds ID as a stable tie breaker. Search matches original
stored text before optional response translation.

Desktop is exposed as `StackTypeValues.Desktop = "desktop"` and accepted by
both skill creation and update schemas. No database migration is needed:
stack is stored as a string.

Example: `/skills/owner/OWNER?page=2&limit=10&search=rust&stack=desktop`.
The existing Projects API is unchanged (`orderBy=asc|desc` sorts creation date).

Specification: GitHub issues #26 and #27; the existing translation Blueprint
remains unchanged. No new dependencies or architecture changes.
