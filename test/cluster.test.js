import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterProjects, ideaOverlap, quietTracks, trackStats } from '../lib/cluster.js';

function filler(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: `Solo Project ${i}`, tracks: ['open'] }));
}

test('distinctive tokens cluster and stopwords do not', () => {
  const projects = [
    ...filler(30),
    { id: '1', name: 'Leash', tracks: ['security'] },
    { id: '2', name: 'Agent Leash', tracks: ['security'] },
    { id: '3', name: 'LeashPay', tracks: ['agents'] },
    { id: '4', name: 'Leash: limits', tracks: ['security'] },
    { id: '5', name: 'NEAR Payroll', tracks: ['realworld'] },
    { id: '6', name: 'NEAR Wallet', tracks: ['defi'] },
    { id: '7', name: 'NEAR Checkout', tracks: ['business'] },
    { id: '8', name: 'NEAR Invoice', tracks: ['business'] },
  ];
  const grouped = clusterProjects(projects);
  const leash = grouped.tokens.find((c) => c.label === 'leash');
  assert.ok(leash, JSON.stringify(grouped.tokens.map((c) => c.label)));
  assert.equal(leash.count, 4);
  assert.equal(grouped.tokens.some((c) => c.label === 'near'), false);
});

test('camelCase and spaced names collapse, and near-duplicates group', () => {
  const projects = [
    ...filler(5),
    { id: 'a', name: 'AgentGuard', tracks: ['security'] },
    { id: 'b', name: 'Agent Guard', tracks: ['security'] },
    { id: 'c', name: 'Alpha Widget Box', tracks: ['open'] },
    { id: 'd', name: 'Alpha Widget Box Pro', tracks: ['open'] },
  ];
  const grouped = clusterProjects(projects, { minSize: 2, maxShare: 1 });
  assert.ok(grouped.names.some((g) => g.count === 2 && g.names.includes('AgentGuard') && g.names.includes('Agent Guard')));
  assert.ok(grouped.near.some((g) => g.names.includes('Alpha Widget Box') && g.names.includes('Alpha Widget Box Pro')));
});

test('track room follows the share of the directory', () => {
  const projects = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, tracks: ['security'] })),
    { id: 'b1', name: 'B1', tracks: ['business'] },
    { id: 'b2', name: 'B2', tracks: ['business'] },
    { id: 'o', name: 'O', tracks: ['open'] },
  ];
  const stats = trackStats(projects, [
    { id: 'security', label: 'AI Security & Defense' },
    { id: 'business', label: 'Autonomous Business' },
    { id: 'open', label: 'Open Innovation' },
  ]);
  const byId = Object.fromEntries(stats.tracks.map((t) => [t.id, t]));
  assert.equal(byId.security.room, 'crowded');
  assert.equal(byId.business.room, 'busy');
  assert.equal(byId.open.room, 'open');
  assert.equal(byId.open.label, 'Open Innovation');
  assert.deepEqual(quietTracks(stats.tracks, 1).map((t) => t.id), ['open']);
});

test('idea overlap ranks shared words and ignores empty input', () => {
  const projects = [
    { id: '1', name: 'LeashPay', tracks: ['security'] },
    { id: '2', name: 'Invoice Link', tracks: ['realworld'] },
  ];
  assert.deepEqual(ideaOverlap('   ', projects), []);
  const hits = ideaOverlap('a leash for agent spending', projects);
  assert.equal(hits[0].name, 'LeashPay');
  assert.deepEqual(hits[0].shared, ['leash']);
  assert.ok(hits[0].score > 0 && hits[0].score < 1);
});
