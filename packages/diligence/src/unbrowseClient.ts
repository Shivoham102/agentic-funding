import type {
  EvidenceSource,
  JsonObject,
  JsonValue,
  ResolveIntentParams,
  ResolveIntentResult,
  UnbrowseDomainSearchParams,
  UnbrowseSearchParams,
  UnbrowseSearchResult,
} from "./types.js";
import {
  hashJson,
  isRecord,
  logWithRedaction,
  makeId,
  sleep,
  toJsonValue,
  type LoggerLike,
} from "./utils.js";

const DEFAULT_UNBROWSE_BASE_URL = "https://beta-api.unbrowse.ai";

export interface UnbrowseClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  fetchImpl?: typeof fetch;
  logger?: LoggerLike;
  secretProvider?: () => Promise<string | undefined>;
}

interface RequestResult {
  data: JsonValue;
  requestId?: string;
}

export class UnbrowseClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: LoggerLike;
  private readonly apiKey?: string;
  private readonly secretProvider?: () => Promise<string | undefined>;

  constructor(options: UnbrowseClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_UNBROWSE_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 250;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger;
    this.apiKey = options.apiKey;
    this.secretProvider = options.secretProvider;
  }

  async resolveIntent(params: ResolveIntentParams): Promise<ResolveIntentResult> {
    const observedAt = new Date().toISOString();
    const payload: JsonObject = {
      intent: params.intent,
      params: {
        url: params.url,
      },
      context: {
        url: params.url,
      },
    };

    if (params.schemaHint !== undefined) {
      payload.schema_hint = params.schemaHint;
    }

    const response = await this.requestJson("/v1/intent/resolve", payload);
    const invocationId = extractString(response.data, ["invocation_id", "request_id", "id"]) ?? response.requestId;
    const source = this.makeSource({
      kind: "unbrowse_intent",
      label: "Unbrowse intent resolution",
      url: params.url,
      endpoint: "/v1/intent/resolve",
      method: "POST",
      invocation_id: invocationId,
      observed_at: observedAt,
      raw_payload_hash: hashJson(response.data),
      metadata: {
        intent: params.intent,
      },
    });

    return {
      data: response.data,
      sources: [source],
      raw_payload: response.data,
      raw_payload_hash: source.raw_payload_hash,
      invocation_id: invocationId,
    };
  }

  async searchSkills(params: UnbrowseSearchParams): Promise<UnbrowseSearchResult[]> {
    const response = await this.requestJson("/v1/search", {
      intent: params.query,
      k: 5,
    });
    return this.normalizeSearchResults(response.data, {
      kind: "unbrowse_skill_search",
      label: "Unbrowse skill search",
      endpoint: "/v1/search",
      method: "POST",
      metadata: {
        query: params.query,
      },
    });
  }

  async searchDomain(params: UnbrowseDomainSearchParams): Promise<UnbrowseSearchResult[]> {
    const response = await this.requestJson("/v1/search/domain", {
      domain: params.domain,
      intent: params.query,
      k: 5,
    });
    return this.normalizeSearchResults(response.data, {
      kind: "unbrowse_domain_search",
      label: "Unbrowse domain search",
      endpoint: "/v1/search/domain",
      method: "POST",
      url: params.domain,
      metadata: {
        domain: params.domain,
        query: params.query,
      },
    });
  }

  private async requestJson(path: string, payload: JsonValue): Promise<RequestResult> {
    const apiKey = await this.resolveApiKey();
    const targetUrl = `${this.baseUrl}${path}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMsFor(path));

      try {
        const response = await this.fetchImpl(targetUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const rawText = await response.text();
        const responseJson = parseJsonText(rawText);

        if (!response.ok) {
          if (attempt < this.maxRetries && isRetryableStatus(response.status)) {
            const retryDelayMs = this.baseRetryDelayMs * 2 ** attempt;
            logWithRedaction(this.logger, "warn", "Unbrowse request retrying", {
              endpoint: path,
              attempt: attempt + 1,
              status: response.status,
              retryDelayMs,
            });
            await sleep(retryDelayMs);
            continue;
          }

          throw new Error(`Unbrowse request failed with status ${response.status}`);
        }

        return {
          data: responseJson,
          requestId: response.headers.get("x-request-id") ?? undefined,
        };
      } catch (error) {
        clearTimeout(timeoutId);

        if (attempt < this.maxRetries) {
          const retryDelayMs = this.baseRetryDelayMs * 2 ** attempt;
          logWithRedaction(this.logger, "warn", "Unbrowse request retrying after error", {
            endpoint: path,
            attempt: attempt + 1,
            retryDelayMs,
            error: error instanceof Error ? error.message : String(error),
          });
          await sleep(retryDelayMs);
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Unbrowse request exhausted retries for ${path}`);
  }

  private timeoutMsFor(path: string): number {
    if (path === "/v1/intent/resolve") {
      return Math.max(this.timeoutMs, 75_000);
    }
    return this.timeoutMs;
  }

  private async resolveApiKey(): Promise<string> {
    const candidate =
      this.apiKey ??
      (this.secretProvider ? await this.secretProvider() : undefined) ??
      process.env.UNBROWSE_API_KEY;

    if (!candidate) {
      throw new Error("UNBROWSE_API_KEY is not configured");
    }

    return candidate;
  }

  private normalizeSearchResults(
    raw: JsonValue,
    baseSource: Omit<EvidenceSource, "id" | "observed_at" | "raw_payload_hash">,
  ): UnbrowseSearchResult[] {
    const observedAt = new Date().toISOString();
    const results = extractSearchResultArray(raw);

    return results.map((result, index) => {
      const rawPayloadHash = hashJson(result);
      const source = this.makeSource({
        ...baseSource,
        observed_at: observedAt,
        raw_payload_hash: rawPayloadHash,
        invocation_id:
          extractString(result, ["invocation_id", "request_id", "id"]) ?? undefined,
      });

      return {
        id: extractString(result, ["id", "skill_id"]) ?? `${source.id}_${index + 1}`,
        name: extractString(result, ["name", "title"]) ?? `result_${index + 1}`,
        domain: extractString(result, ["domain"]),
        description: extractString(result, ["description", "summary"]),
        url: extractString(result, ["url"]),
        score: extractNumber(result, ["score", "rank"]),
        raw: result,
        source,
      };
    });
  }

  private makeSource(source: Omit<EvidenceSource, "id">): EvidenceSource {
    const seed = [
      source.kind,
      source.endpoint ?? "",
      source.url ?? "",
      source.invocation_id ?? "",
      source.request_signature ?? "",
      source.raw_payload_hash,
    ].join("|");

    return {
      ...source,
      id: makeId(source.kind, seed),
    };
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseJsonText(text: string): JsonValue {
  if (!text.trim()) {
    return {};
  }

  return toJsonValue(JSON.parse(text));
}

function extractSearchResultArray(raw: JsonValue): JsonValue[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    return [];
  }

  const results = raw.results;
  if (Array.isArray(results)) {
    return results.map((item) => toJsonValue(item));
  }

  const data = raw.data;
  if (Array.isArray(data)) {
    return data.map((item) => toJsonValue(item));
  }

  return [];
}

function extractString(value: JsonValue, keys: string[]): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function extractNumber(value: JsonValue, keys: string[]): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
