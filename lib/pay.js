// NEAR Intents 1Click. This build always sends dry:true. No deposit address is issued and no funds move.
// Q-007: Intents has no testnet. A dry quote is how a route is priced without spending.
import { randomBytes } from 'node:crypto';
import { quoteDigest } from './hash.js';

const API = 'https://1click.chaindefuser.com/v0';
export const USDC_NEAR = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

export const config = () => ({
  // Optional account id inside the dry quote so 1Click can price the route. It is not paid.
  recipient: process.env.DRYRUN_RECIPIENT || '',
  priceUsdc: BigInt(Math.round(Number(process.env.DRYRUN_PRICE_USD || 5) * 1e6)),
});

const headers = () => ({ 'Content-Type': 'application/json', ...(process.env.ONECLICK_JWT ? { Authorization: `Bearer ${process.env.ONECLICK_JWT}` } : {}) });
async function call(path, init, fetchImpl = fetch) {
  const r = await fetchImpl(API + path, { ...init, headers: headers(), signal: AbortSignal.timeout(20_000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.message || `1Click ${r.status}`), { status: r.status === 404 ? 404 : 502 });
  return body;
}

let tokenCache = { at: 0, list: [] };
export async function tokens(fetchImpl = fetch) {
  if (Date.now() - tokenCache.at > 300_000) tokenCache = { at: Date.now(), list: (await call('/tokens', undefined, fetchImpl)).filter((t) => !/DEPRECATED/.test(t.symbol)).map(({ assetId, symbol, blockchain, decimals }) => ({ assetId, symbol, blockchain, decimals })) };
  return tokenCache.list;
}

const quotes = new Map();

function remember(row) {
  quotes.set(row.quoteId, row);
  while (quotes.size > 200) quotes.delete(quotes.keys().next().value);
}

export function quoteRequestBody({ originAsset, refundTo, recipient, priceUsdc, now = Date.now() }) {
  return {
    dry: true,
    swapType: 'EXACT_OUTPUT',
    slippageTolerance: 100,
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    refundTo,
    refundType: 'ORIGIN_CHAIN',
    destinationAsset: USDC_NEAR,
    amount: String(priceUsdc),
    recipient: recipient || 'dryrun.near',
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(now + 3600_000).toISOString(),
  };
}

export async function quote({ originAsset, refundTo, fetchImpl = fetch, now = Date.now() } = {}) {
  const { recipient, priceUsdc } = config();
  const request = quoteRequestBody({ originAsset, refundTo, recipient, priceUsdc, now });
  if (request.dry !== true) throw new Error('1Click quotes in this build must be dry');
  const q = await call('/quote', { method: 'POST', body: JSON.stringify(request) }, fetchImpl);
  const priced = q.quote || {};
  const row = {
    quoteId: randomBytes(16).toString('hex'),
    dry: true,
    originAsset,
    destinationAsset: USDC_NEAR,
    amount: request.amount,
    amountInFormatted: priced.amountInFormatted ?? null,
    amountInUsd: priced.amountInUsd ?? null,
    timeEstimate: priced.timeEstimate ?? null,
    deadline: priced.deadline || request.deadline,
    depositAddress: null,
    used: false,
    pending: false,
    repo: null,
  };
  row.quoteHash = quoteDigest(row);
  remember(row);
  return publicQuote(row);
}

function publicQuote(row) {
  return {
    quoteId: row.quoteId,
    dry: true,
    fundsMoved: false,
    depositAddress: null,
    originAsset: row.originAsset,
    destinationAsset: row.destinationAsset,
    amount: row.amount,
    amountInFormatted: row.amountInFormatted,
    amountInUsd: row.amountInUsd,
    timeEstimate: row.timeEstimate,
    deadline: row.deadline,
    quoteHash: row.quoteHash,
  };
}

export function holdDryQuote(quoteId, repo) {
  const row = quotes.get(quoteId);
  if (!row || !row.dry) throw Object.assign(new Error('Unknown dry quote. Request a new one.'), { status: 400 });
  if (row.used) throw Object.assign(new Error('This dry quote was already used'), { status: 409 });
  if (row.pending) throw Object.assign(new Error('This dry quote is already being settled'), { status: 409 });
  if (Date.parse(row.deadline) <= Date.now()) throw Object.assign(new Error('This dry quote has expired'), { status: 400 });
  row.pending = true;
  row.repo = repo;
  return publicQuote(row);
}

export function commitDryQuote(quoteId) {
  const row = quotes.get(quoteId);
  if (!row) return;
  row.pending = false;
  row.used = true;
}

export function releaseDryQuote(quoteId) {
  const row = quotes.get(quoteId);
  if (row && !row.used) row.pending = false;
}

export const status = (depositAddress) => call('/status?depositAddress=' + encodeURIComponent(depositAddress));

// A deposit only counts if it settled, to us, in USDC, for at least the price.
export function isPaid(st, { recipient, priceUsdc } = config()) {
  const req = st?.quoteResponse?.quoteRequest, q = st?.quoteResponse?.quote;
  return Boolean(recipient) && st?.status === 'SUCCESS' && req?.recipient === recipient && req?.destinationAsset === USDC_NEAR && BigInt(q?.amountOut ?? 0) >= priceUsdc;
}
