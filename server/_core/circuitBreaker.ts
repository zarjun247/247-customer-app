import CircuitBreaker from "opossum";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type CircuitBreakerOptions = {
  /** Request timeout in ms — AbortController cancels the call after this */
  timeoutMs?: number;
  /** % of calls that can fail before opening the circuit (default 50) */
  errorThresholdPercentage?: number;
  /** Requests in the stats window (default 10) */
  volumeThreshold?: number;
  /** How long (ms) to wait before trying half-open (default 30_000) */
  resetTimeoutMs?: number;
};

const DEFAULTS: Required<CircuitBreakerOptions> = {
  timeoutMs: 10_000,
  errorThresholdPercentage: 50,
  volumeThreshold: 10,
  resetTimeoutMs: 30_000,
};

/**
 * Wraps an async function with a circuit breaker + AbortController timeout.
 *
 * The returned function has the same signature as `fn` but will:
 *   - cancel the underlying fetch via AbortController after `timeoutMs`
 *   - open the circuit when error rate exceeds `errorThresholdPercentage`
 *   - reject fast while the circuit is open
 *
 * Usage:
 *   const protectedFetch = makeCircuitBreaker("sms", smsFetchFn, { timeoutMs: 5_000 });
 *   const result = await protectedFetch(args);
 */
export function makeCircuitBreaker<TArgs extends unknown[], TResult>(
  name: string,
  fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
  opts: CircuitBreakerOptions = {}
): (...args: TArgs) => Promise<TResult> {
  const {
    timeoutMs,
    errorThresholdPercentage,
    volumeThreshold,
    resetTimeoutMs,
  } = { ...DEFAULTS, ...opts };

  const wrapped = (...args: TArgs): Promise<TResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fn(controller.signal, ...args).finally(() => clearTimeout(timer));
  };

  const breaker = new CircuitBreaker(wrapped, {
    name,
    timeout: false, // we use AbortController, not opossum's internal timeout
    errorThresholdPercentage,
    volumeThreshold,
    resetTimeout: resetTimeoutMs,
  });

  breaker.on("open", () =>
    logger.warn({ circuit: name }, "circuit_breaker_open")
  );
  breaker.on("halfOpen", () =>
    logger.info({ circuit: name }, "circuit_breaker_half_open")
  );
  breaker.on("close", () =>
    logger.info({ circuit: name }, "circuit_breaker_closed")
  );
  breaker.on("fallback", () =>
    logger.warn({ circuit: name }, "circuit_breaker_fallback")
  );

  return (...args: TArgs) => breaker.fire(...args);
}
