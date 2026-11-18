// Normalize dynamic pressure by the pressure at the indicated speed limit.
// A short excursion warns before it builds enough damage to jam a mechanism.
const excessPressure = (iasKnots, limit) => Math.max(0, (iasKnots / limit) ** 2 - 1);
const accumulateDamage = (damage, load, dt) => Math.min(1, damage + 0.5 * load * load * dt);

function flapLoad(angle, iasKnots, angles, limits) {
  if (angle < 0.1) return 0;
  const upper = angles.findIndex(detent => detent >= angle);
  if (upper < 1 || !limits[upper]) return 0;
  const lower = upper - 1;
  const progress = (angle - angles[lower]) / (angles[upper] - angles[lower]);
  const lowerLimit = limits[lower] || limits[upper];
  const limit = lowerLimit + (limits[upper] - lowerLimit) * progress;
  return excessPressure(iasKnots, limit);
}

export function advanceConfigurationOverspeed(aero, gear, limits, iasKnots, dt) {
  const offset = aero.flapAngleOffset ?? 0;
  const left = flapLoad(aero.currentFlapAngle - offset, iasKnots, aero.flapAngles, limits.flap);
  const right = flapLoad(aero.currentFlapAngle + offset, iasKnots, aero.flapAngles, limits.flap);
  // Sideslip biases the two exposed flap loads in opposite directions.
  const bias = Math.max(-0.3, Math.min(0.3, aero.beta ?? 0));
  aero.leftFlapDamage = accumulateDamage(aero.leftFlapDamage ?? 0, left * (1 - bias), dt);
  aero.rightFlapDamage = accumulateDamage(aero.rightFlapDamage ?? 0, right * (1 + bias), dt);

  let gearLoad = 0;
  if (!gear.isFixed && limits.gearOperating && limits.gearExtended) {
    const moving = Math.abs(gear.targetGearState - gear.gearState) > 0.001;
    const exposed = Math.max(gear.gearState, moving ? 0.05 : 0);
    const limit = moving ? limits.gearOperating : limits.gearExtended;
    gearLoad = exposed > 0 ? excessPressure(iasKnots, limit) : 0;
    gear.overspeedDamage = accumulateDamage(gear.overspeedDamage ?? 0, gearLoad * exposed, dt);
  }

  const selectedFlapLimit = limits.flap[aero.flapsIndex];
  return {
    flap: left > 0 || right > 0 || Boolean(selectedFlapLimit && iasKnots > selectedFlapLimit),
    gear: gearLoad > 0,
  };
}
