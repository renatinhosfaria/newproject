import type { Clock } from "../clock.js";
import { problem } from "../http/problem.filter.js";

interface Bucket {
  count: number;
  resetAt: number;
}

export class LoginRateLimiter {
  private readonly byEmail = new Map<string, Bucket>();
  private readonly byIp = new Map<string, Bucket>();
  constructor(
    private readonly clock: Clock,
    private readonly maxPerEmail = 10,
    private readonly maxPerIp = 100,
  ) {}

  check(ip: string, email: string): void {
    const now = this.clock.now().getTime();
    const emailBucket = this.take(
      this.byEmail,
      email.trim().toLowerCase(),
      now,
      this.maxPerEmail,
    );
    const ipBucket = this.take(this.byIp, ip, now, this.maxPerIp);
    if (
      emailBucket.count > this.maxPerEmail ||
      ipBucket.count > this.maxPerIp
    ) {
      const resetAt = Math.max(emailBucket.resetAt, ipBucket.resetAt);
      const error = problem(429, "RATE_LIMITED", undefined, true);
      (error as ProblemWithRetry).retryAfter = Math.max(
        1,
        Math.ceil((resetAt - now) / 1000),
      );
      throw error;
    }
  }

  private take(
    map: Map<string, Bucket>,
    key: string,
    now: number,
    max: number,
  ): Bucket {
    const current = map.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 1, resetAt: now + 15 * 60_000 }
        : { ...current, count: current.count + 1 };
    map.set(key, bucket);
    return bucket;
  }
}

export type ProblemWithRetry = { retryAfter?: number };
