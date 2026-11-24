import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorityZonesFromBounds,
  createAuthorityZones,
  zoneDistance,
} from '../src/terrain/AuthorityZones.js';

test('bounds arrays normalize to exclude zones', () => {
  const zones = authorityZonesFromBounds([[0, 0, 10, 10]]);
  assert.deepEqual(zones, [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10, mode: 'exclude' }]);
  const authority = createAuthorityZones(zones);
  assert.equal(authority.protects(5, 5), true);
  assert.equal(authority.contains(5, 5), true);
  assert.equal(authority.flatten(5, 5, 100), 100);
});

test('flatten zones blend toward the target and stop at the margin', () => {
  const authority = createAuthorityZones([{
    minX: -10, maxX: 10, minZ: -10, maxZ: 10,
    height: 0, blendMargin: 10,
  }]);
  assert.equal(authority.flatten(0, 0, 100), 0);
  const blended = authority.flatten(15, 0, 100);
  assert.ok(blended > 0 && blended < 100);
  assert.equal(authority.flatten(20, 0, 100), 100);
  assert.equal(authority.protects(0, 0), false);
  assert.equal(authority.contains(0, 0), true);
  assert.equal(zoneDistance(15, 5, authority.zones[0]), 5);
});
