import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticTerrainProvider } from '../src/terrain/TerrainProvider.js';
import { validateTerrainProviderOverride } from '../src/terrain/conformance.js';

test('override validator checks each provider only when its identity changes', () => {
  let current = null;
  let calls = 0;
  const source = {
    kind: 'counting',
    getHeight() { calls++; return 1; },
    getNormal: () => ({ x: 0, y: 1, z: 0 }),
    isReady: () => true,
    update() {},
    dispose() {},
  };
  const validated = validateTerrainProviderOverride(() => current);
  assert.equal(validated(), null);
  current = source;
  assert.equal(validated(), source);
  const callsAfterValidation = calls;
  assert.ok(callsAfterValidation > 0);
  assert.equal(validated(), source);
  assert.equal(calls, callsAfterValidation);
  current = analyticTerrainProvider({ getHeight: () => 2 });
  assert.notEqual(validated(), source);
});

test('override validator rejects a non-conforming provider', () => {
  let current = null;
  const validated = validateTerrainProviderOverride(() => current);
  current = {
    kind: 'bad', getHeight: () => null, getNormal: () => null,
    isReady: () => true, update() {}, dispose() {},
  };
  assert.throws(() => validated(), /conformance failed/);
});
