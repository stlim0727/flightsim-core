import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Object3D, Vector3 } from 'three';
import { LandingGear } from '../src/physics/LandingGear.js';
import {
  analyticTerrainProvider,
  assertTerrainProviderContract,
  createGroundHeightQuery,
  createGroundSurfaceQueries,
  resolveGroundHeight,
  toNormalVector3,
} from '../src/terrain/TerrainProvider.js';
import {
  createAnchorFrame,
  createTerrariumProvider,
  decodeTerrarium,
  lonLatToTilePixel,
} from '../src/terrain/TerrariumElevationProvider.js';

const ANCHOR = { lat: 35.1652, lon: 128.939, headingDeg: 353.9 };
const GIMHAE_OFFSET = { x: 160, z: 1600 };
const GIMHAE_FLAT_ZONE = { minX: -700, maxX: 700, minZ: -2200, maxZ: 2200, height: 0, blendMargin: 400 };

function encodeTerrariumTile(heightFn) {
  const rgba = new Uint8ClampedArray(256 * 256 * 4);
  for (let py = 0; py < 256; py++) {
    for (let px = 0; px < 256; px++) {
      const m = typeof heightFn === 'function' ? heightFn(px, py) : heightFn;
      const v = Math.max(0, Math.min(65535.99, m + 32768));
      const idx = (py * 256 + px) * 4;
      rgba[idx] = Math.floor(v / 256);
      rgba[idx + 1] = Math.floor(v % 256);
      rgba[idx + 2] = Math.round((v - Math.floor(v)) * 256) % 256;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}
const flatTile = metres => encodeTerrariumTile(metres);

function tilePixelToSim(anchor, simOffset, zoom, tx, ty, px, py) {
  const n = 2 ** zoom;
  const fx = tx + (px + 0.5) / 256;
  const fy = ty + (py + 0.5) / 256;
  const lon = (fx / n) * 360 - 180;
  const mercN = Math.PI - (2 * Math.PI * fy) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(mercN) - Math.exp(-mercN)));
  const d2r = Math.PI / 180;
  const latMid = (anchor.lat + lat) * 0.5 * d2r;
  const east = (lon - anchor.lon) * 111320 * Math.cos(latMid);
  const north = (lat - anchor.lat) * 110540;
  const r = anchor.headingDeg * d2r;
  const a = east * Math.cos(r) - north * Math.sin(r);
  const b = east * Math.sin(r) + north * Math.cos(r);
  return { x: simOffset.x + a, z: simOffset.z - b };
}

const settle = () => new Promise(r => setTimeout(r, 15));

test('decodeTerrarium decodes positive, negative, and sub-metre elevations', () => {
  const pos = decodeTerrarium(flatTile(123.5));
  assert.ok(Math.abs(pos[0] - 123.5) < 0.01);
  const neg = decodeTerrarium(flatTile(-40.25));
  assert.ok(Math.abs(neg[100] + 40.25) < 0.01);
  assert.deepEqual([...decodeTerrarium(Uint8Array.from([128, 13, 128, 255, 127, 246, 0, 255]))], [13.5, -10]);
});

test('createAnchorFrame maps anchor to itself and respects heading projection', () => {
  const frame = createAnchorFrame(ANCHOR);
  const origin = frame.toWgs84(0, 0);
  assert.ok(Math.abs(origin.lat - ANCHOR.lat) < 1e-9);
  assert.ok(Math.abs(origin.lon - ANCHOR.lon) < 1e-9);
  // Forward is -Z along heading 353.9deg (almost due north): latitude rises.
  const ahead = frame.toWgs84(0, -1000);
  assert.ok(ahead.lat > ANCHOR.lat + 0.008);
  const tp = lonLatToTilePixel(ANCHOR.lat, ANCHOR.lon, 11);
  assert.ok(tp.fx > 0 && tp.fy > 0);
});

test('createTerrariumProvider satisfies contract before and after load and computes anchor-relative heights', async () => {
  const provider = createTerrariumProvider({
    anchor: ANCHOR,
    loadTile: async () => flatTile(250),
  });
  assertTerrainProviderContract(provider, [[0, 0]]);
  assert.equal(provider.getHeight(0, 0), null);
  assert.equal(provider.isReady(0, 0), false);
  await settle();
  assert.equal(provider.isReady(0, 0), true);
  assertTerrainProviderContract(provider, [[0, 0]]);
  // Flat 250 m everywhere -> datum absorbs it so every point reads 0.
  assert.ok(Math.abs(provider.getHeight(0, 0)) < 0.01);
  const n = provider.getNormal(0, 0);
  assert.ok(n === null || n.y > 0.999);
  provider.dispose();
});

test('createTerrariumProvider requests target tile before datum tile loads and retries failed tiles after cooldown', async () => {
  const requested = [];
  const p1 = createTerrariumProvider({
    anchor: ANCHOR,
    loadTile: async (z, x, y) => { requested.push(`${z}/${x}/${y}`); return flatTile(5); },
  });
  p1.getHeight(0, -20000);
  await settle();
  assert.ok(new Set(requested).size >= 2);
  p1.dispose();

  let calls = 0;
  let clock = 1000;
  const p2 = createTerrariumProvider({
    anchor: ANCHOR,
    retryMs: 5000,
    now: () => clock,
    loadTile: async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return flatTile(10);
    },
  });
  p2.getHeight(0, 0);
  await settle();
  assert.equal(p2.isReady(0, 0), false);
  const firstCalls = calls;
  p2.getHeight(0, 0); // within retry cooldown -> no extra fetch
  await settle();
  assert.equal(calls, firstCalls);

  clock += 6000; // past retry cooldown -> retries and succeeds
  p2.getHeight(0, 0);
  await settle();
  assert.ok(calls > firstCalls);
  assert.equal(p2.isReady(0, 0), true);
  assert.ok(Math.abs(p2.getHeight(0, 0)) < 0.01);
  p2.dispose();
});

test('createTerrariumProvider flattens flatZones spikes, blends 400 m margin, and separates water from terrain', async () => {
  const provider = createTerrariumProvider({
    anchor: ANCHOR,
    simOffset: GIMHAE_OFFSET,
    flatZones: [GIMHAE_FLAT_ZONE],
    loadTile: async (z, tx, ty) => encodeTerrariumTile((px, py) => {
      const { x, z: sz } = tilePixelToSim(ANCHOR, GIMHAE_OFFSET, z, tx, ty, px, py);
      if (Math.abs(x - 160) < 350 && Math.abs(sz + 800) < 350) return 35; // +33m spike on runway
      if (sz <= -2200) return 102; // +100m mountain north of runway
      if (sz > 3000) return -2;    // open sea south of runway
      return 2;
    }),
  });

  provider.update({ x: 160, z: 1600 });
  provider.getHeight(160, -800);
  provider.getHeight(160, -2400);
  provider.getHeight(160, -2800);
  provider.getHeight(160, 5000);
  await settle();

  for (const sz of [1600, 0, -800, -1600, -2200]) {
    assert.ok(Math.abs(provider.getHeight(160, sz)) < 1e-6);
  }
  const runwayNormal = provider.getNormal(160, -800);
  assert.ok(runwayNormal && runwayNormal.y > 0.9999 && Math.abs(runwayNormal.x) < 1e-6);

  const blendMid = provider.getHeight(160, -2400);
  assert.ok(blendMid > 40 && blendMid < 60, `Expected smooth midpoint ~50m, got ${blendMid}`);
  assert.ok(Math.abs(provider.getHeight(160, -2800) - 100) < 1.0);

  assert.equal(provider.isWater(160, 1600), false);
  assert.equal(provider.isWater(160, -2800), false);
  assert.equal(provider.isWater(160, 5000), true);
  provider.dispose();
});

test('analyticTerrainProvider and assertTerrainProviderContract enforce contract invariants', () => {
  assert.throws(() => analyticTerrainProvider({}), TypeError);
  const analytic = analyticTerrainProvider({
    getHeight: () => 36,
    getNormal: () => new Vector3(0, 1, 0),
  });
  assert.equal(assertTerrainProviderContract(analytic, [[0, 0], [100, -200]]), true);
  assert.equal(analytic.isReady(0, 0), true);
  assert.equal(analytic.getHeight(0, 0), 36);
  assert.deepEqual(analytic.getNormal(0, 0), { x: 0, y: 1, z: 0 });

  assert.throws(
    () => assertTerrainProviderContract({ kind: 'x', getHeight: () => null, getNormal: () => null, isReady: () => true, update() {}, dispose() {} }),
    /isReady/
  );
  assert.throws(
    () => assertTerrainProviderContract({ kind: 'x', getHeight: () => 0, getNormal: () => null, isReady: () => true, update() {} }),
    /dispose/
  );
});

test('resolveGroundHeight and createGroundHeightQuery fall back cleanly when unready or missing', () => {
  const provider = { isReady: x => x < 100, getHeight: () => 42 };
  const resolved = resolveGroundHeight(() => provider, () => -45);
  assert.equal(resolved(0, 0), 42);
  assert.equal(resolved(200, 0), -45);
  assert.equal(resolveGroundHeight(() => null, () => 7)(1, 2), 7);

  let terrain = { getHeight: (x, z) => x + z };
  let override = null;
  const query = createGroundHeightQuery({ getTerrain: () => terrain, getOverride: () => override });
  assert.equal(query(3, 4), 7);
  override = { isReady: () => true, getHeight: () => 55 };
  assert.equal(query(3, 4), 55);
  terrain = null;
  override = null;
  assert.equal(query(3, 4), 0);
});

test('createGroundSurfaceQueries supports flight3d and hajun3d options, Vector3 adaptation, and no-leak normal rule', () => {
  const slopedTerrainNormal = new Vector3(0.2, 0.98, 0).normalize();
  let terrain = { getHeight: () => 12, getNormal: () => slopedTerrainNormal };
  let override = null;

  // flight3d style: { getTerrain, getOverride }
  const f3dQueries = createGroundSurfaceQueries({
    getTerrain: () => terrain,
    getOverride: () => override,
  });
  assert.equal(f3dQueries.getGroundHeight(0, 0), 12);
  assert.equal(f3dQueries.getGroundNormal(0, 0), slopedTerrainNormal);

  const plainSlope = { x: -0.15, y: 0.988686, z: 0 };
  override = { isReady: () => true, getHeight: () => 50, getNormal: () => plainSlope };
  assert.equal(f3dQueries.getGroundHeight(0, 0), 50);
  const adapted = f3dQueries.getGroundNormal(0, 0);
  assert.equal(adapted.isVector3, true);
  assert.ok(Math.abs(adapted.x - plainSlope.x) < 1e-9);

  // Ready override omitting normal must return null rather than leaking currentTerrain slope
  override = { isReady: () => true, getHeight: () => 50 };
  assert.equal(f3dQueries.getGroundNormal(0, 0), null);

  // Unready / invalid override falls back to currentTerrain height and normal
  override = { isReady: () => true, getHeight: () => null, getNormal: () => plainSlope };
  assert.equal(f3dQueries.getGroundHeight(0, 0), 12);
  assert.equal(f3dQueries.getGroundNormal(0, 0), slopedTerrainNormal);

  // hajun3d style: { getProvider, getFallbackHeight, getFallbackNormal, minHeight, waterFloorHeight, Vector3 }
  let provider = null;
  const h3dQueries = createGroundSurfaceQueries({
    getProvider: () => provider,
    getFallbackHeight: x => (x === 0 ? 0 : -48),
    getFallbackNormal: () => ({ x: 0, y: 1, z: 0 }),
    minHeight: -48,
    waterFloorHeight: -48,
  });
  assert.equal(h3dQueries.getGroundHeight(100, 0), -48);
  assert.equal(h3dQueries.getGroundNormal(100, 0).isVector3, true);
  assert.equal(h3dQueries.isWater(100, 0), null);

  provider = { isReady: () => true, isWater: () => true, getHeight: () => -2, getNormal: () => plainSlope };
  assert.equal(h3dQueries.getGroundHeight(0, 5000), -48);
  assert.equal(h3dQueries.getGroundNormal(0, 5000), null);
  assert.equal(h3dQueries.isWater(0, 5000), true);

  provider = { isReady: () => true, isWater: () => false, getHeight: () => -80, getNormal: () => plainSlope };
  assert.equal(h3dQueries.getGroundHeight(0, 0), -48); // minHeight clamp
  assert.equal(h3dQueries.isWater(0, 0), false);

  // Explicit null Vector3Ctor returns plain object
  assert.deepEqual(toNormalVector3({ x: 0, y: 1, z: 0 }, null), { x: 0, y: 1, z: 0 });
  assert.equal(toNormalVector3({ x: 0, y: 0, z: 0 }), null);
});

test('LandingGear uses sloped override Vector3 normal from createGroundSurfaceQueries without throwing on body contact', () => {
  const grade = 0.1176;
  const len = Math.hypot(-grade, 1, 0);
  const slopedPlainNormal = { x: -grade / len, y: 1 / len, z: 0 };
  const flatTerrain = { getHeight: () => 0, getNormal: () => new Vector3(0, 1, 0) };
  const slopedOverride = {
    isReady: () => true,
    getHeight: x => x * grade,
    getNormal: () => slopedPlainNormal,
  };
  const { getGroundHeight, getGroundNormal } = createGroundSurfaceQueries({
    getTerrain: () => flatTerrain,
    getOverride: () => slopedOverride,
  });

  const pose = y => {
    const mesh = new Object3D();
    mesh.position.set(0, y, 0);
    mesh.quaternion.setFromEuler(new Euler(Math.atan(grade), -Math.PI / 2, 0, 'YXZ'));
    mesh.updateMatrixWorld(true);
    return mesh;
  };

  for (const tangent of [false, true]) {
    const gear = new LandingGear();
    const velocity = new Vector3(65, tangent ? 65 * grade : 0, 0);
    const result = gear.update(1 / 120, pose(3.75), velocity, new Vector3(), getGroundHeight, getGroundNormal);
    assert.equal(result.onGround, true);
    if (tangent) assert.equal(result.failure, null);
    else assert.ok(result.failure && result.failure.sinkRate > 7.5);
  }

  // Body contacts call terrainNormal.lengthSq() directly; must not throw TypeError.
  const bodyGear = new LandingGear();
  const bodyResult = bodyGear.update(1 / 120, pose(0.5), new Vector3(65, 0, 0), new Vector3(), getGroundHeight, getGroundNormal);
  assert.equal(bodyResult.onGround, true);
  assert.ok(bodyResult.bodyContacts.length > 0);
});
