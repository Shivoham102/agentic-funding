import { clusterApiUrl, Connection, PublicKey, type Commitment } from "@solana/web3.js";
import VaultImpl from "@meteora-ag/vault-sdk";
import { StaticTokenListResolutionStrategy } from "@solana/spl-token-registry";
import { z } from "zod";

import {
  RateLimitedHttpClient,
  type JsonRequestOptions,
} from "./httpClient.js";

export type MeteoraCluster = "devnet" | "mainnet-beta";

export interface VaultStrategySnapshot {
  address?: string;
  name: string;
  weightBps?: number;
  allocatedAmount?: number;
  allocatedUsd?: number;
  liquidityUsd?: number;
  utilizationPct?: number;
  safeUtilizationPct?: number;
  averageApyPct?: number;
  currentApyPct?: number;
}

export interface VaultApySnapshot {
  currentPct?: number;
  averagePct?: number;
  hourlyPct?: number;
}

export interface MeteoraVaultDetails {
  tokenSymbol: string;
  tokenMint: string;
  cluster: MeteoraCluster;
  vaultAddress?: string;
  withdrawableAmount: number;
  withdrawableUsd?: number;
  virtualPrice: number;
  lpSupply?: number;
  usdRate?: number;
  apy: VaultApySnapshot;
  strategies: VaultStrategySnapshot[];
  rawState?: unknown;
  rawApy?: unknown;
}

export interface MeteoraVaultClientOptions {
  cluster?: MeteoraCluster;
  rpcUrl?: string;
  commitment?: Commitment;
  dynamicVaultApiBaseUrl?: string;
  timeoutMs?: number;
  httpClient?: RateLimitedHttpClient;
  fetchImpl?: typeof fetch;
  connection?: Connection;
  tokenResolver?: (symbol: string, cluster: MeteoraCluster) => Promise<ResolvedToken>;
  vaultFactory?: (connection: Connection, token: ResolvedToken) => Promise<MeteoraVaultLike>;
  tokenMintOverrides?: Record<string, string>;
}

export interface ResolvedToken {
  symbol: string;
  address: string;
  decimals?: number;
  name?: string;
}

export interface MeteoraVaultLike {
  vaultAddress?: { toBase58(): string } | string;
  lpSupply?: unknown;
  getWithdrawableAmount(): Promise<unknown>;
}

interface MeteoraVaultConstructor {
  create(
    connection: Connection,
    tokenAddress: PublicKey,
    opt?: { cluster?: MeteoraCluster },
  ): Promise<MeteoraVaultLike>;
}

const DEFAULT_DYNAMIC_VAULT_API_BASE = "https://merv2-api.meteora.ag";

const VaultStateSchema = z
  .object({
    vault_address: z.string().optional(),
    lp_supply: z.union([z.number(), z.string()]).optional(),
    virtual_price: z.union([z.number(), z.string()]).optional(),
    usd_rate: z.union([z.number(), z.string()]).optional(),
    strategies: z.array(z.record(z.unknown())).optional(),
    withdrawable_amount: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

const ApyStateSchema = z
  .object({
    current_apy: z.union([z.number(), z.string()]).optional(),
    average_apy: z.union([z.number(), z.string()]).optional(),
    hourly_apy: z.union([z.number(), z.string()]).optional(),
    strategies: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

const VaultInfoListSchema = z.array(z.record(z.unknown()));

export class MeteoraVaultClient {
  private readonly cluster: MeteoraCluster;
  private readonly timeoutMs: number;
  private readonly dynamicVaultApiBaseUrl: string;
  private readonly connection: Connection;
  private readonly httpClient: RateLimitedHttpClient;
  private readonly tokenResolver: (symbol: string, cluster: MeteoraCluster) => Promise<ResolvedToken>;
  private readonly vaultFactory: (connection: Connection, token: ResolvedToken) => Promise<MeteoraVaultLike>;
  private readonly tokenMintOverrides: Record<string, string>;

  constructor(options: MeteoraVaultClientOptions = {}) {
    this.cluster = options.cluster ?? "devnet";
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.dynamicVaultApiBaseUrl = stripTrailingSlash(
      options.dynamicVaultApiBaseUrl ?? DEFAULT_DYNAMIC_VAULT_API_BASE,
    );
    this.connection =
      options.connection ??
      new Connection(options.rpcUrl ?? clusterApiUrl(this.cluster), {
        commitment: options.commitment ?? "confirmed",
      });
    this.httpClient =
      options.httpClient ??
      new RateLimitedHttpClient({
        fetchImpl: options.fetchImpl,
        userAgent: "@autovc/treasury",
      });
    this.tokenMintOverrides = normalizeSymbolMap(options.tokenMintOverrides ?? {});
    this.tokenResolver = options.tokenResolver ?? ((symbol, cluster) => resolveToken(symbol, cluster, this.tokenMintOverrides));
    this.vaultFactory =
      options.vaultFactory ?? ((connection, token) => defaultVaultFactory(connection, token, this.cluster));
  }

  async getVaultDetails(tokenSymbol: string): Promise<MeteoraVaultDetails> {
    const normalizedSymbol = normalizeSymbol(tokenSymbol);
    const token = await this.resolveToken(normalizedSymbol);
    const [vault, vaultState, apyState] = await Promise.all([
      this.vaultFactory(this.connection, token),
      this.fetchVaultState(token.address),
      this.fetchApyState(token.address),
    ]);

    const withdrawableAmount = asNumber(await vault.getWithdrawableAmount()) ?? asNumber(vaultState.withdrawable_amount) ?? 0;
    const lpSupply = asNumber(vault.lpSupply) ?? asNumber(vaultState.lp_supply);
    const usdRate = asNumber(vaultState.usd_rate);
    const virtualPrice =
      asNumber(vaultState.virtual_price) ??
      (lpSupply && lpSupply > 0 ? withdrawableAmount / lpSupply : 0);
    const strategies = mergeStrategies(vaultState.strategies ?? [], apyState.strategies ?? []);

    return {
      tokenSymbol: token.symbol,
      tokenMint: token.address,
      cluster: this.cluster,
      vaultAddress: asVaultAddress(vault.vaultAddress) ?? asOptionalString(vaultState.vault_address),
      withdrawableAmount: round(withdrawableAmount, 9),
      withdrawableUsd: usdRate ? round(withdrawableAmount * usdRate, 6) : undefined,
      virtualPrice: round(virtualPrice, 9),
      lpSupply: lpSupply !== undefined ? round(lpSupply, 9) : undefined,
      usdRate: usdRate !== undefined ? round(usdRate, 6) : undefined,
      apy: {
        currentPct: roundOptional(asNumber(apyState.current_apy)),
        averagePct: roundOptional(asNumber(apyState.average_apy)),
        hourlyPct: roundOptional(asNumber(apyState.hourly_apy)),
      },
      strategies,
      rawState: vaultState,
      rawApy: apyState,
    };
  }

  private async resolveToken(symbol: string): Promise<ResolvedToken> {
    try {
      return await this.tokenResolver(symbol, this.cluster);
    } catch (error) {
      const vaultInfo = await this.fetchVaultInfo();
      const match = vaultInfo.find((item) => {
        const foundSymbol = readString(item, "symbol", "token_symbol");
        return foundSymbol ? normalizeSymbol(foundSymbol) === symbol : false;
      });
      const mint = readString(match, "token_address", "mint", "token_mint");
      if (!mint) {
        throw error;
      }
      return {
        symbol,
        address: mint,
        decimals: asNumber(readUnknown(match, "decimals")),
        name: readString(match, "name", "token_name") ?? symbol,
      };
    }
  }

  private async fetchVaultState(tokenMint: string): Promise<z.infer<typeof VaultStateSchema>> {
    return this.getJson(
      `${this.dynamicVaultApiBaseUrl}/vault_state/${tokenMint}`,
      { service: "dynamic_vault" },
      VaultStateSchema,
    );
  }

  private async fetchApyState(tokenMint: string): Promise<z.infer<typeof ApyStateSchema>> {
    return this.getJson(
      `${this.dynamicVaultApiBaseUrl}/apy_state/${tokenMint}`,
      { service: "dynamic_vault" },
      ApyStateSchema,
    );
  }

  private async fetchVaultInfo(): Promise<Array<Record<string, unknown>>> {
    return this.getJson(
      `${this.dynamicVaultApiBaseUrl}/vault_info`,
      { service: "dynamic_vault" },
      VaultInfoListSchema,
    );
  }

  private async getJson<T>(
    url: string,
    options: Omit<JsonRequestOptions, "timeoutMs"> & { timeoutMs?: number },
    schema: z.ZodType<T>,
  ): Promise<T> {
    return this.httpClient.getJson(url, { ...options, timeoutMs: options.timeoutMs ?? this.timeoutMs }, schema);
  }
}

export async function getVaultDetails(
  tokenSymbol: string,
  options: MeteoraVaultClientOptions = {},
): Promise<MeteoraVaultDetails> {
  return new MeteoraVaultClient(options).getVaultDetails(tokenSymbol);
}

async function defaultVaultFactory(
  connection: Connection,
  token: ResolvedToken,
  cluster: MeteoraCluster,
): Promise<MeteoraVaultLike> {
  const vaultSdk = VaultImpl as unknown as MeteoraVaultConstructor & {
    default?: MeteoraVaultConstructor;
  };
  const vaultFactory = vaultSdk.default ?? vaultSdk;
  const vault = await vaultFactory.create(connection, new PublicKey(token.address), {
    cluster,
  });
  return vault as MeteoraVaultLike;
}

async function resolveToken(
  symbol: string,
  _cluster: MeteoraCluster,
  tokenMintOverrides: Record<string, string>,
): Promise<ResolvedToken> {
  const overrideMint = tokenMintOverrides[symbol];
  if (overrideMint) {
    return { symbol, address: overrideMint };
  }

  const tokens = await new StaticTokenListResolutionStrategy().resolve();
  const registryToken = tokens.find((item) => normalizeSymbol(item.symbol) === symbol);
  if (!registryToken) {
    throw new Error(`Unable to resolve token symbol '${symbol}' from the token registry or overrides.`);
  }

  return {
    symbol: normalizeSymbol(registryToken.symbol),
    address: registryToken.address,
    decimals: registryToken.decimals,
    name: registryToken.name,
  };
}

function mergeStrategies(
  vaultStateStrategies: unknown[],
  apyStrategies: unknown[],
): VaultStrategySnapshot[] {
  const apyByAddress = new Map<string, Record<string, unknown>>();
  for (const raw of apyStrategies) {
    if (!isRecord(raw)) {
      continue;
    }
    const address = normalizeAddress(readString(raw, "address", "strategy_address", "pubkey"));
    if (address) {
      apyByAddress.set(address, raw);
    }
  }

  return vaultStateStrategies
    .filter(isRecord)
    .map((raw, index) => {
      const address = normalizeAddress(readString(raw, "address", "strategy_address", "pubkey"));
      const apy = address ? apyByAddress.get(address) : undefined;
      const strategyName =
        readString(raw, "name", "strategy_name") ??
        readString(apy, "name", "strategy_name") ??
        `Strategy ${index + 1}`;
      return {
        address: address ?? undefined,
        name: strategyName,
        weightBps: asNumber(readUnknown(raw, "weight_bps", "allocation_bps")),
        allocatedAmount: asNumber(readUnknown(raw, "allocated_amount", "position_amount")),
        allocatedUsd: asNumber(readUnknown(raw, "allocated_usd", "position_usd")),
        liquidityUsd: asNumber(readUnknown(raw, "liquidity_usd", "available_liquidity_usd")),
        utilizationPct: asPercent(readUnknown(raw, "utilization", "utilization_rate")),
        safeUtilizationPct: asPercent(readUnknown(raw, "safe_utilization", "safe_utilization_rate")),
        averageApyPct: asNumber(readUnknown(apy, "average_apy", "average_apr")),
        currentApyPct: asNumber(readUnknown(apy, "current_apy", "current_apr")),
      } satisfies VaultStrategySnapshot;
    })
    .sort((left, right) => (right.allocatedUsd ?? 0) - (left.allocatedUsd ?? 0));
}

function readUnknown(record: Record<string, unknown> | undefined, ...keys: string[]): unknown {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function readString(record: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  const value = readUnknown(record, ...keys);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeSymbolMap(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [normalizeSymbol(key), value.trim()])
      .filter(([, value]) => Boolean(value)),
  );
}

function normalizeAddress(value?: string): string | undefined {
  return value?.trim();
}

function asVaultAddress(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object" && "toBase58" in value && typeof value.toBase58 === "function") {
    return value.toBase58();
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === "object") {
    const toNumber = (value as { toNumber?: () => number }).toNumber;
    if (typeof toNumber === "function") {
      const parsed = toNumber.call(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    const toString = (value as { toString?: () => string }).toString;
    if (typeof toString === "function") {
      const parsed = Number(toString.call(value));
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

function asPercent(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  return numeric <= 1 ? numeric * 100 : numeric;
}

function round(value: number, precision = 6): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundOptional(value: number | undefined): number | undefined {
  return value === undefined ? undefined : round(value, 6);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
