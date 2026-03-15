import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractFeatures, recommendPackage, score, validateFeatures } from "../dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");

let failures = 0;

for (const caseName of ["strong", "weak"]) {
  try {
    const proposal = readJson(caseName, "proposal.json");
    const evidence = readJson(caseName, "evidence.json");
    const ownerPrefs = readJson(caseName, "owner-prefs.json");
    const treasury = readJson(caseName, "treasury.json");
    const expectedScorecard = readJson(caseName, "expected-scorecard.json");
    const expectedPackage = readJson(caseName, "expected-package.json");

    const features = extractFeatures(proposal, evidence);
    const featureValidation = validateFeatures(features);

    assert.equal(featureValidation.ok, true, featureValidation.errors.join("\n"));
    assert.equal(features.proposal_id, proposal.proposal_id);

    const scorecard = score(features, ownerPrefs);
    const fundingPackage = recommendPackage(scorecard, treasury);

    assert.deepStrictEqual(scorecard, expectedScorecard);
    assert.deepStrictEqual(fundingPackage, expectedPackage);
    process.stdout.write(`ok ${caseName}\n`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`not ok ${caseName}\n${message}\n`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}

function readJson(caseName, fileName) {
  const filePath = path.join(fixturesDir, caseName, fileName);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
