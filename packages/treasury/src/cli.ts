import {
  getVaultDetails,
  type MeteoraCluster,
  type MeteoraVaultClientOptions,
} from "./meteoraVault.js";
import { computeBuckets, proposeIdleAllocation } from "./treasuryPolicy.js";

interface TreasuryCliRequest {
  action?: "computeBuckets" | "reviewTreasury";
  treasuryState?: unknown;
  upcomingMilestones?: unknown;
  marketConditions?: unknown;
  meteora?: {
    enabled?: boolean;
    tokenSymbols?: string[];
    cluster?: MeteoraCluster;
    rpcUrl?: string;
    dynamicVaultApiBaseUrl?: string;
    timeoutMs?: number;
    tokenMintOverrides?: Record<string, string>;
  };
}

async function main(): Promise<void> {
  try {
    const payload = parsePayload(await readStdin());
    const action = payload.action ?? "reviewTreasury";
    const buckets = computeBuckets(payload.treasuryState ?? {}, payload.upcomingMilestones ?? []);

    if (action === "computeBuckets") {
      process.stdout.write(JSON.stringify({ ok: true, buckets }, null, 2));
      return;
    }

    const warnings: string[] = [];
    const marketConditions = toRecord(payload.marketConditions);
    const vaultDetails =
      payload.meteora?.enabled !== false &&
      Array.isArray(payload.meteora?.tokenSymbols) &&
      payload.meteora?.tokenSymbols.length > 0
        ? await resolveVaultDetails(payload.meteora, warnings)
        : [];
    const allocationPlan = proposeIdleAllocation(buckets, {
      ...marketConditions,
      vaults: vaultDetails,
    });

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          buckets,
          allocationPlan,
          vaultDetails,
          warnings,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  }
}

async function resolveVaultDetails(
  meteora: NonNullable<TreasuryCliRequest["meteora"]>,
  warnings: string[],
): Promise<Awaited<ReturnType<typeof getVaultDetails>>[]> {
  const options: MeteoraVaultClientOptions = {
    cluster: meteora.cluster ?? "devnet",
    rpcUrl: meteora.rpcUrl,
    dynamicVaultApiBaseUrl: meteora.dynamicVaultApiBaseUrl,
    timeoutMs: meteora.timeoutMs,
    tokenMintOverrides: meteora.tokenMintOverrides,
  };
  const details = [];
  for (const tokenSymbol of meteora.tokenSymbols ?? []) {
    try {
      details.push(await getVaultDetails(tokenSymbol, options));
    } catch (error) {
      warnings.push(
        `Failed to fetch Meteora vault details for ${tokenSymbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return details;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parsePayload(input: string): TreasuryCliRequest {
  if (!input.trim()) {
    return {};
  }
  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Treasury CLI expects a JSON object payload.");
  }
  return parsed as TreasuryCliRequest;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

void main();
