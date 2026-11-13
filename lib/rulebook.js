import { checkRepo, checkSubmission, checkDirectory, score } from './checks.js';

// Swap this object to score a different hackathon. The scanner only calls these functions.
export const nearRulebook = {
  id: 'near-2026',
  checkRepo,
  checkSubmission,
  checkDirectory,
  score,
};
