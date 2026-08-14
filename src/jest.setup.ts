import dotenv from "dotenv";

// `override: true` — Bun auto-loads the root .env before this file runs, so
// without it dotenv (which doesn't clobber already-set vars by default)
// would silently keep the developer's real .env values instead of these.
dotenv.config({ path: `${__dirname}/.env.test`, override: true });
