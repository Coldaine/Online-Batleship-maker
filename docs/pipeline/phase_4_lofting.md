---
title: "Phase 4: Elastic Lofting"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 4
type: Deterministic
status: Implemented (Basic Hull) / Planned (Elastic Refinement)
---

# Phase 4: Elastic Lofting

## Purpose

Transform extracted profile curves into a valid 3D mesh using hull lofting algorithms. This is the "forge" of the system — geometry generation from mathematical curves.

## Component

**File:** `src/utils/meshGenerator.ts`
**Function:** `generateShipObj()`

## Interface

```typescript
// Input
interface LoftingInput {
  topProfile: Float32Array;      // Beam distribution from Phase 3
  sideProfile: Float32Array;     // Draft distribution from Phase 3
  analysisData: AnalysisData;    // Ship class, dimensions, geometry hints
  params: ShipParameters;        // User adjustments
}

// Output
interface LoftingOutput {
  obj: string;                   // Wavefront OBJ file content
  stats: {
    vertices: number;
    faces: number;
    groups: string[];            // ['hull', 'superstructure', 'turrets']
  };
}

// User parameters
interface ShipParameters {
  hullExtrusion: number;         // % inflation of hull envelope
  turretScale: number;           // % scaling of turret geometry
  superstructureHeight: number;  // % of hull height
  dimensions: {
    length: number;              // meters (from grounding)
    beam: number;                // meters
    draft: number;               // meters
  };
}
```

## Hull Lofting Algorithm

### Concept

"Lofting" is a shipbuilding term for creating a 3D hull from 2D cross-section drawings. We interpolate between cross-sections along the ship's length.

```
Cross-section at bow (z=0)       Cross-section at midships        Cross-section at stern (z=1)
         ╭─╮                            ╭───────╮                          ╭─╮
        ╱   ╲                          ╱         ╲                        ╱   ╲
       │     │                        │           │                      │     │
        ╲   ╱                          ╲         ╱                        ╲   ╱
         ╰─╯                            ╰───────╯                          ╰─╯
     (narrow, shallow)               (wide, deep)                    (narrow, shallow)
```

### Implementation

```typescript
function generateHull(
  topProfile: Float32Array,
  sideProfile: Float32Array,
  params: ShipParameters
): ObjGeometry {
  const { length, beam, draft } = params.dimensions;
  const extrusion = params.hullExtrusion / 100;

  const LENGTH_SEGMENTS = 24;      // Divisions along ship length
  const RADIAL_SEGMENTS = 8;       // Divisions around cross-section

  const vertices: number[][] = [];
  const faces: number[][] = [];

  // Generate vertices for each cross-section
  for (let z = 0; z <= LENGTH_SEGMENTS; z++) {
    const t = z / LENGTH_SEGMENTS;  // Normalized position [0, 1]

    // Sample profiles at this position
    const profileIndex = Math.floor(t * (topProfile.length - 1));
    const beamAtZ = topProfile[profileIndex] * beam * extrusion;
    const draftAtZ = sideProfile[profileIndex] * draft * extrusion;

    // Generate elliptical cross-section
    for (let r = 0; r < RADIAL_SEGMENTS; r++) {
      const angle = (r / RADIAL_SEGMENTS) * Math.PI;  // Half-ellipse (above waterline)

      const x = beamAtZ * Math.cos(angle) / 2;
      const y = draftAtZ * Math.sin(angle);
      const zPos = t * length;

      vertices.push([x, y, zPos]);
    }
  }

  // Generate faces connecting adjacent cross-sections
  for (let z = 0; z < LENGTH_SEGMENTS; z++) {
    for (let r = 0; r < RADIAL_SEGMENTS - 1; r++) {
      const i = z * RADIAL_SEGMENTS + r;

      // Quad face (two triangles)
      faces.push([
        i, i + 1, i + RADIAL_SEGMENTS + 1, i + RADIAL_SEGMENTS
      ]);
    }
  }

  return { vertices, faces, group: 'hull' };
}
```

## Component Generation

### Superstructure

Generated as a box primitive positioned according to geometry hints:

```typescript
function generateSuperstructure(
  analysis: AnalysisData,
  params: ShipParameters
): ObjGeometry {
  const { length, beam } = params.dimensions;
  const heightFactor = params.superstructureHeight / 100;

  const { start, end } = analysis.geometry?.superstructure ?? { start: 0.3, end: 0.6 };

  const box = {
    x: beam * 0.4,                           // Width (narrower than hull)
    y: params.dimensions.draft * heightFactor, // Height
    z: (end - start) * length,               // Length
    position: {
      x: 0,                                  // Centered
      y: params.dimensions.draft,            // On top of hull
      z: start * length                      // Start position
    }
  };

  return generateBox(box, 'superstructure');
}
```

### Turrets

Generated as cylinders with conical tops:

```typescript
function generateTurrets(
  analysis: AnalysisData,
  params: ShipParameters
): ObjGeometry[] {
  const positions = analysis.geometry?.turrets ?? [0.2, 0.3, 0.7, 0.8];
  const scale = params.turretScale / 100;

  return positions.map((zNorm, index) => {
    const turret = {
      radius: params.dimensions.beam * 0.08 * scale,
      height: params.dimensions.draft * 0.3 * scale,
      position: {
        x: 0,
        y: params.dimensions.draft * 0.5,
        z: zNorm * params.dimensions.length
      },
      barrels: 3,  // Triple turret by default
      barrelLength: params.dimensions.beam * 0.15 * scale
    };

    return generateTurretGeometry(turret, `turret_${index}`);
  });
}
```

## OBJ File Format

The Wavefront OBJ format is text-based and universally supported:

```obj
# NavalForge 3D Export
# Ship Class: Yamato-class battleship
# Generated: 2026-01-01

# Hull vertices
g hull
v 0.000 0.000 0.000
v 1.234 5.678 9.012
...

# Hull faces
f 1 2 3 4
f 5 6 7 8
...

# Superstructure
g superstructure
v 10.000 20.000 30.000
...

# Turrets
g turret_0
v 40.000 50.000 60.000
...
```

### Export Function

```typescript
function exportToObj(geometries: ObjGeometry[]): string {
  const lines: string[] = [
    '# NavalForge 3D Export',
    `# Generated: ${new Date().toISOString()}`,
    ''
  ];

  let vertexOffset = 0;

  for (const geo of geometries) {
    lines.push(`g ${geo.group}`);

    // Vertices
    for (const [x, y, z] of geo.vertices) {
      lines.push(`v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
    }

    // Faces (1-indexed, adjusted for offset)
    for (const face of geo.faces) {
      const adjusted = face.map(i => i + vertexOffset + 1);
      lines.push(`f ${adjusted.join(' ')}`);
    }

    vertexOffset += geo.vertices.length;
    lines.push('');
  }

  return lines.join('\n');
}
```

## Mesh Quality

### Current Implementation

| Metric | Value |
|--------|-------|
| Length segments | 24 |
| Radial segments | 8 |
| Hull vertices | ~200 |
| Hull faces | ~180 |
| File size | ~15KB |

### Quality Levels (Planned)

```typescript
enum MeshQuality {
  PREVIEW = 'preview',     // 12 × 6 segments, ~3KB
  STANDARD = 'standard',   // 24 × 8 segments, ~15KB
  HIGH = 'high',           // 48 × 16 segments, ~60KB
  ULTRA = 'ultra'          // 96 × 32 segments, ~250KB
}
```

## Elastic Refinement (Planned)

The "elastic" in elastic lofting refers to future capability to deform the base mesh based on AI feedback:

```
┌─────────────────────────────────────────────────────────────┐
│                    ELASTIC LOFTING LOOP                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Generate base mesh from profiles                        │
│                          │                                  │
│                          ▼                                  │
│  2. Render mesh from multiple angles                        │
│                          │                                  │
│                          ▼                                  │
│  3. Send renders + blueprints to AI                         │
│                          │                                  │
│                          ▼                                  │
│  4. AI returns structured corrections:                      │
│     {                                                       │
│       "bow_angle": -5,     // degrees                       │
│       "hull_curve": 1.15,  // multiplier at waterline       │
│       "stern_taper": 0.8   // reduction factor              │
│     }                                                       │
│                          │                                  │
│                          ▼                                  │
│  5. Apply corrections to mesh vertices                      │
│                          │                                  │
│                          ▼                                  │
│  6. Repeat until converged or max iterations                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Validation

```typescript
function validateMesh(obj: string): MeshValidation {
  const lines = obj.split('\n');
  const vertices = lines.filter(l => l.startsWith('v ')).length;
  const faces = lines.filter(l => l.startsWith('f ')).length;
  const groups = lines.filter(l => l.startsWith('g ')).map(l => l.slice(2));

  // Check for issues
  const issues: string[] = [];

  if (vertices < 10) issues.push('Too few vertices');
  if (faces < 8) issues.push('Too few faces');
  if (!groups.includes('hull')) issues.push('Missing hull group');

  // Check for degenerate faces (same vertex multiple times)
  for (const line of lines.filter(l => l.startsWith('f '))) {
    const indices = line.slice(2).split(' ').map(Number);
    if (new Set(indices).size !== indices.length) {
      issues.push('Degenerate face detected');
    }
  }

  return {
    valid: issues.length === 0,
    vertices,
    faces,
    groups,
    issues
  };
}
```

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Phase 3: Extraction](./phase_3_extraction.md) — Previous phase
- [Phase 5: Refinement](./phase_5_refinement.md) — Next phase
