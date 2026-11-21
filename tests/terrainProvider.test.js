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
  assert.equal(h3dQueries.getGroundNormal(0, 0), null); // clamped flat floor must not keep terrain slope
  assert.equal(h3dQueries.isWater(0, 0), false);

  provider = { isReady: () => true, isWater: () => false, getHeight: () => -20, getNormal: () => plainSlope };
  assert.equal(h3dQueries.getGroundHeight(0, 0), -20);
  assert.equal(h3dQueries.getGroundNormal(0, 0).isVector3, true);
  assert.ok(Math.abs(h3dQueries.getGroundNormal(0, 0).x - plainSlope.x) < 1e-9);

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

test('createGroundSurfaceQueries returns null normal when minHeight clamps sloped terrain', () => {
  const slope = { x: -0.2, y: 0.9797959, z: 0 };
  const { getGroundHeight, getGroundNormal } = createGroundSurfaceQueries({
    getProvider: () => ({
      isReady: () => true,
      getHeight: x => (x < 0 ? -80 : -10),
      getNormal: () => slope,
    }),
    getFallbackHeight: () => 0,
    minHeight: -48,
  });

  assert.equal(getGroundHeight(-100, 0), -48);
  assert.equal(getGroundNormal(-100, 0), null);
  assert.equal(getGroundHeight(100, 0), -10);
  const unClamped = getGroundNormal(100, 0);
  assert.equal(unClamped.isVector3, true);
  assert.ok(Math.abs(unClamped.x - slope.x) < 1e-9);
});

test('createTerrariumProvider refreshes LRU recency on getHeight and isReady before evicting', async () => {
  const provider = createTerrariumProvider({
    anchor: { lat: 35.1652, lon: 128.939, headingDeg: 0 },
    maxTiles: 2,
    loadTile: async (_z, tx) => flatTile(tx),
  });

  // Load A (x=0) and B (x=30km)
  provider.getHeight(0, 0);
  await settle();
  provider.getHeight(30000, 0);
  await settle();
  assert.equal(provider.isReady(0, 0), true);
  assert.equal(provider.isReady(30000, 0), true);

  // Access A via getHeight -> moves A to MRU; loading C (x=60km) must evict B, not A
  provider.getHeight(0, 0);
  provider.getHeight(60000, 0);
  await settle();
  assert.equal(provider.isReady(0, 0), true);
  assert.equal(provider.isReady(30000, 0), false);
  assert.equal(provider.isReady(60000, 0), true);

  // Refresh A via isReady alone -> moves A to MRU; loading B (x=30km) must evict C, not A
  assert.equal(provider.isReady(0, 0), true);
  provider.getHeight(30000, 0);
  await settle();
  assert.equal(provider.isReady(0, 0), true);
  assert.equal(provider.isReady(60000, 0), false);
  assert.equal(provider.isReady(30000, 0), true);
  provider.dispose();
});

test('createGroundSurfaceQueries and resolveGroundHeight trigger lazy Terrarium tile loading without update()', async () => {
  const requested = [];
  const provider = createTerrariumProvider({
    anchor: ANCHOR,
    loadTile: async (z, tx, ty) => {
      requested.push(`${z}/${tx}/${ty}`);
      return flatTile(tx === 1759 ? 310 : 250);
    },
  });
  const surface = createGroundSurfaceQueries({
    getProvider: () => provider,
    getFallbackHeight: () => -45,
  });
  const resolved = resolveGroundHeight(() => provider, () => -45);

  // Query 30 km east of anchor without ever calling provider.update() or provider.getHeight() directly
  assert.equal(surface.getGroundHeight(30000, 0), -45);
  assert.equal(resolved(30000, 0), -45);

  await settle();
  assert.ok(new Set(requested).size >= 2);
  assert.equal(provider.isReady(30000, 0), true);
  assert.ok(Math.abs(surface.getGroundHeight(30000, 0) - 60) < 0.01);
  assert.ok(Math.abs(resolved(30000, 0) - 60) < 0.01);
  provider.dispose();
});

test('lonLatToTilePixel and createTerrariumProvider wrap tile columns across the antimeridian', async () => {
  const wrapped = lonLatToTilePixel(0, 180.02, 11);
  assert.ok(wrapped.fx >= 0 && wrapped.fx < 1, `Expected fx in [0, 1), got ${wrapped.fx}`);

  const requestedX = [];
  const provider = createTerrariumProvider({
    anchor: { lat: 0, lon: 179.99, headingDeg: 0 },
    prefetchRadius: 1,
    loadTile: async (_z, tx) => {
      requestedX.push(tx);
      return flatTile(tx === 0 ? 40 : 10);
    },
  });

  // 3 km east crosses +180° and must request column 0 rather than out-of-range 2048
  provider.getHeight(3000, 0);
  await settle();
  assert.ok(requestedX.includes(0));
  assert.ok(!requestedX.some(tx => tx < 0 || tx >= 2048));
  assert.equal(provider.isReady(3000, 0), true);
  assert.ok(Math.abs(provider.getHeight(3000, 0) - 30) < 0.01);

  provider.update({ x: 0, z: 0 });
  await settle();
  for (const expectedCol of [2046, 2047, 0]) {
    assert.ok(requestedX.includes(expectedCol), `Expected wrapped prefetch column ${expectedCol}`);
  }
  assert.ok(!requestedX.some(tx => tx < 0 || tx >= 2048));
  provider.dispose();
});

test('createTerrariumProvider ignores stale completions and rejections from evicted tile requests', async () => {
  const deferred = [];
  const provider = createTerrariumProvider({
    anchor: { lat: 35.1652, lon: 128.939, headingDeg: 0 },
    maxTiles: 1,
    loadTile: (z, tx, ty) => new Promise((resolve, reject) => {
      deferred.push({ key: `${z}/${tx}/${ty}`, resolve, reject });
    }),
  });

  // 1. Latch datum at (0, 0).
  assert.equal(provider.getHeight(0, 0), null);
  await settle();
  assert.equal(deferred.length, 1);
  deferred.shift().resolve(flatTile(100));
  await settle();
  assert.equal(provider.isReady(0, 0), true);
  assert.ok(Math.abs(provider.getHeight(0, 0)) < 0.01);

  // 2. Request B (30km), evict with C (60km), re-request B, resolve B2, then reject stale B1.
  assert.equal(provider.getHeight(30000, 0), null);
  await settle();
  assert.equal(deferred.length, 1);
  const b1 = deferred.shift();

  assert.equal(provider.getHeight(60000, 0), null);
  await settle();
  assert.equal(deferred.length, 1);
  const c1 = deferred.shift();
  assert.notEqual(c1.key, b1.key);

  assert.equal(provider.getHeight(30000, 0), null);
  await settle();
  assert.equal(deferred.length, 1);
  const b2 = deferred.shift();
  assert.equal(b2.key, b1.key);

  b2.resolve(flatTile(250));
  await settle();
  assert.equal(provider.isReady(30000, 0), true);
  assert.ok(Math.abs(provider.getHeight(30000, 0) - 150) < 0.01);

  b1.reject(new Error('stale eviction failure'));
  await settle();
  assert.equal(provider.isReady(30000, 0), true);
  assert.ok(Math.abs(provider.getHeight(30000, 0) - 150) < 0.01);

  // 3. Stale resolution from an evicted request must not overwrite a newer pending request.
  assert.equal(provider.getHeight(60000, 0), null);
  await settle();
  const c2 = deferred.shift();
  assert.equal(provider.getHeight(90000, 0), null);
  await settle();
  deferred.shift().reject(new Error('evict C2'));
  await settle();
  assert.equal(provider.getHeight(60000, 0), null);
  await settle();
  const c3 = deferred.shift();
  assert.equal(c3.key, c2.key);

  c2.resolve(flatTile(999));
  await settle();
  assert.equal(provider.isReady(60000, 0), false);

  c3.resolve(flatTile(300));
  await settle();
  assert.equal(provider.isReady(60000, 0), true);
  assert.ok(Math.abs(provider.getHeight(60000, 0) - 200) < 0.01);

  c1.reject(new Error('cleanup'));
  await settle();
  provider.dispose();
});

test('createTerrariumProvider retains current tile and datum when update() prefetch exceeds maxTiles', async () => {
  const frame = createAnchorFrame(ANCHOR);
  const anchorTp = lonLatToTilePixel(ANCHOR.lat, ANCHOR.lon, 11);
  const anchorKey = `11/${Math.floor(anchorTp.fx)}/${Math.floor(anchorTp.fy)}`;
  const targetWgs = frame.toWgs84(30000, 0);
  const targetTp = lonLatToTilePixel(targetWgs.lat, targetWgs.lon, 11);
  const targetKey = `11/${Math.floor(targetTp.fx)}/${Math.floor(targetTp.fy)}`;

  const fetchCounts = new Map();
  const p4 = createTerrariumProvider({
    anchor: ANCHOR,
    maxTiles: 4,
    prefetchRadius: 1,
    loadTile: async (z, tx, ty) => {
      const k = `${z}/${tx}/${ty}`;
      fetchCounts.set(k, (fetchCounts.get(k) || 0) + 1);
      return flatTile(k === targetKey ? 180 : 100);
    },
  });

  // Calling update() away from anchor with maxTiles: 4 (< 9 tiles) must retain datum + center tile.
  p4.update({ x: 30000, z: 0 });
  await settle();
  assert.equal(p4.isReady(30000, 0), true);
  assert.ok(Math.abs(p4.getHeight(30000, 0) - 80) < 0.01);
  assert.equal(fetchCounts.get(targetKey), 1);

  for (let i = 0; i < 5; i++) {
    p4.update({ x: 30000, z: 0 });
    await settle();
    assert.equal(p4.isReady(30000, 0), true);
    assert.ok(Math.abs(p4.getHeight(30000, 0) - 80) < 0.01);
  }
  assert.equal(fetchCounts.get(targetKey), 1);
  p4.dispose();

  // Pre-touch regression: even when the center tile sits at the LRU slot, update() must keep it.
  const lruCounts = new Map();
  const pLru = createTerrariumProvider({
    anchor: ANCHOR,
    maxTiles: 4,
    prefetchRadius: 1,
    loadTile: async (z, tx, ty) => {
      const k = `${z}/${tx}/${ty}`;
      lruCounts.set(k, (lruCounts.get(k) || 0) + 1);
      return flatTile(100);
    },
  });
  for (const x of [0, 30000, 60000, 90000]) {
    pLru.getHeight(x, 0);
    await settle();
  }
  assert.equal(lruCounts.get(anchorKey), 1);
  pLru.update({ x: 0, z: 0 });
  assert.equal(pLru.isReady(0, 0), true);
  await settle();
  assert.equal(lruCounts.get(anchorKey), 1);
  pLru.dispose();

  // maxTiles: 1, prefetchRadius: 1 must converge datum first and then keep the center tile.
  const p1 = createTerrariumProvider({
    anchor: ANCHOR,
    maxTiles: 1,
    prefetchRadius: 1,
    loadTile: async (z, tx, ty) => flatTile(`${z}/${tx}/${ty}` === targetKey ? 165 : 100),
  });
  p1.update({ x: 30000, z: 0 });
  await settle();
  p1.update({ x: 30000, z: 0 });
  await settle();
  p1.update({ x: 30000, z: 0 });
  assert.equal(p1.isReady(30000, 0), true);
  assert.ok(Math.abs(p1.getHeight(30000, 0) - 65) < 0.01);
  p1.dispose();
});
