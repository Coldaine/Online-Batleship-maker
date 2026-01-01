---
title: "Phase 3: Computational Extraction — Specification"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 3
type: Deterministic
status: Specification (Not Implemented)
---

# Phase 3: Computational Extraction

## Purpose

Extract precise silhouette profiles from blueprint images using deterministic pixel-level analysis. This phase transforms images into mathematical curves that define the ship's envelope.

## The Problem

We have blueprint images showing top and side views. We need to convert these raster images into vector-like profile curves:
- **Top view** → Beam (width) distribution along ship length
- **Side view** → Draft (height) distribution along ship length

These curves will drive the 3D mesh generation in Phase 4.

---

## Interface Contract

```typescript
// Input
interface ExtractionInput {
  topView: string;           // Base64 PNG from Phase 1
  sideView: string;          // Base64 PNG from Phase 1
  config?: ExtractionConfig;
}

interface ExtractionConfig {
  threshold: number;         // 0-255, pixel difference from background
  smoothing: number;         // 0-20, moving average window size
  backgroundMode: 'auto' | 'corners' | 'edges' | 'custom';
  backgroundColor?: [number, number, number];  // RGB if custom
  minFeatureSize: number;    // Ignore features smaller than N pixels
}

// Output
interface ExtractionOutput {
  topProfile: ProfileData;
  sideProfile: ProfileData;
  debug: ExtractionDebug;
}

interface ProfileData {
  curve: Float32Array;       // Normalized 0.0-1.0 values
  resolution: number;        // Number of samples (= image width)
  bounds: {
    minIndex: number;        // First non-zero sample
    maxIndex: number;        // Last non-zero sample
    peakIndex: number;       // Index of maximum value
    peakValue: number;       // Maximum value (before normalization)
  };
}

interface ExtractionDebug {
  backgroundDetected: [number, number, number];
  pixelsAnalyzed: number;
  pixelsAboveThreshold: number;
  processingTimeMs: number;
}
```

---

## Pain Points & Challenges

### 1. Background Detection
**Problem:** Not all blueprints have white backgrounds.

**Approaches:**
- **Corner sampling**: Average the 4 corners
- **Edge sampling**: Average all edge pixels
- **Mode detection**: Find most common color
- **User-specified**: Let user pick background color

**Recommendation:** Default to corner sampling. Provide manual override for edge cases.

### 2. Noise and Artifacts
**Problem:** Scanned images have noise, compression artifacts, stray marks.

**Approaches:**
- **Threshold filtering**: Ignore pixels within N of background
- **Moving average smoothing**: Blur the output curve
- **Median filtering**: Remove salt-and-pepper noise
- **Minimum feature size**: Ignore isolated small regions

**Recommendation:** Combine threshold + smoothing. Adjustable parameters.

### 3. Annotations and Text
**Problem:** Blueprints often have dimension lines, labels, scale bars.

**Approaches:**
- **Ignore**: Hope they're thin enough to not affect the silhouette
- **AI pre-processing**: Use Gemini to mask out annotations
- **User masking**: Let user paint over areas to ignore

**Decision for v1:** Ignore. Document as limitation. Annotations are typically thin lines that get smoothed out.

### 4. Multi-object Images
**Problem:** What if there's more than one ship silhouette?

**Approaches:**
- **Largest contiguous region**: Find biggest connected component
- **Bounding box selection**: User specifies region of interest
- **Error out**: Require single clean silhouette

**Recommendation:** For v1, require single silhouette. Validate in Phase 1.

### 5. Orientation Mismatch
**Problem:** Top view and side view might have ship facing different directions.

**Approaches:**
- **Require consistent orientation**: Bow always on left
- **Auto-detect bow**: Use AI or heuristics
- **Profile reversal**: Option to flip a profile

**Recommendation:** Require consistent orientation. Validate bow position is consistent.

---

## Algorithm Specification

### Core Algorithm: Column Scanning

```
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
    bounds: computeBounds(smoothed)
  };
}
```

### Background Detection

```
function detectBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: 'corners' | 'edges' | 'mode'
): [number, number, number] {

  if (mode === 'corners') {
    // Sample 4 corners, 5x5 pixel regions each
    const samples = [
      sampleRegion(data, width, 0, 0, 5, 5),
      sampleRegion(data, width, width - 5, 0, 5, 5),
      sampleRegion(data, width, 0, height - 5, 5, 5),
      sampleRegion(data, width, width - 5, height - 5, 5, 5)
    ];
    return averageColors(samples);
  }

  // ... other modes
}
```

### Smoothing

```
function movingAverage(arr: Float32Array, windowSize: number): Float32Array {
  if (windowSize <= 1) return arr;

  const result = new Float32Array(arr.length);
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;

    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      sum += arr[j];
      count++;
    }

    result[i] = sum / count;
  }

  return result;
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

**Pass Criteria:** Correct profiles for geometric test shapes.

---

### Test 2: Background Detection
**Goal:** Correctly identify background color in various scenarios.

```typescript
describe('detectBackground', () => {
  it('should detect white background from corners', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 20, y: 20, w: 60, h: 60, color: '#000000' }]
    });

    const bg = detectBackground(imageData.data, 100, 100, 'corners');

    expect(bg[0]).toBeCloseTo(255, 0);  // R
    expect(bg[1]).toBeCloseTo(255, 0);  // G
    expect(bg[2]).toBeCloseTo(255, 0);  // B
  });

  it('should detect gray background', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#808080',
      shapes: []
    });

    const bg = detectBackground(imageData.data, 100, 100, 'corners');

    expect(bg[0]).toBeCloseTo(128, 5);
    expect(bg[1]).toBeCloseTo(128, 5);
    expect(bg[2]).toBeCloseTo(128, 5);
  });

  it('should detect blue background', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#0000FF',
      shapes: []
    });

    const bg = detectBackground(imageData.data, 100, 100, 'corners');

    expect(bg[0]).toBeCloseTo(0, 5);
    expect(bg[1]).toBeCloseTo(0, 5);
    expect(bg[2]).toBeCloseTo(255, 5);
  });
});
```

**Pass Criteria:** Background detection works for white, gray, and colored backgrounds.

---

### Test 3: Threshold Sensitivity
**Goal:** Verify threshold parameter correctly filters near-background pixels.

```typescript
describe('threshold behavior', () => {
  it('should ignore low-contrast content with high threshold', () => {
    // Create image with light gray content on white background
    const imageData = createTestImage({
      width: 100,
      height: 50,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 20, y: 10, w: 60, h: 30, color: '#F0F0F0' }]  // Very light gray
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
      shapes: [{ type: 'rect', x: 20, y: 10, w: 60, h: 30, color: '#333333' }]  // Dark gray
    });

    // Should be detected with default threshold
    const result = extractProfile(imageData, { ...defaultConfig, threshold: 30 });
    expect(result.bounds.minIndex).toBe(20);
    expect(result.bounds.maxIndex).toBe(79);
  });
});
```

**Pass Criteria:** Threshold correctly controls sensitivity to near-background colors.

---

### Test 4: Smoothing Effect
**Goal:** Verify smoothing reduces noise without destroying signal.

```typescript
describe('smoothing', () => {
  it('should smooth noisy profile while preserving shape', () => {
    // Create ship-like profile with noise
    const noisyProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      // Ship-like shape: low at ends, high in middle
      const baseValue = Math.sin((i / 100) * Math.PI);
      const noise = (Math.random() - 0.5) * 0.2;  // ±10% noise
      noisyProfile[i] = Math.max(0, baseValue + noise);
    }

    const smoothed = movingAverage(noisyProfile, 5);

    // Smoothed should have lower variance but same general shape
    const originalVariance = computeVariance(noisyProfile);
    const smoothedVariance = computeVariance(smoothed);
    expect(smoothedVariance).toBeLessThan(originalVariance);

    // Peak should still be near center
    const peakIndex = smoothed.indexOf(Math.max(...smoothed));
    expect(peakIndex).toBeGreaterThan(40);
    expect(peakIndex).toBeLessThan(60);
  });

  it('should not smooth with windowSize <= 1', () => {
    const profile = new Float32Array([0.5, 1.0, 0.5]);

    expect(movingAverage(profile, 0)).toEqual(profile);
    expect(movingAverage(profile, 1)).toEqual(profile);
  });

  it('should handle edge cases at array boundaries', () => {
    const profile = new Float32Array([1, 1, 1, 0, 0]);
    const smoothed = movingAverage(profile, 3);

    // First element should only average with itself and next
    expect(smoothed[0]).toBeCloseTo(1, 1);
    // Last element should only average with itself and previous
    expect(smoothed[4]).toBeCloseTo(0, 1);
  });
});
```

**Pass Criteria:** Smoothing reduces noise while preserving profile shape.

---

### Test 5: Ship-Like Profile Extraction
**Goal:** Extract realistic profile from ship-like silhouette.

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

**Pass Criteria:** Realistic ship profiles are correctly extracted.

---

### Test 6: Edge Cases
**Goal:** Handle edge cases gracefully.

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

**Pass Criteria:** Edge cases handled without crashes or unexpected behavior.

---

## Success Criteria

A correct implementation of Phase 3 will:

1. ✅ Extract profiles from clean blueprint images with >95% accuracy
2. ✅ Handle white, gray, and colored backgrounds
3. ✅ Complete extraction in <1 second for images up to 4000px wide
4. ✅ Produce deterministic output (same input → same output)
5. ✅ Configurable threshold and smoothing parameters
6. ✅ Return useful debug information for troubleshooting
7. ✅ Gracefully handle edge cases (blank, tiny, huge images)

---

## Performance Requirements

| Image Size | Max Processing Time |
|------------|---------------------|
| 1000 × 500 | 100ms |
| 2000 × 1000 | 400ms |
| 4000 × 2000 | 1500ms |

---

## What's NOT In Scope (v1)

- Text/annotation removal
- Automatic rotation correction
- Multi-contour handling (multiple ships)
- Sub-pixel accuracy
- GPU acceleration

---

## Dependencies

- Browser Canvas API (getImageData)
- No external libraries required
- Pure TypeScript/JavaScript computation

---

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Phase 2: Grounding](./phase_2_grounding.md) — Previous phase
- [Phase 4: Lofting](./phase_4_lofting.md) — Next phase (consumes this output)
