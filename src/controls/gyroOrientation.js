export const degrees = radians => radians * 180 / Math.PI;
export const angleDelta = (angle, zero) => ((angle - zero + 540) % 360) - 180;

/** Gravity projected into screen axes avoids beta/gamma jumps near landscape. */
export function screenTilt(beta, gamma, angle) {
  const b = beta * Math.PI / 180;
  const g = gamma * Math.PI / 180;
  const a = angle * Math.PI / 180;
  const x = Math.cos(b) * Math.sin(g);
  const y = Math.sin(b);
  const z = Math.cos(b) * Math.cos(g);
  // DeviceOrientation's +gamma is -gravity.x; screen +90° puts device
  // +x at screen top and device +y at screen left. Preserve that handedness.
  const right = x * Math.cos(a) + y * Math.sin(a);
  const up = y * Math.cos(a) - x * Math.sin(a);
  return {
    pitch: degrees(Math.atan2(up, z)),
    roll: degrees(Math.atan2(right, Math.hypot(up, z))),
  };
}

export function readGyroScreen(win = (typeof window !== 'undefined' ? window : globalThis)) {
  const orientation = win?.screen?.orientation;
  const rawAngle = orientation?.angle ?? win?.orientation;
  const angle = Number.isFinite(rawAngle) ? ((rawAngle % 360) + 360) % 360 : 0;
  const type = orientation?.type?.startsWith('landscape')
    ? 'landscape'
    : orientation?.type?.startsWith('portrait')
    ? 'portrait'
    : ((win?.innerWidth || 0) > (win?.innerHeight || 0) ? 'landscape' : 'portrait');
  return { angle, type };
}

export function isGyroSupportedDevice(
  win = (typeof window !== 'undefined' ? window : globalThis),
  nav = (typeof navigator !== 'undefined' ? navigator : globalThis?.navigator)
) {
  if (typeof win === 'undefined' || !win || !win.DeviceOrientationEvent) return false;
  if (win.isSecureContext === false) return false;
  const ua = nav?.userAgent || '';
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && (nav?.maxTouchPoints || 0) > 1);
  const isMobileClient = Boolean(nav?.userAgentData?.mobile);
  const hasTouch = Boolean(('ontouchstart' in win) || ((nav?.maxTouchPoints ?? 0) > 0));
  return (isMobileUA || isMobileClient) && hasTouch;
}

/**
 * 3rd-order non-linear response curve with radial deadzone.
 * Shape: response = linearWeight * travel + cubicWeight * travel^3
 * Eliminates twitchiness while preserving full authority.
 */
export function shapeTouchStick(pitch, roll, { deadzone = 0.06, linearWeight = 0.35, cubicWeight = 0.65 } = {}) {
  const magnitude = Math.hypot(pitch, roll);
  if (magnitude <= deadzone) return [0, 0];
  const travel = (Math.min(1, magnitude) - deadzone) / (1 - deadzone);
  const response = linearWeight * travel + cubicWeight * Math.pow(travel, 3);
  return [(pitch / magnitude) * response, (roll / magnitude) * response];
}

