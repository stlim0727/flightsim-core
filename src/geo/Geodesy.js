/**
 * Frame-agnostic WGS84 / ECEF / ENU and Web Mercator tile math.
 *
 * Shared by Flight3d and hajun3d. Apps keep their own local-frame adapters:
 * Flight3d uses +x East / +z South, hajun3d uses +X right / -Z forward with
 * `origin.headingDeg`. No DOM, renderer, or Three.js dependency.
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const MAX_MERCATOR_LAT = 85.05112878;

export const WGS84_A = 6378137.0;
export const WGS84_B = 6356752.314245;
export const WGS84_E2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
export const WGS84_E2_PRIME = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);

const A2 = WGS84_A * WGS84_A;
const B2 = WGS84_B * WGS84_B;

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function originOf(origin) {
  if (!origin) throw new TypeError('origin is required');
  const latitude = origin.latitude ?? origin.lat;
  const longitude = origin.longitude ?? origin.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new TypeError('origin needs finite latitude/longitude (or lat/lon)');
  }
  return {
    latitude,
    longitude,
    height: finite(origin.height ?? 0, 'origin.height'),
  };
}

function axes({ latitude, longitude }) {
  const lat = latitude * D2R;
  const lon = longitude * D2R;
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const so = Math.sin(lon);
  const co = Math.cos(lon);
  return {
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

/** Geodetic degrees -> ECEF metres. */
export function wgs84ToEcef(latitude, longitude, height = 0) {
  const lat = finite(latitude, 'latitude') * D2R;
  const lon = finite(longitude, 'longitude') * D2R;
  const h = finite(height, 'height');
  const sinLat = Math.sin(lat);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return {
    x: (n + h) * Math.cos(lat) * Math.cos(lon),
    y: (n + h) * Math.cos(lat) * Math.sin(lon),
    z: (n * (1 - WGS84_E2) + h) * sinLat,
  };
}

/** ECEF metres -> geodetic degrees and height (Bowring's algorithm). */
export function ecefToWgs84(x, y, z) {
  const X = finite(x, 'x');
  const Y = finite(y, 'y');
  const Z = finite(z, 'z');
  const p = Math.hypot(X, Y);
  const theta = Math.atan2(Z * WGS84_A, p * WGS84_B);
  const st = Math.sin(theta);
  const ct = Math.cos(theta);
  const lat = Math.atan2(
    Z + WGS84_E2_PRIME * WGS84_B * st * st * st,
    p - WGS84_E2 * WGS84_A * ct * ct * ct
  );
  const sinLat = Math.sin(lat);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const cosLat = Math.cos(lat);
  const height = Math.abs(cosLat) > 1e-12
    ? p / cosLat - n
    : Z / sinLat - n * (1 - WGS84_E2);
  return { latitude: lat * R2D, longitude: Math.atan2(Y, X) * R2D, height };
}

/** Geodetic point -> local ENU metres relative to origin. */
export function wgs84ToEnu(latitude, longitude, origin, height = 0) {
  const o = originOf(origin);
  const p = wgs84ToEcef(latitude, longitude, height);
  const c = wgs84ToEcef(o.latitude, o.longitude, o.height);
  const a = axes(o);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dz = p.z - c.z;
  return {
    east: a.east[0] * dx + a.east[1] * dy + a.east[2] * dz,
    north: a.north[0] * dx + a.north[1] * dy + a.north[2] * dz,
    up: a.up[0] * dx + a.up[1] * dy + a.up[2] * dz,
  };
}

/**
 * Local ENU metres -> geodetic degrees. Exact ellipsoid intersection keeps
 * regional distances sub-metre instead of drifting with flat-Earth scaling.
 */
export function enuToWgs84(east, north, up, origin) {
  const o = originOf(origin);
  const e = finite(east, 'east');
  const n = finite(north, 'north');
  const u = finite(up ?? 0, 'up');
  const c = wgs84ToEcef(o.latitude, o.longitude, o.height);
  const a = axes(o);

  const px = c.x + a.east[0] * e + a.north[0] * n + a.up[0] * u;
  const py = c.y + a.east[1] * e + a.north[1] * n + a.up[1] * u;
  const pz = c.z + a.east[2] * e + a.north[2] * n + a.up[2] * u;

  const A = (a.up[0] * a.up[0] + a.up[1] * a.up[1]) / A2 + (a.up[2] * a.up[2]) / B2;
  const B = 2 * ((px * a.up[0] + py * a.up[1]) / A2 + (pz * a.up[2]) / B2);
  const C = (px * px + py * py) / A2 + (pz * pz) / B2 - 1;
  const disc = B * B - 4 * A * C;

  if (disc < 0) {
    // Beyond the tangent horizon: analytic local expansion.
    const lat = o.latitude * D2R;
    const sinLat = Math.sin(lat);
    const rn = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const rm = WGS84_A * (1 - WGS84_E2) / Math.pow(1 - WGS84_E2 * sinLat * sinLat, 1.5);
    return {
      latitude: o.latitude + (n / rm) * R2D,
      longitude: o.longitude + (e / (rn * Math.cos(lat))) * R2D,
      height: o.height + u,
    };
  }

  const y1 = (-B + Math.sqrt(disc)) / (2 * A);
  const y2 = (-B - Math.sqrt(disc)) / (2 * A);
  const y = Math.abs(y1) < Math.abs(y2) ? y1 : y2;
  return ecefToWgs84(px + a.up[0] * y, py + a.up[1] * y, pz + a.up[2] * y);
}

/** WGS84 degrees -> fractional Web Mercator tile coordinates. */
export function lonLatToTilePixel(lat, lon, zoom) {
  const n = 2 ** zoom;
  const wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const clampedLat = Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, lat));
  const latRad = clampedLat * D2R;
  const fx = ((wrappedLon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { fx, fy };
}

/** Fractional Web Mercator tile coordinates -> WGS84 degrees. */
export function tilePixelToLonLat(fx, fy, zoom) {
  const n = 2 ** zoom;
  const x = ((fx / n % 1) + 1) % 1;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * fy) / n)));
  return { lat: latRad * R2D, lon: x * 360 - 180 };
}
