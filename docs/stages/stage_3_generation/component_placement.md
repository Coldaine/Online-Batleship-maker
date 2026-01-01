---
title: "Stage 3.2: Component Placement"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 3
component: component_placement
status: Specification (Not Implemented)
---

# Component Placement

## Purpose

Generate and place ship components (turrets, superstructure, funnels) on the hull surface using geometry hints from Stage 1.

## The Problem

A hull alone doesn't look like a warship. We need:
- Main gun turrets at correct positions
- Superstructure block in the right location
- Funnels (if applicable)
- All components sized proportionally to the ship

---

## Interface Contract

```typescript
// Input
interface ComponentPlacementInput {
  hullGeometry: ObjGeometry;
  dimensions: {
    length: number;
    beam: number;
    draft: number;
  };
  topProfile: Float32Array;      // For deck width calculation
  geometryHints: {
    turretPositions: number[];   // 0-1 normalized
    superstructure: { start: number; end: number };
    funnelPositions?: number[];
  };
  config?: ComponentConfig;
}

interface ComponentConfig {
  turretConfig: TurretConfig;
  superstructureConfig: SuperstructureConfig;
  funnelConfig?: FunnelConfig;
}

interface TurretConfig {
  barrelsPerTurret: number;      // Default 3
  barrelLength: number;          // As fraction of beam (default 0.4)
  turretHeight: number;          // As fraction of draft (default 0.3)
  turretRadius: number;          // As fraction of beam (default 0.12)
}

interface SuperstructureConfig {
  widthFraction: number;         // Fraction of beam (default 0.4)
  heightFraction: number;        // Fraction of draft (default 0.8)
}

interface FunnelConfig {
  radius: number;                // As fraction of beam (default 0.05)
  height: number;                // As fraction of draft (default 0.6)
}

// Output
interface ComponentPlacementOutput {
  turrets: ObjGeometry[];
  superstructure: ObjGeometry;
  funnels: ObjGeometry[];
}
```

---

## Component Generation

### Superstructure

```typescript
function generateSuperstructure(
  dimensions: Dimensions,
  topProfile: Float32Array,
  bounds: { start: number; end: number },
  config: SuperstructureConfig
): ObjGeometry {
  const { length, beam, draft } = dimensions;

  const startZ = bounds.start * length;
  const endZ = bounds.end * length;
  const width = beam * config.widthFraction;
  const height = draft * config.heightFraction;

  // Base on top of hull (deck level)
  const baseY = draft;

  return generateBox({
    center: [0, baseY + height / 2, (startZ + endZ) / 2],
    dimensions: [width, height, endZ - startZ],
    group: 'superstructure'
  });
}
```

### Turret

```typescript
function generateTurret(
  position: number,              // 0-1 along length
  dimensions: Dimensions,
  topProfile: Float32Array,
  config: TurretConfig,
  index: number
): ObjGeometry {
  const { length, beam, draft } = dimensions;
  const z = position * length;

  // Get hull width at this position
  const profIndex = Math.floor(position * (topProfile.length - 1));
  const hullWidth = topProfile[profIndex] * beam;

  const turretRadius = hullWidth * config.turretRadius;
  const turretHeight = draft * config.turretHeight;
  const baseY = draft;  // On deck

  // Cylinder for turret body
  const cylinder = generateCylinder({
    center: [0, baseY + turretHeight / 2, z],
    radius: turretRadius,
    height: turretHeight,
    segments: 12,
    group: `turret_${index}`
  });

  // Barrels
  const barrels = generateBarrels({
    turretCenter: [0, baseY + turretHeight, z],
    count: config.barrelsPerTurret,
    length: beam * config.barrelLength,
    radius: turretRadius * 0.15,
    spread: turretRadius * 0.8,
    group: `turret_${index}`
  });

  return mergeGeometry([cylinder, barrels]);
}

function generateBarrels(params: BarrelParams): ObjGeometry {
  const { turretCenter, count, length, radius, spread, group } = params;
  const geometries: ObjGeometry[] = [];

  const spacing = spread / (count - 1 || 1);
  const startX = -(count - 1) * spacing / 2;

  for (let i = 0; i < count; i++) {
    const x = startX + i * spacing;
    geometries.push(generateCylinder({
      center: [turretCenter[0] + x, turretCenter[1], turretCenter[2] - length / 2],
      radius,
      height: length,
      segments: 6,
      axis: 'z',  // Barrels point along Z (toward bow)
      group
    }));
  }

  return mergeGeometry(geometries);
}
```

### Funnel

```typescript
function generateFunnel(
  position: number,
  dimensions: Dimensions,
  config: FunnelConfig,
  index: number
): ObjGeometry {
  const { length, beam, draft } = dimensions;
  const z = position * length;

  const radius = beam * config.radius;
  const height = draft * config.height;
  const baseY = draft;  // On deck

  return generateCylinder({
    center: [0, baseY + height / 2, z],
    radius,
    height,
    segments: 12,
    group: `funnel_${index}`
  });
}
```

---

## TDD Goals

### Test 1: Turret Generation
```typescript
describe('turret generation', () => {
  it('should generate correct number of turrets', () => {
    const result = placeComponents({
      ...testInput,
      geometryHints: {
        turretPositions: [0.2, 0.3, 0.7],
        superstructure: { start: 0.4, end: 0.6 }
      }
    });

    expect(result.turrets.length).toBe(3);
    expect(result.turrets[0].group).toBe('turret_0');
    expect(result.turrets[1].group).toBe('turret_1');
    expect(result.turrets[2].group).toBe('turret_2');
  });

  it('should place turrets at correct Z positions', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = placeComponents({
      ...testInput,
      dimensions,
      geometryHints: {
        turretPositions: [0.25, 0.75],
        superstructure: { start: 0.4, end: 0.6 }
      }
    });

    const turret0Center = getGeometryCenter(result.turrets[0]);
    const turret1Center = getGeometryCenter(result.turrets[1]);

    expect(turret0Center[2]).toBeCloseTo(50, 5);   // 0.25 * 200
    expect(turret1Center[2]).toBeCloseTo(150, 5);  // 0.75 * 200
  });

  it('should generate barrels on turrets', () => {
    const result = placeComponents({
      ...testInput,
      config: { turretConfig: { barrelsPerTurret: 3 } }
    });

    // Each turret should have vertices for cylinder + barrels
    const turretVertexCount = result.turrets[0].vertices.length;
    expect(turretVertexCount).toBeGreaterThan(50);  // More than just a cylinder
  });
});
```

### Test 2: Superstructure Generation
```typescript
describe('superstructure generation', () => {
  it('should generate superstructure within bounds', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = placeComponents({
      ...testInput,
      dimensions,
      geometryHints: {
        turretPositions: [],
        superstructure: { start: 0.3, end: 0.5 }
      }
    });

    const superBounds = getGeometryBounds(result.superstructure);

    expect(superBounds.min[2]).toBeGreaterThanOrEqual(60 - 5);  // 0.3 * 200
    expect(superBounds.max[2]).toBeLessThanOrEqual(100 + 5);    // 0.5 * 200
  });

  it('should place superstructure on deck level', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = placeComponents({
      ...testInput,
      dimensions
    });

    const superBounds = getGeometryBounds(result.superstructure);

    // Bottom of superstructure should be at deck level (y = draft)
    expect(superBounds.min[1]).toBeCloseTo(10, 1);
  });

  it('should respect width configuration', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = placeComponents({
      ...testInput,
      dimensions,
      config: { superstructureConfig: { widthFraction: 0.5 } }
    });

    const superBounds = getGeometryBounds(result.superstructure);
    const width = superBounds.max[0] - superBounds.min[0];

    expect(width).toBeCloseTo(15, 1);  // 0.5 * 30
  });
});
```

### Test 3: Funnel Generation
```typescript
describe('funnel generation', () => {
  it('should generate funnels when specified', () => {
    const result = placeComponents({
      ...testInput,
      geometryHints: {
        turretPositions: [0.2],
        superstructure: { start: 0.4, end: 0.6 },
        funnelPositions: [0.45, 0.55]
      }
    });

    expect(result.funnels.length).toBe(2);
    expect(result.funnels[0].group).toBe('funnel_0');
    expect(result.funnels[1].group).toBe('funnel_1');
  });

  it('should place funnels at correct positions', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = placeComponents({
      ...testInput,
      dimensions,
      geometryHints: {
        turretPositions: [],
        superstructure: { start: 0.4, end: 0.6 },
        funnelPositions: [0.5]
      }
    });

    const funnelCenter = getGeometryCenter(result.funnels[0]);
    expect(funnelCenter[2]).toBeCloseTo(100, 5);  // 0.5 * 200
  });

  it('should return empty array when no funnels specified', () => {
    const result = placeComponents({
      ...testInput,
      geometryHints: {
        turretPositions: [0.2],
        superstructure: { start: 0.4, end: 0.6 }
        // No funnelPositions
      }
    });

    expect(result.funnels.length).toBe(0);
  });
});
```

### Test 4: Component Proportions
```typescript
describe('component proportions', () => {
  it('should scale turrets with ship size', () => {
    const smallShip = placeComponents({
      ...testInput,
      dimensions: { length: 100, beam: 15, draft: 5 }
    });

    const largeShip = placeComponents({
      ...testInput,
      dimensions: { length: 200, beam: 30, draft: 10 }
    });

    const smallTurretBounds = getGeometryBounds(smallShip.turrets[0]);
    const largeTurretBounds = getGeometryBounds(largeShip.turrets[0]);

    const smallTurretSize = smallTurretBounds.max[0] - smallTurretBounds.min[0];
    const largeTurretSize = largeTurretBounds.max[0] - largeTurretBounds.min[0];

    // Large turret should be roughly 2x small turret
    expect(largeTurretSize / smallTurretSize).toBeCloseTo(2, 0.5);
  });

  it('should adapt turret size to hull width at position', () => {
    // Create profile where bow is narrower than stern
    const topProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      topProfile[i] = 0.5 + (i / 100) * 0.5;  // 0.5 → 1.0
    }

    const result = placeComponents({
      ...testInput,
      topProfile,
      geometryHints: {
        turretPositions: [0.1, 0.9],  // One near bow, one near stern
        superstructure: { start: 0.4, end: 0.6 }
      }
    });

    const bowTurretBounds = getGeometryBounds(result.turrets[0]);
    const sternTurretBounds = getGeometryBounds(result.turrets[1]);

    const bowTurretSize = bowTurretBounds.max[0] - bowTurretBounds.min[0];
    const sternTurretSize = sternTurretBounds.max[0] - sternTurretBounds.min[0];

    // Stern turret should be larger (wider hull there)
    expect(sternTurretSize).toBeGreaterThan(bowTurretSize);
  });
});
```

---

## Success Criteria

1. ✅ Generate turrets at specified positions
2. ✅ Generate superstructure within specified bounds
3. ✅ Place all components on deck level
4. ✅ Scale components proportionally to ship size
5. ✅ Support configurable component dimensions
6. ✅ Complete component generation in <50ms

---

## Related Documents

- [Stage 3 Overview](./README.md)
- [Lofting](./lofting.md)
- [OBJ Export](./obj_export.md)
