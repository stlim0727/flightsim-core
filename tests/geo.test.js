import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ecefToWgs84,
  enuToWgs84,
  lonLatToTilePixel,
  tilePixelToLonLat,
  wgs84ToEcef,
  wgs84ToEnu,
} from '../src/geo/Geodesy.js';

const ORIGIN = { latitude: 37.55, longitude: 126.98 };
const ORIGIN_SHORT = { lat: ORIGIN.latitude, lon: ORIGIN.longitude };

test('WGS84 -> ECEF -> WGS84 round-trips with height', () => {
  const ecef = wgs84ToEcef(ORIGIN.latitude, ORIGIN.longitude, 36);
  const back = ecefToWgs84(ecef.x, ecef.y, ecef.z);
  assert.ok(Math.abs(back.latitude - ORIGIN.latitude) < 1e-9);
  assert.ok(Math.abs(back.longitude - ORIGIN.longitude) < 1e-9);
  assert.ok(Math.abs(back.height - 36) < 1e-6);
});

test('ENU inverse preserves regional offsets for both origin key styles', () => {
  const target = { latitude: 37.75, longitude: 127.20 };
  for (const origin of [ORIGIN, ORIGIN_SHORT]) {
    const enu = wgs84ToEnu(target.latitude, target.longitude, origin);
    const back = enuToWgs84(enu.east, enu.north, enu.up, origin);
    assert.ok(Math.abs(back.latitude - target.latitude) < 1e-8);
    assert.ok(Math.abs(back.longitude - target.longitude) < 1e-8);
  }
});

test('Web Mercator forward/inverse agree at multiple zooms', () => {
  for (const zoom of [10, 11, 15]) {
    const { fx, fy } = lonLatToTilePixel(ORIGIN.latitude, ORIGIN.longitude, zoom);
    const tx = Math.floor(fx);
    const ty = Math.floor(fy);
    const back = tilePixelToLonLat(tx + 0.5, ty + 0.5, zoom);
    const center = tilePixelToLonLat(tx, ty, zoom);
    assert.ok(back.lat > center.lat || back.lon > center.lon);
    const exact = tilePixelToLonLat(fx, fy, zoom);
    assert.ok(Math.abs(exact.lat - ORIGIN.latitude) < 1e-9);
    assert.ok(Math.abs(exact.lon - ORIGIN.longitude) < 1e-9);
  }
});

test('ENU inverse preserves altitude for elevated origins and targets', () => {
  const origin = { ...ORIGIN, height: 100 };
  const vertical = enuToWgs84(0, 0, 1000, origin);
  assert.ok(Math.abs(vertical.height - 1100) < 1e-6);

  const target = { latitude: 37.75, longitude: 127.2, height: 500 };
  const enu = wgs84ToEnu(target.latitude, target.longitude, origin, target.height);
  const back = enuToWgs84(enu.east, enu.north, enu.up, origin);
  assert.ok(Math.abs(back.height - target.height) < 1e-3);
  assert.ok(Math.abs(back.latitude - target.latitude) < 1e-4);
  assert.ok(Math.abs(back.longitude - target.longitude) < 1e-4);
});
