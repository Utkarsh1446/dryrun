import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEEP_MAX_TOKENS, DEEP_PROMPT_CHARS, DEEP_RETRY_CHARS, DEFAULT_DEEP_MODEL, DEFAULT_SCORE_MODEL,
  INCOMPLETE_REVIEW, SCORE_MAX_TOKENS, SCORE_PROMPT_CHARS, SCORE_RETRY_CHARS,
  acceptReview, answerText, buildPrompt, deepReview, finishPaidReview, modelId, parseReply, readCompletion, reasoningEffort,
} from '../lib/deep.js';
import { criteriaScore } from '../lib/ai.js';

const snap = { files: new Map([['README.md', '# Thing\nBuilt with NEAR.\n'], ['lib/a.js', 'x'.repeat(30_000)]]) };
const THINKING = 'Let me analyze this repository carefully before I answer.';
const GOOD = '{"summary":"The README matches the tree.","runPrediction":"npm test is the first step.","claims":[{"claim":"It runs tests","verdict":"supported","evidence":"README.md","fix":""}],"topFixes":["Add an example"]}';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('canonical model ids and reasoning effort default to low', () => {
  assert.equal(modelId('deep', {}), DEFAULT_DEEP_MODEL);
  assert.equal(modelId('score', {}), DEFAULT_SCORE_MODEL);
  assert.equal(reasoningEffort({}), 'low');
  assert.equal(reasoningEffort({ NEAR_AI_REASONING_EFFORT: 'medium' }), 'medium');
  assert.equal(reasoningEffort({ NEAR_AI_REASONING_EFFORT: '  ' }), 'low');
  assert.ok(SCORE_PROMPT_CHARS < DEEP_PROMPT_CHARS);
  assert.ok(DEEP_RETRY_CHARS < DEEP_PROMPT_CHARS);
  assert.ok(SCORE_RETRY_CHARS < SCORE_PROMPT_CHARS);
});

test('answer text ignores reasoning_content, and a length finish is not a review', () => {
  assert.equal(answerText({ content: null, reasoning_content: THINKING }), '');
  assert.equal(answerText({ content: '{"summary":"from content"}', reasoning_content: THINKING }), '{"summary":"from content"}');
  assert.equal(answerText(null), '');
  const length = readCompletion({
    id: 'chat-1',
    choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: THINKING + '\n' + GOOD } }],
  });
  assert.equal(length.text, '');
  assert.equal(acceptReview(length), null);
  assert.equal(parseReply(null), null);
  assert.equal(parseReply(THINKING), null);
  const stopped = readCompletion({ choices: [{ finish_reason: 'stop', message: { content: GOOD, reasoning_content: THINKING } }] });
  assert.equal(acceptReview(stopped).summary, 'The README matches the tree.');
  assert.equal(JSON.stringify(acceptReview(stopped)).includes('Let me analyze'), false);
});

test('a shorter prompt is used when the first review is truncated', async () => {
  const prompts = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/chat/completions')) {
      const body = JSON.parse(init.body);
      prompts.push(body.messages[1].content);
      assert.equal(body.reasoning_effort, 'low');
      assert.equal(body.max_tokens, DEEP_MAX_TOKENS);
      assert.equal(body.model, 'z-ai/glm-5.3');
      assert.equal(JSON.stringify(body).includes('test-key'), false);
      if (prompts.length === 1) {
        return jsonResponse({
          id: 'chat-long',
          model: 'z-ai/glm-5.3',
          choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: THINKING } }],
          usage: { prompt_tokens: 9000, completion_tokens: 8192, total_tokens: 17192 },
        });
      }
      return jsonResponse({
        id: 'chat-ok',
        model: 'z-ai/glm-5.3',
        choices: [{ finish_reason: 'stop', message: { content: GOOD, reasoning_content: THINKING } }],
        usage: { prompt_tokens: 2000, completion_tokens: 40, total_tokens: 2040 },
      });
    }
    assert.match(String(url), /\/signature\/chat-ok\?/);
    assert.match(String(url), /model=z-ai%2Fglm-5\.3/);
    assert.match(String(url), /signing_algo=ecdsa/);
    return jsonResponse({ text: 'signed', signature: 'sig', signing_address: 'ed25519:example', signing_algo: 'ecdsa', signature_kind: 'gateway' });
  };
  const out = await deepReview(snap, { fetchImpl, key: 'test-key', model: 'z-ai/glm-5.3', env: {} });
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1].length < prompts[0].length);
  assert.ok(prompts[0].length <= DEEP_PROMPT_CHARS + 80);
  assert.ok(prompts[1].length <= DEEP_RETRY_CHARS + 80);
  assert.equal(out.review.summary, 'The README matches the tree.');
  assert.equal(JSON.stringify(out.review).includes('Let me analyze'), false);
  assert.equal(out.finishReason, 'stop');
  assert.equal(out.signature.kind, 'gateway');
  assert.equal(out.chatId, 'chat-ok');
});

test('two truncated replies throw and do not quote the reasoning', async () => {
  let chats = 0;
  let signatures = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/signature/')) { signatures += 1; return jsonResponse({}, 404); }
    chats += 1;
    return jsonResponse({
      id: 'chat-bad',
      choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: THINKING } }],
    });
  };
  await assert.rejects(
    () => deepReview(snap, { fetchImpl, key: 'test-key', model: 'z-ai/glm-5.3', env: {} }),
    (err) => {
      assert.equal(err.message, INCOMPLETE_REVIEW);
      assert.equal(err.status, 502);
      assert.equal(err.message.includes('Let me analyze'), false);
      return true;
    },
  );
  assert.equal(chats, 2);
  assert.equal(signatures, 0);
});

test('criteria score retries on length and never returns reasoning as the note', async () => {
  const prompts = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    prompts.push(body.messages[1].content);
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.max_tokens, SCORE_MAX_TOKENS);
    if (prompts.length === 1) {
      return jsonResponse({
        id: 'c1',
        model: DEFAULT_SCORE_MODEL,
        choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: THINKING } }],
      });
    }
    return jsonResponse({
      id: 'c2',
      model: DEFAULT_SCORE_MODEL,
      choices: [{ finish_reason: 'stop', message: { content: '{"technical":4,"design":3,"impact":3,"originality":2,"sustainability":4,"note":"solid"}', reasoning_content: THINKING } }],
      usage: { prompt_tokens: 8, completion_tokens: 9, total_tokens: 17 },
    });
  };
  const out = await criteriaScore(snap, { fetchImpl, key: 'test-key', env: {} });
  assert.equal(prompts.length, 2);
  assert.ok(prompts[0].length <= SCORE_PROMPT_CHARS + 80);
  assert.ok(prompts[1].length < prompts[0].length);
  assert.equal(out.scores.technical, 4);
  assert.equal(out.note, 'solid');
  assert.equal(out.usage.totalTokens, 17);
  assert.equal(JSON.stringify(out).includes('Let me analyze'), false);
});

test('a criteria score that never returns JSON is an error, not the reasoning text', async () => {
  const fetchImpl = async () => jsonResponse({
    choices: [{ finish_reason: 'stop', message: { content: THINKING, reasoning_content: THINKING } }],
  });
  const out = await criteriaScore(snap, { fetchImpl, key: 'test-key', env: {} });
  assert.equal(out.error, 'Score incomplete. Retry.');
  assert.equal(out.note, undefined);
  assert.equal(JSON.stringify(out).includes('Let me analyze'), false);
});

test('a failed review does not spend the deposit', async () => {
  const used = new Map();
  const pending = new Set();
  await assert.rejects(() => finishPaidReview({
    free: false, used, pending, depositAddress: 'dep', repo: 'https://github.com/a/b',
    paid: async () => true,
    run: async () => { throw Object.assign(new Error(INCOMPLETE_REVIEW), { status: 502 }); },
  }));
  assert.equal(used.has('dep'), false);
  assert.equal(pending.size, 0);
  const ok = await finishPaidReview({
    free: false, used, pending, depositAddress: 'dep', repo: 'https://github.com/a/b',
    paid: async () => true,
    run: async () => ({ review: { summary: 'ok' } }),
  });
  assert.equal(ok.review.summary, 'ok');
  assert.equal(used.get('dep'), 'https://github.com/a/b');
});

test('the smaller prompt budget drops source that does not fit', () => {
  const full = buildPrompt(snap, DEEP_PROMPT_CHARS);
  const small = buildPrompt(snap, DEEP_RETRY_CHARS);
  assert.match(full, /README\.md/);
  assert.ok(small.length < full.length);
});
