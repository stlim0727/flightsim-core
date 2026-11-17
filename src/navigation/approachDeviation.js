const DEG = Math.PI / 180;

/**
 * Signed navigation deviations for the active airport's approach course.
 * Returns null when the airport has no approach data.
 *
 * @param {object|null} data approach geometry, or null when navigation is unavailable
 * @param {{x:number,z:number,altitudeFt:number}} pos world position, altitude in ft
 * @returns {{courseDeg:number, crossTrackM:number, distanceToThresholdM:number, glideslopeErrorFt:number}|null}
 *   crossTrackM > 0 = right of centerline, distanceToThresholdM > 0 = before the threshold,
 *   glideslopeErrorFt > 0 = above the glideslope.
 */
export function approachDeviation(data, pos) {
  if (!data) return null;
  const th = thRad(data.headingDeg);
  const dx = pos.x - data.threshold.x;
  const dz = pos.z - data.threshold.z;
  const along = dx * Math.sin(th) + dz * -Math.cos(th);
  const cross = dx * Math.cos(th) + dz * Math.sin(th);
  const distanceToThresholdM = -along;
  const gsAltitudeFt = data.elevationFt +
    Math.tan(data.gsAngleDeg * DEG) * distanceToThresholdM / 0.3048;
  const speedKnots = pos.tasKnots ?? pos.groundSpeedKnots ?? pos.iasKnots ?? 140;
  return {
    courseDeg: data.headingDeg,
    crossTrackM: cross,
    distanceToThresholdM,
    glideslopeErrorFt: pos.altitudeFt - gsAltitudeFt,
    // Required sink rate on the glideslope at this speed, negative = descending (fpm).
    referenceSinkFpm: -Math.tan(data.gsAngleDeg * DEG) * speedKnots * 101.27,
  };
}

function thRad(headingDeg) {
  return headingDeg * DEG;
}
