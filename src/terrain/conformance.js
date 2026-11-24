/**
 * Provider-conformance checks shared by Flight3d and hajun3d tests.
 *
 * Returns failure strings instead of importing a test framework so this module
 * stays dependency-free and usable from any runner.
 */

import { assertTerrainProviderContract } from './TerrainProvider.js';

export function terrainProviderConformanceFailures(provider, points = [[0, 0]]) {
  const failures = [];
  try {
    assertTerrainProviderContract(provider, points);
  } catch (error) {
    failures.push(error.message);
    return failures;
  }

  for (const [x, z] of points) {
    const height = provider.getHeight(x, z);
    if (height !== null && !Number.isFinite(height)) {
      failures.push(`getHeight(${x}, ${z}) must be finite or null`);
    }
    if (provider.isReady(x, z) && !Number.isFinite(height)) {
      failures.push(`isReady(${x}, ${z}) is true but getHeight is not authoritative`);
    }

    const normal = provider.getNormal(x, z);
    if (normal !== null) {
      const finite = [normal.x, normal.y, normal.z].every(Number.isFinite);
      const length = Math.hypot(normal.x, normal.y, normal.z);
      if (!finite || Math.abs(length - 1) > 1e-3 || normal.y <= 0) {
        failures.push(`getNormal(${x}, ${z}) must be a finite upward unit vector`);
      }
    }

    const water = provider.isWater?.(x, z);
    if (water !== undefined && water !== null && typeof water !== 'boolean') {
      failures.push(`isWater(${x}, ${z}) must be boolean or null`);
    }
  }
  return failures;
}

/** Throws a single error describing every conformance failure. */
export function assertTerrainProviderConformance(provider, points = [[0, 0]]) {
  const failures = terrainProviderConformanceFailures(provider, points);
  if (failures.length) {
    throw new Error(`terrain provider conformance failed: ${failures.join('; ')}`);
  }
  return true;
}

/**
 * Wrap a provider getter so a new provider instance is conformance-checked once
 * on first use, not on every physics query. `null` is always accepted.
 */
export function validateTerrainProviderOverride(getProvider, points = [[0, 0]]) {
  let validated = null;
  return () => {
    const provider = getProvider?.() ?? null;
    if (provider && provider !== validated) {
      assertTerrainProviderConformance(provider, points);
      validated = provider;
    }
    return provider;
  };
}
