---
title: "Phase 4: Elastic Lofting — Specification"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 4
type: Deterministic
status: Specification (Not Implemented)
---

# Phase 4: Elastic Lofting

## Purpose

Transform profile curves into a valid 3D mesh using hull lofting algorithms. This phase creates geometry from mathematics — no AI, pure deterministic computation.

## The Problem

We have:
- **Top profile**: How wide the ship is at each point along its length
- **Side profile**: How tall the ship is at each point along its length
- **Dimensions**: Real-world length, beam, draft in meters
- **Geometry hints**: Where turrets and superstructure should go

We need to produce a 3D mesh that:
- Has plausible hull cross-sections
- Includes superstructure and turrets
- Is topologically valid (watertight, no holes)
- Can be exported as OBJ

---

## Interface Contract

```typescript
// Input
interface LoftingInput {
  topProfile: ProfileData;       // From Phase 3
  sideProfile: ProfileData;      // From Phase 3
  dimensions: {
    length: number;              // meters
    beam: number;                // meters
    draft: number;               // meters
  };
  geometryHints: {
    turretPositions: number[];   // 0-1 normalized
    superstructure: { start: number; end: number };
  };
  config?: LoftingConfig;
}

interface LoftingConfig {
  lengthSegments: number;        // Default 24
  radialSegments: number;        // Default 8
  hullShape: 'ellipse' | 'rounded_v' | 'flat_bottom';
  generateSuperstructure: boolean;
  generateTurrets: boolean;
  turretConfig?: TurretConfig;
}

interface TurretConfig {
  barrelsPerTurret: number;      // Default 3
  barrelLength: number;          // As fraction of beam
  turretHeight: number;          // As fraction of draft
}

// Output
interface LoftingOutput {
  obj: string;                   // Valid Wavefront OBJ content
  stats: MeshStats;
}

interface MeshStats {
  vertexCount: number;
  faceCount: number;
  groups: string[];              // ['hull', 'superstructure', 'turret_0', ...]
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  estimatedFileSizeBytes: number;
}
```

---

## Pain Points & Challenges

### 1. Cross-Section Shape
**Problem:** We know width and height at each point, but not the actual cross-section shape.

**Approaches:**
- **Ellipse**: Simple, reasonable for many hulls
- **Rounded V**: Better for faster ships
- **Flat bottom**: Better for cargo ships
- **AI-inferred**: Use Gemini to suggest shape (Phase 5)

**Decision for v1:** Use ellipse as default. It's simple, predictable, and "good enough" for visualization. Document as approximation.

### 2. Bow and Stern Shape
**Problem:** Real ships have complex bow shapes (bulbous, clipper, raked) and stern shapes (cruiser, transom, canoe).

**Approaches:**
- **Simple taper**: Just narrow the ellipse to a point
- **Parametric curves**: Use bezier curves for shape
- **Template-based**: Have predefined bow/stern templates

**Decision for v1:** Simple taper. The profile curve already captures the general taper — we just need to scale the cross-section.

### 3. Waterline Alignment
**Problem:** Where is the waterline? Above or below center?

**Approaches:**
- **Assume midpoint**: Waterline is at y=0
- **Draft-based**: Waterline is at draft depth below deck
- **Profile-inferred**: Use side profile to estimate

**Decision:** Assume y=0 is waterline. Everything above is freeboard, below is underwater.

### 4. Mesh Quality vs File Size
**Problem:** More segments = smoother mesh = larger file.

**Balance:**
| Quality | Length Segs | Radial Segs | File Size |
|---------|-------------|-------------|-----------|
| Preview | 12 | 6 | ~5KB |
| Standard | 24 | 8 | ~15KB |
| High | 48 | 16 | ~60KB |

**Decision:** Default to Standard. Allow configuration.

### 5. Component Placement
**Problem:** Where exactly do turrets and superstructure go?

**Approach:** Use normalized positions from Phase 2 geometry hints. Place on deck surface (top of hull at that Z position).

---

## Algorithm Specification

### Hull Lofting

```typescript
function generateHull(
  topProfile: Float32Array,
  sideProfile: Float32Array,
  dimensions: Dimensions,
  config: LoftingConfig
): ObjGeometry {
  const vertices: number[][] = [];
  const faces: number[][] = [];

  const { length, beam, draft } = dimensions;
  const { lengthSegments, radialSegments } = config;

  // Generate cross-sections along ship length
  for (let z = 0; z <= lengthSegments; z++) {
    const t = z / lengthSegments;  // 0 to 1 along ship
    const zPos = t * length;

    // Sample profiles at this position
    const topIndex = Math.floor(t * (topProfile.length - 1));
    const sideIndex = Math.floor(t * (sideProfile.length - 1));

    const widthAtZ = topProfile[topIndex] * beam;
    const heightAtZ = sideProfile[sideIndex] * draft;

    // Generate elliptical cross-section
    for (let r = 0; r <= radialSegments; r++) {
      // Full circle from -π to π (below and above waterline)
      const angle = ((r / radialSegments) * 2 - 1) * Math.PI;

      const x = (widthAtZ / 2) * Math.cos(angle);
      const y = heightAtZ * Math.sin(angle);

      vertices.push([x, y, zPos]);
    }
  }

  // Generate faces connecting adjacent cross-sections
  for (let z = 0; z < lengthSegments; z++) {
    for (let r = 0; r < radialSegments; r++) {
      const ring = radialSegments + 1;
      const i = z * ring + r;

      // Quad as two triangles
      faces.push([i, i + 1, i + ring + 1]);
      faces.push([i, i + ring + 1, i + ring]);
    }
  }

  return { vertices, faces, group: 'hull' };
}
```

### Superstructure Generation

```typescript
function generateSuperstructure(
  topProfile: Float32Array,
  dimensions: Dimensions,
  bounds: { start: number; end: number }
): ObjGeometry {
  const { length, beam, draft } = dimensions;

  // Superstructure box
  const startZ = bounds.start * length;
  const endZ = bounds.end * length;
  const width = beam * 0.4;  // Narrower than hull
  const height = draft * 0.8; // Tall structure

  // Sample hull height at midpoint for base
  const midIndex = Math.floor(((bounds.start + bounds.end) / 2) * topProfile.length);
  const baseY = draft;  // On top of hull

  return generateBox({
    center: [0, baseY + height / 2, (startZ + endZ) / 2],
    dimensions: [width, height, endZ - startZ],
    group: 'superstructure'
  });
}
```

### Turret Generation

```typescript
function generateTurret(
  position: number,        // 0-1 along length
  dimensions: Dimensions,
  topProfile: Float32Array,
  config: TurretConfig,
  index: number
): ObjGeometry {
  const { length, beam, draft } = dimensions;
  const z = position * length;

  // Get hull width at this position for turret sizing
  const profIndex = Math.floor(position * (topProfile.length - 1));
  const hullWidth = topProfile[profIndex] * beam;

  const turretRadius = hullWidth * 0.12;
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
```

### OBJ Export

```typescript
function toObjString(geometries: ObjGeometry[]): string {
  const lines: string[] = [
    '# NavalForge 3D Export',
    `# Generated: ${new Date().toISOString()}`,
    `# Vertices: ${countVertices(geometries)}`,
    `# Faces: ${countFaces(geometries)}`,
    ''
  ];

  let vertexOffset = 0;

  for (const geo of geometries) {
    lines.push(`g ${geo.group}`);
    lines.push(`o ${geo.group}`);

    // Vertices
    for (const [x, y, z] of geo.vertices) {
      lines.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
    }

    // Faces (OBJ uses 1-based indexing)
    for (const face of geo.faces) {
      const indices = face.map(i => i + vertexOffset + 1);
      lines.push(`f ${indices.join(' ')}`);
    }

    vertexOffset += geo.vertices.length;
    lines.push('');
  }

  return lines.join('\n');
}
```

---

## TDD Goals

### Test 1: Valid OBJ Output
**Goal:** Generated OBJ is syntactically valid and parseable.

```typescript
describe('OBJ generation', () => {
  it('should produce valid OBJ syntax', () => {
    const result = generateShipObj(testInput);

    // Every line should be valid OBJ
    const lines = result.obj.split('\n');
    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '') continue;
      expect(line).toMatch(/^(v|f|g|o|vn|vt|s)\s/);
    }
  });

  it('should be parseable by standard OBJ parser', () => {
    const result = generateShipObj(testInput);

    const parsed = parseObj(result.obj);
    expect(parsed.vertices.length).toBeGreaterThan(0);
    expect(parsed.faces.length).toBeGreaterThan(0);
  });

  it('should have consistent face winding', () => {
    const result = generateShipObj(testInput);
    const parsed = parseObj(result.obj);

    // All faces should reference valid vertices
    for (const face of parsed.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThan(0);
        expect(idx).toBeLessThanOrEqual(parsed.vertices.length);
      }
    }
  });
});
```

**Pass Criteria:** OBJ files parse without errors in standard tools.

---

### Test 2: Mesh Topology
**Goal:** Mesh is topologically valid (no holes, consistent winding).

```typescript
describe('mesh topology', () => {
  it('should have no duplicate vertices at same position', () => {
    const result = generateShipObj(testInput);
    const parsed = parseObj(result.obj);

    const positions = new Set<string>();
    for (const v of parsed.vertices) {
      const key = `${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)}`;
      expect(positions.has(key)).toBe(false);
      positions.add(key);
    }
  });

  it('should have proper edge sharing (watertight hull)', () => {
    const result = generateShipObj(testInput);
    const parsed = parseObj(result.obj);

    // Count how many times each edge appears
    const edgeCounts = new Map<string, number>();
    for (const face of parsed.faces) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        const edge = [Math.min(a, b), Math.max(a, b)].join('-');
        edgeCounts.set(edge, (edgeCounts.get(edge) || 0) + 1);
      }
    }

    // Interior edges should appear exactly twice
    // Boundary edges once (bow/stern caps)
    for (const [edge, count] of edgeCounts) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('should have correct vertex count for configuration', () => {
    const config = { lengthSegments: 10, radialSegments: 8 };
    const result = generateShipObj({ ...testInput, config });

    // Hull: (lengthSegments + 1) * (radialSegments + 1) vertices
    const expectedHullVerts = 11 * 9;
    expect(result.stats.vertexCount).toBeGreaterThanOrEqual(expectedHullVerts);
  });
});
```

**Pass Criteria:** Mesh passes topology validation.

---

### Test 3: Dimensional Accuracy
**Goal:** Generated mesh has correct real-world dimensions.

```typescript
describe('dimensional accuracy', () => {
  it('should produce mesh matching input dimensions', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = generateShipObj({ ...testInput, dimensions });

    const { min, max } = result.stats.boundingBox;

    // Length (Z axis)
    expect(max[2] - min[2]).toBeCloseTo(200, 0);

    // Beam (X axis) - should be close to beam at widest point
    expect(max[0] - min[0]).toBeLessThanOrEqual(30);
    expect(max[0] - min[0]).toBeGreaterThan(20);  // Not too narrow

    // Draft (Y axis)
    expect(max[1] - min[1]).toBeLessThanOrEqual(10);
  });

  it('should scale proportionally with dimensions', () => {
    const small = generateShipObj({
      ...testInput,
      dimensions: { length: 100, beam: 15, draft: 5 }
    });
    const large = generateShipObj({
      ...testInput,
      dimensions: { length: 200, beam: 30, draft: 10 }
    });

    // Large should be exactly 2x small
    const smallSize = computeBoundingBoxSize(small.stats.boundingBox);
    const largeSize = computeBoundingBoxSize(large.stats.boundingBox);

    expect(largeSize[0] / smallSize[0]).toBeCloseTo(2, 1);
    expect(largeSize[1] / smallSize[1]).toBeCloseTo(2, 1);
    expect(largeSize[2] / smallSize[2]).toBeCloseTo(2, 1);
  });
});
```

**Pass Criteria:** Mesh dimensions match input specifications.

---

### Test 4: Profile Fidelity
**Goal:** Hull shape follows input profiles.

```typescript
describe('profile fidelity', () => {
  it('should be narrower at bow than midships (top profile)', () => {
    // Create profile that's narrow at ends, wide in middle
    const topProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      topProfile[i] = Math.sin((i / 100) * Math.PI);  // 0 → 1 → 0
    }

    const result = generateShipObj({
      ...testInput,
      topProfile: { curve: topProfile, resolution: 100, bounds: { minIndex: 0, maxIndex: 99, peakIndex: 50, peakValue: 1 } }
    });

    // Sample hull width at different Z positions
    const parsed = parseObj(result.obj);
    const widthAtBow = measureWidthAtZ(parsed, 10);
    const widthAtMid = measureWidthAtZ(parsed, 100);

    expect(widthAtMid).toBeGreaterThan(widthAtBow * 1.5);
  });

  it('should be taller at superstructure (side profile)', () => {
    // Create profile with tall middle section
    const sideProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      if (i > 30 && i < 60) {
        sideProfile[i] = 1.0;  // Tall superstructure region
      } else {
        sideProfile[i] = 0.5;  // Lower hull
      }
    }

    const result = generateShipObj({
      ...testInput,
      sideProfile: { curve: sideProfile, resolution: 100, bounds: { minIndex: 0, maxIndex: 99, peakIndex: 45, peakValue: 1 } }
    });

    const parsed = parseObj(result.obj);
    const heightAtBow = measureHeightAtZ(parsed, 10);
    const heightAtMid = measureHeightAtZ(parsed, 45);

    expect(heightAtMid).toBeGreaterThan(heightAtBow * 1.5);
  });
});
```

**Pass Criteria:** Mesh shape follows input profile curves.

---

### Test 5: Component Generation
**Goal:** Turrets and superstructure are correctly placed.

```typescript
describe('component generation', () => {
  it('should generate correct number of turrets', () => {
    const result = generateShipObj({
      ...testInput,
      geometryHints: {
        turretPositions: [0.2, 0.3, 0.7],  // 3 turrets
        superstructure: { start: 0.4, end: 0.6 }
      }
    });

    expect(result.stats.groups).toContain('turret_0');
    expect(result.stats.groups).toContain('turret_1');
    expect(result.stats.groups).toContain('turret_2');
    expect(result.stats.groups).not.toContain('turret_3');
  });

  it('should place turrets at correct Z positions', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = generateShipObj({
      ...testInput,
      dimensions,
      geometryHints: {
        turretPositions: [0.25, 0.75],
        superstructure: { start: 0.4, end: 0.6 }
      }
    });

    const parsed = parseObj(result.obj);
    const turret0Center = getGroupCenter(parsed, 'turret_0');
    const turret1Center = getGroupCenter(parsed, 'turret_1');

    expect(turret0Center[2]).toBeCloseTo(50, 5);   // 0.25 * 200
    expect(turret1Center[2]).toBeCloseTo(150, 5);  // 0.75 * 200
  });

  it('should generate superstructure within bounds', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = generateShipObj({
      ...testInput,
      dimensions,
      geometryHints: {
        turretPositions: [],
        superstructure: { start: 0.3, end: 0.5 }
      }
    });

    const parsed = parseObj(result.obj);
    const superBounds = getGroupBounds(parsed, 'superstructure');

    expect(superBounds.min[2]).toBeGreaterThanOrEqual(60 - 5);  // 0.3 * 200
    expect(superBounds.max[2]).toBeLessThanOrEqual(100 + 5);    // 0.5 * 200
  });
});
```

**Pass Criteria:** Components are generated and positioned correctly.

---

### Test 6: Performance
**Goal:** Generation completes within time budget.

```typescript
describe('performance', () => {
  it('should generate standard quality mesh in <100ms', () => {
    const start = performance.now();
    const result = generateShipObj({
      ...testInput,
      config: { lengthSegments: 24, radialSegments: 8 }
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.obj.length).toBeGreaterThan(0);
  });

  it('should generate high quality mesh in <500ms', () => {
    const start = performance.now();
    const result = generateShipObj({
      ...testInput,
      config: { lengthSegments: 96, radialSegments: 32 }
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it('should produce reasonable file sizes', () => {
    const standard = generateShipObj({
      ...testInput,
      config: { lengthSegments: 24, radialSegments: 8 }
    });

    expect(standard.stats.estimatedFileSizeBytes).toBeLessThan(50 * 1024);  // <50KB
  });
});
```

**Pass Criteria:** Generation is fast and files are reasonably sized.

---

## Success Criteria

A correct implementation of Phase 4 will:

1. ✅ Generate valid, parseable OBJ files
2. ✅ Produce watertight hull meshes
3. ✅ Match input dimensions within 1% error
4. ✅ Follow profile curves for hull shape
5. ✅ Place components at specified positions
6. ✅ Complete standard generation in <100ms
7. ✅ Support configurable mesh quality

---

## Coordinate System

```
        Y (up)
        │
        │     Z (length, bow to stern)
        │    ╱
        │   ╱
        │  ╱
        │ ╱
        │╱
        └────────── X (beam, port to starboard)

- Origin: Midships, at waterline
- X: Positive = starboard, Negative = port
- Y: Positive = up (above waterline), Negative = down (below waterline)
- Z: 0 = bow, length = stern
```

---

## What's NOT In Scope (v1)

- Normals calculation (for smooth shading)
- UV texture coordinates
- Multiple LOD levels
- Animation/rigging
- Propellers/rudder
- Internal structure

---

## Dependencies

- No external libraries
- Pure TypeScript/JavaScript geometry
- Output: Plain text OBJ string

---

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Phase 3: Extraction](./phase_3_extraction.md) — Previous phase
- [Phase 5: Refinement](./phase_5_refinement.md) — Next phase
