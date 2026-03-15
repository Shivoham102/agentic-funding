export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type EvidenceSourceKind =
  | "unbrowse_intent"
  | "unbrowse_skill_search"
  | "unbrowse_domain_search"
  | "solana_rpc"
  | "portfolio_context";

export type EvidenceFactCategory =
  | "founder"
  | "product"
  | "market"
  | "wallet"
  | "portfolio_context";

export interface EvidenceSource {
  id: string;
  kind: EvidenceSourceKind;
  label: string;
  url?: string;
  endpoint?: string;
  method?: string;
  invocation_id?: string;
  request_signature?: string;
  observed_at: string;
  raw_payload_hash: string;
  raw_payload_ref?: string;
  metadata?: JsonObject;
}

export interface EvidenceFact {
  id: string;
  category: EvidenceFactCategory;
  key: string;
  claim: string;
  value: JsonValue;
  confidence: number;
  observed_at: string;
  provenance: {
    source_ids: string[];
    urls?: string[];
    invocation_ids?: string[];
    request_signatures?: string[];
  };
}

export interface EvidenceBundle {
  proposal_id?: string;
  facts: EvidenceFact[];
  sources: EvidenceSource[];
  timestamps: {
    generated_at: string;
    source_observed_at: string[];
  };
  confidence: {
    overall: number;
    by_category: Partial<Record<EvidenceFactCategory, number>>;
  };
  raw_payload_hash: string;
}

export interface OffChainPayloadRecord {
  source_id: string;
  observed_at: string;
  raw_payload_hash: string;
  payload: JsonValue;
}

export interface ResolveIntentParams {
  url: string;
  intent: string;
  schemaHint?: JsonValue;
}

export interface ResolveIntentResult {
  data: JsonValue;
  sources: EvidenceSource[];
  raw_payload: JsonValue;
  raw_payload_hash: string;
  invocation_id?: string;
}

export interface UnbrowseSearchParams {
  query: string;
}

export interface UnbrowseDomainSearchParams extends UnbrowseSearchParams {
  domain: string;
}

export interface UnbrowseSearchResult {
  id: string;
  name: string;
  domain?: string;
  description?: string;
  url?: string;
  score?: number;
  raw: JsonValue;
  source: EvidenceSource;
}

export interface TokenAccountHolding {
  address: string;
  mint: string;
  amount_raw: string;
  decimals: number;
  ui_amount: number;
  owner: string;
  program_id: string;
}

export interface RecentSignatureRecord {
  signature: string;
  slot: number;
  block_time: number | null;
  err: JsonValue | null;
  confirmation_status: string | null;
}

export interface WalletSummary {
  pubkey: string;
  commitment: string;
  requested_at: string;
  solBalanceLamports: number;
  tokenAccounts: TokenAccountHolding[];
  recentSignatures: RecentSignatureRecord[];
}

export interface WalletAgeEstimate {
  earliest_observed_at: string | null;
  lookback_days: number | null;
  label: "unknown" | "new" | "emerging" | "established" | "mature";
}

export interface DerivedSignals {
  walletAgeEstimate: WalletAgeEstimate;
  activityLevel: "none" | "low" | "medium" | "high";
  holdingsCount: number;
}

export interface SolanaWalletSummaryOptions {
  commitment?: "processed" | "confirmed" | "finalized";
  recentSignatureLimit?: number;
}

export interface DiligenceProposal {
  proposal_id?: string;
  name: string;
  website_url?: string;
  github_url?: string;
  short_description?: string;
  description?: string;
  team_background?: string;
  market_summary?: string;
  traction_summary?: string;
  recipient_wallet?: string;
  category?: string;
  stage?: string;
}

export interface PortfolioProjectRecord {
  id: string;
  name: string;
  category?: string;
  stage?: string;
  website_url?: string;
  recipient_wallet?: string;
}

export interface BuildEvidenceBundleOptions {
  proposal: DiligenceProposal;
  portfolio_projects?: PortfolioProjectRecord[];
  generated_at?: Date;
}

export interface BuildEvidenceBundleResult {
  bundle: EvidenceBundle;
  raw_payloads: OffChainPayloadRecord[];
}
