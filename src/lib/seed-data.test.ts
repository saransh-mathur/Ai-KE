import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedPayloads } from './seed-data.ts';

test('buildSeedPayloads maps all demo entities with referential integrity', () => {
  const payloads = buildSeedPayloads();

  assert.equal(payloads.vendors.length, 5);
  assert.equal(payloads.businessUnits.length, 4);
  assert.equal(payloads.assets.length, 6);
  assert.equal(payloads.incidents.length, 4);
  assert.equal(payloads.knowledgeChunks.length, 8);

  const vendorIds = new Set(payloads.vendors.map((v) => v.id));
  const buIds = new Set(payloads.businessUnits.map((b) => b.id));
  const assetIds = new Set(payloads.assets.map((a) => a.id));

  for (const asset of payloads.assets) {
    assert.ok(vendorIds.has(asset.vendorId), `Asset ${asset.id} references valid vendor ${asset.vendorId}`);
    assert.ok(buIds.has(asset.businessUnitId), `Asset ${asset.id} references valid BU ${asset.businessUnitId}`);
  }

  for (const inc of payloads.incidents) {
    assert.ok(assetIds.has(inc.assetId), `Incident ${inc.id} references valid asset ${inc.assetId}`);
    assert.ok(inc.downtimeMinutes >= 0);
  }

  for (const chunk of payloads.knowledgeChunks) {
    assert.ok(assetIds.has(chunk.assetId), `Chunk ${chunk.id} references valid asset ${chunk.assetId}`);
    assert.ok(chunk.chunkText.length > 20);
  }
});
