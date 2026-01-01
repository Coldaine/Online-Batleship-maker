---
title: "Phase 3: Computational Extraction"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 3
type: Deterministic
status: Implemented (Basic) / In Development (Advanced)
---

# Phase 3: Computational Extraction

## Purpose

Extract precise silhouette profiles from blueprint images using deterministic pixel-level analysis. This is the "eyes" of the system — pure math, no AI.

## Component

**File:** `src/utils/VisionKernel.ts`
**Function:** `traceSilhouette()`

## Interface

```typescript
// Configuration
interface TraceConfig {
  threshold: number;     // 0-255, distance from background to count as opaque
  smoothing: number;     // 0-10, moving average window size
  isSideView: boolean;   // Affects interpretation of axes
}

// Input
interface ExtractionInput {
  imageData: ImageData;  // Raw pixel data from canvas
  config: TraceConfig;
}

// Output
interface ProfileData {
  profile: Float32Array; // Normalized values 0.0-1.0
  resolution: number;    // Samples (columns analyzed)
  peaks: {
    maxValue: number;    // Highest point before normalization
    maxIndex: number;    // Position of highest point
  };
}
```

## Algorithm

### Core Concept

For each column (Z-axis = ship length), scan vertically to find the extent of opaque pixels. This gives us the "height" of the ship at each point along its length.

```
        Column 0    Column N/2    Column N
           │           │            │
           ▼           ▼            ▼
     ┌─────────────────────────────────────┐
     │     ███████████████████████████     │  ← Top edge
     │   █████████████████████████████████ │
     │  ███████████████████████████████████│
     │   █████████████████████████████████ │
     │     ███████████████████████████     │  ← Bottom edge
     └─────────────────────────────────────┘

     Profile[0] = small
     Profile[N/2] = large (superstructure)
     Profile[N] = small (stern)
```

### Step-by-Step Process

```typescript
function traceSilhouette(imageData: ImageData, config: TraceConfig): ProfileData {
  const { width, height, data } = imageData;
  const { threshold, smoothing } = config;

  // Step 1: Determine background color (sample corners)
  const bgColor = detectBackground(data, width, height);

  // Step 2: Scan each column
  const rawProfile = new Float32Array(width);

  for (let x = 0; x < width; x++) {
    let minY = height;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const pixel = [data[idx], data[idx + 1], data[idx + 2]];

      const distance = euclideanDistance(pixel, bgColor);

      if (distance > threshold) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    // Height at this column (0 if no opaque pixels found)
    rawProfile[x] = maxY > minY ? (maxY - minY) / height : 0;
  }

  // Step 3: Normalize to 0-1 range
  const maxValue = Math.max(...rawProfile);
  const normalized = rawProfile.map(v => v / maxValue);

  // Step 4: Apply smoothing
  const smoothed = movingAverage(normalized, smoothing);

  return {
    profile: smoothed,
    resolution: width,
    peaks: { maxValue, maxIndex: rawProfile.indexOf(maxValue) }
  };
}
```

### Helper Functions

```typescript
function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2
  );
}

function detectBackground(data: Uint8ClampedArray, w: number, h: number): number[] {
  // Sample corners and take average
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1]
  ];

  let r = 0, g = 0, b = 0;
  for (const [x, y] of corners) {
    const idx = (y * w + x) * 4;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
  }

  return [r / 4, g / 4, b / 4];
}

function movingAverage(arr: Float32Array, window: number): Float32Array {
  if (window <= 1) return arr;

  const result = new Float32Array(arr.length);
  const half = Math.floor(window / 2);

  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;

    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < arr.length) {
        sum += arr[j];
        count++;
      }
    }

    result[i] = sum / count;
  }

  return result;
}
```

## Profile Interpretation

### Top View Profile

Represents **beam (width)** distribution along ship length:

```
Profile Value
    1.0 │          ████████
        │        ██        ██
        │      ██            ██
        │    ██                ██
    0.0 │__██____________________██__
        Bow                      Stern

Meaning: Ship is widest at midships, tapers at bow and stern
```

### Side View Profile

Represents **draft/height** distribution along ship length:

```
Profile Value
    1.0 │     ████████████
        │   ██  (superstructure) ██
        │ ██                        ██
        │██   (hull)                  ██
    0.0 │________________________________
        Bow                          Stern

Meaning: Superstructure creates height peak, hull is lower
```

## Configuration Guidelines

| Blueprint Style | Threshold | Smoothing |
|-----------------|-----------|-----------|
| Clean vector graphics | 30-50 | 1-2 |
| Scanned documents | 50-80 | 3-5 |
| Hand-drawn sketches | 80-120 | 5-8 |
| Low contrast images | 20-40 | 2-4 |

## Visualization

The extracted profile can be rendered as an overlay:

```typescript
function renderProfileOverlay(
  ctx: CanvasRenderingContext2D,
  profile: Float32Array,
  color: string = '#00ff00'
): void {
  const { width, height } = ctx.canvas;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let x = 0; x < profile.length; x++) {
    const screenX = (x / profile.length) * width;
    const screenY = height - (profile[x] * height);

    if (x === 0) {
      ctx.moveTo(screenX, screenY);
    } else {
      ctx.lineTo(screenX, screenY);
    }
  }

  ctx.stroke();
}
```

## Error Handling

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| All-white image | `maxValue === 0` | Return error, prompt for different image |
| Inverted colors | Ship darker than background | Invert threshold logic |
| Noisy edges | Jagged profile | Increase smoothing |
| Multiple objects | Multiple peaks | Warn user, use largest contiguous region |

## Testing

**File:** `src/utils/VisionKernel.test.ts`

Test cases:
- Synthetic rectangle → flat profile
- Synthetic triangle → linear gradient profile
- All-black image → zero profile
- Edge cases (single pixel, single column)

## Future Enhancements

### Planned for Phase 2 Implementation

1. **Adaptive thresholding**: AI suggests optimal threshold per-image
2. **Color segmentation**: Separate hull from deck from superstructure
3. **Edge detection**: Canny/Sobel for cleaner boundaries
4. **Contour tracing**: Full 2D outline, not just column heights
5. **Symmetry enforcement**: Mirror asymmetric hand-drawn blueprints

### Advanced Features

1. **Multi-layer extraction**: Separate waterline, deck line, superstructure line
2. **Feature detection**: Identify turrets, funnels, masts as distinct objects
3. **Scale detection**: Auto-detect scale bars in blueprint
4. **Annotation removal**: Filter out text and dimension lines

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Proposal: Computational Extraction](../proposal_computational_extraction.md) — Detailed spec
- [Implementation Plan Phase 2](../implementation_plan_phase_2.md) — VisionKernel roadmap
- [Phase 2: Grounding](./phase_2_grounding.md) — Previous phase
- [Phase 4: Lofting](./phase_4_lofting.md) — Next phase
