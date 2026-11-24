// Test the shipped tarball from outside this checkout, without browser globals.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(), 'flightsim-core-package-'));
try {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', directory], { encoding: 'utf8' }))[0];
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, packed.filename)], { cwd: directory, stdio: 'inherit' });
  writeFileSync(join(directory, 'smoke.mjs'), `
    import assert from 'node:assert/strict';
    import { FlightPhysicsCore, FlightControlLaws, FlightWarningsCore, AutopilotController,
      AIRCRAFT_REGISTRY, approachDeviation,
      analyticTerrainProvider, createGroundSurfaceQueries, assertTerrainProviderContract,
      assertTerrainProviderConformance, surfaceNormal, createTileScheduler,
      decodeTerrarium, createTerrariumProvider, wgs84ToEnu, enuToWgs84,
      createAuthorityZones, validateTerrainProviderOverride } from '@stlim0727/flightsim-core';
    import { FlightPhysicsCore as SubpathCore } from '@stlim0727/flightsim-core/physics/FlightPhysicsCore.js';
    import { analyticTerrainProvider as SubpathAnalytic, createGroundSurfaceQueries as SubpathSurface } from '@stlim0727/flightsim-core/terrain/TerrainProvider.js';
    import { decodeTerrarium as SubpathDecode, createTerrariumProvider as SubpathTerrarium } from '@stlim0727/flightsim-core/terrain/TerrariumElevationProvider.js';
    import { wgs84ToEnu as SubpathWgs84ToEnu } from '@stlim0727/flightsim-core/geo/Geodesy.js';
    import { createTileScheduler as SubpathScheduler } from '@stlim0727/flightsim-core/tile/TileScheduler.js';
    import { assertTerrainProviderConformance as SubpathConformance } from '@stlim0727/flightsim-core/terrain/conformance.js';
    import { createAuthorityZones as SubpathAuthority } from '@stlim0727/flightsim-core/terrain/AuthorityZones.js';
    import { validateTerrainProviderOverride as SubpathValidator } from '@stlim0727/flightsim-core/terrain/conformance.js';
    assert.equal(globalThis.window, undefined);
    assert.equal(globalThis.document, undefined);
    assert.equal(FlightPhysicsCore, SubpathCore);
    assert.equal(analyticTerrainProvider, SubpathAnalytic);
    assert.equal(createGroundSurfaceQueries, SubpathSurface);
    assert.equal(decodeTerrarium, SubpathDecode);
    assert.equal(createTerrariumProvider, SubpathTerrarium);
    assert.equal(wgs84ToEnu, SubpathWgs84ToEnu);
    assert.equal(createTileScheduler, SubpathScheduler);
    assert.equal(assertTerrainProviderConformance, SubpathConformance);
    assert.equal(createAuthorityZones, SubpathAuthority);
    assert.equal(validateTerrainProviderOverride, SubpathValidator);
    assert.equal(createAuthorityZones([{ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }]).protects(0.5, 0.5), true);
    const origin = { latitude: 35.1652, longitude: 128.939 };
    const enu = wgs84ToEnu(origin.latitude + 0.01, origin.longitude, origin);
    const back = enuToWgs84(enu.east, enu.north, enu.up, origin);
    assert.ok(Math.abs(back.latitude - origin.latitude - 0.01) < 1e-9);
    const scheduler = createTileScheduler();
    assert.equal(await scheduler.schedule('k', 1, async () => 7), 7);
    scheduler.dispose();
    assert.equal(surfaceNormal((x) => x, 0, 0).y > 0, true);
    let override = null;
    const validatedOverride = validateTerrainProviderOverride(() => override);
    assert.equal(validatedOverride(), null);

    // Terrain provider smoke test without browser globals
    const flatTile = metres => {
      const v = metres + 32768;
      const rgba = new Uint8Array(256 * 256 * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = Math.floor(v / 256);
        rgba[i + 1] = Math.floor(v % 256);
        rgba[i + 2] = Math.round((v - Math.floor(v)) * 256) % 256;
        rgba[i + 3] = 255;
      }
      return rgba;
    };
    assert.ok(Math.abs(decodeTerrarium(flatTile(123.5))[0] - 123.5) < 0.01);
    const len = Math.hypot(-0.1, 1, 0);
    const analytic = analyticTerrainProvider({
      getHeight: () => 12,
      getNormal: () => ({ x: -0.1 / len, y: 1 / len, z: 0 }),
    });
    assertTerrainProviderContract(analytic, [[0, 0]]);
    assertTerrainProviderConformance(analytic, [[0, 0]]);
    const terrarium = createTerrariumProvider({
      anchor: { lat: 35.1652, lon: 128.939, headingDeg: 353.9 },
      loadTile: async () => flatTile(250),
    });
    assertTerrainProviderContract(terrarium, [[0, 0]]);
    await new Promise(r => setTimeout(r, 5));
    assert.equal(terrarium.isReady(0, 0), true);
    assertTerrainProviderContract(terrarium, [[0, 0]]);
    const queries = createGroundSurfaceQueries({ getTerrain: () => ({ getHeight: () => 0 }), getOverride: () => analytic });
    assert.equal(queries.getGroundHeight(0, 0), 12);
    assert.equal(queries.getGroundNormal(0, 0).isVector3, true);
    terrarium.dispose();

    for (const config of Object.values(AIRCRAFT_REGISTRY)) {
      const physics = new FlightPhysicsCore({ config });
      physics.position.set(0, 1500, 0); physics.linearVelocity.set(0, 0, -100);
      const controls = new FlightControlLaws();
      const warnings = new FlightWarningsCore(config);
      const autopilot = new AutopilotController({ approachDeviation: (_key, state) => approachDeviation(null, state) });
      autopilot.engage('MASTER', physics.step(1/120));
      for (let i = 0; i < 120; i++) {
        const result = physics.step(1/120, controls.update({ throttle: 0.6 }, 1/120, physics.telemetry.iasKnots, config.id));
        assert.ok(Number.isFinite(result.position.y));
        assert.ok(Number.isFinite(autopilot.update(result, 1/120).elevator));
        assert.ok(Array.isArray(warnings.update(1/120, result.telemetry).activeWarnings));
      }
    }
    console.log('Packed package: standalone B738/C172/F16 simulation passed');
  `);
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: directory, stdio: 'inherit' });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
