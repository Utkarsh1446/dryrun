// Dry-quote settlement for a deep review. No funds move. The quote this process issued is tied to a testnet receipt.
import { chainStatus, recordReceipt } from './chain.js';
import { CHECKER_VERSION, deepPayload, hashPayload } from './hash.js';
import { commitDryQuote, holdDryQuote, releaseDryQuote } from './pay.js';
import { nearAiStatus } from './nearai.js';

export const AI_NOT_CALLED = 'NEAR_AI_API_KEY is not set. The model was not called. The dry quote is still recorded on testnet.';

export async function settleDryReview({
  quoteId,
  repo,
  sha,
  hold = holdDryQuote,
  commit = commitDryQuote,
  release = releaseDryQuote,
  run,
  record = recordReceipt,
  aiConfigured = nearAiStatus().configured,
  chainReady = chainStatus().configured,
} = {}) {
  if (!chainReady) throw Object.assign(new Error('Testnet recorder is not configured. Set NEAR_CONTRACT_ID and NEAR_PRIVATE_KEY.'), { status: 503 });
  const quote = hold(quoteId, repo);
  try {
    let review = null;
    let aiCalled = false;
    let aiError = null;
    if (aiConfigured) {
      review = await run();
      aiCalled = true;
    } else {
      aiError = AI_NOT_CALLED;
    }
    const payload = deepPayload({
      repo,
      sha,
      checker: CHECKER_VERSION,
      quoteHash: quote.quoteHash,
      review,
      aiCalled,
    });
    const resultHash = hashPayload(payload);
    const receipt = await record({
      repo_url: repo,
      commit_sha: sha,
      result_hash: resultHash,
      checker_version: CHECKER_VERSION,
      kind: 'deep',
      quote_hash: quote.quoteHash,
    });
    if (!receipt) throw Object.assign(new Error('The testnet receipt was not written.'), { status: 502 });
    commit(quoteId);
    return {
      dry: true,
      settled: true,
      fundsMoved: false,
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      amountInFormatted: quote.amountInFormatted,
      deadline: quote.deadline,
      resultHash,
      aiCalled,
      aiError,
      review: review?.review || null,
      model: review?.model || null,
      chatId: review?.chatId || null,
      signature: review?.signature || null,
      startup: review?.startup || null,
      startupLabel: review?.startupLabel || null,
      startupLink: review?.startupLink || null,
      readiness: review?.readiness || null,
      receipt,
    };
  } catch (error) {
    release(quoteId);
    throw error;
  }
}
