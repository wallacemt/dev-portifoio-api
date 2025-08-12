//biome-ignore-all lint: using in development
export function devDebugger(message: string, err?: unknown | Error, type: "log" | "warn" | "error" = "log") {
  if (process.env.NODE_ENV !== "production") {
    switch (type) {
      case "log":
        console.log(`${message} ${err && err instanceof Error ? err.message : err || ""}`);
        break;
      case "warn":
        console.warn(`${message} ${err && err instanceof Error ? err.message : err || ""}`);
        break;
      case "error":
        console.error(`${message} ${err && err instanceof Error ? err.message : err || ""}`);
        break;
    }
  }
}
