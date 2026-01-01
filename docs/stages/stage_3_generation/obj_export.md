---
title: "Stage 3.3: OBJ Export"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 3
component: obj_export
status: Specification (Not Implemented)
---

# OBJ Export

## Purpose

Convert generated geometry into valid Wavefront OBJ format for use in 3D applications.

## The Problem

We have geometry data structures (vertices, faces, groups). We need to serialize them into a standard 3D file format that:
- Can be opened in any 3D software
- Preserves component grouping
- Is human-readable for debugging
- Is compact for storage

---

## OBJ Format Overview

```obj
# Comment
o ObjectName
g GroupName

# Vertices
v x y z
v x y z
...

# Faces (1-indexed!)
f v1 v2 v3
f v1 v2 v3 v4
...
```

---

## Interface Contract

```typescript
interface ObjExportInput {
  geometries: ObjGeometry[];
  metadata?: {
    modelName?: string;
    author?: string;
    createdAt?: string;
  };
}

interface ObjExportOutput {
  obj: string;                   // The OBJ file content
  stats: {
    vertexCount: number;
    faceCount: number;
    groups: string[];
    fileSizeBytes: number;
  };
}

function exportToObj(input: ObjExportInput): ObjExportOutput;
```

---

## Implementation

```typescript
function exportToObj(input: ObjExportInput): ObjExportOutput {
  const { geometries, metadata = {} } = input;
  const lines: string[] = [];

  // Header
  lines.push('# NavalForge 3D Export');
  lines.push(`# Model: ${metadata.modelName || 'Unknown'}`);
  lines.push(`# Generated: ${metadata.createdAt || new Date().toISOString()}`);
  lines.push('');

  let totalVertices = 0;
  let totalFaces = 0;
  const groups: string[] = [];
  let vertexOffset = 0;

  for (const geo of geometries) {
    groups.push(geo.group);

    // Group and object markers
    lines.push(`g ${geo.group}`);
    lines.push(`o ${geo.group}`);
    lines.push('');

    // Vertices
    for (const [x, y, z] of geo.vertices) {
      lines.push(`v ${formatFloat(x)} ${formatFloat(y)} ${formatFloat(z)}`);
    }
    lines.push('');

    // Faces (OBJ uses 1-based indexing)
    for (const face of geo.faces) {
      const indices = face.map(i => i + vertexOffset + 1);
      lines.push(`f ${indices.join(' ')}`);
    }
    lines.push('');

    totalVertices += geo.vertices.length;
    totalFaces += geo.faces.length;
    vertexOffset += geo.vertices.length;
  }

  const obj = lines.join('\n');

  return {
    obj,
    stats: {
      vertexCount: totalVertices,
      faceCount: totalFaces,
      groups,
      fileSizeBytes: new TextEncoder().encode(obj).length
    }
  };
}

function formatFloat(n: number): string {
  return n.toFixed(6);
}
```

---

## TDD Goals

### Test 1: Valid OBJ Syntax
```typescript
describe('OBJ export - syntax', () => {
  it('should produce valid OBJ lines', () => {
    const result = exportToObj({
      geometries: [testGeometry]
    });

    const lines = result.obj.split('\n');
    for (const line of lines) {
      if (line.trim() === '' || line.startsWith('#')) continue;
      expect(line).toMatch(/^(v|f|g|o|vn|vt|s)\s/);
    }
  });

  it('should include header comments', () => {
    const result = exportToObj({
      geometries: [testGeometry],
      metadata: { modelName: 'TestShip' }
    });

    expect(result.obj).toContain('# NavalForge 3D Export');
    expect(result.obj).toContain('# Model: TestShip');
  });

  it('should include group markers', () => {
    const result = exportToObj({
      geometries: [{
        vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        faces: [[0, 1, 2]],
        group: 'hull'
      }]
    });

    expect(result.obj).toContain('g hull');
    expect(result.obj).toContain('o hull');
  });
});
```

### Test 2: Vertex Format
```typescript
describe('OBJ export - vertices', () => {
  it('should format vertices with 6 decimal places', () => {
    const result = exportToObj({
      geometries: [{
        vertices: [[1.123456789, 2.5, -3.000001]],
        faces: [],
        group: 'test'
      }]
    });

    expect(result.obj).toContain('v 1.123457 2.500000 -3.000001');
  });

  it('should handle negative coordinates', () => {
    const result = exportToObj({
      geometries: [{
        vertices: [[-10.5, -20.25, -30.125]],
        faces: [],
        group: 'test'
      }]
    });

    expect(result.obj).toContain('v -10.500000 -20.250000 -30.125000');
  });

  it('should handle zero coordinates', () => {
    const result = exportToObj({
      geometries: [{
        vertices: [[0, 0, 0]],
        faces: [],
        group: 'test'
      }]
    });

    expect(result.obj).toContain('v 0.000000 0.000000 0.000000');
  });
});
```

### Test 3: Face Indexing
```typescript
describe('OBJ export - faces', () => {
  it('should use 1-based indexing', () => {
    const result = exportToObj({
      geometries: [{
        vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        faces: [[0, 1, 2]],  // 0-based input
        group: 'test'
      }]
    });

    expect(result.obj).toContain('f 1 2 3');  // 1-based output
  });

  it('should handle multiple faces', () => {
    const result = exportToObj({
      geometries: [{
        vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
        faces: [[0, 1, 2], [0, 2, 3]],
        group: 'test'
      }]
    });

    expect(result.obj).toContain('f 1 2 3');
    expect(result.obj).toContain('f 1 3 4');
  });

  it('should handle quads', () => {
    const result = exportToObj({
      geometries: [{
        vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
        faces: [[0, 1, 2, 3]],
        group: 'test'
      }]
    });

    expect(result.obj).toContain('f 1 2 3 4');
  });
});
```

### Test 4: Multiple Geometries
```typescript
describe('OBJ export - multiple groups', () => {
  it('should maintain correct vertex offsets', () => {
    const result = exportToObj({
      geometries: [
        {
          vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
          faces: [[0, 1, 2]],
          group: 'group1'
        },
        {
          vertices: [[2, 0, 0], [3, 0, 0], [2, 1, 0]],
          faces: [[0, 1, 2]],
          group: 'group2'
        }
      ]
    });

    // First group uses indices 1-3
    expect(result.obj).toContain('g group1');
    expect(result.obj).toMatch(/g group1[\s\S]*f 1 2 3/);

    // Second group uses indices 4-6 (offset by 3)
    expect(result.obj).toContain('g group2');
    expect(result.obj).toMatch(/g group2[\s\S]*f 4 5 6/);
  });

  it('should track all groups in stats', () => {
    const result = exportToObj({
      geometries: [
        { vertices: [], faces: [], group: 'hull' },
        { vertices: [], faces: [], group: 'turret_0' },
        { vertices: [], faces: [], group: 'superstructure' }
      ]
    });

    expect(result.stats.groups).toEqual(['hull', 'turret_0', 'superstructure']);
  });
});
```

### Test 5: Statistics
```typescript
describe('OBJ export - stats', () => {
  it('should count vertices correctly', () => {
    const result = exportToObj({
      geometries: [
        { vertices: [[0, 0, 0], [1, 0, 0]], faces: [], group: 'g1' },
        { vertices: [[2, 0, 0], [3, 0, 0], [4, 0, 0]], faces: [], group: 'g2' }
      ]
    });

    expect(result.stats.vertexCount).toBe(5);
  });

  it('should count faces correctly', () => {
    const result = exportToObj({
      geometries: [
        {
          vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]],
          faces: [[0, 1, 2], [1, 3, 2]],
          group: 'g1'
        }
      ]
    });

    expect(result.stats.faceCount).toBe(2);
  });

  it('should estimate file size', () => {
    const result = exportToObj({
      geometries: [testGeometry]
    });

    expect(result.stats.fileSizeBytes).toBeGreaterThan(0);
    expect(result.stats.fileSizeBytes).toBe(new TextEncoder().encode(result.obj).length);
  });
});
```

### Test 6: Parseability
```typescript
describe('OBJ export - parseability', () => {
  it('should be parseable by standard OBJ parser', () => {
    const result = exportToObj({
      geometries: [
        {
          vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
          faces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
          group: 'tetrahedron'
        }
      ]
    });

    const parsed = parseObj(result.obj);

    expect(parsed.vertices.length).toBe(4);
    expect(parsed.faces.length).toBe(4);
    expect(parsed.groups).toContain('tetrahedron');
  });

  it('should round-trip complex geometry', () => {
    const original = generateHull(testTopProfile, testSideProfile, testDimensions, defaultConfig);
    const exported = exportToObj({ geometries: [original] });
    const parsed = parseObj(exported.obj);

    expect(parsed.vertices.length).toBe(original.vertices.length);
    expect(parsed.faces.length).toBe(original.faces.length);
  });
});
```

---

## Success Criteria

1. ✅ Produce syntactically valid OBJ files
2. ✅ Use correct 1-based indexing for faces
3. ✅ Handle multiple geometry groups
4. ✅ Maintain vertex offset tracking
5. ✅ Include useful metadata comments
6. ✅ Parseable by standard OBJ parsers

---

## Related Documents

- [Stage 3 Overview](./README.md)
- [Lofting](./lofting.md)
- [Component Placement](./component_placement.md)
