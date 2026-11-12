import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHybridRetrievalWithRbac, isAuthorized, CLEARANCE_HIERARCHY, parseNaturalLanguageQuery } from './hybrid-search.ts';

test('RBAC clearance hierarchy is properly ordered', () => {
  assert.ok(CLEARANCE_HIERARCHY.L3_RESTRICTED > CLEARANCE_HIERARCHY.L2_CONFIDENTIAL);
  assert.ok(CLEARANCE_HIERARCHY.L2_CONFIDENTIAL > CLEARANCE_HIERARCHY.L1_PUBLIC);

  assert.equal(isAuthorized('L1_PUBLIC', 'L1_PUBLIC'), true);
  assert.equal(isAuthorized('L1_PUBLIC', 'L2_CONFIDENTIAL'), false);
  assert.equal(isAuthorized('L1_PUBLIC', 'L3_RESTRICTED'), false);

  assert.equal(isAuthorized('L2_CONFIDENTIAL', 'L1_PUBLIC'), true);
  assert.equal(isAuthorized('L2_CONFIDENTIAL', 'L2_CONFIDENTIAL'), true);
  assert.equal(isAuthorized('L2_CONFIDENTIAL', 'L3_RESTRICTED'), false);

  assert.equal(isAuthorized('L3_RESTRICTED', 'L3_RESTRICTED'), true);
});

test('RBAC pre-filtering redacts L3 documents when user is L1_PUBLIC', () => {
  const query = 'aurora replication lag incident postmortem';
  const analysis = parseNaturalLanguageQuery(query);

  const responseL1 = executeHybridRetrievalWithRbac(query, analysis, {
    userClearance: 'L1_PUBLIC',
    applySqlFilters: false,
    maxResults: 10,
  });

  // Verify that chk-001 (L3) is in redactedNotices and NOT in results
  const chk1InResults = responseL1.results.some(r => r.chunk.id === 'chk-001');
  assert.equal(chk1InResults, false, 'L3_RESTRICTED chunk must not be in L1 results');

  const chk1InRedacted = responseL1.redactedNotices.some(n => n.id === 'chk-001');
  assert.equal(chk1InRedacted, true, 'L3_RESTRICTED chunk must be listed in redactedNotices');
  assert.ok(responseL1.redactedNotices.length > 0, 'Must have redacted notices');

  // Now verify that L3_RESTRICTED user CAN see chk-001
  const responseL3 = executeHybridRetrievalWithRbac(query, analysis, {
    userClearance: 'L3_RESTRICTED',
    applySqlFilters: false,
    maxResults: 10,
  });

  const chk1InL3Results = responseL3.results.some(r => r.chunk.id === 'chk-001');
  assert.equal(chk1InL3Results, true, 'L3_RESTRICTED user must be able to retrieve chk-001');
  assert.equal(responseL3.redactedNotices.length, 0, 'L3 user should have zero redacted notices');
});

test('RRF dynamic kConstant tuning affects final fused rank scores', () => {
  const query = 'database servers in us-east-1';
  const analysis = parseNaturalLanguageQuery(query);

  const respDefaultK = executeHybridRetrievalWithRbac(query, analysis, { kConstant: 60 });
  const respHigherK = executeHybridRetrievalWithRbac(query, analysis, { kConstant: 80 });

  assert.ok(respDefaultK.results.length > 0);
  assert.ok(respHigherK.results.length > 0);

  // RRF score with k=60 is higher than k=80 for rank 1 (1/61 > 1/81)
  assert.ok(
    respDefaultK.results[0].rrfScore > respHigherK.results[0].rrfScore,
    'Lower k factor must produce higher reciprocal score for identical ordinal ranks'
  );
});
