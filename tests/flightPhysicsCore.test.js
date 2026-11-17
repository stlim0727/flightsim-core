import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FlightPhysicsCore } from '../src/physics/FlightPhysicsCore.js';
import { BOEING_737_800, CESSNA_172, F16_FALCON } from '../src/config/aircraftConfigs.js';
import { Atmosphere } from '../src/physics/Atmosphere.js';

test('FlightPhysicsCore runs standalone with fixed 120 Hz substepping and zero app dependencies', () => {
  const core = new FlightPhysicsCore({ config: BOEING_737_800 });
  core.position.set(0, 1500, 0);
  core.linearVelocity.set(0, 0, -130);

  // 1/60 s = 2 substeps at 120 Hz
  const frame1 = core.step(1 / 60, { throttle: 0.7, gearHandleDown: false }, {
    getGroundHeight: () => 0,
  });
  assert.equal(frame1.substeps, 2);
  assert.ok(frame1.position.z < 0);
  assert.ok(Number.isFinite(frame1.telemetry.iasKnots) && frame1.telemetry.iasKnots > 150);
  assert.ok(Number.isFinite(frame1.telemetry.gForce));

  // Sub-tick delta accumulates without stepping until 1/120 s is reached
  const frame2 = core.step(0.004, { throttle: 0.7, gearHandleDown: false });
  assert.equal(frame2.substeps, 0);
  const frame3 = core.step(0.005, { throttle: 0.7, gearHandleDown: false });
  assert.equal(frame3.substeps, 1);
});

test('FlightPhysicsCore supports inputs for flaps, spoilers, gear, reverser, and wind callback', () => {
  const core = new FlightPhysicsCore({ config: BOEING_737_800 });
  core.position.set(0, 500, 0);
  core.linearVelocity.set(0, 0, -120);

  const windSampled = [];
  const res = core.integrateSubstep(1 / 120, {
    throttle: 0.5,
    flapsIndex: 2,
    spoilers: 0.5,
    gearHandleDown: false,
    reverserActive: false,
    pitchTrim: 0.1,
  }, {
    getGroundHeight: () => 0,
    getWindWorld: (pos, _time, out) => {
      windSampled.push(pos.clone());
      out.set(5, 0, 0);
    },
  });

  assert.equal(core.aero.flapsIndex, 2);
  assert.equal(core.aero.spoilers, 0.5);
  assert.equal(core.gear.targetGearState, 0.0);
  assert.ok(windSampled.length >= 1);
  assert.ok(res.events.some(e => e.type === 'gearTransit' && e.extending === false));
});

test('FlightPhysicsCore emits touchdown, excursion, and waterDitching events', () => {
  // 1. Touchdown event after sustained airborne flight
  const landingCore = new FlightPhysicsCore({ config: BOEING_737_800 });
  landingCore.engines.refuel(landingCore.aero);
  landingCore.position.set(0, 1.5, 0);
  landingCore.linearVelocity.set(0, -1.5, -70);
  landingCore.lastOnGround = false;
  landingCore.airborneTime = 2.0;

  let sawTouchdown = false;
  for (let i = 0; i < 120; i++) {
    const out = landingCore.integrateSubstep(1 / 120, { throttle: 0.2, gearHandleDown: true }, {
      getGroundHeight: () => 0,
      isOnRunway: () => true,
      isRunwaySafetyArea: () => true,
    });
    if (out.events.some(e => e.type === 'touchdown')) {
      sawTouchdown = true;
      break;
    }
  }
  assert.equal(sawTouchdown, true);

  // 2. Excursion event off-runway on rough terrain
  const excursionCore = new FlightPhysicsCore({ config: BOEING_737_800 });
  excursionCore.position.set(0, 2.2, 0);
  excursionCore.linearVelocity.set(0, 0, -40);
  let sawExcursion = false;
  for (let i = 0; i < 60; i++) {
    const out = excursionCore.integrateSubstep(1 / 120, { throttle: 0.0, gearHandleDown: true }, {
      getGroundHeight: () => 0,
      isOnRunway: () => false,
      isRunwaySafetyArea: () => false,
    });
    if (out.events.some(e => e.type === 'excursion')) {
      sawExcursion = true;
      break;
    }
  }
  assert.equal(sawExcursion, true);

  // 3. Water ditching event over ocean
  const waterCore = new FlightPhysicsCore({ config: F16_FALCON });
  waterCore.position.set(0, 0.2, 0);
  waterCore.linearVelocity.set(0, -3, -60);
  waterCore.lastOnGround = false;
  let sawDitching = false;
  for (let i = 0; i < 60; i++) {
    const out = waterCore.integrateSubstep(1 / 120, { throttle: 0.5, gearHandleDown: false }, {
      getGroundHeight: () => -50,
      getWaterLevel: () => 0,
    });
    if (out.events.some(e => e.type === 'waterDitching')) {
      sawDitching = true;
      break;
    }
  }
  assert.equal(sawDitching, true);
});
