import { createHash } from "node:crypto";

import type { JsonObject, JsonPrimitive, JsonValue } from "./types.js";

export interface LoggerLike {
  debug?(message: string, meta?: unknown): void;
  info?(message: string, meta?: unknown): void;
  warn?(message: string, meta?: unknown): void;
  error?(message: string, meta?: unknown): void;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, innerValue]) => [
      key,
      toJsonValue(innerValue),
    ]);
    return Object.fromEntries(entries);
  }

  return String(value);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(toJsonValue(value)));
}

export function hashJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (isRecord(value)) {
    const sortedEntries = Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, innerValue]) => [key, sortJsonValue(innerValue)]);
    return Object.fromEntries(sortedEntries);
  }

  return value as JsonPrimitive;
}

export function clampConfidence(value: number, fallback = 0.5): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

export function normalizeConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value === "number") {
    if (value > 1 && value <= 100) {
      return clampConfidence(value / 100, fallback);
    }
    return clampConfidence(value, fallback);
  }
  return fallback;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function redactSecrets(value: unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (!isRecord(value)) {
    return toJsonValue(value);
  }

  const redacted: Record<string, JsonValue> = {};
  for (const [key, innerValue] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("authorization") ||
      lowerKey.includes("cookie") ||
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("api_key")
    ) {
      redacted[key] = "[REDACTED]";
      continue;
    }
    redacted[key] = redactSecrets(innerValue);
  }
  return redacted;
}

export function logWithRedaction(
  logger: LoggerLike | undefined,
  level: keyof LoggerLike,
  message: string,
  meta?: unknown,
): void {
  const logFn = logger?.[level];
  if (typeof logFn !== "function") {
    return;
  }
  logFn(message, meta === undefined ? undefined : redactSecrets(meta));
}

export function makeId(prefix: string, seed: string): string {
  return `${prefix}_${hashJson(seed).slice(0, 16)}`;
}

export function parseUrlDomain(urlValue?: string): string | undefined {
  if (!urlValue) {
    return undefined;
  }

  try {
    return new URL(urlValue).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item : undefined))
    .filter((item): item is string => Boolean(item));
}
