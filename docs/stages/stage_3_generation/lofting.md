---
title: "Stage 3.1: Elastic Lofting"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 3
component: lofting
status: Specification (Not Implemented)
---

# Elastic Lofting

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
- Is topologically valid (watertight, no holes)
- Can be exported as OBJ

---

## Interface Contract

```typescript
// Input
interface LoftingInput {
  topProfile: ProfileData;       // From Stage 2
  sideProfile: ProfileData;      // From Stage 2
  dimensions: {
    length: number;              // meters
    beam: number;                // meters
    draft: number;               // meters
  };
  config?: LoftingConfig;
}

interface LoftingConfig {
  lengthSegments: number;        // Default 24
  radialSegments: number;        // Default 8
  hullShape: 'ellipse' | 'rounded_v' | 'flat_bottom';
}

// Output
interface LoftingOutput {
  hull: ObjGeometry;
  stats: MeshStats;
}

interface ObjGeometry {
  vertices: number[][];          // [[x,y,z], ...]
  faces: number[][];             // [[v1,v2,v3], ...]
  group: string;
}

interface MeshStats {
  vertexCount: number;
  faceCount: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
}
```

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
      const y = (heightAtZ / 2) * Math.sin(angle);  // Divide by 2: heightAtZ is diameter, not radius

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

---

## Pain Points & Challenges

### 1. Cross-Section Shape
**Problem:** We know width and height, but not the actual cross-section shape.

**Options:**
- **Ellipse**: Simple, reasonable for many hulls (default)
- **Rounded V**: Better for faster ships
- **Flat bottom**: Better for cargo ships

**Decision for v1:** Use ellipse as default. It's simple and "good enough" for visualization.

### 2. Bow and Stern Shape
**Problem:** Real ships have complex bow/stern shapes.

**Decision for v1:** Simple taper. The profile curve already captures the general taper.

### 3. Mesh Quality vs File Size
**Balance:**
| Quality | Length Segs | Radial Segs | File Size |
|---------|-------------|-------------|-----------|
| Preview | 12 | 6 | ~5KB |
| Standard | 24 | 8 | ~15KB |
| High | 48 | 16 | ~60KB |

---

## TDD Goals

### Test 1: Valid OBJ Output
```typescript
describe('hull generation', () => {
  it('should produce valid geometry', () => {
    const result = generateHull(testTopProfile, testSideProfile, testDimensions, defaultConfig);

    expect(result.vertices.length).toBeGreaterThan(0);
    expect(result.faces.length).toBeGreaterThan(0);

    // All faces should reference valid vertices
    for (const face of result.faces) {
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(result.vertices.length);
      }
    }
  });

  it('should have correct vertex count for configuration', () => {
    const config = { lengthSegments: 10, radialSegments: 8, hullShape: 'ellipse' };
    const result = generateHull(testTopProfile, testSideProfile, testDimensions, config);

    // (lengthSegments + 1) * (radialSegments + 1) vertices
    const expectedVerts = 11 * 9;
    expect(result.vertices.length).toBe(expectedVerts);
  });
});
```

### Test 2: Dimensional Accuracy
```typescript
describe('dimensional accuracy', () => {
  it('should match input dimensions', () => {
    const dimensions = { length: 200, beam: 30, draft: 10 };
    const result = generateHull(flatProfile, flatProfile, dimensions, defaultConfig);

    const { min, max } = computeBoundingBox(result.vertices);

    // Length (Z axis)
    expect(max[2] - min[2]).toBeCloseTo(200, 0);

    // Beam (X axis)
    expect(max[0] - min[0]).toBeLessThanOrEqual(30);

    // Draft (Y axis)
    expect(max[1] - min[1]).toBeLessThanOrEqual(10);
  });

  it('should scale proportionally', () => {
    const small = generateHull(testProfile, testProfile, { length: 100, beam: 15, draft: 5 }, defaultConfig);
    const large = generateHull(testProfile, testProfile, { length: 200, beam: 30, draft: 10 }, defaultConfig);

    const smallSize = computeBoundingBoxSize(small.vertices);
    const largeSize = computeBoundingBoxSize(large.vertices);

    expect(largeSize[0] / smallSize[0]).toBeCloseTo(2, 1);
    expect(largeSize[1] / smallSize[1]).toBeCloseTo(2, 1);
    expect(largeSize[2] / smallSize[2]).toBeCloseTo(2, 1);
  });
});
```

### Test 3: Profile Fidelity
```typescript
describe('profile fidelity', () => {
  it('should follow top profile for beam distribution', () => {
    // Create profile: narrow at ends, wide in middle
    const topProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      topProfile[i] = Math.sin((i / 100) * Math.PI);
    }

    const result = generateHull(topProfile, flatProfile, testDimensions, defaultConfig);

    // Sample hull width at different Z positions
    const widthAtBow = measureWidthAtZ(result, 10);
    const widthAtMid = measureWidthAtZ(result, 100);

    expect(widthAtMid).toBeGreaterThan(widthAtBow * 1.5);
  });
});
```

### Test 4: Mesh Topology
```typescript
describe('mesh topology', () => {
  it('should have proper edge sharing', () => {
    const result = generateHull(testProfile, testProfile, testDimensions, defaultConfig);

    // Count edge occurrences
    const edgeCounts = new Map<string, number>();
    for (const face of result.faces) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        const edge = [Math.min(a, b), Math.max(a, b)].join('-');
        edgeCounts.set(edge, (edgeCounts.get(edge) || 0) + 1);
      }
    }

    // Interior edges should appear exactly twice
    for (const [edge, count] of edgeCounts) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });
});
```

### Test 5: Performance
```typescript
describe('performance', () => {
  it('should generate standard quality in <100ms', () => {
    const start = performance.now();
    const result = generateHull(testProfile, testProfile, testDimensions, {
      lengthSegments: 24,
      radialSegments: 8,
      hullShape: 'ellipse'
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.vertices.length).toBeGreaterThan(0);
  });

  it('should generate high quality in <500ms', () => {
    const start = performance.now();
    const result = generateHull(testProfile, testProfile, testDimensions, {
      lengthSegments: 96,
      radialSegments: 32,
      hullShape: 'ellipse'
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});
```

---

## Success Criteria

1. ✅ Generate valid geometry with correct vertex/face counts
2. ✅ Match input dimensions within 1% error
3. ✅ Follow profile curves for hull shape
4. ✅ Produce watertight meshes
5. ✅ Complete standard generation in <100ms
6. ✅ Support configurable mesh quality

---

## Related Documents

- [Stage 3 Overview](./README.md)
- [Component Placement](./component_placement.md)
- [OBJ Export](./obj_export.md)
