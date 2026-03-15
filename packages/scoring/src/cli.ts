import { extractFeatures, recommendPackage, score, validateFeatures } from "./index.js";

interface FeatureExtractionRequest {
  proposal?: unknown;
  evidence?: unknown;
  ownerPrefs?: unknown;
  treasurySnapshot?: unknown;
}

async function main(): Promise<void> {
  try {
    const input = await readStdin();
    const payload = parsePayload(input);
    const features = extractFeatures(payload.proposal ?? {}, payload.evidence ?? {});
    const validation = validateFeatures(features);
    const scorecard = score(features, payload.ownerPrefs ?? {});
    const fundingPackageDraft =
      payload.treasurySnapshot !== undefined
        ? recommendPackage(scorecard, payload.treasurySnapshot)
        : undefined;

    process.stdout.write(
      JSON.stringify(
        {
          ok: validation.ok,
          validation,
          features,
          scorecard,
          fundingPackageDraft,
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parsePayload(input: string): FeatureExtractionRequest {
  if (!input.trim()) {
    return {};
  }

  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Feature extraction CLI expects a JSON object payload.");
  }
  return parsed as FeatureExtractionRequest;
}

void main();
