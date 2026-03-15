import { type Commitment, Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

import type {
  DerivedSignals,
  JsonValue,
  RecentSignatureRecord,
  SolanaWalletSummaryOptions,
  TokenAccountHolding,
  WalletAgeEstimate,
  WalletSummary,
} from "./types.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export interface SolanaEnrichmentClientOptions {
  rpcUrl?: string;
  commitment?: Commitment;
  recentSignatureLimit?: number;
  connection?: Connection;
}

export class SolanaEnrichmentClient {
  private readonly connection: Connection;
  private readonly commitment: Commitment;
  private readonly recentSignatureLimit: number;

  constructor(options: SolanaEnrichmentClientOptions = {}) {
    this.commitment = options.commitment ?? "finalized";
    this.recentSignatureLimit = options.recentSignatureLimit ?? 25;
    this.connection =
      options.connection ??
      new Connection(options.rpcUrl ?? clusterApiUrl("mainnet-beta"), {
        commitment: this.commitment,
      });
  }

  async getWalletSummary(
    pubkey: string,
    options: SolanaWalletSummaryOptions = {},
  ): Promise<WalletSummary> {
    const owner = new PublicKey(pubkey);
    const commitment = (options.commitment ?? this.commitment) as Commitment;
    const signatureCommitment = normalizeSignatureCommitment(commitment);
    const recentSignatureLimit = options.recentSignatureLimit ?? this.recentSignatureLimit;
    const requestedAt = new Date().toISOString();

    const [solBalanceLamports, tokenAccountsResponse, recentSignaturesResponse] =
      await Promise.all([
        this.connection.getBalance(owner, commitment),
        this.connection.getParsedTokenAccountsByOwner(
          owner,
          { programId: TOKEN_PROGRAM_ID },
          commitment,
        ),
        this.connection.getSignaturesForAddress(
          owner,
          { limit: recentSignatureLimit },
          signatureCommitment,
        ),
      ]);

    const tokenAccounts = tokenAccountsResponse.value.map((tokenAccount) =>
      normalizeTokenAccount(owner, tokenAccount.pubkey.toBase58(), tokenAccount.account.owner.toBase58(), tokenAccount.account.data),
    );

    const recentSignatures = recentSignaturesResponse.map<RecentSignatureRecord>((signature) => ({
      signature: signature.signature,
      slot: signature.slot,
      block_time: signature.blockTime ?? null,
      err: (signature.err as JsonValue | null) ?? null,
      confirmation_status: signature.confirmationStatus ?? null,
    }));

    return {
      pubkey,
      commitment,
      requested_at: requestedAt,
      solBalanceLamports,
      tokenAccounts,
      recentSignatures,
    };
  }

  getDerivedSignals(summary: WalletSummary): DerivedSignals {
    const earliestObservedAt = extractEarliestObservedAt(summary.recentSignatures);
    const walletAgeEstimate = deriveWalletAgeEstimate(summary.requested_at, earliestObservedAt);
    const holdingsCount = summary.tokenAccounts.filter(
      (account) => Number(account.amount_raw) > 0 || account.ui_amount > 0,
    ).length;
    const activityLevel = deriveActivityLevel(summary.recentSignatures.length);

    return {
      walletAgeEstimate,
      activityLevel,
      holdingsCount,
    };
  }
}

function normalizeTokenAccount(
  owner: PublicKey,
  address: string,
  programId: string,
  data: unknown,
): TokenAccountHolding {
  const parsedData = extractParsedData(data);
  const tokenAmount = extractTokenAmount(parsedData);

  return {
    address,
    mint: extractStringField(parsedData, "mint") ?? "",
    amount_raw: tokenAmount.amount_raw,
    decimals: tokenAmount.decimals,
    ui_amount: tokenAmount.ui_amount,
    owner: extractStringField(parsedData, "owner") ?? owner.toBase58(),
    program_id: programId,
  };
}

function extractParsedData(data: unknown): Record<string, unknown> {
  if (
    typeof data === "object" &&
    data !== null &&
    "parsed" in data &&
    typeof (data as { parsed?: unknown }).parsed === "object" &&
    (data as { parsed?: unknown }).parsed !== null
  ) {
    const parsed = (data as { parsed: { info?: unknown } }).parsed;
    if (typeof parsed.info === "object" && parsed.info !== null) {
      return parsed.info as Record<string, unknown>;
    }
  }

  return {};
}

function extractTokenAmount(parsedData: Record<string, unknown>): {
  amount_raw: string;
  decimals: number;
  ui_amount: number;
} {
  const tokenAmount =
    typeof parsedData.tokenAmount === "object" && parsedData.tokenAmount !== null
      ? (parsedData.tokenAmount as Record<string, unknown>)
      : {};

  return {
    amount_raw:
      typeof tokenAmount.amount === "string"
        ? tokenAmount.amount
        : typeof tokenAmount.amount === "number"
          ? String(tokenAmount.amount)
          : "0",
    decimals:
      typeof tokenAmount.decimals === "number" && Number.isFinite(tokenAmount.decimals)
        ? tokenAmount.decimals
        : 0,
    ui_amount:
      typeof tokenAmount.uiAmount === "number" && Number.isFinite(tokenAmount.uiAmount)
        ? tokenAmount.uiAmount
        : 0,
  };
}

function extractStringField(parsedData: Record<string, unknown>, key: string): string | undefined {
  const candidate = parsedData[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function extractEarliestObservedAt(signatures: RecentSignatureRecord[]): string | null {
  const timestamps = signatures
    .map((signature) => signature.block_time)
    .filter((blockTime): blockTime is number => blockTime !== null)
    .map((blockTime) => new Date(blockTime * 1000).toISOString());

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort()[0] ?? null;
}

function deriveWalletAgeEstimate(
  requestedAtIso: string,
  earliestObservedAt: string | null,
): WalletAgeEstimate {
  if (!earliestObservedAt) {
    return {
      earliest_observed_at: null,
      lookback_days: null,
      label: "unknown",
    };
  }

  const lookbackMs = Date.parse(requestedAtIso) - Date.parse(earliestObservedAt);
  const lookbackDays = Math.max(0, Math.round(lookbackMs / 86_400_000));

  let label: WalletAgeEstimate["label"] = "new";
  if (lookbackDays >= 365) {
    label = "mature";
  } else if (lookbackDays >= 90) {
    label = "established";
  } else if (lookbackDays >= 30) {
    label = "emerging";
  }

  return {
    earliest_observed_at: earliestObservedAt,
    lookback_days: lookbackDays,
    label,
  };
}

function deriveActivityLevel(signatureCount: number): DerivedSignals["activityLevel"] {
  if (signatureCount === 0) {
    return "none";
  }
  if (signatureCount < 5) {
    return "low";
  }
  if (signatureCount < 15) {
    return "medium";
  }
  return "high";
}

function normalizeSignatureCommitment(commitment: Commitment): "confirmed" | "finalized" {
  if (commitment === "finalized" || commitment === "max" || commitment === "root") {
    return "finalized";
  }
  return "confirmed";
}
