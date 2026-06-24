import { getDb } from "./db";

/**
 * Fixed-window rate limiter backed by the shared DB (so it works on serverless, where in-memory
 * counters don't persist between invocations). Returns true if the request is allowed.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucket = `${key}:${windowStart}`;
  const expiresAt = windowStart + windowMs;
  try {
    const db = await getDb();
    // Atomic upsert + increment, then read the resulting count.
    const res = await db.execute({
      sql: `INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?)
            ON CONFLICT(bucket) DO UPDATE SET count = count + 1
            RETURNING count`,
      args: [bucket, expiresAt],
    });
    const count = Number(res.rows[0]?.count ?? 1);
    // Occasionally sweep expired buckets so the table doesn't grow unbounded.
    if (Math.random() < 0.02) {
      await db.execute({ sql: "DELETE FROM rate_limits WHERE expires_at < ?", args: [now] });
    }
    return count <= limit;
  } catch {
    // Never let a limiter failure block legitimate traffic.
    return true;
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
