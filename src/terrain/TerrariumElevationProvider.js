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

/** WGS84 degrees -> Web Mercator fractional tile coordinates `{ fx, fy }`. */
export function lonLatToTilePixel(lat, lon, zoom) {
  const n = 2 ** zoom;
  const latRad = lat * D2R;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { fx, fy };
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

function zoneDistance(x, z, zone) {
  const dx = x < zone.minX ? zone.minX - x : x > zone.maxX ? x - zone.maxX : 0;
  const dz = z < zone.minZ ? zone.minZ - z : z > zone.maxZ ? z - zone.maxZ : 0;
  return Math.hypot(dx, dz);
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
    loadTile,
    zoom = DEFAULT_ZOOM,
    maxTiles = 24,
    prefetchRadius = 1,
    flatZones = [],
    retryMs = DEFAULT_RETRY_MS,
    now = () => Date.now(),
  } = options || {};
  if (!anchor || typeof loadTile !== 'function') {
    throw new Error('createTerrariumProvider needs { anchor, loadTile }');
  }

  const frame = createAnchorFrame(anchor, simOffset);
  const tiles = new Map(); // key -> Float32Array | 'pending' | 'failed'
  const order = [];
  const failedAt = new Map(); // key -> ms
  let datumM = null;
  let disposed = false;

  const keyOf = (x, y) => `${zoom}/${x}/${y}`;

  function applyFlatZones(x, z, rawHeight) {
    if (!flatZones.length) return rawHeight;
    let bestW = 0;
    let bestH = rawHeight;
    for (let i = 0; i < flatZones.length; i++) {
      const zone = flatZones[i];
      const dist = zoneDistance(x, z, zone);
      const targetH = zone.height ?? 0;
      if (dist === 0) return targetH;
      const margin = zone.blendMargin ?? 400;
      if (margin > 0 && dist < margin) {
        const t = dist / margin;
        const w = 1 - t * t * (3 - 2 * t);
        if (w > bestW) {
          bestW = w;
          bestH = targetH * w + rawHeight * (1 - w);
        }
      }
    }
    return bestH;
  }

  function request(tx, ty) {
    if (disposed) return 'disposed';
    const key = keyOf(tx, ty);
    if (tiles.has(key)) {
      const state = tiles.get(key);
      if (state !== 'failed' || now() - (failedAt.get(key) || 0) < retryMs) return state;
      tiles.delete(key);
      const at = order.indexOf(key);
      if (at >= 0) order.splice(at, 1);
    }
    tiles.set(key, 'pending');
    order.push(key);
    while (order.length > maxTiles) {
      const evicted = order.shift();
      tiles.delete(evicted);
      failedAt.delete(evicted);
    }
    Promise.resolve()
      .then(() => loadTile(zoom, tx, ty))
      .then(rgba => {
        if (disposed || !tiles.has(key)) return;
        tiles.set(key, decodeTerrarium(rgba));
        failedAt.delete(key);
      })
      .catch(() => {
        if (disposed || !tiles.has(key)) return;
        tiles.set(key, 'failed');
        failedAt.set(key, now());
      });
    return 'pending';
  }

  function pixel(tx, ty, px, py) {
    const data = tiles.get(keyOf(tx, ty));
    if (!(data instanceof Float32Array)) return null;
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
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    if (fetchMissing) request(tx, ty);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const wx = gx - x0;
    const wy = gy - y0;
    // Neighbouring-tile samples at the seam are clamped to this tile's edge;
    // the error is below one pixel (~60 m) of lateral position.
    const h00 = pixel(tx, ty, x0, y0);
    const h10 = pixel(tx, ty, x0 + 1, y0);
    const h01 = pixel(tx, ty, x0, y0 + 1);
    const h11 = pixel(tx, ty, x0 + 1, y0 + 1);
    if (h00 === null || h10 === null || h01 === null || h11 === null) return null;
    return (h00 * (1 - wx) + h10 * wx) * (1 - wy) + (h01 * (1 - wx) + h11 * wx) * wy;
  }

  function ensureDatum() {
    if (datumM !== null) return true;
    const h = sampleMsl(simOffset.x, simOffset.z, true);
    if (h === null) return false;
    datumM = h;
    return true;
  }

  const provider = {
    kind: 'terrarium',
    zoom,
    visualRoot: null,
    getHeight(x, z) {
      // Always request the tile for (x, z), even while the datum tile is still loading.
      const h = sampleMsl(x, z, true);
      if (!ensureDatum()) return null;
      return h === null ? null : applyFlatZones(x, z, h - datumM);
    },
    isReady(x, z) {
      return ensureDatum() && sampleMsl(x, z, false) !== null;
    },
    isWater(x, z) {
      if (!ensureDatum()) return false;
      for (let i = 0; i < flatZones.length; i++) {
        if (zoneDistance(x, z, flatZones[i]) === 0) return false;
      }
      const msl = sampleMsl(x, z, false);
      return msl !== null && msl <= 0.1;
    },
    getNormal(x, z) {
      const d = 30;
      const hl = provider.getHeight(x - d, z);
      const hr = provider.getHeight(x + d, z);
      const hf = provider.getHeight(x, z - d);
      const hb = provider.getHeight(x, z + d);
      if ([hl, hr, hf, hb].some(v => v === null)) return null;
      const nx = hl - hr;
      const nz = hf - hb;
      const ny = 2 * d;
      const len = Math.hypot(nx, ny, nz);
      return { x: nx / len, y: ny / len, z: nz / len };
    },
    update(position) {
      if (!position) return;
      ensureDatum();
      const { lat, lon } = frame.toWgs84(position.x, position.z);
      const { fx, fy } = lonLatToTilePixel(lat, lon, zoom);
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      for (let dy = -prefetchRadius; dy <= prefetchRadius; dy++) {
        for (let dx = -prefetchRadius; dx <= prefetchRadius; dx++) request(cx + dx, cy + dy);
      }
    },
    dispose() {
      disposed = true;
      tiles.clear();
      failedAt.clear();
      order.length = 0;
    },
  };
  return provider;
}
