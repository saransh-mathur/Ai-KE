import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRRFScore, parseNaturalLanguageQuery, executeHybridRetrieval, computeSimulatedCosineSimilarity } from './hybrid-search.ts';
import { MOCK_KNOWLEDGE_CHUNKS } from './mock-data.ts';

test('calculateRRFScore computes standard reciprocal rank fusion correctly', () => {
  // Formula: 1 / (60 + rank1) + 1 / (60 + rank2)
  const rank1 = 1;
  const rank2 = 1;
  const expected = (1 / 61) + (1 / 61);
  const score = calculateRRFScore(rank1, rank2, 60);
  assert.equal(score, Number(expected.toFixed(6)));

  // If graph rank is 0 (disabled), only vector rank contributes
  const vOnly = calculateRRFScore(1, 0, 60);
  assert.equal(vOnly, Number((1 / 61).toFixed(6)));

  // Verify rank 1 vs rank 5 monotonicity
  const scoreRank1 = calculateRRFScore(1, 1);
  const scoreRank5 = calculateRRFScore(5, 5);
  assert.ok(scoreRank1 > scoreRank5, 'Rank 1 must have higher RRF score than Rank 5');
});

test('parseNaturalLanguageQuery extracts SQL filters and intent accurately', () => {
  const query = 'Which Tier-1 database vendors have assets in us-east-1 affected by critical incidents?';
  const analysis = parseNaturalLanguageQuery(query);

  assert.equal(analysis.extractedFilters.vendorTier, 1);
  assert.equal(analysis.extractedFilters.region, 'us-east-1');
  assert.equal(analysis.extractedFilters.assetType, 'database');
  assert.equal(analysis.extractedFilters.severity, 'SEV-1');
  assert.equal(analysis.graphTraversalIntent, true);
});

test('computeSimulatedCosineSimilarity returns bounded similarity scores', () => {
  const chunk = MOCK_KNOWLEDGE_CHUNKS[0];
  const query = 'aurora replication lag aws us-east-1';
  const score = computeSimulatedCosineSimilarity(query, chunk);

  assert.ok(score >= 0 && score <= 1, 'Score must be between 0 and 1');
  assert.ok(score > 0.6, 'Relevant query must yield high similarity score');
});

test('executeHybridRetrieval returns ranked results with hop path and metadata', () => {
  const query = 'Which Tier-1 database vendors have assets in us-east-1 affected by critical incidents?';
  const analysis = parseNaturalLanguageQuery(query);
  const results = executeHybridRetrieval(query, analysis);

  assert.ok(results.length > 0, 'Retrieval should return matching candidates');
  const topResult = results[0];
  assert.ok(topResult.rrfScore > 0, 'Top result must have a positive RRF score');
  assert.ok(topResult.hopPath.length >= 3, 'Top result must contain multi-hop path');
  assert.equal(topResult.vendor.tier, 1, 'Must match Tier-1 vendor filter');
  assert.equal(topResult.asset.region, 'us-east-1', 'Must match us-east-1 region filter');
});
