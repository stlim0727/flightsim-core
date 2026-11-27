import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Aerodynamics } from '../src/physics/Aerodynamics.js';
import { EngineModel } from '../src/physics/EngineModel.js';
import { CONCORDE } from '../src/config/aircraftConfigs.js';

function conditionsAt(altitudeMeters) {
  const temperature = 288.15 - 0.0065 * altitudeMeters;
  const pressure = 101325 * Math.pow(temperature / 288.15, 9.80665 / (0.0065 * 287.05));
  const density = pressure / (287.05 * temperature);
  return { density, densityRatio: density / 1.225, speedOfSound: Math.sqrt(1.4 * 287.05 * temperature) };
}

describe('Concorde realistic performance', () => {
  function cruiseResult(mach, altitudeMeters, config = CONCORDE) {
    const aero = new Aerodynamics(config);
    const conditions = conditionsAt(altitudeMeters);
    let speed = mach * conditions.speedOfSound;
    const aircraft = new THREE.Object3D();
    const velocity = new THREE.Vector3(0, 0, -speed);
    let result;
    for (let index = 0; index < 8; index++) {
      velocity.z = -speed;
      result = aero.computeAero(0.01, aircraft, velocity, new THREE.Vector3(), altitudeMeters, 20000, 0, 0);
      if (Math.abs(result.mach - mach) < 0.001) break;
      speed *= result.mach / mach;
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
    const { result } = cruiseResult(2.0, 18300);
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
    assert.ok(dry.totalThrust > 20000 && dry.totalThrust < 80000, `dry total thrust ${dry.totalThrust}`);
    assert.ok(dry.fuelKg < engines.fuelCapacityKg, 'dry cruise burns fuel');

    engines.setReheat(true);
    const reheated = engines.update(0.2, altitude, speed, densityRatio);
    assert.ok(reheated.totalThrust > dry.totalThrust * 1.5, 'reheat increases installed thrust');
    assert.ok(
      reheated.engine1.fuelFlow > dry.engine1.fuelFlow * 1.5,
      'reheat sharply increases fuel flow',
    );
  });

  it('accepts manifest aerodynamics aliases', () => {
    const aero = new Aerodynamics({
      aerodynamics: { clAlpha: 3.1, cd0: 0.015 },
    });
    assert.equal(aero.CLa, 3.1);
    assert.equal(aero.CD0, 0.015);
  });
});
