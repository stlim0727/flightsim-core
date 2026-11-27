import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Aerodynamics } from '../src/physics/Aerodynamics.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { CONCORDE, F16_FALCON } from '../src/config/aircraftConfigs.js';

function conditionsAt(altitudeMeters) {
  const h = Math.max(0, altitudeMeters);
  if (h <= 11000) {
    const temperature = 288.15 - 0.0065 * h;
    const pressure = 101325 * Math.pow(temperature / 288.15, 9.80665 / (0.0065 * 287.05));
    const density = pressure / (287.05 * temperature);
    return { density, densityRatio: density / 1.225, speedOfSound: Math.sqrt(1.4 * 287.05 * temperature) };
  }
  const temperature = 216.65;
  const tropoPressure = 101325 * Math.pow(temperature / 288.15, 9.80665 / (0.0065 * 287.05));
  const pressure = tropoPressure * Math.exp((-9.80665 * (h - 11000)) / (287.05 * temperature));
  const density = pressure / (287.05 * temperature);
  return { density, densityRatio: density / 1.225, speedOfSound: Math.sqrt(1.4 * 287.05 * temperature) };
}

describe('Concorde realistic performance', () => {
  function cruiseResult(mach, altitudeMeters, config = CONCORDE, pitchDeg = 0) {
    const aero = new Aerodynamics(config);
    const conditions = conditionsAt(altitudeMeters);
    let speed = mach * conditions.speedOfSound;
    const aircraft = new THREE.Object3D();
    aircraft.rotation.x = THREE.MathUtils.degToRad(pitchDeg);
    aircraft.updateMatrixWorld(true);
    const velocity = new THREE.Vector3(0, 0, -speed);
    let result;
    for (let index = 0; index < 8; index++) {
      velocity.z = -speed;
      result = aero.computeAero(0.01, aircraft, velocity, new THREE.Vector3(), altitudeMeters, 20000, 0, 0);
      if (Math.abs(result.mach - mach) < 0.001) break;
      speed *= mach / result.mach;
    }
    return { aero, result, conditions };
  }

  it('keeps finite wave drag through the transonic range at supersonic cruise', () => {
    for (const mach of [0.8, 0.93, 1.0, 1.1, 1.4, 2.0, 2.2]) {
      const { result } = cruiseResult(mach, 18000);
      assert.ok(Number.isFinite(result.cd), `finite cd at Mach ${mach}`);
      assert.ok(result.cd > 0 && result.cd < 0.3, `bounded cd at Mach ${mach}: ${result.cd}`);
    }
  });

  it('holds Concorde-like L/D at Mach 2 cruise', () => {
    const { result } = cruiseResult(2.0, 18300, CONCORDE, 2.0);
    const liftToDrag = result.cl / result.cd;
    assert.ok(liftToDrag > 6.5 && liftToDrag < 8.5, `Mach 2 L/D was ${liftToDrag}`);
  });

  it('uses installed dry thrust and reheat tables with TSFC fuel flow', () => {
    const engines = new EngineModel(CONCORDE.propulsion);
    engines.setThrottle(1);
    engines.settleSpool();
    const altitude = 18300;
    const { densityRatio, speedOfSound } = conditionsAt(altitude);
    const speed = 2.0 * speedOfSound;

    const dry = engines.update(0.2, altitude, speed, densityRatio);
    assert.ok(dry.totalThrust > 150000 && dry.totalThrust < 250000, `dry total thrust ${dry.totalThrust}`);
    assert.ok(dry.fuelKg < engines.fuelCapacityKg, 'dry cruise burns fuel');

    const highAlt = 28000;
    const highCond = conditionsAt(highAlt);
    const aboveCeiling = engines.update(0.2, highAlt, 2.0 * highCond.speedOfSound, highCond.densityRatio);
    assert.ok(
      aboveCeiling.totalThrust < dry.totalThrust * 0.6,
      `thrust decays above ceiling: ${aboveCeiling.totalThrust} vs ${dry.totalThrust}`,
    );

    engines.setReheat(true);
    const reheated = engines.update(0.2, altitude, speed, densityRatio);
    assert.ok(reheated.totalThrust > dry.totalThrust * 1.5, 'reheat increases installed thrust');
    assert.ok(
      reheated.engine1.fuelFlow > dry.engine1.fuelFlow * 1.5,
      'reheat sharply increases fuel flow',
    );

    engines.loadConfig(CONCORDE.propulsion);
    assert.equal(engines.reheatActive, false, 'loadConfig resets reheatActive');
  });

  it('keeps F-16 supersonic wave drag bounded through Mach 2.05', () => {
    for (const mach of [0.95, 1.2, 1.6, 2.05]) {
      const { result } = cruiseResult(mach, 15000, F16_FALCON);
      assert.ok(Number.isFinite(result.cd), `F16 finite cd at Mach ${mach}`);
      assert.ok(result.cd > 0 && result.cd < 0.15, `F16 bounded cd at Mach ${mach}: ${result.cd}`);
    }
  });

  it('accepts manifest aerodynamics aliases', () => {
    const aero = new Aerodynamics({
      aerodynamics: { clAlpha: 3.1, cd0: 0.015 },
    });
    assert.equal(aero.CLa, 3.1);
    assert.equal(aero.CD0, 0.015);
  });
});
