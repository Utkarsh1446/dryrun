// NEAR AI Cloud, OpenAI-compatible chat completions.
// Live calls read NEAR_AI_API_KEY from the environment. This workspace does not have that key.
// Unit tests inject a mock fetch. Nothing here invents a model response.
// A live check, where a key exists, is `npm run smoke:ai`. It prints token counts from the response, not a price.

export function nearAiBase(env = process.env) {
  return String(env.NEAR_AI_BASE || 'https://cloud-api.near.ai/v1').replace(/\/$/, '');
}

export function nearAiKey(env = process.env) {
  const key = String(env.NEAR_AI_API_KEY || '').trim();
  return key || null;
}

export function nearAiStatus(env = process.env) {
  const configured = Boolean(nearAiKey(env));
  return {
    configured,
    base: nearAiBase(env),
    keySource: 'NEAR_AI_API_KEY',
    note: configured
      ? 'NEAR_AI_API_KEY is set. Chat completions are sent to NEAR AI Cloud.'
      : 'NEAR_AI_API_KEY is not set. No live NEAR AI Cloud call is made. Tests use a mock fetch only.',
  };
}
