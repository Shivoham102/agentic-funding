import { z } from "zod";

export const METEORA_SERVICE_LIMITS_RPS = {
  dynamic_vault: Infinity,
  dlmm: 30,
  damm_v2: 10,
} as const;

export type MeteoraServiceName = keyof typeof METEORA_SERVICE_LIMITS_RPS;

export interface RateLimitedHttpClientOptions {
  fetchImpl?: typeof fetch;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  baseHeaders?: Record<string, string>;
  userAgent?: string;
}

export interface JsonRequestOptions {
  service: MeteoraServiceName;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const JsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.any()),
  z.record(z.any()),
]);

export class RateLimitedHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly clock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseHeaders: Record<string, string>;
  private readonly queues = new Map<MeteoraServiceName, Promise<void>>();
  private readonly nextAllowedAt = new Map<MeteoraServiceName, number>();

  constructor(options: RateLimitedHttpClientOptions = {}) {
    if (typeof options.fetchImpl === "function") {
      this.fetchImpl = options.fetchImpl;
    } else if (typeof fetch === "function") {
      this.fetchImpl = fetch.bind(globalThis);
    } else {
      throw new Error("A fetch implementation is required.");
    }

    this.clock = options.clock ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((ms: number) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }));
    this.baseHeaders = {
      accept: "application/json",
      ...(options.userAgent ? { "user-agent": options.userAgent } : {}),
      ...(options.baseHeaders ?? {}),
    };
  }

  async getJson<T>(
    url: string,
    options: JsonRequestOptions,
    schema?: z.ZodType<T>,
  ): Promise<T> {
    return this.schedule(options.service, async () => {
      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? 15_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: {
            ...this.baseHeaders,
            ...(options.headers ?? {}),
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }

        const json = (await response.json()) as unknown;
        if (!schema) {
          return JsonValueSchema.parse(json) as T;
        }
        return schema.parse(json);
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  async schedule<T>(service: MeteoraServiceName, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(service) ?? Promise.resolve();
    const current = previous.then(async () => {
      const minIntervalMs = this.getMinIntervalMs(service);
      if (Number.isFinite(minIntervalMs) && minIntervalMs > 0) {
        const now = this.clock();
        const nextAllowed = this.nextAllowedAt.get(service) ?? 0;
        if (nextAllowed > now) {
          await this.sleep(nextAllowed - now);
        }
        this.nextAllowedAt.set(service, this.clock() + minIntervalMs);
      }
      return task();
    });

    this.queues.set(
      service,
      current.then(
        () => undefined,
        () => undefined,
      ),
    );
    return current;
  }

  private getMinIntervalMs(service: MeteoraServiceName): number {
    const limit = METEORA_SERVICE_LIMITS_RPS[service];
    if (!Number.isFinite(limit) || limit <= 0) {
      return 0;
    }
    return Math.ceil(1000 / limit);
  }
}
