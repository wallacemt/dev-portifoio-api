import { env } from "./env";
import { runBackfill } from "./translation/backfill";
import { processPendingBatch } from "./translation/worker";
import { devDebugger } from "./utils/devDebugger";

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 10;

let shuttingDown = false;
let currentCycle: Promise<unknown> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The worker refuses to start without Redis (ADR-04): the daily quota
 * counter must be shared with the API process, or this process would spend
 * a second, invisible budget against the same OpenRouter account ceiling.
 */
function assertRedisConfigured(): void {
  if (!env.REDIS_URL) {
    // biome-ignore lint/suspicious/noConsole: fatal boot diagnostic — devDebugger is silenced in production, but this must show there too.
    console.error(
      "[worker] REDIS_URL não configurada. O worker de tradução exige Redis para compartilhar o contador de quota diário com a API (ADR-04) — encerrando.",
    );
    process.exit(1);
  }
}

async function runLoop(): Promise<void> {
  while (!shuttingDown) {
    currentCycle = processPendingBatch(BATCH_SIZE)
      .then((result) => {
        devDebugger(
          `[worker] cycle done — processed=${result.processed} failed=${result.failed} skippedByQuota=${result.skippedByQuota}`,
        );
      })
      .catch((error) => devDebugger("[worker] cycle crashed", error, "error"));

    // biome-ignore lint/nursery/noAwaitInLoop: each cycle must finish before the next starts, so shutdown() can cleanly wait on `currentCycle`.
    await currentCycle;
    if (shuttingDown) break;
    await delay(POLL_INTERVAL_MS);
  }
}

/** Waits for the in-flight batch to finish before letting the process exit. */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  devDebugger(`[worker] received ${signal}, finishing the current job before exiting`);
  await currentCycle;
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});

async function main(): Promise<void> {
  assertRedisConfigured();

  if (process.argv.includes("--backfill")) {
    const retryFailed = process.argv.includes("--retry-failed");
    const result = await runBackfill({ retryFailed });
    devDebugger(`[worker] backfill finished — scanned=${result.scanned} enqueued=${result.enqueued}`);
    process.exit(0);
    return;
  }

  devDebugger(`[worker] starting — poll interval ${POLL_INTERVAL_MS}ms, budget ${env.WORKER_DAILY_BUDGET}/day`);
  await runLoop();
}

main().catch((error) => {
  // biome-ignore lint/suspicious/noConsole: fatal boot diagnostic — see assertRedisConfigured above.
  console.error("[worker] fatal error", error);
  process.exit(1);
});
