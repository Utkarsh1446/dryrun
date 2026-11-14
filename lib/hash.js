// Canonical hashes for receipts. Key order is sorted so the same check always hashes the same.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const CHECKER_VERSION = pkg.version;

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function checkPayload({ repo, sha, checker = CHECKER_VERSION, assessment }) {
  return {
    checker,
    commit: sha || '',
    fails: assessment.fails,
    kind: 'check',
    repo,
    results: (assessment.results || []).map((row) => ({ id: row.id, level: row.level })),
    rulesScore: assessment.rulesScore,
    score: assessment.score,
    warns: assessment.warns,
  };
}

export function deepPayload({ repo, sha, checker = CHECKER_VERSION, quoteHash, review, aiCalled }) {
  const body = review?.review || review || null;
  return {
    aiCalled: Boolean(aiCalled),
    checker,
    commit: sha || '',
    kind: 'deep',
    quoteHash,
    repo,
    review: body ? {
      claims: (body.claims || []).map((claim) => ({ claim: claim.claim, verdict: claim.verdict })),
      summary: body.summary || '',
      topFixes: body.topFixes || [],
    } : null,
  };
}

export function hashPayload(payload) {
  return sha256Hex(canonical(payload));
}

export function quoteDigest(quote) {
  return sha256Hex(canonical({
    amount: quote.amount,
    amountInFormatted: quote.amountInFormatted ?? null,
    deadline: quote.deadline,
    destinationAsset: quote.destinationAsset,
    dry: true,
    originAsset: quote.originAsset,
    quoteId: quote.quoteId,
  }));
}
