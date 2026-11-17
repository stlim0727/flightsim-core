import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRCRAFT_REGISTRY,
  AIRCRAFT_SPECS,
  classifyLanding,
  getAircraftSpecs,
  shapeTouchStick,
  isGyroSupportedDevice,
  Aerodynamics,
  MassProperties,
} from '../src/index.js';

describe('Expanded Aircraft Configurations & Touch Controls', () => {
  it('registers all standard and expanded aircraft', () => {
    const expected = ['B738', 'F16', 'C172', 'A320', 'B747', 'DC10', 'MD80', 'CONCORDE', 'CL215', 'AMPHIBIAN'];
    for (const id of expected) {
      assert.ok(AIRCRAFT_REGISTRY[id], `Missing config for ${id}`);
      assert.ok(AIRCRAFT_REGISTRY[id].aerodynamics, `Missing aero for ${id}`);
      assert.ok(AIRCRAFT_REGISTRY[id].massProperties, `Missing mass properties for ${id}`);
      assert.ok(AIRCRAFT_REGISTRY[id].propulsion, `Missing propulsion for ${id}`);
    }
  });

  it('instantiates Aerodynamics and MassProperties successfully for all aircraft', () => {
    for (const [id, config] of Object.entries(AIRCRAFT_REGISTRY)) {
      const mass = new MassProperties(config);
      assert.ok(mass.emptyMassKg > 0, `${id} empty mass`);
      const aero = new Aerodynamics(config);
      assert.ok(aero, `${id} aero`);
    }
  });

  it('classifies landings across airliner and amphibian categories', () => {
    const b747Butter = classifyLanding('B747', 1.15, 120);
    assert.equal(b747Butter.rating, 'butter');
    assert.equal(b747Butter.isCrash, false);

    const cl215Normal = classifyLanding('CL215', 1.45, 220);
    assert.equal(cl215Normal.rating, 'normal');
    assert.equal(cl215Normal.isCrash, false);

    const crash = classifyLanding('A320', 2.80, 800);
    assert.equal(crash.rating, 'crash');
    assert.equal(crash.isCrash, true);
  });

  it('shapes touch stick with 6% deadzone and non-linear response', () => {
    // Within deadzone
    const [deadPitch, deadRoll] = shapeTouchStick(0.03, 0.03);
    assert.equal(deadPitch, 0);
    assert.equal(deadRoll, 0);

    // Full deflection
    const [fullPitch, fullRoll] = shapeTouchStick(1.0, 0.0);
    assert.ok(Math.abs(fullPitch - 1.0) < 1e-4, 'full travel produces 1.0 output');
    assert.equal(fullRoll, 0);

    // Mid travel has progressive cubic feel
    const [midPitch] = shapeTouchStick(0.53, 0.0);
    assert.ok(midPitch > 0 && midPitch < 0.53, 'response softens center travel');
  });

  it('detects gyro supported devices accurately', () => {
    const desktopWin = { DeviceOrientationEvent: function() {}, isSecureContext: true };
    const desktopNav = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 };
    assert.equal(isGyroSupportedDevice(desktopWin, desktopNav), false);

    const mobileWin = { DeviceOrientationEvent: function() {}, isSecureContext: true, ontouchstart: null };
    const mobileNav = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5, userAgentData: { mobile: true } };
    assert.equal(isGyroSupportedDevice(mobileWin, mobileNav), true);
  });
});
