import type {
  BuildEvidenceBundleOptions,
  BuildEvidenceBundleResult,
  DiligenceProposal,
  EvidenceFact,
  EvidenceFactCategory,
  EvidenceSource,
  JsonObject,
  JsonValue,
  OffChainPayloadRecord,
  PortfolioProjectRecord,
  ResolveIntentResult,
} from "./types.js";
import { SolanaEnrichmentClient } from "./solanaEnrichment.js";
import { UnbrowseClient } from "./unbrowseClient.js";
import {
  average,
  asStringArray,
  clampConfidence,
  hashJson,
  isRecord,
  makeId,
  normalizeConfidence,
  parseUrlDomain,
  toJsonValue,
  unique,
} from "./utils.js";

interface DiligenceSubsystemOptions {
  unbrowseClient?: UnbrowseClient;
  solanaClient?: SolanaEnrichmentClient;
}

interface WebCheckDefinition {
  category: Extract<EvidenceFactCategory, "founder" | "product" | "market">;
  label: string;
  claimSelector: (proposal: DiligenceProposal) => string | undefined;
}

const WEB_CHECKS: WebCheckDefinition[] = [
  {
    category: "founder",
    label: "founder and team claims",
    claimSelector: (proposal) => proposal.team_background,
  },
  {
    category: "product",
    label: "product and traction claims",
    claimSelector: (proposal) =>
      [proposal.short_description, proposal.description, proposal.traction_summary]
        .filter((part): part is string => Boolean(part))
        .join(" "),
  },
  {
    category: "market",
    label: "market and positioning claims",
    claimSelector: (proposal) => proposal.market_summary,
  },
];

export class DiligenceSubsystem {
  private readonly unbrowseClient?: UnbrowseClient;
  private readonly solanaClient?: SolanaEnrichmentClient;

  constructor(options: DiligenceSubsystemOptions = {}) {
    this.unbrowseClient = options.unbrowseClient;
    this.solanaClient = options.solanaClient;
  }

  async buildEvidenceBundle(
    options: BuildEvidenceBundleOptions,
  ): Promise<BuildEvidenceBundleResult> {
    const generatedAt = (options.generated_at ?? new Date()).toISOString();
    const facts: EvidenceFact[] = [];
    const sources: EvidenceSource[] = [];
    const rawPayloads: OffChainPayloadRecord[] = [];

    if (this.unbrowseClient && options.proposal.website_url) {
      const webEvidence = await this.collectWebEvidence(options.proposal);
      facts.push(...webEvidence.facts);
      sources.push(...webEvidence.sources);
      rawPayloads.push(...webEvidence.rawPayloads);
    }

    if (this.solanaClient && options.proposal.recipient_wallet) {
      const walletEvidence = await this.collectWalletEvidence(options.proposal.recipient_wallet);
      facts.push(...walletEvidence.facts);
      sources.push(...walletEvidence.sources);
      rawPayloads.push(...walletEvidence.rawPayloads);
    }

    if ((options.portfolio_projects ?? []).length > 0) {
      const portfolioEvidence = this.collectPortfolioContextEvidence(
        options.proposal,
        options.portfolio_projects ?? [],
      );
      facts.push(...portfolioEvidence.facts);
      sources.push(...portfolioEvidence.sources);
      rawPayloads.push(...portfolioEvidence.rawPayloads);
    }

    const confidenceByCategory = buildConfidenceByCategory(facts);
    const bundlePayload = {
      proposal_id: options.proposal.proposal_id,
      facts,
      sources,
      timestamps: {
        generated_at: generatedAt,
        source_observed_at: unique(sources.map((source) => source.observed_at)).sort(),
      },
      confidence: {
        overall: average(Object.values(confidenceByCategory)),
        by_category: confidenceByCategory,
      },
    };

    return {
      bundle: {
        ...bundlePayload,
        raw_payload_hash: hashJson(bundlePayload),
      },
      raw_payloads: rawPayloads,
    };
  }

  private async collectWebEvidence(proposal: DiligenceProposal): Promise<{
    facts: EvidenceFact[];
    sources: EvidenceSource[];
    rawPayloads: OffChainPayloadRecord[];
  }> {
    const facts: EvidenceFact[] = [];
    const sources: EvidenceSource[] = [];
    const rawPayloads: OffChainPayloadRecord[] = [];

    for (const webCheck of WEB_CHECKS) {
      const claimText = webCheck.claimSelector(proposal)?.trim();
      if (!claimText || !proposal.website_url) {
        continue;
      }

      const result = await this.unbrowseClient!.resolveIntent({
        url: proposal.website_url,
        intent: buildWebIntent(proposal, webCheck.label, claimText),
        schemaHint: buildWebSchemaHint(webCheck.category),
      });

      sources.push(...result.sources);
      rawPayloads.push(
        ...result.sources.map((source) => ({
          source_id: source.id,
          observed_at: source.observed_at,
          raw_payload_hash: source.raw_payload_hash,
          payload: result.raw_payload,
        })),
      );
      facts.push(...normalizeUnbrowseFacts(webCheck.category, claimText, result));
    }

    return {
      facts,
      sources,
      rawPayloads,
    };
  }

  private async collectWalletEvidence(wallet: string): Promise<{
    facts: EvidenceFact[];
    sources: EvidenceSource[];
    rawPayloads: OffChainPayloadRecord[];
  }> {
    const summary = await this.solanaClient!.getWalletSummary(wallet);
    const derivedSignals = this.solanaClient!.getDerivedSignals(summary);
    const observedAt = summary.requested_at;
    const rawPayloads: OffChainPayloadRecord[] = [];

    const sourcePayloads = [
      {
        label: "Solana getBalance",
        request_signature: `getBalance:${summary.pubkey}`,
        payload: toJsonValue({
          wallet: summary.pubkey,
          commitment: summary.commitment,
          solBalanceLamports: summary.solBalanceLamports,
        }),
      },
      {
        label: "Solana getTokenAccountsByOwner",
        request_signature: `getTokenAccountsByOwner:${summary.pubkey}`,
        payload: toJsonValue({
          wallet: summary.pubkey,
          commitment: summary.commitment,
          tokenAccounts: summary.tokenAccounts,
        }),
      },
      {
        label: "Solana getSignaturesForAddress",
        request_signature: `getSignaturesForAddress:${summary.pubkey}`,
        payload: toJsonValue({
          wallet: summary.pubkey,
          commitment: summary.commitment,
          recentSignatures: summary.recentSignatures,
        }),
      },
    ];

    const sources = sourcePayloads.map((item) => {
      const rawPayloadHash = hashJson(item.payload);
      const source: EvidenceSource = {
        id: makeId("solana_rpc", `${item.request_signature}|${rawPayloadHash}`),
        kind: "solana_rpc",
        label: item.label,
        endpoint: "solana-rpc",
        method: "RPC",
        request_signature: item.request_signature,
        observed_at: observedAt,
        raw_payload_hash: rawPayloadHash,
        metadata: {
          wallet,
          commitment: summary.commitment,
        },
      };

      rawPayloads.push({
        source_id: source.id,
        observed_at: observedAt,
        raw_payload_hash: rawPayloadHash,
        payload: item.payload,
      });
      return source;
    });

    const facts: EvidenceFact[] = [
      makeFact("wallet", "sol_balance_lamports", "Wallet SOL balance in lamports.", summary.solBalanceLamports, observedAt, sources),
      makeFact("wallet", "token_accounts", "Wallet SPL token account holdings.", toJsonValue(summary.tokenAccounts), observedAt, sources),
      makeFact("wallet", "recent_signatures", "Recent wallet signatures from the finalized RPC view.", toJsonValue(summary.recentSignatures), observedAt, sources),
      makeFact("wallet", "wallet_age_estimate", "Estimated wallet age derived from the oldest recent signature in scope.", toJsonValue(derivedSignals.walletAgeEstimate), observedAt, sources),
      makeFact("wallet", "activity_level", "Derived wallet activity level from recent finalized signatures.", derivedSignals.activityLevel, observedAt, sources),
      makeFact("wallet", "holdings_count", "Count of token holdings with a positive balance.", derivedSignals.holdingsCount, observedAt, sources),
    ];

    return {
      facts,
      sources,
      rawPayloads,
    };
  }

  private collectPortfolioContextEvidence(
    proposal: DiligenceProposal,
    portfolioProjects: PortfolioProjectRecord[],
  ): {
    facts: EvidenceFact[];
    sources: EvidenceSource[];
    rawPayloads: OffChainPayloadRecord[];
  } {
    const observedAt = new Date().toISOString();
    const proposalDomain = parseUrlDomain(proposal.website_url);

    const sameCategory = portfolioProjects.filter(
      (project) => project.category && proposal.category && project.category === proposal.category,
    );
    const sameStage = portfolioProjects.filter(
      (project) => project.stage && proposal.stage && project.stage === proposal.stage,
    );
    const sameDomain = portfolioProjects.filter((project) => {
      const portfolioDomain = parseUrlDomain(project.website_url);
      return Boolean(proposalDomain && portfolioDomain && proposalDomain === portfolioDomain);
    });
    const sameWallet = portfolioProjects.filter(
      (project) =>
        project.recipient_wallet &&
        proposal.recipient_wallet &&
        project.recipient_wallet === proposal.recipient_wallet,
    );

    const overlapIds = unique(
      [...sameCategory, ...sameStage, ...sameDomain, ...sameWallet].map((project) => project.id),
    );
    const overlapProjects = portfolioProjects
      .filter((project) => overlapIds.includes(project.id))
      .map((project) => ({
        id: project.id,
        name: project.name,
      }));

    const payload: JsonObject = {
      proposal: {
        proposal_id: proposal.proposal_id ?? null,
        category: proposal.category ?? null,
        stage: proposal.stage ?? null,
        website_domain: proposalDomain ?? null,
        recipient_wallet: proposal.recipient_wallet ?? null,
      },
      overlap_summary: {
        same_category_count: sameCategory.length,
        same_stage_count: sameStage.length,
        same_domain_count: sameDomain.length,
        same_wallet_count: sameWallet.length,
        overlap_projects: overlapProjects,
      },
    };
    const rawPayloadHash = hashJson(payload);
    const source: EvidenceSource = {
      id: makeId("portfolio_context", rawPayloadHash),
      kind: "portfolio_context",
      label: "Internal portfolio context",
      endpoint: "internal-db",
      method: "SNAPSHOT",
      request_signature: "portfolio_context_snapshot",
      observed_at: observedAt,
      raw_payload_hash: rawPayloadHash,
      metadata: {
        roster_size: portfolioProjects.length,
      },
    };

    const facts: EvidenceFact[] = [
      makeFact("portfolio_context", "portfolio_total_projects", "Current internal portfolio size.", portfolioProjects.length, observedAt, [source], 1),
      makeFact("portfolio_context", "portfolio_same_category_count", "Count of portfolio companies in the same category.", sameCategory.length, observedAt, [source], 1),
      makeFact("portfolio_context", "portfolio_same_stage_count", "Count of portfolio companies at the same stage.", sameStage.length, observedAt, [source], 1),
      makeFact("portfolio_context", "portfolio_same_domain_count", "Count of portfolio companies sharing the same website domain.", sameDomain.length, observedAt, [source], 1),
      makeFact("portfolio_context", "portfolio_same_wallet_count", "Count of portfolio companies sharing the same recipient wallet.", sameWallet.length, observedAt, [source], 1),
      makeFact("portfolio_context", "portfolio_overlap_projects", "Projects overlapping on category, stage, website domain, or wallet.", overlapProjects, observedAt, [source], 1),
    ];

    return {
      facts,
      sources: [source],
      rawPayloads: [
        {
          source_id: source.id,
          observed_at: observedAt,
          raw_payload_hash: rawPayloadHash,
          payload,
        },
      ],
    };
  }
}

function buildWebIntent(proposal: DiligenceProposal, label: string, claimText: string): string {
  return [
    `Corroborate ${label} for the startup proposal "${proposal.name}".`,
    "Return structured facts only.",
    `Claim text: ${claimText}`,
    "Focus on publicly verifiable evidence, contradictions, and the specific URLs supporting each fact.",
  ].join(" ");
}

function buildWebSchemaHint(
  category: Extract<EvidenceFactCategory, "founder" | "product" | "market">,
): JsonObject {
  return {
    category,
    facts: [
      {
        key: `${category}_fact`,
        claim: "string",
        supported: true,
        evidence: "string",
        supporting_urls: ["string"],
        confidence: 0.0,
      },
    ],
  };
}

function normalizeUnbrowseFacts(
  category: Extract<EvidenceFactCategory, "founder" | "product" | "market">,
  originalClaim: string,
  result: ResolveIntentResult,
): EvidenceFact[] {
  const observedAt = result.sources[0]?.observed_at ?? new Date().toISOString();
  const invocationIds = result.sources
    .map((source) => source.invocation_id)
    .filter((invocationId): invocationId is string => Boolean(invocationId));
  const sourceIds = result.sources.map((source) => source.id);
  const urls = unique(result.sources.map((source) => source.url).filter((url): url is string => Boolean(url)));

  const extractedFacts = extractFactItems(result.data);
  if (extractedFacts.length === 0) {
    return [
      {
        id: makeId("fact", `${category}|${originalClaim}|${result.raw_payload_hash}`),
        category,
        key: `${category}_corroboration`,
        claim: originalClaim,
        value: result.data,
        confidence: 0.5,
        observed_at: observedAt,
        provenance: {
          source_ids: sourceIds,
          urls,
          invocation_ids: invocationIds,
        },
      },
    ];
  }

  return extractedFacts.map((item, index) => {
    const supportingUrls = unique([
      ...urls,
      ...asStringArray(isRecord(item) ? item.supporting_urls : undefined),
    ]);
    const itemClaim =
      (isRecord(item) && typeof item.claim === "string" && item.claim.trim()) ||
      (isRecord(item) && typeof item.statement === "string" && item.statement.trim()) ||
      originalClaim;
    const key =
      (isRecord(item) && typeof item.key === "string" && item.key.trim()) ||
      `${category}_fact_${index + 1}`;

    let value: JsonValue = item;
    if (isRecord(item) && "supported" in item) {
      value = {
        supported: toJsonBoolean(item.supported),
        evidence: typeof item.evidence === "string" ? item.evidence : null,
        supporting_urls: supportingUrls,
      };
    }

    return {
      id: makeId("fact", `${category}|${key}|${result.raw_payload_hash}|${index}`),
      category,
      key,
      claim: itemClaim,
      value,
      confidence: normalizeConfidence(isRecord(item) ? item.confidence : undefined, 0.5),
      observed_at: observedAt,
      provenance: {
        source_ids: sourceIds,
        urls: supportingUrls,
        invocation_ids: invocationIds,
      },
    };
  });
}

function extractFactItems(data: JsonValue): JsonValue[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (!isRecord(data)) {
    return [];
  }

  for (const key of ["facts", "claims", "items", "results"]) {
    const candidate = data[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function makeFact(
  category: EvidenceFactCategory,
  key: string,
  claim: string,
  value: JsonValue,
  observedAt: string,
  sources: EvidenceSource[],
  confidence = 0.85,
): EvidenceFact {
  return {
    id: makeId("fact", `${category}|${key}|${hashJson(value)}`),
    category,
    key,
    claim,
    value,
    confidence: clampConfidence(confidence),
    observed_at: observedAt,
    provenance: {
      source_ids: sources.map((source) => source.id),
      urls: unique(sources.map((source) => source.url).filter((url): url is string => Boolean(url))),
      invocation_ids: sources
        .map((source) => source.invocation_id)
        .filter((invocationId): invocationId is string => Boolean(invocationId)),
      request_signatures: sources
        .map((source) => source.request_signature)
        .filter((requestSignature): requestSignature is string => Boolean(requestSignature)),
    },
  };
}

function buildConfidenceByCategory(
  facts: EvidenceFact[],
): Partial<Record<EvidenceFactCategory, number>> {
  const grouped: Partial<Record<EvidenceFactCategory, number[]>> = {};

  for (const fact of facts) {
    grouped[fact.category] ??= [];
    grouped[fact.category]!.push(fact.confidence);
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([category, values]) => [category, average(values ?? [])]),
  ) as Partial<Record<EvidenceFactCategory, number>>;
}

function toJsonBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}
