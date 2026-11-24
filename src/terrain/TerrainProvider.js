/**
 * Headless terrain provider contract and paired surface queries.
 *
 * Supplies ground height, upward surface normal, and optional water state to
 * physics independent of how the terrain is rendered (analytic meshes, DEM
 * grids, streamed raster/3D tiles).
 *
 * Provider contract:
 *   kind                          'analytic' | 'streamed-raster' | 'terrarium' | ...
 *   getHeight(x, z)               metres in the sim frame, or null when unknown
 *   getNormal(x, z)               { x, y, z } unit vector (or THREE.Vector3), or null
 *   isReady(x, z)                 true => getHeight(x, z) is authoritative there
 *   isWater(x, z)                 optional; true when open water covers (x, z)
 *   update(...)                   optional; prefetch / update per frame
 *   visualRoot                    optional scene node or null (unused by headless physics)
 *   dispose()                     optional cleanup
 */

import { Vector3 } from 'three';

function toPlainNormal(n) {
  return n ? { x: n.x, y: n.y, z: n.z } : null;
}

/**
 * Validate and adapt a surface normal (plain `{ x, y, z }` or `THREE.Vector3`)
 * into a `Vector3Ctor` instance (defaults to `THREE.Vector3`) for physics
 * consumers that require `.isVector3` / `.lengthSq()`. Returns `null` for
 * missing, non-finite, or degenerate vectors.
 */
export function toNormalVector3(normal, Vector3Ctor = Vector3) {
  if (!normal) return null;
  const { x, y, z } = normal;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (x * x + y * y + z * z <= 0.0001) return null;
  if (normal.isVector3) return normal;
  return typeof Vector3Ctor === 'function' ? new Vector3Ctor(x, y, z) : { x, y, z };
}
/**
 * Upward unit normal from a synchronous height sampler using central
 * differences. Shared by Terrarium and streamed raster providers; returns
 * null when any sample is unavailable or non-finite.
 */
export function surfaceNormal(sample, x, z, stepM = 30) {
  const d = Number.isFinite(stepM) && stepM > 0 ? stepM : 30;
  const hl = sample(x - d, z);
  const hr = sample(x + d, z);
  const hf = sample(x, z - d);
  const hb = sample(x, z + d);
  if ([hl, hr, hf, hb].some(v => v === null || !Number.isFinite(v))) return null;
  const nx = hl - hr;
  const nz = hf - hb;
  const ny = 2 * d;
  const len = Math.hypot(nx, ny, nz);
  return { x: nx / len, y: ny / len, z: nz / len };
}

function sampleReadyHeight(provider, x, z) {
  if (!provider) return null;
  const ready = Boolean(provider.isReady?.(x, z));
  const h = provider.getHeight?.(x, z);
  if (!ready) return null;
  return Number.isFinite(h) ? h : null;
}

/**
 * Wrap an object with a synchronous analytic `getHeight`/`getNormal` (Terrain,
 * LuklaTerrain, JejuFlightSurface, IncheonFlightSurface...). Always ready.
 */
export function analyticTerrainProvider(source, { kind = 'analytic', visualRoot = null } = {}) {
  if (typeof source?.getHeight !== 'function') {
    throw new TypeError('analyticTerrainProvider needs an object with getHeight(x, z)');
  }
  return {
    kind,
    source,
    visualRoot: visualRoot ?? source.mesh ?? source.group ?? null,
    getHeight(x, z) {
      const h = source.getHeight(x, z);
      return Number.isFinite(h) ? h : null;
    },
    getNormal(x, z) {
      return typeof source.getNormal === 'function' ? toPlainNormal(source.getNormal(x, z)) : null;
    },
    isReady: () => true,
    update() {},
    dispose() { source.dispose?.(); },
  };
}

/**
 * Height that prefers `provider` where ready and finite, otherwise `fallback(x, z)`.
 * Never returns null/NaN.
 */
export function resolveGroundHeight(getProvider, fallback) {
  return (x, z) => {
    const provider = getProvider();
    const h = sampleReadyHeight(provider, x, z);
    if (h !== null) return h;
    return fallback(x, z);
  };
}

/**
 * Paired ground-height, surface-normal, and water queries for physics so
 * contact forces, slope normals, and water ditching always describe the same
 * surface.
 *
 * Supports both:
 * - `{ getTerrain, getOverride }` (falling back to `getTerrain()?.getHeight?.(x, z) ?? 0`)
 * - `{ getProvider, getFallbackHeight, getFallbackNormal, minHeight, waterFloorHeight, Vector3 }`
 *
 * When a ready override/provider owns `(x, z)` and omits or returns a `null`
 * normal, `getGroundNormal` returns `null` rather than leaking the fallback slope.
 */
export function createGroundSurfaceQueries(options = {}) {
  const {
    getTerrain,
    getOverride,
    getProvider,
    getFallbackHeight,
    getFallbackNormal,
    minHeight = -Infinity,
    waterFloorHeight,
    Vector3: Vector3Ctor = Vector3,
  } = options;

  const overrideGetter = getOverride ?? getProvider ?? (() => null);
  const fallbackHeight = getFallbackHeight ?? ((x, z) => getTerrain?.()?.getHeight?.(x, z) ?? 0);
  const fallbackNormal = getFallbackNormal ?? ((x, z) => getTerrain?.()?.getNormal?.(x, z) ?? null);

  return {
    getGroundHeight(x, z) {
      const provider = overrideGetter();
      const h = sampleReadyHeight(provider, x, z);
      if (h !== null) {
        if (Number.isFinite(waterFloorHeight) && provider.isWater?.(x, z)) {
          return waterFloorHeight;
        }
        return Math.max(minHeight, h);
      }
      return fallbackHeight(x, z);
    },
    getGroundNormal(x, z) {
      const provider = overrideGetter();
      const h = sampleReadyHeight(provider, x, z);
      if (h !== null) {
        if (Number.isFinite(waterFloorHeight) && provider.isWater?.(x, z)) return null;
        if (h < minHeight) return null;
        return toNormalVector3(provider.getNormal?.(x, z) ?? null, Vector3Ctor);
      }
      return toNormalVector3(fallbackNormal(x, z), Vector3Ctor);
    },
    isWater(x, z) {
      const provider = overrideGetter();
      if (sampleReadyHeight(provider, x, z) === null) return null;
      return Boolean(provider.isWater?.(x, z));
    },
  };
}

/**
 * Ground-height query for physics. Behaves identically to
 * `createGroundSurfaceQueries(options).getGroundHeight`.
 */
export function createGroundHeightQuery(options) {
  return createGroundSurfaceQueries(options).getGroundHeight;
}

/** Throws unless `provider` implements the contract; used by conformance tests. */
export function assertTerrainProviderContract(provider, points = [[0, 0]]) {
  for (const name of ['getHeight', 'getNormal', 'isReady', 'update', 'dispose']) {
    if (typeof provider?.[name] !== 'function') throw new Error(`terrain provider is missing ${name}()`);
  }
  if (typeof provider.kind !== 'string') throw new Error('terrain provider needs a string kind');
  for (const [x, z] of points) {
    const h = provider.getHeight(x, z);
    if (h !== null && !Number.isFinite(h)) throw new Error(`getHeight(${x}, ${z}) must be a finite number or null`);
    if (provider.isReady(x, z) && h === null) throw new Error(`isReady(${x}, ${z}) is true but getHeight is null`);
    const n = provider.getNormal(x, z);
    if (n !== null) {
      const len = Math.hypot(n.x, n.y, n.z);
      if (!(Math.abs(len - 1) < 1e-3) || n.y <= 0) throw new Error(`getNormal(${x}, ${z}) must be an upward unit vector`);
    }
  }
  return true;
}
