import { defineAdapter } from './adapter.js';
import { TRACKS } from '../checks.js';

export const TRACK_LABELS = {
  defi: 'Unstoppable DeFi',
  thesis: 'Investment Thesis',
  privacy: 'Privacy & Private AI',
  business: 'Autonomous Business',
  swarms: 'AI Swarms',
  security: 'AI Security & Defense',
  agents: 'Agent Economy',
  realworld: 'Real-World Money',
  games: 'Games',
  nfts: 'NFTs',
  memecoins: 'Memecoins',
  social: 'Social Money',
  open: 'Open Innovation',
};

const UA = 'DryRun/0.2 (hackathon directory monitor)';

function normalize(p) {
  if (!p?.id || !p.project_name) return null;
  return {
    id: String(p.id),
    name: String(p.project_name),
    tracks: Array.isArray(p.tracks) ? p.tracks.map(String) : [],
    demoUrl: typeof p.demo_url === 'string' ? p.demo_url : null,
  };
}

export const near = defineAdapter({
  id: 'near-2026',
  name: 'NEAR HACKATHON',
  source: 'https://nearhackathon.com/api/projects',
  live: true,
  tracks: TRACKS.map((id) => ({ id, label: TRACK_LABELS[id] || id })),
  async fetchPage(page, fetchImpl = fetch) {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error('Bad directory page');
    const url = `https://nearhackathon.com/api/projects?page=${n}`;
    const r = await fetchImpl(url, {
      redirect: 'manual',
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 429 || r.status >= 500) throw Object.assign(new Error(`Directory HTTP ${r.status}`), { status: r.status });
    if (r.status >= 300 && r.status < 400) throw new Error('Directory redirect refused');
    if (!r.ok) throw Object.assign(new Error(`Directory HTTP ${r.status}`), { status: r.status });
    const body = await r.json();
    const projects = (body.projects || []).map(normalize).filter(Boolean);
    return {
      total: Number(body.total) || 0,
      page: Number(body.page) || n,
      pageSize: Number(body.pageSize) || projects.length || 1,
      projects,
    };
  },
});
