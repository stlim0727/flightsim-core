/**
 * Pure headless Terrarium elevation provider.
 *
 * Decodes 256x256 Terrarium RGBA rasters, projects local metric simulator
 * coordinates (+X right, -Z forward along runway heading) to WGS84/Web Mercator
 * tiles, caches tiles with LRU eviction and failure cooldown, re-references
 * elevations to the runway anchor datum, and blends flat airport zones.
 *
 * Tile I/O is injected via `loadTile(z, x, y)` so this module stays completely
 * free of DOM, fetch, canvas, or browser globals.
 */

import { lonLatToTilePixel } from '../geo/Geodesy.js';
import { surfaceNormal } from './TerrainProvider.js';
import { createAuthorityZones } from './AuthorityZones.js';

export { lonLatToTilePixel };

const TILE_SIZE = 256;
const DEFAULT_ZOOM = 11;
const D2R = Math.PI / 180;
const DEFAULT_RETRY_MS = 5000;

/** Terrarium PNG RGBA -> Float32 heights (metres above MSL). */
export function decodeTerrarium(rgba) {
  const heights = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < heights.length; i++, j += 4) {
    heights[i] = rgba[j] * 256 + rgba[j + 1] + rgba[j + 2] / 256 - 32768;
  }
  return heights;
}


/**
 * Sim (x, z) -> WGS84 around a runway anchor.
 * World axes: +X right, -Z forward along `anchor.headingDeg`.
 */
export function createAnchorFrame(anchor, simOffset = { x: 0, z: 0 }) {
  const r = anchor.headingDeg * D2R;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    toWgs84(x, z) {
      const a = x - simOffset.x;
      const b = -(z - simOffset.z);
      const east = a * cos + b * sin;
      const north = -a * sin + b * cos;
      const lat = anchor.lat + north / 110540;
      const latMid = (anchor.lat + lat) * 0.5 * D2R;
      const lon = anchor.lon + east / (111320 * Math.cos(latMid));
      return { lat, lon };
    },
  };
}


/**
 * Elevation-only provider backed by Terrarium tiles. `loadTile(z, x, y)` must
 * resolve to a 256x256 RGBA byte array (`Uint8ClampedArray` / `Uint8Array`) or
 * reject. Heights are re-referenced so `simOffset` reads `0` in the sim frame,
 * absorbing geoid/ellipsoid offset at the anchor.
 */
export function createTerrariumProvider(options) {
  const {
    anchor,
    simOffset = { x: 0, z: 0 },
    toWgs84,
    loadTile,
    zoom = DEFAULT_ZOOM,
    maxTiles = 24,
    prefetchRadius = 1,
    flatZones = [],
    retryMs = DEFAULT_RETRY_MS,
    now = () => Date.now(),
  } = options || {};
  if ((!anchor && typeof toWgs84 !== 'function') || typeof loadTile !== 'function') {
    throw new Error('createTerrariumProvider needs { loadTile } and either { anchor } or { toWgs84 }');
  }
  // Legacy flatZones omitted both `mode` and `height` and still flattened to 0.
  const authority = createAuthorityZones(flatZones.map(zone => ({ ...zone, mode: zone.mode ?? 'flatten' })));
  const frame = typeof toWgs84 === 'function' ? { toWgs84 } : createAnchorFrame(anchor, simOffset);
  const tilesAcross = 2 ** zoom;
  const cacheLimit = Number.isFinite(maxTiles)
    ? Math.max(1, Math.floor(maxTiles))
    : maxTiles === Infinity
      ? Infinity
      : 24;
  const radius = Number.isFinite(prefetchRadius) ? Math.max(0, Math.floor(prefetchRadius)) : 1;
  const wrapX = tx => ((tx % tilesAcross) + tilesAcross) % tilesAcross;
  const tiles = new Map(); // insertion order: LRU -> MRU; key -> Float32Array | { pending: true } | 'failed'
  const failedAt = new Map(); // key -> ms
  let datumM = null;
  let disposed = false;

  const keyOf = (x, y) => `${zoom}/${x}/${y}`;

  function touch(key) {
    if (!tiles.has(key)) return;
    const value = tiles.get(key);
    tiles.delete(key);
    tiles.set(key, value);
  }


  function request(tx, ty) {
    if (disposed) return 'disposed';
    const wy = Math.floor(ty);
    if (wy < 0 || wy >= tilesAcross) return 'out-of-bounds';
    const wx = wrapX(Math.floor(tx));
    const key = keyOf(wx, wy);
    if (tiles.has(key)) {
      const state = tiles.get(key);
      if (state !== 'failed') {
        touch(key);
        return state instanceof Float32Array ? state : 'pending';
      }
      if (now() - (failedAt.get(key) || 0) < retryMs) return state;
      tiles.delete(key);
      failedAt.delete(key);
    }
    const pending = { pending: true };
    tiles.set(key, pending);
    while (tiles.size > cacheLimit) {
      const evicted = tiles.keys().next().value;
      tiles.delete(evicted);
      failedAt.delete(evicted);
    }
    Promise.resolve()
      .then(() => loadTile(zoom, wx, wy))
      .then(rgba => {
        if (disposed || tiles.get(key) !== pending) return;
        tiles.set(key, decodeTerrarium(rgba));
        failedAt.delete(key);
      })
      .catch(() => {
        if (disposed || tiles.get(key) !== pending) return;
        tiles.set(key, 'failed');
        failedAt.set(key, now());
      });
    return 'pending';
  }

  function pixel(data, px, py) {
    const cx = Math.min(TILE_SIZE - 1, Math.max(0, px));
    const cy = Math.min(TILE_SIZE - 1, Math.max(0, py));
    return data[cy * TILE_SIZE + cx];
  }

  /** Bilinear elevation above MSL at sim (x, z), or null when not loaded. */
  function sampleMsl(x, z, fetchMissing) {
    const { lat, lon } = frame.toWgs84(x, z);
    const { fx, fy } = lonLatToTilePixel(lat, lon, zoom);
    const gx = (fx - Math.floor(fx)) * TILE_SIZE - 0.5;
    const gy = (fy - Math.floor(fy)) * TILE_SIZE - 0.5;
    const tx = wrapX(Math.floor(fx));
    const ty = Math.floor(fy);
    if (ty < 0 || ty >= tilesAcross) return null;
    if (fetchMissing) request(tx, ty);
    const key = keyOf(tx, ty);
    const data = tiles.get(key);
    if (!(data instanceof Float32Array)) return null;
    touch(key);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const wx = gx - x0;
    const wy = gy - y0;
    // Neighbouring-tile samples at the seam are clamped to this tile's edge;
    // the error is below one pixel (~60 m) of lateral position.
    const h00 = pixel(data, x0, y0);
    const h10 = pixel(data, x0 + 1, y0);
    const h01 = pixel(data, x0, y0 + 1);
    const h11 = pixel(data, x0 + 1, y0 + 1);
    return (h00 * (1 - wx) + h10 * wx) * (1 - wy) + (h01 * (1 - wx) + h11 * wx) * wy;
  }

  function ensureDatum(fetchMissing = true) {
    if (datumM !== null) return true;
    const h = sampleMsl(simOffset.x, simOffset.z, fetchMissing);
    if (h === null) return false;
    datumM = h;
    return true;
  }

  const provider = {
    kind: 'terrarium',
    zoom,
    visualRoot: null,
    getHeight(x, z) {
      // Latch datum first if the anchor tile is already in cache so fetching
      // (x, z) cannot evict an unread anchor tile under small maxTiles.
      const hasDatum = ensureDatum(false);
      if (!hasDatum && cacheLimit === 1) {
        ensureDatum(true);
        return null;
      }
      // Always request the tile for (x, z), even while the datum tile is still loading.
      const h = sampleMsl(x, z, true);
      if (!hasDatum && !ensureDatum(true)) return null;
      return h === null ? null : authority.flatten(x, z, h - datumM);
    },
    isReady(x, z) {
      return ensureDatum(false) && sampleMsl(x, z, false) !== null;
    },
    isWater(x, z) {
      if (!ensureDatum(false)) return false;
      if (authority.contains(x, z)) return false;
      const msl = sampleMsl(x, z, false);
      return msl !== null && msl <= 0.1;
    },
    getNormal(x, z) {
      return surfaceNormal(provider.getHeight, x, z);
    },
    update(position) {
      if (!position || disposed) return;
      const hasDatum = ensureDatum(false);
      if (!hasDatum && cacheLimit === 1) {
        ensureDatum(true);
        return;
      }
      const { lat, lon } = frame.toWgs84(position.x, position.z);
      const { fx, fy } = lonLatToTilePixel(lat, lon, zoom);
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);

      // Deduplicate wrapped (wx, ny) keeping minimum squared distance to (cx, cy).
      const byKey = new Map();
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= tilesAcross) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const wx = wrapX(cx + dx);
          const key = keyOf(wx, ny);
          const distSq = dx * dx + dy * dy;
          const prev = byKey.get(key);
          if (!prev || distSq < prev.distSq) {
            byKey.set(key, { wx, ny, key, distSq });
          }
        }
      }
      const candidates = [...byKey.values()].sort((a, b) => a.distSq - b.distSq);

      let anchorKey = null;
      if (!hasDatum) {
        const anchorWgs = frame.toWgs84(simOffset.x, simOffset.z);
        const anchorTp = lonLatToTilePixel(anchorWgs.lat, anchorWgs.lon, zoom);
        const ax = wrapX(Math.floor(anchorTp.fx));
        const ay = Math.floor(anchorTp.fy);
        if (ay >= 0 && ay < tilesAcross) anchorKey = keyOf(ax, ay);
      }

      let selected = candidates.slice(0, cacheLimit);
      const needsSeparateDatumSlot =
        !hasDatum && anchorKey !== null && !selected.some(c => c.key === anchorKey);
      if (needsSeparateDatumSlot && cacheLimit > 1) {
        selected = candidates.slice(0, cacheLimit - 1);
      }

      // Pre-touch already-cached retained tiles so new neighbor fetches never
      // evict the current tile or pending datum tile when they sit at LRU.
      if (needsSeparateDatumSlot) touch(anchorKey);
      for (let i = selected.length - 1; i >= 0; i--) touch(selected[i].key);

      // Request farthest to nearest so (cx, cy) finishes at the MRU end.
      for (let i = selected.length - 1; i >= 0; i--) {
        request(selected[i].wx, selected[i].ny);
      }
      if (!hasDatum) {
        ensureDatum(true);
        if (selected.length > 0) touch(selected[0].key);
      }
    },
    dispose() {
      disposed = true;
      tiles.clear();
      failedAt.clear();
    },
  };
  return provider;
}
