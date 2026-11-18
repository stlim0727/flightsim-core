import test from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere } from '../src/physics/Atmosphere.js';
import { FlightPhysicsCore } from '../src/physics/FlightPhysicsCore.js';
import { CESSNA_172 } from '../src/config/aircraftConfigs.js';
import { FlightWarningsCore } from '../src/systems/FlightWarningsCore.js';

function fly(core, ias, inputs, ticks = 1, sideslip = 0) {
  let frame;
  for (let tick = 0; tick < ticks; tick++) {
    core.position.set(0, 1000, 0);
    core.quaternion.identity();
    core.angularVelocity.set(0, 0, 0);
    const tas = ias / 1.94384 / Math.sqrt(Atmosphere.getConditions(1000).densityRatio);
    core.linearVelocity.set(tas * Math.sin(sideslip), 0, -tas * Math.cos(sideslip));
    frame = core.integrateSubstep(1 / 120, inputs);
  }
  return frame.telemetry;
}

test('flap warning precedes jamming, and unequal loads leave unequal flap angles', () => {
  const core = new FlightPhysicsCore();
  core.gear.gearState = core.gear.targetGearState = 0;
  const first = fly(core, 290, { flapsIndex: 6 });
  assert.equal(first.configurationOverspeed.flap, true);
  assert.equal(first.configurationDamage.flapLeft, 0);
  const loaded = fly(core, 290, { flapsIndex: 6 }, 480, 0.2);
  assert.equal(loaded.configurationDamage.flapRight, 1);
  assert.ok(Math.abs(core.aero.flapAngleOffset) > 0.01);
  const angle = core.aero.currentFlapAngle + core.aero.flapAngleOffset;
  fly(core, 130, { flapsIndex: 0 }, 120);
  assert.ok(Math.abs(core.aero.currentFlapAngle + core.aero.flapAngleOffset - angle) < 1e-9);
  core.reset();
  assert.equal(core.aero.flapAngleOffset, 0);
  assert.equal(fly(core, 130, { flapsIndex: 0 }).configurationDamage.flapRight, 0);
});

test('gear uses operating and extended limits, jams, and resets', () => {
  const core = new FlightPhysicsCore();
  assert.equal(fly(core, 270, { gearHandleDown: true }).configurationOverspeed.gear, false);
  assert.equal(fly(core, 270, { gearHandleDown: false }).configurationOverspeed.gear, true);
  core.gear.gearState = core.gear.targetGearState = 0;
  assert.equal(fly(core, 410, {}).configurationDamage.gear < 0.01, true);
  const failed = fly(core, 460, { gearHandleDown: true }, 720);
  assert.equal(failed.configurationDamage.gear, 1);
  assert.ok(failed.gearState > 0 && failed.gearState < 1);
  assert.equal(fly(core, 150, { gearHandleDown: false }, 120).gearState, failed.gearState);
  core.reset();
  assert.ok(fly(core, 150, { gearHandleDown: true }, 120).gearState > failed.gearState);
});

test('fixed gear has no overspeed damage and flap warning reaches the warning system', () => {
  const core = new FlightPhysicsCore({ config: CESSNA_172 });
  core.lastOnGround = false;
  const state = fly(core, 120, { flapsIndex: 1, gearHandleDown: false });
  assert.equal(state.configurationDamage.gear, 0);
  assert.equal(state.configurationOverspeed.gear, false);
  assert.equal(state.gearState, 1);
  const warnings = new FlightWarningsCore('C172').update(1 / 120, state).activeWarnings;
  assert.ok(warnings.some(warning => warning.id === 'flap-overspeed'));
});
