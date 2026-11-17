import { B738_MASS_DISTRIBUTION, C172_MASS_DISTRIBUTION, F16_MASS_DISTRIBUTION } from './massDistributions.js';
import { C172_BODY_SUPPORT_POINTS } from '../physics/groundContacts.js';

/**
 * @file aircraftConfigs.js
 * @description Centralized, typed, and extensible Aircraft Specification & Aerodynamic Configurations.
 * Allows adding new aircraft types (e.g. B737, B777, F-16, Cessna 172) by defining configuration objects.
 */

/**
 * @typedef {Object} AircraftConfig
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Object} massProperties - Mass and inertia tensor values
 * @property {Object} aerodynamics - Dimensionless aerodynamic derivatives and geometry
 * @property {Object} propulsion - Engine thrust and spool dynamics
 * @property {Object} landingGear - Gear suspension, steering, and braking parameters
 * @property {Object} cockpit - Cockpit geometry, eye offsets, and instrument placements
 * @property {Object} [audio] - Engine sound profile and synthesized RPM tuning
 */

export const BOEING_737_800 = {
  id: 'B738',
  massDistribution: B738_MASS_DISTRIBUTION,
  name: 'Boeing 737-800',
  description: 'Twin-engine narrow-body jet airliner with CFM56-7B high-bypass turbofans',

  // 1. Mass & Inertial Properties
  massProperties: {
    emptyWeightKg: 41413,
    maxTakeoffWeightKg: 79010,
    currentMassKg: 66000.0,
    // Principal moments of inertia (kg·m^2) for heavy twin-jet airliner
    Ixx: 1650000.0, // Roll inertia (heavy fuel wings)
    Iyy: 3450000.0, // Pitch inertia (long heavy passenger fuselage)
    Izz: 4850000.0  // Yaw inertia
  },

  // 2. Aerodynamic Geometry & Stability Derivatives
  aerodynamics: {
    wingspanM: 35.8,       // Span b (m)
    wingAreaM2: 124.6,     // Area S (m^2)
    meanChordM: 3.99,      // MAC c_bar (m)
    // Calibrated game tail estimates, not manufacturer performance data.
    tailArmM: 12, tailAreaM2: 32, tailInducedFactor: 0.10,
    oswaldEfficiency: 0.82,// Span efficiency factor e

    // Lift parameters
    cl0Clean: 0.22,        // Zero-AoA clean lift
    claPerRad: 5.65,       // Lift slope dCL/dAlpha
    alphaStallDeg: 15.5,   // Clean stall angle of attack
    clFlapBoostMax: 0.95,  // Max lift boost at full flaps (40 deg)
    spoilerLiftDump: 0.38, // Lift dump with flight spoilers deployed

    // Drag parameters
    cd0Clean: 0.0185,      // Parasitic zero-lift drag
    gearDrag: 0.024,       // Additional parasitic drag with gear down
    spoilerDrag: 0.075,    // Additional drag with speedbrakes extended
    transonicMachBuffet: 0.78, // Mach threshold for compressibility drag

    // Longitudinal (Pitch) Stability Derivatives
    cm0: -0.02,            // Trim pitching moment at zero AoA
    cma: -0.90,            // Static pitch stability (dCm/dAlpha < 0)
    cmDe: -1.25,           // Elevator pitch control authority (dCm/dDe per rad)
    cmQ: -26.0,            // Heavy transport pitch rate damping derivative

    // Lateral-Directional (Roll & Yaw) Stability Derivatives
    clBeta: -0.14,         // Dihedral effect / sweepback roll (dCl/dBeta)
    clDa: 0.18,            // Aileron roll control authority (dCl/dDa per rad)
    clP: -0.65,            // Roll rate damping derivative
    cnBeta: -0.22,         // Directional weathercock stability (dCn/dBeta < 0 in Three.js Y-up)
    cnDr: -0.12,           // Rudder yaw control authority (dCn/dDr per rad)
    cnR: -0.32,            // Yaw rate damping derivative
    adverseYaw: -0.025,    // Adverse yaw coupling from aileron deflection

    // Flap detents (degrees)
    flapAngles: [0, 1, 5, 15, 20, 30, 40]
  },

  // See docs/development/stall-warning.md for sources and approximation limits.
  stallWarning: { type: 'stickShaker', marginDeg: 2.0 },

  // 3. Propulsion System (Twin Turbofans)
  propulsion: {
    numEngines: 2,
    engineName: 'CFM56-7B26',
    maxStaticThrustPerEngineN: 121000.0, // ~27,000 lbf each
    idleN1Percent: 22.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 3.2,                 // Idle to TOGA response lag
    spoolDownTimeSec: 2.4,               // TOGA to Idle lag
    reverseThrustEfficiency: 0.45,       // 45% reverse thrust deflection
    baseFuelFlowKgPerHour: 350.0,
    maxFuelFlowKgPerHour: 2500.0,
    fuelCapacityKg: 14200.0
  },

  // 4. Landing Gear & Ground Interaction
  landingGear: {
    isFixed: false,
    cgGroundHeightM: 3.5,
    gearTransitTimeSec: 8.0,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -3.27, z: -12.5 },
        wheelRadius: 0.38,
        restLength: 0.9,
        kSpring: 420000, // N/m
        cDamper: 48000,  // N/(m/s)
        isSteerable: true,
        maxSteeringDeg: 55.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -3.2, y: -3.30, z: 1.8 },
        wheelRadius: 0.48,
        restLength: 0.9,
        kSpring: 850000,
        cDamper: 72000,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 3.2, y: -3.30, z: 1.8 },
        wheelRadius: 0.48,
        restLength: 0.9,
        kSpring: 850000,
        cDamper: 72000,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.45,
    tireLateralFriction: 0.75
  },

  // 5. Cockpit Camera & Instrument Layout
  cockpit: {
    hasPhotoCockpit: true,
    captainEyePos: { x: -0.303, y: 0.88, z: -12.35 },
    portraitEyeX: -0.303,
    portraitEyeY: 0.88,
    defaultLookPitchRad: -0.08, // -4.6° forward look showing runway, horizon & MCP without excess dashboard dominance
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 55.0,
    chaseHeight: 10.5,
    droneDistance: 38.0,
    droneHeight: 11.5,
    gearCamOffset: { x: 2.2, y: -2.4, z: 6.2 },
    gearLookTarget: { x: -0.5, y: -1.9, z: -2.5 }
  }
};

export const F16_FALCON = {
  id: 'F16',
  flightControls: { gLimiter: true },
  massDistribution: F16_MASS_DISTRIBUTION,
  name: 'F-16 Fighting Falcon',
  description: 'Single-engine supersonic multirole fighter aircraft with afterburning turbofan',

  // 1. Mass & Inertial Properties
  massProperties: {
    emptyWeightKg: 8570,
    maxTakeoffWeightKg: 19200,
    currentMassKg: 12000.0,
    Ixx: 12800.0,
    Iyy: 75000.0,
    Izz: 82000.0
  },

  // 2. Aerodynamic Geometry & Stability Derivatives
  aerodynamics: {
    wingspanM: 9.96,
    wingAreaM2: 27.87,
    meanChordM: 3.45,
    // Calibrated game tail estimates, not manufacturer performance data.
    tailArmM: 4, tailAreaM2: 6, tailInducedFactor: 0.10,
    oswaldEfficiency: 0.75,

    cl0Clean: 0.05,
    claPerRad: 4.2,
    alphaStallDeg: 28.0,
    clFlapBoostMax: 0.35,
    spoilerLiftDump: 0.25,

    cd0Clean: 0.015,
    gearDrag: 0.030,
    spoilerDrag: 0.080,
    transonicMachBuffet: 0.95,

    cm0: 0.0,
    cma: -0.45,
    cmDe: -1.8,
    cmQ: -12.0,

    clBeta: -0.08,
    clDa: 0.35,
    clP: -0.45,
    cnBeta: -0.18,
    cnDr: -0.15,
    cnR: -0.25,
    adverseYaw: -0.010,

    flapAngles: [0, 20]
  },

  stallWarning: { type: 'lowSpeed', marginDeg: 2.0, gearDownAlphaDeg: 15.0 },

  // 3. Propulsion System (Single Afterburning Turbofan)
  propulsion: {
    numEngines: 1,
    engineName: 'F110-GE-129',
    // Centerline engine: no reference-origin thrust pitch moment. CG shifts
    // are accounted for separately by the longitudinal force model.
    pitchMomentArmMeters: 0.0,
    maxStaticThrustPerEngineN: 131000.0,
    idleN1Percent: 60.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 1.2,
    spoolDownTimeSec: 1.5,
    reverseThrustEfficiency: 0.0,
    baseFuelFlowKgPerHour: 600.0,
    maxFuelFlowKgPerHour: 4500.0,
    fuelCapacityKg: 3200.0,
    momentArmMeters: 0.0
  },

  // 4. Landing Gear & Ground Interaction
  landingGear: {
    isFixed: false,
    bodySupportPoints: [
      ['belly', [0, -0.9, 0]], ['nose', [0, 0, -7.8]],
      ['tail', [0, 0, 8]], ['wingL', [-4.98, 0, 1.8]],
      ['wingR', [4.98, 0, 1.8]], ['engineL', [0, -0.7, 7.5]],
    ].map(([id, position], index) => ({ id, key: `${id}:${index}`, position, weight: 1 })),
    cgGroundHeightM: 1.85,
    gearTransitTimeSec: 5.0,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -1.65, z: -2.35 },
        wheelRadius: 0.25,
        restLength: 0.8,
        kSpring: 350000,
        cDamper: 32000,
        isSteerable: true,
        maxSteeringDeg: 35.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -1.1, y: -1.65, z: 1.65 },
        wheelRadius: 0.35,
        restLength: 0.8,
        kSpring: 450000,
        cDamper: 40000,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 1.1, y: -1.65, z: 1.65 },
        wheelRadius: 0.35,
        restLength: 0.8,
        kSpring: 450000,
        cDamper: 40000,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.55,
    tireLateralFriction: 0.80
  },

  // 5. Cockpit Camera & Instrument Layout
  cockpit: {
    hasPhotoCockpit: false,
    captainEyePos: { x: 0.0, y: 0.94, z: -3.60 },
    portraitEyeX: 0.0, // Single seat stays centered in narrow viewports too.
    portraitEyeY: 0.94,
    defaultLookPitchRad: -0.04, // -2.3° boresight level with HUD optical center
    defaultFov: 75.0,
    exteriorFov: 60.0,
    chaseDistance: 18.0,
    chaseHeight: 4.5,
    droneDistance: 14.0,
    droneHeight: 4.8,
    gearCamOffset: { x: 3.0, y: -3.0, z: 5.0 },
    gearLookTarget: { x: 0.0, y: -1.0, z: -0.3 }
  }
};

export const CESSNA_172 = {
  id: 'C172',
  massDistribution: C172_MASS_DISTRIBUTION,
  name: 'Cessna 172 Skyhawk',
  description: 'Single-engine four-seat high-wing general aviation aircraft with piston engine',

  // 1. Mass & Inertial Properties
  massProperties: {
    emptyWeightKg: 767,
    maxTakeoffWeightKg: 1157,
    currentMassKg: 1050.0,
    Ixx: 1285.0,
    Iyy: 1825.0,
    Izz: 2667.0
  },

  // 2. Aerodynamic Geometry & Stability Derivatives
  aerodynamics: {
    wingspanM: 11.0,
    wingAreaM2: 16.2,
    meanChordM: 1.47,
    // Calibrated game tail estimates, not manufacturer performance data.
    tailArmM: 4, tailAreaM2: 4, tailInducedFactor: 0.10,
    oswaldEfficiency: 0.80,

    cl0Clean: 0.35,
    claPerRad: 5.1,
    alphaStallDeg: 14.0,
    clFlapBoostMax: 0.65,
    spoilerLiftDump: 0.0,

    cd0Clean: 0.027,
    gearDrag: 0.015,
    spoilerDrag: 0.0,
    transonicMachBuffet: 0.60,

    cm0: -0.04,
    cma: -0.75,
    cmDe: -1.35,
    cmQ: -14.0,

    clBeta: -0.09,
    clDa: 0.22,
    clP: -0.50,
    cnBeta: 0.12,
    cnDr: -0.09,
    cnR: -0.18,
    adverseYaw: -0.020,

    flapAngles: [0, 10, 20, 30]
  },

  stallWarning: { type: 'pneumaticHorn', referenceMarginKnots: 7.5 },

  // 3. Propulsion System (Single Piston Engine)
  propulsion: {
    numEngines: 1,
    engineName: 'Lycoming IO-360-L2A',
    maxStaticThrustPerEngineN: 3200.0,
    idleN1Percent: 25.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 0.8,
    spoolDownTimeSec: 0.8,
    reverseThrustEfficiency: 0.0,
    baseFuelFlowKgPerHour: 28.0,
    maxFuelFlowKgPerHour: 48.0,
    fuelCapacityKg: 144.0,
    momentArmMeters: 0.0
  },

  // Synthesized piston/propeller sound tuning. RPM is estimated from the
  // current normalized engine telemetry, rather than treated as turbine N1.
  audio: {
    engineType: 'piston',
    idleRpm: 700,
    maxRpm: 2700,
    cylinders: 4,
    propellerBlades: 2
  },

  // 4. Landing Gear & Ground Interaction (Fixed Tricycle Gear)
  landingGear: {
    isFixed: true,
    cgGroundHeightM: 1.35,
    gearTransitTimeSec: 0.1,
    bodySupportPoints: C172_BODY_SUPPORT_POINTS,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -1.1, z: -1.5 },
        wheelRadius: 0.20,
        restLength: 0.5,
        kSpring: 120000,
        cDamper: 15000,
        isSteerable: true,
        maxSteeringDeg: 30.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -1.05, y: -1.15, z: 0.4 },
        wheelRadius: 0.25,
        restLength: 0.5,
        kSpring: 180000,
        cDamper: 20000,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 1.05, y: -1.15, z: 0.4 },
        wheelRadius: 0.25,
        restLength: 0.5,
        kSpring: 180000,
        cDamper: 20000,
        isSteerable: false
      }
    ],
    rollingFriction: 0.025,
    maxBrakingFriction: 0.40,
    tireLateralFriction: 0.70
  },

  // 5. Cockpit Camera & Instrument Layout
  cockpit: {
    hasPhotoCockpit: false,
    captainEyePos: { x: -0.22, y: 0.72, z: -1.18 },
    defaultLookPitchRad: -0.05,
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 14.0,
    chaseHeight: 3.2,
    droneDistance: 12.0,
    droneHeight: 3.5,
    gearCamOffset: { x: 0.8, y: -0.6, z: 1.2 },
    gearLookTarget: { x: 0.0, y: -0.8, z: -0.2 }
  }
};

export const AIRBUS_A320 = {
  id: 'A320',
  name: 'Airbus A320-200',
  description: 'Twin-engine narrow-body jet airliner with CFM56-5B high-bypass turbofans',
  massProperties: {
    emptyWeightKg: 42600,
    maxTakeoffWeightKg: 77000,
    currentMassKg: 68000.0,
    Ixx: 1700000.0,
    Iyy: 3660000.0,
    Izz: 5070000.0
  },
  massDistribution: {
    referenceMassKg: 68000,
    initialFuelKg: 13970,
    initialPayloadKg: 11430,
    tanks: [
      { id: 'main', capacityKg: 19000, priority: 0, position: { x: 0, y: 0, z: 0 } }
    ],
    stations: [
      { id: 'payload', capacityKg: 77000, position: { x: 0, y: 0, z: 0 } }
    ]
  },
  aerodynamics: {
    wingspanM: 35.80,
    wingAreaM2: 122.6,
    meanChordM: 4.19,
    tailArmM: 12.18,
    tailAreaM2: 31.48,
    tailInducedFactor: 0.10,
    oswaldEfficiency: 0.83,
    cl0Clean: 0.24,
    claPerRad: 5.45,
    alphaStallDeg: 14.6,
    clFlapBoostMax: 0.95,
    spoilerLiftDump: 0.38,
    cd0Clean: 0.0195,
    gearDrag: 0.024,
    spoilerDrag: 0.075,
    transonicMachBuffet: 0.78,
    cm0: -0.02,
    cma: -0.90,
    cmDe: -1.45,
    cmQ: -26.0,
    clBeta: -0.14,
    clDa: 0.18,
    clP: -0.65,
    cnBeta: -0.22,
    cnDr: -0.12,
    cnR: -0.32,
    adverseYaw: -0.025,
    flapAngles: [0, 10, 25, 40]
  },
  stallWarning: { type: 'stickShaker', marginDeg: 2.0 },
  propulsion: {
    numEngines: 2,
    engineName: 'CFM56-5B4 Turbofans',
    maxStaticThrustPerEngineN: 120000,
    idleN1Percent: 22.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 3.2,
    spoolDownTimeSec: 2.4,
    reverseThrustEfficiency: 0.45,
    baseFuelFlowKgPerHour: 360.0,
    maxFuelFlowKgPerHour: 2575.0,
    fuelCapacityKg: 19000
  },
  landingGear: {
    isFixed: false,
    cgGroundHeightM: 3.5,
    gearTransitTimeSec: 8.0,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -3.27, z: -12.5 },
        wheelRadius: 0.38,
        restLength: 0.9,
        kSpring: 432700,
        cDamper: 48700,
        isSteerable: true,
        maxSteeringDeg: 55.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -3.2, y: -3.30, z: 0.9 },
        wheelRadius: 0.48,
        restLength: 0.9,
        kSpring: 875700,
        cDamper: 73100,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 3.2, y: -3.30, z: 0.9 },
        wheelRadius: 0.48,
        restLength: 0.9,
        kSpring: 875700,
        cDamper: 73100,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.45,
    tireLateralFriction: 0.75
  },
  cockpit: {
    hasPhotoCockpit: true,
    captainEyePos: { x: -0.303, y: 0.88, z: -12.35 },
    portraitEyeX: -0.303,
    portraitEyeY: 0.88,
    defaultLookPitchRad: -0.08,
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 55.0,
    chaseHeight: 10.5,
    droneDistance: 38.0,
    droneHeight: 11.5,
    gearCamOffset: { x: 2.2, y: -2.4, z: 6.2 },
    gearLookTarget: { x: -0.5, y: -1.9, z: -2.5 }
  }
};

export const BOEING_747_400 = {
  id: 'B747',
  name: 'Boeing 747-400',
  description: 'Four-engine wide-body commercial airliner with GE CF6-80C2 high-bypass turbofans',
  massProperties: {
    emptyWeightKg: 179014,
    maxTakeoffWeightKg: 396893,
    currentMassKg: 320000.0,
    Ixx: 25920000.0,
    Iyy: 81060000.0,
    Izz: 95080000.0
  },
  massDistribution: {
    referenceMassKg: 396893,
    initialFuelKg: 77542,
    initialPayloadKg: 63444,
    tanks: [
      { id: 'main', capacityKg: 173480, priority: 0, position: { x: 0, y: 0, z: 0 } }
    ],
    stations: [
      { id: 'payload', capacityKg: 396893, position: { x: 0, y: 0, z: 0 } }
    ]
  },
  aerodynamics: {
    wingspanM: 64.44,
    wingAreaM2: 525.0,
    meanChordM: 8.32,
    tailArmM: 26.4,
    tailAreaM2: 134.8,
    tailInducedFactor: 0.10,
    oswaldEfficiency: 0.80,
    cl0Clean: 0.26,
    claPerRad: 5.05,
    alphaStallDeg: 14.9,
    clFlapBoostMax: 0.95,
    spoilerLiftDump: 0.38,
    cd0Clean: 0.0215,
    gearDrag: 0.024,
    spoilerDrag: 0.075,
    transonicMachBuffet: 0.82,
    cm0: -0.02,
    cma: -0.90,
    cmDe: -1.45,
    cmQ: -36.1,
    clBeta: -0.14,
    clDa: 0.116,
    clP: -0.827,
    cnBeta: -0.22,
    cnDr: -0.107,
    cnR: -0.368,
    adverseYaw: -0.025,
    flapAngles: [0, 10, 25, 40]
  },
  stallWarning: { type: 'stickShaker', marginDeg: 2.0 },
  propulsion: {
    numEngines: 4,
    engineName: 'GE CF6-80C2B5F Turbofans',
    maxStaticThrustPerEngineN: 276000,
    idleN1Percent: 22.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 3.5,
    spoolDownTimeSec: 2.6,
    reverseThrustEfficiency: 0.45,
    baseFuelFlowKgPerHour: 1696.0,
    maxFuelFlowKgPerHour: 12120.0,
    fuelCapacityKg: 173480
  },
  landingGear: {
    isFixed: false,
    cgGroundHeightM: 4.8,
    gearTransitTimeSec: 10.0,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -4.5, z: -20.0 },
        wheelRadius: 0.61,
        restLength: 1.44,
        kSpring: 2036000,
        cDamper: 105600,
        isSteerable: true,
        maxSteeringDeg: 55.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -5.12, y: -4.55, z: 1.44 },
        wheelRadius: 0.77,
        restLength: 1.44,
        kSpring: 4120000,
        cDamper: 158400,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 5.12, y: -4.55, z: 1.44 },
        wheelRadius: 0.77,
        restLength: 1.44,
        kSpring: 4120000,
        cDamper: 158400,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.45,
    tireLateralFriction: 0.75
  },
  cockpit: {
    hasPhotoCockpit: true,
    captainEyePos: { x: -0.42, y: 2.8, z: -24.5 },
    portraitEyeX: -0.42,
    portraitEyeY: 2.8,
    defaultLookPitchRad: -0.08,
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 85.0,
    chaseHeight: 16.0,
    droneDistance: 60.0,
    droneHeight: 18.0,
    gearCamOffset: { x: 3.5, y: -3.5, z: 10.0 },
    gearLookTarget: { x: -0.5, y: -2.5, z: -4.0 }
  }
};

export const DC10_30 = {
  id: 'DC10',
  name: 'McDonnell Douglas DC-10-30',
  description: 'Three-engine wide-body jet airliner with two underwing turbofans and one tail-mounted engine',
  massProperties: {
    emptyWeightKg: 121563,
    maxTakeoffWeightKg: 259460,
    currentMassKg: 215000.0,
    Ixx: 10650000.0,
    Iyy: 36600000.0,
    Izz: 41400000.0
  },
  massDistribution: {
    referenceMassKg: 259460,
    initialFuelKg: 51390,
    initialPayloadKg: 42047,
    tanks: [
      { id: 'main', capacityKg: 111100, priority: 0, position: { x: 0, y: 0, z: 0 } }
    ],
    stations: [
      { id: 'payload', capacityKg: 259460, position: { x: 0, y: 0, z: 0 } }
    ]
  },
  aerodynamics: {
    wingspanM: 50.40,
    wingAreaM2: 367.7,
    meanChordM: 7.50,
    tailArmM: 21.6,
    tailAreaM2: 94.4,
    tailInducedFactor: 0.10,
    oswaldEfficiency: 0.78,
    cl0Clean: 0.25,
    claPerRad: 4.95,
    alphaStallDeg: 14.6,
    clFlapBoostMax: 0.90,
    spoilerLiftDump: 0.38,
    cd0Clean: 0.0225,
    gearDrag: 0.024,
    spoilerDrag: 0.075,
    transonicMachBuffet: 0.80,
    cm0: -0.02,
    cma: -0.90,
    cmDe: -1.45,
    cmQ: -30.3,
    clBeta: -0.14,
    clDa: 0.134,
    clP: -0.709,
    cnBeta: -0.22,
    cnDr: -0.112,
    cnR: -0.336,
    adverseYaw: -0.025,
    flapAngles: [0, 10, 25, 40]
  },
  stallWarning: { type: 'stickShaker', marginDeg: 2.0 },
  propulsion: {
    numEngines: 3,
    engineName: 'GE CF6-50C2 Turbofans',
    maxStaticThrustPerEngineN: 233500,
    idleN1Percent: 22.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 3.4,
    spoolDownTimeSec: 2.5,
    reverseThrustEfficiency: 0.45,
    baseFuelFlowKgPerHour: 1140.0,
    maxFuelFlowKgPerHour: 8145.0,
    fuelCapacityKg: 111100
  },
  landingGear: {
    isFixed: false,
    cgGroundHeightM: 4.2,
    gearTransitTimeSec: 9.0,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -3.8, z: -17.6 },
        wheelRadius: 0.53,
        restLength: 1.27,
        kSpring: 1368000,
        cDamper: 86600,
        isSteerable: true,
        maxSteeringDeg: 55.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -4.5, y: -3.85, z: 1.27 },
        wheelRadius: 0.67,
        restLength: 1.27,
        kSpring: 2770000,
        cDamper: 130000,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 4.5, y: -3.85, z: 1.27 },
        wheelRadius: 0.67,
        restLength: 1.27,
        kSpring: 2770000,
        cDamper: 130000,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.45,
    tireLateralFriction: 0.75
  },
  cockpit: {
    hasPhotoCockpit: true,
    captainEyePos: { x: -0.38, y: 1.9, z: -19.2 },
    portraitEyeX: -0.38,
    portraitEyeY: 1.9,
    defaultLookPitchRad: -0.08,
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 70.0,
    chaseHeight: 13.0,
    droneDistance: 48.0,
    droneHeight: 14.5,
    gearCamOffset: { x: 2.8, y: -3.0, z: 8.0 },
    gearLookTarget: { x: -0.5, y: -2.0, z: -3.0 }
  }
};

export const MD82 = {
  id: 'MD80',
  name: 'McDonnell Douglas MD-82',
  description: 'Twin-engine narrow-body airliner with aft fuselage-mounted JT8D turbofans and T-tail',
  massProperties: {
    emptyWeightKg: 37300,
    maxTakeoffWeightKg: 67812,
    currentMassKg: 58000.0,
    Ixx: 1220000.0,
    Iyy: 2660000.0,
    Izz: 3660000.0
  },
  massDistribution: {
    referenceMassKg: 58000,
    initialFuelKg: 11385,
    initialPayloadKg: 9315,
    tanks: [
      { id: 'main', capacityKg: 18944, priority: 0, position: { x: 0, y: 0, z: 0 } }
    ],
    stations: [
      { id: 'payload', capacityKg: 67812, position: { x: 0, y: 0, z: 0 } }
    ]
  },
  aerodynamics: {
    wingspanM: 32.82,
    wingAreaM2: 112.3,
    meanChordM: 3.62,
    tailArmM: 11.25,
    tailAreaM2: 28.84,
    tailInducedFactor: 0.10,
    oswaldEfficiency: 0.81,
    cl0Clean: 0.23,
    claPerRad: 5.15,
    alphaStallDeg: 14.0,
    clFlapBoostMax: 0.92,
    spoilerLiftDump: 0.38,
    cd0Clean: 0.0205,
    gearDrag: 0.024,
    spoilerDrag: 0.075,
    transonicMachBuffet: 0.78,
    cm0: -0.02,
    cma: -0.90,
    cmDe: -1.53,
    cmQ: -27.4,
    clBeta: -0.14,
    clDa: 0.167,
    clP: -0.62,
    cnBeta: -0.22,
    cnDr: -0.123,
    cnR: -0.32,
    adverseYaw: -0.025,
    flapAngles: [0, 10, 25, 40]
  },
  stallWarning: { type: 'stickShaker', marginDeg: 2.0 },
  propulsion: {
    numEngines: 2,
    engineName: 'P&W JT8D-217C Turbofans',
    maxStaticThrustPerEngineN: 93000,
    idleN1Percent: 22.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 3.1,
    spoolDownTimeSec: 2.3,
    reverseThrustEfficiency: 0.45,
    baseFuelFlowKgPerHour: 307.0,
    maxFuelFlowKgPerHour: 2195.0,
    fuelCapacityKg: 18944
  },
  landingGear: {
    isFixed: false,
    cgGroundHeightM: 3.2,
    gearTransitTimeSec: 7.5,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -3.0, z: -11.5 },
        wheelRadius: 0.35,
        restLength: 0.82,
        kSpring: 369000,
        cDamper: 45000,
        isSteerable: true,
        maxSteeringDeg: 55.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -2.93, y: -3.05, z: 0.82 },
        wheelRadius: 0.44,
        restLength: 0.82,
        kSpring: 747000,
        cDamper: 67500,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 2.93, y: -3.05, z: 0.82 },
        wheelRadius: 0.44,
        restLength: 0.82,
        kSpring: 747000,
        cDamper: 67500,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.45,
    tireLateralFriction: 0.75
  },
  cockpit: {
    hasPhotoCockpit: true,
    captainEyePos: { x: -0.29, y: 0.82, z: -11.8 },
    portraitEyeX: -0.29,
    portraitEyeY: 0.82,
    defaultLookPitchRad: -0.08,
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 50.0,
    chaseHeight: 9.8,
    droneDistance: 36.0,
    droneHeight: 10.8,
    gearCamOffset: { x: 2.0, y: -2.2, z: 5.8 },
    gearLookTarget: { x: -0.5, y: -1.8, z: -2.2 }
  }
};

export const CONCORDE = {
  id: 'CONCORDE',
  name: 'Aérospatiale/BAC Concorde',
  description: 'Supersonic passenger airliner featuring ogival delta wing and four Rolls-Royce/Snecma Olympus 593 turbojets with reheat',
  massProperties: {
    emptyWeightKg: 78700,
    maxTakeoffWeightKg: 185070,
    currentMassKg: 150000.0,
    Ixx: 1916000.0,
    Iyy: 17830000.0,
    Izz: 15350000.0
  },
  massDistribution: {
    referenceMassKg: 185070,
    initialFuelKg: 39215,
    initialPayloadKg: 32085,
    tanks: [
      { id: 'main', capacityKg: 95680, priority: 0, position: { x: 0, y: 0, z: 0 } }
    ],
    stations: [
      { id: 'payload', capacityKg: 185070, position: { x: 0, y: 0, z: 0 } }
    ]
  },
  aerodynamics: {
    wingspanM: 25.60,
    wingAreaM2: 358.25,
    meanChordM: 15.50,
    tailArmM: 18.1,
    tailAreaM2: 92.0,
    tailInducedFactor: 0.10,
    oswaldEfficiency: 0.65,
    cl0Clean: 0.12,
    claPerRad: 3.2,
    alphaStallDeg: 20.6,
    clFlapBoostMax: 0.0,
    spoilerLiftDump: 0.25,
    cd0Clean: 0.0175,
    gearDrag: 0.024,
    spoilerDrag: 0.075,
    transonicMachBuffet: 1.15,
    cm0: -0.02,
    cma: -0.90,
    cmDe: -1.63,
    cmQ: -24.5,
    clBeta: -0.14,
    clDa: 0.193,
    clP: -0.53,
    cnBeta: -0.22,
    cnDr: -0.128,
    cnR: -0.304,
    adverseYaw: -0.025,
    flapAngles: [0, 0, 0, 0]
  },
  stallWarning: { type: 'stickShaker', marginDeg: 3.0 },
  propulsion: {
    numEngines: 4,
    engineName: 'Olympus 593 Mk 610 Turbojets',
    maxStaticThrustPerEngineN: 169300,
    idleN1Percent: 22.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 3.0,
    spoolDownTimeSec: 2.2,
    reverseThrustEfficiency: 0.25,
    baseFuelFlowKgPerHour: 795.0,
    maxFuelFlowKgPerHour: 5680.0,
    fuelCapacityKg: 95680
  },
  landingGear: {
    isFixed: false,
    cgGroundHeightM: 3.8,
    gearTransitTimeSec: 8.5,
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -3.5, z: -15.5 },
        wheelRadius: 0.45,
        restLength: 1.0,
        kSpring: 954000,
        cDamper: 72400,
        isSteerable: true,
        maxSteeringDeg: 55.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -3.8, y: -3.55, z: 1.1 },
        wheelRadius: 0.58,
        restLength: 1.0,
        kSpring: 1930000,
        cDamper: 108600,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 3.8, y: -3.55, z: 1.1 },
        wheelRadius: 0.58,
        restLength: 1.0,
        kSpring: 1930000,
        cDamper: 108600,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.45,
    tireLateralFriction: 0.75
  },
  cockpit: {
    hasPhotoCockpit: true,
    captainEyePos: { x: -0.32, y: 1.2, z: -20.5 },
    portraitEyeX: -0.32,
    portraitEyeY: 1.2,
    defaultLookPitchRad: -0.08,
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 65.0,
    chaseHeight: 11.5,
    droneDistance: 45.0,
    droneHeight: 12.5,
    gearCamOffset: { x: 2.5, y: -2.6, z: 7.2 },
    gearLookTarget: { x: -0.5, y: -1.9, z: -2.8 }
  }
};

export const CANADAIR_CL215 = {
  id: 'CL215',
  name: 'Canadair CL-215 Amphibian',
  description: 'Twin-engine amphibious flying boat designed for aerial firefighting and water landings',
  isAmphibious: true,
  massProperties: {
    emptyWeightKg: 12220,
    maxTakeoffWeightKg: 19731,
    currentMassKg: 17100.0,
    Ixx: 273000.0,
    Iyy: 231000.0,
    Izz: 565000.0
  },
  massDistribution: {
    referenceMassKg: 17100,
    initialFuelKg: 2684,
    initialPayloadKg: 2196,
    tanks: [
      { id: 'main', capacityKg: 4250, priority: 0, position: { x: 0, y: 0, z: 0 } }
    ],
    stations: [
      { id: 'payload', capacityKg: 19731, position: { x: 0, y: 0, z: 0 } }
    ]
  },
  aerodynamics: {
    wingspanM: 28.60,
    wingAreaM2: 100.33,
    meanChordM: 3.54,
    tailArmM: 6.1,
    tailAreaM2: 25.8,
    tailInducedFactor: 0.10,
    oswaldEfficiency: 0.75,
    cl0Clean: 0.32,
    claPerRad: 5.0,
    alphaStallDeg: 14.9,
    clFlapBoostMax: 0.85,
    spoilerLiftDump: 0.30,
    cd0Clean: 0.034,
    gearDrag: 0.024,
    spoilerDrag: 0.075,
    transonicMachBuffet: 0.50,
    cm0: -0.02,
    cma: -0.90,
    cmDe: -1.71,
    cmQ: -23.1,
    clBeta: -0.14,
    clDa: 0.175,
    clP: -0.53,
    cnBeta: -0.22,
    cnDr: -0.133,
    cnR: -0.272,
    adverseYaw: -0.025,
    flapAngles: [0, 10, 25, 40]
  },
  stallWarning: { type: 'stickShaker', marginDeg: 2.0 },
  propulsion: {
    numEngines: 2,
    engineName: 'Pratt & Whitney R-2800-83AM Radials',
    maxStaticThrustPerEngineN: 31000,
    idleN1Percent: 18.0,
    togaN1Percent: 100.0,
    spoolUpTimeSec: 2.0,
    spoolDownTimeSec: 1.6,
    reverseThrustEfficiency: 0.35,
    baseFuelFlowKgPerHour: 90.0,
    maxFuelFlowKgPerHour: 647.0,
    fuelCapacityKg: 4250
  },
  landingGear: {
    isFixed: true,
    cgGroundHeightM: 2.8,
    gearTransitTimeSec: 0.1,
    bodySupportPoints: [
      { id: 'belly', key: 'belly:0', position: [0, -1.8, -4.8], weight: 1 / 3 },
      { id: 'belly', key: 'belly:1', position: [0, -1.8, 0.0], weight: 1 / 3 },
      { id: 'belly', key: 'belly:2', position: [0, -1.6, 4.8], weight: 1 / 3 },
      { id: 'nose', key: 'nose:3', position: [0, -1.5, -8.8], weight: 1 },
      { id: 'tail', key: 'tail:4', position: [0, -0.8, 10.5], weight: 1 },
      { id: 'wingL', key: 'wingL:5', position: [-13.5, -1.0, 0.5], weight: 1 },
      { id: 'wingR', key: 'wingR:6', position: [13.5, -1.0, 0.5], weight: 1 }
    ],
    contacts: [
      {
        id: 'nose',
        name: 'Nose Gear',
        localPos: { x: 0.0, y: -2.6, z: -10.0 },
        wheelRadius: 0.30,
        restLength: 0.72,
        kSpring: 108800,
        cDamper: 24400,
        isSteerable: true,
        maxSteeringDeg: 55.0
      },
      {
        id: 'mainLeft',
        name: 'Left Main Gear',
        localPos: { x: -2.56, y: -2.65, z: 0.72 },
        wheelRadius: 0.38,
        restLength: 0.72,
        kSpring: 220000,
        cDamper: 36600,
        isSteerable: false
      },
      {
        id: 'mainRight',
        name: 'Right Main Gear',
        localPos: { x: 2.56, y: -2.65, z: 0.72 },
        wheelRadius: 0.38,
        restLength: 0.72,
        kSpring: 220000,
        cDamper: 36600,
        isSteerable: false
      }
    ],
    rollingFriction: 0.02,
    maxBrakingFriction: 0.45,
    tireLateralFriction: 0.75
  },
  cockpit: {
    hasPhotoCockpit: true,
    captainEyePos: { x: -0.32, y: 0.9, z: -6.5 },
    portraitEyeX: -0.32,
    portraitEyeY: 0.9,
    defaultLookPitchRad: -0.08,
    defaultFov: 68.0,
    exteriorFov: 55.0,
    chaseDistance: 45.0,
    chaseHeight: 8.5,
    droneDistance: 32.0,
    droneHeight: 9.5,
    gearCamOffset: { x: 1.8, y: -1.8, z: 4.8 },
    gearLookTarget: { x: -0.5, y: -1.5, z: -1.8 }
  }
};

/**
 * Registry of available aircraft configurations
 */
export const AIRCRAFT_REGISTRY = {
  B738: BOEING_737_800,
  F16: F16_FALCON,
  C172: CESSNA_172,
  A320: AIRBUS_A320,
  B747: BOEING_747_400,
  DC10: DC10_30,
  MD80: MD82,
  CONCORDE: CONCORDE,
  CL215: CANADAIR_CL215,
  AMPHIBIAN: CANADAIR_CL215
};

export const DEFAULT_AIRCRAFT_ID = 'B738';

/**
 * Aircraft Structural Specifications, G-Force limits and Touchdown Ratings.
 * Defines limit load, ultimate load (1.5x limit), oleo strut characteristics,
 * and dynamic touchdown evaluation thresholds per aircraft category.
 */
export const AIRCRAFT_SPECS = Object.freeze({
  B738: Object.freeze({
    id: 'B738',
    name: 'Boeing 737-800',
    type: 'airliner',
    // Structural flight limits: Flaps UP: -1.0G ~ +2.5G, Flaps DOWN: 0.0G ~ +2.0G
    limitLoad: Object.freeze({ min: -1.0, max: 2.5, flapsDownMin: 0.0, flapsDownMax: 2.0 }),
    // Ultimate load (1.5x limit factor)
    ultimateLoad: Object.freeze({ min: -1.5, max: 3.75, flapsDownMin: 0.0, flapsDownMax: 3.0 }),
    oleoStrokeM: 0.40, // 35-45 cm cushion travel
    hardLandingGThreshold: 1.55,
    crashGThreshold: 2.10,
    landingRatings: Object.freeze([
      { id: 'butter', maxG: 1.25, maxSinkFpm: 150, labelKey: 'debrief.rating.butter' },
      { id: 'normal', maxG: 1.55, maxSinkFpm: 300, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 1.80, maxSinkFpm: 500, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 2.10, maxSinkFpm: 600, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.10, minSinkFpm: 600, labelKey: 'debrief.rating.damage' }
    ])
  }),
  F16: Object.freeze({
    id: 'F16',
    name: 'F-16 Fighting Falcon',
    type: 'fighter',
    // Structural flight limits: -3.0G ~ +9.0G (FBW G-limiter)
    limitLoad: Object.freeze({ min: -3.0, max: 9.0 }),
    // Ultimate load (1.5x limit factor)
    ultimateLoad: Object.freeze({ min: -4.5, max: 13.5 }),
    oleoStrokeM: 0.30,
    hardLandingGThreshold: 2.20,
    crashGThreshold: 3.50,
    landingRatings: Object.freeze([
      { id: 'soft', maxG: 1.50, maxSinkFpm: 300, labelKey: 'debrief.rating.soft' },
      { id: 'normal', maxG: 2.20, maxSinkFpm: 600, labelKey: 'debrief.rating.normalMilitary' },
      { id: 'firm', maxG: 3.00, maxSinkFpm: 900, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 3.50, maxSinkFpm: 1200, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 3.50, minSinkFpm: 1200, labelKey: 'debrief.rating.damage' }
    ])
  }),
  C172: Object.freeze({
    id: 'C172',
    name: 'Cessna 172 Skyhawk',
    type: 'generalAviation',
    // Structural flight limits: Normal: -1.52G ~ +3.8G, Utility: +4.4G
    limitLoad: Object.freeze({ min: -1.52, max: 3.8, utilityMax: 4.4 }),
    // Ultimate load (1.5x limit factor)
    ultimateLoad: Object.freeze({ min: -2.28, max: 5.7, utilityMax: 6.6 }),
    oleoStrokeM: 0.15, // Spring-steel leaf gear
    hardLandingGThreshold: 1.70,
    crashGThreshold: 2.50,
    landingRatings: Object.freeze([
      { id: 'smooth', maxG: 1.30, maxSinkFpm: 200, labelKey: 'debrief.rating.smooth' },
      { id: 'normal', maxG: 1.70, maxSinkFpm: 400, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 2.20, maxSinkFpm: 600, labelKey: 'debrief.rating.firmBouncing' },
      { id: 'severeHard', maxG: 2.50, maxSinkFpm: 800, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.50, minSinkFpm: 800, labelKey: 'debrief.rating.damage' }
    ])
  }),
  A320: Object.freeze({
    id: 'A320',
    name: 'Airbus A320-200',
    type: 'airliner',
    limitLoad: Object.freeze({ min: -1.0, max: 2.5, flapsDownMin: 0.0, flapsDownMax: 2.0 }),
    ultimateLoad: Object.freeze({ min: -1.5, max: 3.75, flapsDownMin: 0.0, flapsDownMax: 3.0 }),
    oleoStrokeM: 0.40,
    hardLandingGThreshold: 1.55,
    crashGThreshold: 2.10,
    landingRatings: Object.freeze([
      { id: 'butter', maxG: 1.25, maxSinkFpm: 150, labelKey: 'debrief.rating.butter' },
      { id: 'normal', maxG: 1.55, maxSinkFpm: 300, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 1.80, maxSinkFpm: 500, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 2.10, maxSinkFpm: 600, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.10, minSinkFpm: 600, labelKey: 'debrief.rating.damage' }
    ])
  }),
  B747: Object.freeze({
    id: 'B747',
    name: 'Boeing 747-400',
    type: 'airliner',
    limitLoad: Object.freeze({ min: -1.0, max: 2.5, flapsDownMin: 0.0, flapsDownMax: 2.0 }),
    ultimateLoad: Object.freeze({ min: -1.5, max: 3.75, flapsDownMin: 0.0, flapsDownMax: 3.0 }),
    oleoStrokeM: 0.50,
    hardLandingGThreshold: 1.55,
    crashGThreshold: 2.10,
    landingRatings: Object.freeze([
      { id: 'butter', maxG: 1.25, maxSinkFpm: 150, labelKey: 'debrief.rating.butter' },
      { id: 'normal', maxG: 1.55, maxSinkFpm: 300, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 1.80, maxSinkFpm: 500, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 2.10, maxSinkFpm: 600, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.10, minSinkFpm: 600, labelKey: 'debrief.rating.damage' }
    ])
  }),
  DC10: Object.freeze({
    id: 'DC10',
    name: 'McDonnell Douglas DC-10-30',
    type: 'airliner',
    limitLoad: Object.freeze({ min: -1.0, max: 2.5, flapsDownMin: 0.0, flapsDownMax: 2.0 }),
    ultimateLoad: Object.freeze({ min: -1.5, max: 3.75, flapsDownMin: 0.0, flapsDownMax: 3.0 }),
    oleoStrokeM: 0.45,
    hardLandingGThreshold: 1.55,
    crashGThreshold: 2.10,
    landingRatings: Object.freeze([
      { id: 'butter', maxG: 1.25, maxSinkFpm: 150, labelKey: 'debrief.rating.butter' },
      { id: 'normal', maxG: 1.55, maxSinkFpm: 300, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 1.80, maxSinkFpm: 500, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 2.10, maxSinkFpm: 600, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.10, minSinkFpm: 600, labelKey: 'debrief.rating.damage' }
    ])
  }),
  MD80: Object.freeze({
    id: 'MD80',
    name: 'McDonnell Douglas MD-82',
    type: 'airliner',
    limitLoad: Object.freeze({ min: -1.0, max: 2.5, flapsDownMin: 0.0, flapsDownMax: 2.0 }),
    ultimateLoad: Object.freeze({ min: -1.5, max: 3.75, flapsDownMin: 0.0, flapsDownMax: 3.0 }),
    oleoStrokeM: 0.38,
    hardLandingGThreshold: 1.55,
    crashGThreshold: 2.10,
    landingRatings: Object.freeze([
      { id: 'butter', maxG: 1.25, maxSinkFpm: 150, labelKey: 'debrief.rating.butter' },
      { id: 'normal', maxG: 1.55, maxSinkFpm: 300, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 1.80, maxSinkFpm: 500, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 2.10, maxSinkFpm: 600, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.10, minSinkFpm: 600, labelKey: 'debrief.rating.damage' }
    ])
  }),
  CONCORDE: Object.freeze({
    id: 'CONCORDE',
    name: 'Aérospatiale/BAC Concorde',
    type: 'supersonicAirliner',
    limitLoad: Object.freeze({ min: -1.0, max: 2.5, flapsDownMin: -1.0, flapsDownMax: 2.5 }),
    ultimateLoad: Object.freeze({ min: -1.5, max: 3.75, flapsDownMin: -1.5, flapsDownMax: 3.75 }),
    oleoStrokeM: 0.42,
    hardLandingGThreshold: 1.65,
    crashGThreshold: 2.25,
    landingRatings: Object.freeze([
      { id: 'butter', maxG: 1.25, maxSinkFpm: 150, labelKey: 'debrief.rating.butter' },
      { id: 'normal', maxG: 1.65, maxSinkFpm: 350, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 1.95, maxSinkFpm: 550, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 2.25, maxSinkFpm: 700, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.25, minSinkFpm: 700, labelKey: 'debrief.rating.damage' }
    ])
  }),
  CL215: Object.freeze({
    id: 'CL215',
    name: 'Canadair CL-215 Amphibian',
    type: 'amphibian',
    limitLoad: Object.freeze({ min: -1.0, max: 3.25, flapsDownMin: 0.0, flapsDownMax: 2.2 }),
    ultimateLoad: Object.freeze({ min: -1.5, max: 4.87, flapsDownMin: 0.0, flapsDownMax: 3.3 }),
    oleoStrokeM: 0.35,
    hardLandingGThreshold: 1.70,
    crashGThreshold: 2.40,
    landingRatings: Object.freeze([
      { id: 'smooth', maxG: 1.30, maxSinkFpm: 180, labelKey: 'debrief.rating.smooth' },
      { id: 'normal', maxG: 1.70, maxSinkFpm: 380, labelKey: 'debrief.rating.normal' },
      { id: 'firm', maxG: 2.10, maxSinkFpm: 580, labelKey: 'debrief.rating.firm' },
      { id: 'severeHard', maxG: 2.40, maxSinkFpm: 750, labelKey: 'debrief.rating.severeHard' },
      { id: 'crash', minG: 2.40, minSinkFpm: 750, labelKey: 'debrief.rating.damage' }
    ])
  })
});

export const AircraftSpecs = AIRCRAFT_SPECS;

// Attach specs directly to aircraft configuration objects
BOEING_737_800.specs = AIRCRAFT_SPECS.B738;
BOEING_737_800.hardLandingGThreshold = AIRCRAFT_SPECS.B738.hardLandingGThreshold;
BOEING_737_800.crashGThreshold = AIRCRAFT_SPECS.B738.crashGThreshold;

F16_FALCON.specs = AIRCRAFT_SPECS.F16;
F16_FALCON.hardLandingGThreshold = AIRCRAFT_SPECS.F16.hardLandingGThreshold;
F16_FALCON.crashGThreshold = AIRCRAFT_SPECS.F16.crashGThreshold;

CESSNA_172.specs = AIRCRAFT_SPECS.C172;
CESSNA_172.hardLandingGThreshold = AIRCRAFT_SPECS.C172.hardLandingGThreshold;
CESSNA_172.crashGThreshold = AIRCRAFT_SPECS.C172.crashGThreshold;

AIRBUS_A320.specs = AIRCRAFT_SPECS.A320;
AIRBUS_A320.hardLandingGThreshold = AIRCRAFT_SPECS.A320.hardLandingGThreshold;
AIRBUS_A320.crashGThreshold = AIRCRAFT_SPECS.A320.crashGThreshold;

BOEING_747_400.specs = AIRCRAFT_SPECS.B747;
BOEING_747_400.hardLandingGThreshold = AIRCRAFT_SPECS.B747.hardLandingGThreshold;
BOEING_747_400.crashGThreshold = AIRCRAFT_SPECS.B747.crashGThreshold;

DC10_30.specs = AIRCRAFT_SPECS.DC10;
DC10_30.hardLandingGThreshold = AIRCRAFT_SPECS.DC10.hardLandingGThreshold;
DC10_30.crashGThreshold = AIRCRAFT_SPECS.DC10.crashGThreshold;

MD82.specs = AIRCRAFT_SPECS.MD80;
MD82.hardLandingGThreshold = AIRCRAFT_SPECS.MD80.hardLandingGThreshold;
MD82.crashGThreshold = AIRCRAFT_SPECS.MD80.crashGThreshold;

CONCORDE.specs = AIRCRAFT_SPECS.CONCORDE;
CONCORDE.hardLandingGThreshold = AIRCRAFT_SPECS.CONCORDE.hardLandingGThreshold;
CONCORDE.crashGThreshold = AIRCRAFT_SPECS.CONCORDE.crashGThreshold;

CANADAIR_CL215.specs = AIRCRAFT_SPECS.CL215;
CANADAIR_CL215.hardLandingGThreshold = AIRCRAFT_SPECS.CL215.hardLandingGThreshold;
CANADAIR_CL215.crashGThreshold = AIRCRAFT_SPECS.CL215.crashGThreshold;

/**
 * Returns aircraft structural specifications or the default B738 spec.
 * @param {string} aircraftId
 * @returns {typeof AIRCRAFT_SPECS['B738']}
 */
export function getAircraftSpecs(aircraftId) {
  return AIRCRAFT_SPECS[aircraftId] || AIRCRAFT_SPECS.B738;
}

/**
 * Evaluates touchdown performance against the aircraft's specific operational limits.
 * @param {string} aircraftId
 * @param {number} contactG
 * @param {number} [sinkRateFpm=0]
 * @returns {{ rating: string, labelKey: string, isHard: boolean, isCrash: boolean }}
 */
export function classifyLanding(aircraftId, contactG, sinkRateFpm = 0) {
  const specs = getAircraftSpecs(aircraftId);
  const gVal = Number.isFinite(contactG) ? contactG : 1.0;
  const fpm = Number.isFinite(sinkRateFpm) ? sinkRateFpm : 0;

  if (aircraftId === 'B738' || aircraftId === 'A320' || aircraftId === 'B747' || aircraftId === 'DC10' || aircraftId === 'MD80' || aircraftId === 'CONCORDE') {
    if (gVal > specs.crashGThreshold || fpm > 600) {
      return { rating: 'crash', labelKey: 'debrief.rating.damage', isHard: true, isCrash: true };
    }
    if (gVal > 1.80 || fpm > 500) {
      return { rating: 'severeHard', labelKey: 'debrief.rating.severeHard', isHard: true, isCrash: false };
    }
    if (gVal > specs.hardLandingGThreshold || fpm > 300) {
      return { rating: 'firm', labelKey: 'debrief.rating.firm', isHard: true, isCrash: false };
    }
    if (gVal > 1.25 || fpm >= 150) {
      return { rating: 'normal', labelKey: 'debrief.rating.normal', isHard: false, isCrash: false };
    }
    return { rating: 'butter', labelKey: 'debrief.rating.butter', isHard: false, isCrash: false };
  }

  if (aircraftId === 'CL215' || aircraftId === 'AMPHIBIAN') {
    if (gVal > specs.crashGThreshold || fpm > 700) {
      return { rating: 'crash', labelKey: 'debrief.rating.damage', isHard: true, isCrash: true };
    }
    if (gVal > 2.00 || fpm > 550) {
      return { rating: 'severeHard', labelKey: 'debrief.rating.severeHard', isHard: true, isCrash: false };
    }
    if (gVal > specs.hardLandingGThreshold || fpm > 350) {
      return { rating: 'firm', labelKey: 'debrief.rating.firm', isHard: true, isCrash: false };
    }
    if (gVal > 1.30 || fpm >= 180) {
      return { rating: 'normal', labelKey: 'debrief.rating.normal', isHard: false, isCrash: false };
    }
    return { rating: 'smooth', labelKey: 'debrief.rating.smooth', isHard: false, isCrash: false };
  }

  if (aircraftId === 'F16') {
    if (gVal > specs.crashGThreshold) {
      return { rating: 'crash', labelKey: 'debrief.rating.damage', isHard: true, isCrash: true };
    }
    if (gVal > 3.00) {
      return { rating: 'severeHard', labelKey: 'debrief.rating.severeHard', isHard: true, isCrash: false };
    }
    if (gVal > specs.hardLandingGThreshold) {
      return { rating: 'firm', labelKey: 'debrief.rating.firm', isHard: true, isCrash: false };
    }
    if (gVal > 1.50) {
      return { rating: 'normal', labelKey: 'debrief.rating.normalMilitary', isHard: false, isCrash: false };
    }
    return { rating: 'soft', labelKey: 'debrief.rating.soft', isHard: false, isCrash: false };
  }

  if (aircraftId === 'C172') {
    if (gVal > specs.crashGThreshold) {
      return { rating: 'crash', labelKey: 'debrief.rating.damage', isHard: true, isCrash: true };
    }
    if (gVal > 2.20) {
      return { rating: 'severeHard', labelKey: 'debrief.rating.severeHard', isHard: true, isCrash: false };
    }
    if (gVal > specs.hardLandingGThreshold) {
      return { rating: 'firm', labelKey: 'debrief.rating.firmBouncing', isHard: true, isCrash: false };
    }
    if (gVal > 1.30) {
      return { rating: 'normal', labelKey: 'debrief.rating.normal', isHard: false, isCrash: false };
    }
    return { rating: 'smooth', labelKey: 'debrief.rating.smooth', isHard: false, isCrash: false };
  }

  // Fallback generic
  const isCrash = gVal > specs.crashGThreshold;
  const isHard = gVal > specs.hardLandingGThreshold;
  return {
    rating: isCrash ? 'crash' : isHard ? 'firm' : 'normal',
    labelKey: isCrash ? 'debrief.rating.damage' : isHard ? 'debrief.rating.firm' : 'debrief.rating.normal',
    isHard,
    isCrash
  };
}
