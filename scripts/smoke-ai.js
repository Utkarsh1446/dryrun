// Live NEAR AI Cloud check. Skips cleanly when NEAR_AI_API_KEY is unset.
// Never prints the key. Usage: npm run smoke:ai -- https://github.com/owner/repo
import { criteriaScore } from '../lib/ai.js';
import { deepReview, modelId, reasoningEffort } from '../lib/deep.js';
import { snapshot } from '../lib/repo.js';

const repo = process.argv[2] || 'https://github.com/Axlnd3r/NePu';

if (!process.env.NEAR_AI_API_KEY) {
  console.log('smoke:ai skipped: NEAR_AI_API_KEY is not set.');
  process.exit(0);
}

function tokens(usage) {
  if (!usage) return 'usage not in the response';
  return `tokens prompt ${usage.promptTokens ?? '?'} completion ${usage.completionTokens ?? '?'} total ${usage.totalTokens ?? '?'}`;
}

function signatureLine(signature) {
  if (!signature) return 'signature: none';
  const kind = signature.kind || 'unspecified';
  const addr = signature.signingAddress ? 'signing address present' : 'no signing address';
  return `signature kind ${kind}, ${addr}`;
}

let failed = false;
console.log(`smoke:ai ${repo}`);
console.log(`criteria model ${modelId('score')} reasoning ${reasoningEffort()}`);
console.log(`deep model ${modelId('deep')} reasoning ${reasoningEffort()}`);

let snap;
try {
  const started = Date.now();
  snap = await snapshot(repo);
  console.log(`clone ${Date.now() - started}ms files ${snap.files.size}`);
} catch (e) {
  console.error(`clone failed: ${e.message || e}`);
  process.exit(1);
}

try {
  const score = await criteriaScore(snap);
  if (!score) {
    failed = true;
    console.error('criteria: no result (key was set but the call returned nothing)');
  } else if (score.error) {
    failed = true;
    console.error(`criteria error: ${score.error} model ${score.model || ''} finish ${score.finishReason || ''} ${score.latencyMs ?? '?'}ms`);
  } else {
    const s = score.scores;
    console.log(`criteria ${score.latencyMs}ms model ${score.model} finish ${score.finishReason} ${tokens(score.usage)}`);
    console.log(`  technical ${s.technical} design ${s.design} impact ${s.impact} originality ${s.originality} sustainability ${s.sustainability}`);
    console.log(`  note: ${score.note || ''}`);
  }
} catch (e) {
  failed = true;
  console.error(`criteria failed: ${e.message || e}`);
}

try {
  const deep = await deepReview(snap);
  const review = deep.review || {};
  console.log(`deep chat ${deep.chatMs}ms total ${deep.latencyMs}ms model ${deep.model} requested ${deep.requestedModel} finish ${deep.finishReason} ${tokens(deep.usage)}`);
  console.log(`  ${signatureLine(deep.signature)}`);
  console.log(`  summary: ${review.summary || ''}`);
  console.log(`  run: ${review.runPrediction || ''}`);
  console.log(`  claims ${(review.claims || []).length} topFixes ${(review.topFixes || []).length}`);
  if (!review.summary) {
    failed = true;
    console.error('deep review returned no summary');
  }
} catch (e) {
  failed = true;
  console.error(`deep review failed: ${e.message || e}`);
}

process.exit(failed ? 1 : 0);
