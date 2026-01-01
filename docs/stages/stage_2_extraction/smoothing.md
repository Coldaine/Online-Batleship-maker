---
title: "Stage 2.3: Smoothing"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 2
component: smoothing
status: Specification (Not Implemented)
---

# Smoothing

## Purpose

Reduce noise in extracted profiles while preserving the essential hull shape.

## The Problem

Raw extracted profiles have noise from:
- Scanning artifacts
- Compression artifacts
- Stray marks on blueprints
- Thin annotation lines
- Anti-aliasing pixels

We need to smooth out this noise while preserving the actual ship outline.

---

## Interface Contract

```typescript
interface SmoothingInput {
  profile: Float32Array;
  method: 'moving_average' | 'gaussian' | 'median';
  windowSize: number;          // Must be odd
  preserveEdges?: boolean;
}

interface SmoothingOutput {
  smoothed: Float32Array;
  reductionRatio: number;      // How much noise was reduced
}
```

---

## Smoothing Methods

### 1. Moving Average (Default)

Simple windowed average. Fast and effective.

```typescript
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

### 2. Gaussian Smoothing

Weighted average with Gaussian kernel. Smoother result.

```typescript
function gaussianSmooth(arr: Float32Array, windowSize: number, sigma?: number): Float32Array {
  sigma = sigma ?? windowSize / 6;
  const kernel = createGaussianKernel(windowSize, sigma);
  return convolve(arr, kernel);
}

function createGaussianKernel(size: number, sigma: number): Float32Array {
  const kernel = new Float32Array(size);
  const half = Math.floor(size / 2);
  let sum = 0;

  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }

  // Normalize
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }

  return kernel;
}
```

### 3. Median Filter

Good for removing outliers/spikes. Preserves edges better.

```typescript
function medianFilter(arr: Float32Array, windowSize: number): Float32Array {
  const result = new Float32Array(arr.length);
  const half = Math.floor(windowSize / 2);
  const window: number[] = [];

  for (let i = 0; i < arr.length; i++) {
    window.length = 0;

    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      window.push(arr[j]);
    }

    window.sort((a, b) => a - b);
    result[i] = window[Math.floor(window.length / 2)];
  }

  return result;
}
```

---

## TDD Goals

### Test 1: Basic Smoothing
```typescript
describe('smoothing - basic', () => {
  it('should reduce variance while preserving mean', () => {
    // Create noisy profile
    const noisy = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      noisy[i] = 0.5 + (Math.random() - 0.5) * 0.2;  // ~0.5 ± 0.1
    }

    const smoothed = movingAverage(noisy, 5);

    // Variance should be reduced
    const noisyVariance = computeVariance(noisy);
    const smoothedVariance = computeVariance(smoothed);
    expect(smoothedVariance).toBeLessThan(noisyVariance);

    // Mean should be preserved
    const noisyMean = computeMean(noisy);
    const smoothedMean = computeMean(smoothed);
    expect(smoothedMean).toBeCloseTo(noisyMean, 1);
  });

  it('should not change uniform profile', () => {
    const uniform = new Float32Array(100).fill(0.5);

    const smoothed = movingAverage(uniform, 5);

    for (let i = 0; i < 100; i++) {
      expect(smoothed[i]).toBeCloseTo(0.5, 5);
    }
  });
});
```

### Test 2: Window Size Effect
```typescript
describe('smoothing - window size', () => {
  it('should smooth more with larger window', () => {
    const noisy = createNoisyProfile(100, 0.1);

    const smooth3 = movingAverage(noisy, 3);
    const smooth7 = movingAverage(noisy, 7);
    const smooth15 = movingAverage(noisy, 15);

    const var3 = computeVariance(smooth3);
    const var7 = computeVariance(smooth7);
    const var15 = computeVariance(smooth15);

    expect(var7).toBeLessThan(var3);
    expect(var15).toBeLessThan(var7);
  });

  it('should not change with window size 1', () => {
    const profile = new Float32Array([0.1, 0.5, 0.9, 0.5, 0.1]);

    const smoothed = movingAverage(profile, 1);

    expect(smoothed).toEqual(profile);
  });

  it('should handle window size 0', () => {
    const profile = new Float32Array([0.1, 0.5, 0.9]);

    const smoothed = movingAverage(profile, 0);

    expect(smoothed).toEqual(profile);
  });
});
```

### Test 3: Edge Handling
```typescript
describe('smoothing - edges', () => {
  it('should handle edges correctly', () => {
    const profile = new Float32Array([1, 1, 1, 0, 0]);
    const smoothed = movingAverage(profile, 3);

    // First element should only average with itself and next
    expect(smoothed[0]).toBeCloseTo(1, 1);
    // Last element should only average with itself and previous
    expect(smoothed[4]).toBeCloseTo(0, 1);
    // Middle should be mixed
    expect(smoothed[2]).toBeGreaterThan(0.3);
    expect(smoothed[2]).toBeLessThan(0.8);
  });

  it('should preserve profile endpoints', () => {
    const profile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      profile[i] = Math.sin((i / 100) * Math.PI);  // 0 → 1 → 0
    }

    const smoothed = movingAverage(profile, 5);

    // Endpoints should remain near zero
    expect(smoothed[0]).toBeCloseTo(0, 1);
    expect(smoothed[99]).toBeCloseTo(0, 1);
  });
});
```

### Test 4: Shape Preservation
```typescript
describe('smoothing - shape preservation', () => {
  it('should preserve ship-like profile shape', () => {
    // Create ship profile: narrow bow, wide midships, narrow stern
    const shipProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      // Sinusoidal shape with noise
      const base = Math.sin((i / 100) * Math.PI);
      const noise = (Math.random() - 0.5) * 0.1;
      shipProfile[i] = Math.max(0, base + noise);
    }

    const smoothed = movingAverage(shipProfile, 5);

    // Peak should still be near center
    const peakIndex = Array.from(smoothed).indexOf(Math.max(...smoothed));
    expect(peakIndex).toBeGreaterThan(40);
    expect(peakIndex).toBeLessThan(60);

    // General shape should be preserved
    expect(smoothed[25]).toBeLessThan(smoothed[50]);  // Bow < midships
    expect(smoothed[75]).toBeLessThan(smoothed[50]);  // Stern < midships
  });

  it('should preserve superstructure bump', () => {
    // Side profile with superstructure peak
    const sideProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      if (i >= 35 && i <= 55) {
        sideProfile[i] = 1.0;  // Tall superstructure
      } else {
        sideProfile[i] = 0.5;  // Lower hull
      }
    }

    const smoothed = movingAverage(sideProfile, 5);

    // Superstructure region should still be higher
    expect(smoothed[45]).toBeGreaterThan(smoothed[20]);
    expect(smoothed[45]).toBeGreaterThan(smoothed[80]);
  });
});
```

### Test 5: Median vs Average
```typescript
describe('smoothing - median vs average', () => {
  it('should remove spikes better with median', () => {
    // Profile with spike
    const spikeProfile = new Float32Array(100).fill(0.5);
    spikeProfile[50] = 2.0;  // Outlier spike

    const avgSmoothed = movingAverage(spikeProfile, 3);
    const medSmoothed = medianFilter(spikeProfile, 3);

    // Median should completely remove spike
    expect(medSmoothed[50]).toBeCloseTo(0.5, 1);
    // Average will still show some effect
    expect(avgSmoothed[50]).toBeGreaterThan(0.6);
  });

  it('should preserve edges better with median', () => {
    // Sharp edge
    const edgeProfile = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      edgeProfile[i] = i < 50 ? 0.0 : 1.0;
    }

    const avgSmoothed = movingAverage(edgeProfile, 5);
    const medSmoothed = medianFilter(edgeProfile, 5);

    // Median should have sharper transition
    expect(Math.abs(medSmoothed[50] - medSmoothed[49])).toBeGreaterThan(
      Math.abs(avgSmoothed[50] - avgSmoothed[49])
    );
  });
});
```

### Test 6: Gaussian Smoothing
```typescript
describe('smoothing - gaussian', () => {
  it('should produce smoother result than moving average', () => {
    const noisy = createNoisyProfile(100, 0.2);

    const avgSmoothed = movingAverage(noisy, 7);
    const gaussSmoothed = gaussianSmooth(noisy, 7);

    // Gaussian should have lower high-frequency content
    const avgHF = computeHighFrequency(avgSmoothed);
    const gaussHF = computeHighFrequency(gaussSmoothed);

    expect(gaussHF).toBeLessThanOrEqual(avgHF);
  });

  it('should respect sigma parameter', () => {
    const noisy = createNoisyProfile(100, 0.2);

    const narrowGauss = gaussianSmooth(noisy, 7, 1);   // Narrow kernel
    const wideGauss = gaussianSmooth(noisy, 7, 3);    // Wide kernel

    const narrowVar = computeVariance(narrowGauss);
    const wideVar = computeVariance(wideGauss);

    // Wider sigma = more smoothing
    expect(wideVar).toBeLessThan(narrowVar);
  });
});
```

---

## Recommended Settings

| Use Case | Method | Window Size |
|----------|--------|-------------|
| Clean blueprints | moving_average | 3 |
| Scanned images | moving_average | 5 |
| Noisy scans | moving_average | 7-9 |
| Spike removal | median | 5 |
| Maximum smoothness | gaussian | 11 |

---

## Success Criteria

1. ✅ Reduce noise variance by >50% with default settings
2. ✅ Preserve overall profile shape (peak position, general trend)
3. ✅ Handle edges without introducing artifacts
4. ✅ Support multiple smoothing methods
5. ✅ Complete in <10ms for typical profile sizes
6. ✅ Configurable window size

---

## Related Documents

- [Stage 2 Overview](./README.md)
- [Profile Extraction](./profile_extraction.md)
