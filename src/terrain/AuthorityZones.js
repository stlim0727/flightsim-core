/**
 * Shared authority zones for terrain surfaces.
 *
 * A provider owns the ground height except where a zone says otherwise:
 * - `flatten` zones blend sampled heights toward a fixed target (runways).
 * - `exclude` zones hand authority back to another surface (airport meshes).
 *
 * Both Flight3d's protected areas and hajun3d's flat zones normalize to this
 * shape, so the containment and blend math lives in one headless module.
 */

function normalizeZone(zone) {
  if (Array.isArray(zone)) {
    const [west, north, east, south] = zone;
    return { minX: west, maxX: east, minZ: north, maxZ: south, mode: 'exclude' };
  }
  return {
    minX: zone.minX,
    maxX: zone.maxX,
    minZ: zone.minZ,
    maxZ: zone.maxZ,
    height: zone.height,
    blendMargin: zone.blendMargin,
    mode: zone.mode ?? (zone.height !== undefined ? 'flatten' : 'exclude'),
  };
}

/** Bounds arrays `[west, north, east, south]` -> normalized exclude zones. */
export function authorityZonesFromBounds(bounds = []) {
  return bounds.map(normalizeZone);
}

export function zoneDistance(x, z, zone) {
  const dx = x < zone.minX ? zone.minX - x : x > zone.maxX ? x - zone.maxX : 0;
  const dz = z < zone.minZ ? zone.minZ - z : z > zone.maxZ ? z - zone.maxZ : 0;
  return Math.hypot(dx, dz);
}

export function createAuthorityZones(zones = []) {
  const items = (zones || []).map(normalizeZone);

  function distanceTo(x, z) {
    let best = Infinity;
    for (const zone of items) best = Math.min(best, zoneDistance(x, z, zone));
    return best;
  }

  /** True anywhere a zone claims the point, regardless of mode. */
  function contains(x, z) {
    return items.some(zone => zoneDistance(x, z, zone) === 0);
  }

  /** True only where the provider must yield authority to another surface. */
  function protects(x, z) {
    return items.some(zone => zone.mode === 'exclude' && zoneDistance(x, z, zone) === 0);
  }

  /** Blend raw heights toward flatten-zone targets; other zones pass through. */
  function flatten(x, z, rawHeight) {
    let bestW = 0;
    let bestH = rawHeight;
    for (const zone of items) {
      if (zone.mode !== 'flatten') continue;
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

  return { zones: items, distanceTo, contains, protects, flatten };
}
