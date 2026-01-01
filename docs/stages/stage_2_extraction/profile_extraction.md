---
title: "Stage 2.1: Profile Extraction"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 2
component: profile_extraction
status: Specification (Not Implemented)
---

# Profile Extraction

## Purpose

Extract precise silhouette profiles from blueprint images using deterministic pixel-level analysis.

## The Problem

We have blueprint images showing top and side views. We need to convert these raster images into vector-like profile curves:
- **Top view** → Beam (width) distribution along ship length
- **Side view** → Draft (height) distribution along ship length

These curves will drive the 3D mesh generation in Stage 3.

---

## Interface Contract

```typescript
// Input
interface ExtractionInput {
  imageData: ImageData;        // From canvas getImageData
  config?: ExtractionConfig;
}

interface ExtractionConfig {
  threshold: number;           // 0-255, pixel difference from background
  smoothing: number;           // 0-20, moving average window size
  backgroundMode: 'auto' | 'corners' | 'edges' | 'custom';
  backgroundColor?: [number, number, number];  // RGB if custom
  minFeatureSize: number;      // Ignore features smaller than N pixels
}

// Output
interface ProfileData {
  curve: Float32Array;         // Normalized 0.0-1.0 values
  resolution: number;          // Number of samples (= image width)
  bounds: {
    minIndex: number;          // First non-zero sample
    maxIndex: number;          // Last non-zero sample
    peakIndex: number;         // Index of maximum value
    peakValue: number;         // Maximum value (before normalization)
  };
}

interface ExtractionOutput {
  profile: ProfileData;
  debug: ExtractionDebug;
}

interface ExtractionDebug {
  backgroundDetected: [number, number, number];
  pixelsAnalyzed: number;
  pixelsAboveThreshold: number;
  processingTimeMs: number;
}
```

---

## Algorithm Specification

### Core Algorithm: Column Scanning

```typescript
function extractProfile(imageData: ImageData, config: ExtractionConfig): ProfileData {
  const { width, height, data } = imageData;
  const bg = detectBackground(data, width, height, config.backgroundMode);

  const rawHeights = new Float32Array(width);

  // Scan each column
  for (let x = 0; x < width; x++) {
    let minY = height;  // Topmost content pixel
    let maxY = 0;       // Bottommost content pixel

    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const distance = euclidean(r, g, b, bg[0], bg[1], bg[2]);

      if (distance > config.threshold) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    // Height at this column (0 if no content found)
    rawHeights[x] = maxY > minY ? (maxY - minY + 1) : 0;
  }

  // Normalize to 0-1
  const peak = Math.max(...rawHeights);
  const normalized = rawHeights.map(h => peak > 0 ? h / peak : 0);

  // Apply smoothing
  const smoothed = movingAverage(normalized, config.smoothing);

  return {
    curve: smoothed,
    resolution: width,
    bounds: computeBounds(smoothed, peak)
  };
}

function euclidean(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );
}
```

---

## TDD Goals

### Test 1: Simple Rectangle Extraction
**Goal:** Extract correct profile from a simple rectangular silhouette.

```typescript
describe('extractProfile - simple shapes', () => {
  it('should return flat profile for solid rectangle', () => {
    // Create 100x50 image with 80x30 black rectangle centered
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 10, y: 10, w: 80, h: 30, color: '#000000' }]
    });

    const result = extractProfile(imageData, defaultConfig);

    // Profile should be ~0 for first 10 columns, ~1.0 for next 80, ~0 for last 10
    expect(result.curve[5]).toBeCloseTo(0, 1);    // Before rectangle
    expect(result.curve[50]).toBeCloseTo(1, 1);   // Middle of rectangle
    expect(result.curve[95]).toBeCloseTo(0, 1);   // After rectangle

    // Bounds should match rectangle
    expect(result.bounds.minIndex).toBeCloseTo(10, 1);
    expect(result.bounds.maxIndex).toBeCloseTo(89, 1);
  });

  it('should return triangular profile for triangle', () => {
    // Create triangle pointing right (like ship bow)
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'triangle', points: [[0,25], [100,0], [100,50]], color: '#000000' }]
    });

    const result = extractProfile(imageData, defaultConfig);

    // Profile should increase from left to right
    expect(result.curve[10]).toBeLessThan(result.curve[50]);
    expect(result.curve[50]).toBeLessThan(result.curve[90]);
    expect(result.curve[99]).toBeCloseTo(1, 1);
  });
});
```

### Test 2: Threshold Sensitivity
```typescript
describe('threshold behavior', () => {
  it('should ignore low-contrast content with high threshold', () => {
    // Create image with light gray content on white background
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 20, y: 10, w: 60, h: 30, color: '#F0F0F0' }]
    });

    // High threshold should ignore the light gray
    const highThreshold = extractProfile(imageData, { ...defaultConfig, threshold: 50 });
    expect(Math.max(...highThreshold.curve)).toBe(0);

    // Low threshold should detect it
    const lowThreshold = extractProfile(imageData, { ...defaultConfig, threshold: 10 });
    expect(Math.max(...lowThreshold.curve)).toBeGreaterThan(0);
  });

  it('should detect dark content on white background', () => {
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 20, y: 10, w: 60, h: 30, color: '#333333' }]
    });

    const result = extractProfile(imageData, { ...defaultConfig, threshold: 30 });
    expect(result.bounds.minIndex).toBe(20);
    expect(result.bounds.maxIndex).toBe(79);
  });
});
```

### Test 3: Ship-Like Profile Extraction
```typescript
describe('ship profile extraction', () => {
  it('should extract typical battleship top profile', () => {
    // Create battleship-like top view: tapered bow, wide midships, tapered stern
    const imageData = createBattleshipTopView({
      length: 200,
      maxBeam: 40,
      bowTaper: 0.3,    // Bow is 30% of length
      sternTaper: 0.2   // Stern is 20% of length
    });

    const result = extractProfile(imageData, defaultConfig);

    // Bow should be narrow
    expect(result.curve[10]).toBeLessThan(0.5);

    // Midships should be wide
    expect(result.curve[100]).toBeGreaterThan(0.8);

    // Stern should be moderate
    expect(result.curve[180]).toBeLessThan(0.7);
    expect(result.curve[180]).toBeGreaterThan(0.3);
  });

  it('should extract typical side profile with superstructure', () => {
    // Create side view: low hull with tall superstructure
    const imageData = createBattleshipSideView({
      length: 200,
      hullHeight: 20,
      superstructureHeight: 40,
      superstructureStart: 0.35,
      superstructureEnd: 0.55
    });

    const result = extractProfile(imageData, defaultConfig);

    // Hull area should be lower
    expect(result.curve[20]).toBeLessThan(0.6);

    // Superstructure should be higher
    expect(result.curve[90]).toBeGreaterThan(0.9);

    // Stern should be lower
    expect(result.curve[180]).toBeLessThan(0.6);
  });
});
```

### Test 4: Edge Cases
```typescript
describe('edge cases', () => {
  it('should return zero profile for blank image', () => {
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: []
    });

    const result = extractProfile(imageData, defaultConfig);

    expect(Math.max(...result.curve)).toBe(0);
    expect(result.bounds.peakValue).toBe(0);
  });

  it('should handle 1-pixel wide image', () => {
    const imageData = createTestImage({
      width: 1,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 0, y: 10, w: 1, h: 30, color: '#000000' }]
    });

    const result = extractProfile(imageData, defaultConfig);

    expect(result.curve.length).toBe(1);
    expect(result.curve[0]).toBe(1);
  });

  it('should handle very large images efficiently', () => {
    const imageData = createTestImage({
      width: 4000,
      height: 2000,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 100, y: 100, w: 3800, h: 1800, color: '#000000' }]
    });

    const start = performance.now();
    const result = extractProfile(imageData, defaultConfig);
    const elapsed = performance.now() - start;

    expect(result.curve.length).toBe(4000);
    expect(elapsed).toBeLessThan(2000);  // Should complete in <2 seconds
  });
});
```

### Test 5: Determinism
```typescript
describe('determinism', () => {
  it('should produce identical output for identical input', () => {
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 20, y: 10, w: 60, h: 30, color: '#000000' }]
    });

    const result1 = extractProfile(imageData, defaultConfig);
    const result2 = extractProfile(imageData, defaultConfig);

    expect(result1.curve).toEqual(result2.curve);
    expect(result1.bounds).toEqual(result2.bounds);
  });

  it('should produce different output for different config', () => {
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 20, y: 10, w: 60, h: 30, color: '#000000' }]
    });

    const result1 = extractProfile(imageData, { ...defaultConfig, smoothing: 0 });
    const result2 = extractProfile(imageData, { ...defaultConfig, smoothing: 10 });

    // With smoothing, edges should be different
    expect(result1.curve[20]).not.toEqual(result2.curve[20]);
  });
});
```

---

## Success Criteria

1. ✅ Extract profiles from clean blueprint images with >95% accuracy
2. ✅ Complete extraction in <1 second for images up to 4000px wide
3. ✅ Produce deterministic output (same input → same output)
4. ✅ Configurable threshold and smoothing parameters
5. ✅ Return useful debug information for troubleshooting
6. ✅ Gracefully handle edge cases

---

## Related Documents

- [Stage 2 Overview](./README.md)
- [Background Detection](./background_detection.md)
- [Smoothing](./smoothing.md)
