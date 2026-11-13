import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEEP_MAX_TOKENS, DEFAULT_DEEP_MODEL, DEFAULT_SCORE_MODEL, SCORE_MAX_TOKENS,
  deepReview, messageText, modelId, parseReply, readCompletion,
} from '../lib/deep.js';
import { criteriaScore } from '../lib/ai.js';

const snap = { files: new Map([['README.md', '# Thing\nBuilt with NEAR.\n']]) };
const REASONING = '{"summary":"The README matches the tree.","runPrediction":"npm test is the first step.","claims":[{"claim":"It runs tests","verdict":"supported","evidence":"README.md","fix":""}],"topFixes":["Add an example"]}';

test('canonical model ids, with one override for both calls', () => {
  assert.equal(modelId('deep', {}), DEFAULT_DEEP_MODEL);
  assert.equal(modelId('score', {}), DEFAULT_SCORE_MODEL);
  assert.equal(DEFAULT_DEEP_MODEL, 'z-ai/glm-5.3');
  assert.equal(DEFAULT_SCORE_MODEL, 'z-ai/glm-5.3-flash');
  assert.notEqual(DEFAULT_DEEP_MODEL, 'zai-org/GLM-5.1-FP8');
  assert.equal(modelId('deep', { NEAR_AI_MODEL: 'qwen/qwen3.7-max' }), 'qwen/qwen3.7-max');
  assert.equal(modelId('score', { NEAR_AI_MODEL: 'qwen/qwen3.7-max' }), 'qwen/qwen3.7-max');
});

test('a null content falls back to reasoning_content, and parseReply accepts empty input', () => {
  assert.equal(messageText({ content: null, reasoning_content: REASONING }), REASONING);
  assert.equal(messageText({ content: '', reasoning_content: REASONING }), REASONING);
  assert.equal(messageText({ content: '{"summary":"from content"}', reasoning_content: REASONING }).includes('from content'), true);
  assert.equal(messageText({ content: [{ type: 'text', text: 'array' }], reasoning_content: 'nope' }), 'array');
  assert.equal(messageText(null), '');
  const read = readCompletion({
    id: 'chat-1',
    model: 'z-ai/glm-5.3',
    choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: REASONING } }],
    usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
  });
  assert.equal(read.finishReason, 'length');
  assert.equal(read.usage.totalTokens, 33);
  assert.equal(parseReply(read.text).summary, 'The README matches the tree.');
  assert.equal(parseReply(null).summary, '');
  assert.equal(parseReply(undefined).claims.length, 0);
  assert.equal(parseReply('no json here').summary, 'no json here');
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('deep review reads reasoning_content and requests a gateway signature with the model', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/chat/completions')) {
      return jsonResponse({
        id: 'chatcmpl-1',
        model: 'z-ai/glm-5.3',
        choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: 'thinking\n' + REASONING } }],
        usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      });
    }
    return jsonResponse({
      text: 'signed text',
      signature: 'sig-bytes',
      signing_address: 'ed25519:example',
      signing_algo: 'ecdsa',
      signature_kind: 'gateway',
    });
  };
  const out = await deepReview(snap, { fetchImpl, key: 'test-key', model: 'z-ai/glm-5.3' });
  const chat = calls[0];
  const body = JSON.parse(chat.init.body);
  assert.equal(body.model, 'z-ai/glm-5.3');
  assert.equal(body.max_tokens, DEEP_MAX_TOKENS);
  assert.ok(body.max_tokens >= 2048);
  assert.equal(chat.init.headers.Authorization, 'Bearer test-key');
  assert.equal(chat.init.body.includes('test-key'), false);
  assert.match(calls[1].url, /\/signature\/chatcmpl-1\?/);
  assert.match(calls[1].url, /model=z-ai%2Fglm-5\.3/);
  assert.match(calls[1].url, /signing_algo=ecdsa/);
  assert.equal(out.review.summary, 'The README matches the tree.');
  assert.equal(out.review.runPrediction, 'npm test is the first step.');
  assert.equal(out.finishReason, 'length');
  assert.equal(out.usage.totalTokens, 140);
  assert.equal(out.signature.kind, 'gateway');
  assert.equal(out.signature.signingAlgo, 'ecdsa');
  assert.equal(out.signature.signingAddress, 'ed25519:example');
  assert.equal(out.model, 'z-ai/glm-5.3');
});

test('a missing signature does not drop the review', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/chat/completions')) {
      return jsonResponse({
        id: 'chat-2',
        choices: [{ message: { content: '{"summary":"ok","claims":[],"topFixes":[]}' } }],
      });
    }
    return jsonResponse({ message: 'nope' }, 404);
  };
  const out = await deepReview(snap, { fetchImpl, key: 'test-key', model: 'z-ai/glm-5.3' });
  assert.equal(out.review.summary, 'ok');
  assert.equal(out.signature, null);
});

test('criteria score uses the flash default, a large token budget, and reasoning_content', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization };
    return jsonResponse({
      id: 'chat-3',
      model: DEFAULT_SCORE_MODEL,
      choices: [{
        finish_reason: 'stop',
        message: { content: null, reasoning_content: '{"technical":4,"design":3,"impact":3,"originality":2,"sustainability":4,"note":"solid"}' },
      }],
      usage: { prompt_tokens: 8, completion_tokens: 9, total_tokens: 17 },
    });
  };
  const out = await criteriaScore(snap, { fetchImpl, key: 'test-key' });
  assert.equal(seen.body.model, modelId('score'));
  assert.equal(seen.body.max_tokens, SCORE_MAX_TOKENS);
  assert.equal(seen.auth, 'Bearer test-key');
  assert.equal(seen.body && JSON.stringify(seen.body).includes('test-key'), false);
  assert.equal(out.scores.technical, 4);
  assert.equal(out.scores.sustainability, 4);
  assert.equal(out.note, 'solid');
  assert.equal(out.model, DEFAULT_SCORE_MODEL);
  assert.equal(out.usage.totalTokens, 17);
  assert.equal(out.finishReason, 'stop');
});
