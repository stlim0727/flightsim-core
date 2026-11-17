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
      AIRCRAFT_REGISTRY, approachDeviation } from '@stlim0727/flightsim-core';
    import { FlightPhysicsCore as SubpathCore } from '@stlim0727/flightsim-core/physics/FlightPhysicsCore.js';
    assert.equal(globalThis.window, undefined);
    assert.equal(globalThis.document, undefined);
    assert.equal(FlightPhysicsCore, SubpathCore);
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
