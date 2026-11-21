# flightsim-core

Headless flight simulation library extracted from Flight3d. Includes fixed-step
6-DOF physics, control input shaping, autopilot and flight warnings. Runs in Node
and browser applications without DOM, UI, device APIs, audio or a renderer.

The `three` peer dependency supplies vector, quaternion and matrix math. No
WebGL context, scene, canvas or renderer is created by this package. Provide
terrain, wind and runway queries through physics callbacks.

## Install

The initial release is an npm-compatible package distributed from GitHub. Pin a
full release commit for reproducible installs; no npm registry token is needed:

```sh
npm install '@stlim0727/flightsim-core@git+https://github.com/stlim0727/flightsim-core.git#v0.1.0'
```

It is not published to npmjs.com yet. The package name and exports also support
registry distribution later without changing application imports.

## Simulate

```js
import {
  FlightPhysicsCore, FlightControlLaws, FlightWarningsCore,
  AutopilotController, AIRCRAFT_REGISTRY,
} from '@stlim0727/flightsim-core';

const physics = new FlightPhysicsCore({ config: AIRCRAFT_REGISTRY.C172 });
physics.position.set(0, 1500, 0);
physics.linearVelocity.set(0, 0, -55);
const controls = new FlightControlLaws();
const warnings = new FlightWarningsCore('C172');
const autopilot = new AutopilotController();
const dt = 1 / 120;
const inputs = controls.update({ pitch: 0.1, throttle: 0.65 }, dt,
  physics.telemetry.iasKnots, 'C172');
const state = physics.step(dt, inputs, { getGroundHeight: () => 0 });
const alerts = warnings.update(dt, state.telemetry);
autopilot.engage('ALT', state);
const commands = autopilot.update(state, dt);
```

World axes are +Y up and identity forward -Z. Physics units are metres, seconds,
kilograms and radians; telemetry attitude is degrees, speed knots, altitude feet
and vertical speed feet/minute. Each simulation owns its own system instances.
Physics and autopilot results contain borrowed mutable state; copy it when
retaining history. Aircraft defaults are simulator calibrations, not certified
manufacturer data.

`FlightControlLaws.update(raw, dt, iasKnots, aircraftId)` returns the physics input
shape. Pitch/roll/yaw are normalized axes, throttle/brakes 0..1, pitchTrim is a
signed rate command, and flapsDelta/gearToggle/reverserToggle are one-step pulses.
Optional shaping settings are `deadzoneStick`, `deadzoneRudder`, `precisionCurve`
and `flapCount`. Existing source-aware shaping is available as `updateSources`.

`FlightWarningsCore.update(dt, telemetry, terrainAheadSeconds)` returns
`{ activeWarnings, gpwsCallout, stallWarning, overspeed, bankAngle,
terrainConflict }`. Callouts are crossing events; clients decide how to display
or play them. Terrain prediction accepts an injected height provider through
`terrainConflictSeconds`.

`AutopilotController` accepts either a physics snapshot with telemetry, position,
quaternion and linearVelocity, or flat telemetry. APP requires an injected
`approachDeviation(airportKey, state)` callback; without navigation it remains
armed. The exported `approachDeviation(approach, state)` computes deviations for
caller-owned approach geometry (threshold, headingDeg, gsAngleDeg, elevationFt).
No airport or scenery database is bundled. Other autopilot modes need no callback.

Root exports cover the main systems, aircraft presets, navigation helper and
terrain providers. Focused subpaths include `physics/FlightPhysicsCore.js`,
`controls/FlightControlLaws.js`, `physics/Autopilot.js`,
`systems/FlightWarningsCore.js`, `terrain/TerrainProvider.js`,
`terrain/TerrariumElevationProvider.js` and other explicitly exported physics
modules.

`terrain/TerrainProvider.js` defines the headless ground-truth contract
(`getHeight`, `getNormal`, `isReady`, `update`, `dispose`) along with
`analyticTerrainProvider`, `createGroundSurfaceQueries` (pairing height,
`THREE.Vector3`-adapted slope normals, and optional water state across
providers/fallbacks), `resolveGroundHeight` and
`assertTerrainProviderContract`. `terrain/TerrariumElevationProvider.js` provides
`decodeTerrarium`, `lonLatToTilePixel`, `createAnchorFrame` and
`createTerrariumProvider` with caller-injected `loadTile(z, x, y)` so tile I/O
stays outside this package.

## Develop and release

Use the Node version in `.node-version`:

```sh
npm ci
npm run check
npm test
npm run test:package
```

The package check packs and installs the actual tarball in a temporary consumer
project and runs all three aircraft without browser globals. It prevents local
checkout files or workspace links from masking a broken distribution.

For a new release, update the package version and lockfile, pass CI, tag the
validated commit `vX.Y.Z`, and update Flight3d's pinned Git dependency and lockfile.
Flight3d's old source paths are compatibility reexports; make core changes here.
