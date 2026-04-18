type LogContext = Record<string, unknown>;

// Structured JSON logger — outputs to stdout/stderr for Vercel Log Drains.
// Enable Vercel Observability in the dashboard to stream these to Axiom/Datadog.
export const logger = {
  info: (msg: string, ctx?: LogContext) =>
    console.log(JSON.stringify({ level: "info", msg, ...ctx, ts: Date.now() })),

  warn: (msg: string, ctx?: LogContext) =>
    console.warn(JSON.stringify({ level: "warn", msg, ...ctx, ts: Date.now() })),

  error: (msg: string, ctx?: LogContext) =>
    console.error(JSON.stringify({ level: "error", msg, ...ctx, ts: Date.now() })),
};
