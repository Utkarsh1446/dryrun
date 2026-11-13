import { checkRepo, checkSubmission, checkDirectory, score } from './checks.js';

// What the AI judge scores against. Criteria are the ones past NEAR hackathons used (no weights were
// published for this event); the rules are the published HACKATHON.md items the screen checks.
export const nearJudging = {
  name: 'NEAR HACKATHON (Nov 2026)',
  criteria: [
    { id: 'technical', label: 'Technical implementation', ask: 'Is there working, non-trivial code that does what the README claims? Is it more than a template?' },
    { id: 'near', label: 'NEAR integration', ask: 'Is NEAR technology (contracts, SDK, RPC, Intents, Chain Signatures, AI Cloud) actually called in code and essential to the product? (Q-002: only the NEAR integration built in the window is judged.)' },
    { id: 'design', label: 'Design and usability', ask: 'Can a user or judge understand and use it? Clear flow, UI or CLI, docs.' },
    { id: 'impact', label: 'Impact', ask: 'Does it solve a real problem for a specific user? How many people would need it?' },
    { id: 'originality', label: 'Originality', ask: 'Is the approach new compared with obvious alternatives, or a common clone?' },
    { id: 'reproducibility', label: 'Reproducibility', ask: 'Would a fresh clone following the README run? (Q-017: AI screeners check that the repo runs and matches its README.)' },
  ],
  rules: [
    'Q-001/Q-004: only work done from 2026-10-19 onward counts; an old project as-is does not qualify.',
    'Q-005: libraries, boilerplate and AI-generated code are allowed but must be listed in the README.',
    'Q-010 to Q-012: testnet-only is eligible; a local-only demo is fine if reproducible and the demo post has a video.',
    'Q-017: screening is reproducibility-first: runs, and does what the README says.',
  ],
};

// Swap this object to score a different hackathon. The scanner only calls these functions.
export const nearRulebook = {
  id: 'near-2026',
  checkRepo,
  checkSubmission,
  checkDirectory,
  score,
  judging: nearJudging,
};
