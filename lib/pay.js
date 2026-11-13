// Payment through the NEAR Intents 1Click API: the buyer pays from any chain/token, we receive USDC on NEAR.
// No wallet connection and no custody: 1Click gives a one-time deposit address and settles on NEAR.
const API = 'https://1click.chaindefuser.com/v0';
export const USDC_NEAR = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

export const config = () => ({
  recipient: process.env.DRYRUN_RECIPIENT || '', // NEAR account that receives revenue; unset => quotes are dry (no deposit address)
  priceUsdc: BigInt(Math.round(Number(process.env.DRYRUN_PRICE_USD || 5) * 1e6)),
});

const headers = () => ({ 'Content-Type': 'application/json', ...(process.env.ONECLICK_JWT ? { Authorization: `Bearer ${process.env.ONECLICK_JWT}` } : {}) });
async function call(path, init) {
  const r = await fetch(API + path, { ...init, headers: headers(), signal: AbortSignal.timeout(20_000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.message || `1Click ${r.status}`), { status: r.status === 404 ? 404 : 502 });
  return body;
}

let tokenCache = { at: 0, list: [] };
export async function tokens() {
  if (Date.now() - tokenCache.at > 300_000) tokenCache = { at: Date.now(), list: (await call('/tokens')).filter((t) => !/DEPRECATED/.test(t.symbol)).map(({ assetId, symbol, blockchain, decimals }) => ({ assetId, symbol, blockchain, decimals })) };
  return tokenCache.list;
}

export async function quote({ originAsset, refundTo }) {
  const { recipient, priceUsdc } = config();
  const q = await call('/quote', { method: 'POST', body: JSON.stringify({
    dry: !recipient, swapType: 'EXACT_OUTPUT', slippageTolerance: 100,
    originAsset, depositType: 'ORIGIN_CHAIN', refundTo, refundType: 'ORIGIN_CHAIN',
    destinationAsset: USDC_NEAR, amount: String(priceUsdc), recipient: recipient || 'dryrun.near', recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + 3600_000).toISOString(),
  }) });
  const { depositAddress, depositMemo, amountInFormatted, amountInUsd, timeEstimate, deadline } = q.quote;
  return { dry: !recipient, depositAddress, depositMemo, amountInFormatted, amountInUsd, timeEstimate, deadline };
}

export const status = (depositAddress) => call('/status?depositAddress=' + encodeURIComponent(depositAddress));

// A deposit only counts if it settled, to us, in USDC, for at least the price.
export function isPaid(st, { recipient, priceUsdc } = config()) {
  const req = st?.quoteResponse?.quoteRequest, q = st?.quoteResponse?.quote;
  return Boolean(recipient) && st?.status === 'SUCCESS' && req?.recipient === recipient && req?.destinationAsset === USDC_NEAR && BigInt(q?.amountOut ?? 0) >= priceUsdc;
}
