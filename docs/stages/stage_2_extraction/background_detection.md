---
title: "Stage 2.2: Background Detection"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 2
component: background_detection
status: Specification (Not Implemented)
---

# Background Detection

## Purpose

Correctly identify the background color in blueprint images to distinguish ship pixels from empty space.

## The Problem

Not all blueprints have white backgrounds:
- White paper scans
- Cream/off-white aged paper
- Gray backgrounds
- Blue technical paper
- Dark backgrounds with light ships

We need to reliably detect the background color regardless of the source.

---

## Interface Contract

```typescript
interface BackgroundDetectionInput {
  imageData: ImageData;
  mode: 'corners' | 'edges' | 'mode' | 'custom';
  customColor?: [number, number, number];
}

interface BackgroundDetectionOutput {
  color: [number, number, number];   // RGB
  confidence: number;                // 0-1
  method: string;                    // Which method was used
  samples: number;                   // How many pixels were sampled
}
```

---

## Detection Methods

### 1. Corner Sampling (Default)

Sample small regions at the four corners, assuming corners are likely background.

```typescript
function detectFromCorners(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  regionSize: number = 5
): [number, number, number] {
  const corners = [
    { x: 0, y: 0 },                           // Top-left
    { x: width - regionSize, y: 0 },          // Top-right
    { x: 0, y: height - regionSize },         // Bottom-left
    { x: width - regionSize, y: height - regionSize }  // Bottom-right
  ];

  const samples: [number, number, number][] = [];

  for (const corner of corners) {
    const regionColor = sampleRegion(data, width, corner.x, corner.y, regionSize, regionSize);
    samples.push(regionColor);
  }

  // Average the corner samples
  return averageColors(samples);
}
```

### 2. Edge Sampling

Sample all pixels along the image edges.

```typescript
function detectFromEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number] {
  const samples: [number, number, number][] = [];

  // Top and bottom edges
  for (let x = 0; x < width; x++) {
    samples.push(getPixel(data, width, x, 0));
    samples.push(getPixel(data, width, x, height - 1));
  }

  // Left and right edges (excluding corners already sampled)
  for (let y = 1; y < height - 1; y++) {
    samples.push(getPixel(data, width, 0, y));
    samples.push(getPixel(data, width, width - 1, y));
  }

  return averageColors(samples);
}
```

### 3. Mode Detection

Find the most common color in the image (assumes background is dominant).

```typescript
function detectFromMode(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  quantization: number = 8
): [number, number, number] {
  const colorCounts = new Map<string, { count: number; color: [number, number, number] }>();

  for (let i = 0; i < data.length; i += 4) {
    // Quantize to reduce unique colors
    const r = Math.floor(data[i] / quantization) * quantization;
    const g = Math.floor(data[i + 1] / quantization) * quantization;
    const b = Math.floor(data[i + 2] / quantization) * quantization;

    const key = `${r},${g},${b}`;
    const existing = colorCounts.get(key);

    if (existing) {
      existing.count++;
    } else {
      colorCounts.set(key, { count: 1, color: [r, g, b] });
    }
  }

  // Find most common
  let maxCount = 0;
  let modeColor: [number, number, number] = [255, 255, 255];

  for (const { count, color } of colorCounts.values()) {
    if (count > maxCount) {
      maxCount = count;
      modeColor = color;
    }
  }

  return modeColor;
}
```

---

## TDD Goals

### Test 1: White Background Detection
```typescript
describe('detectBackground - white', () => {
  it('should detect pure white background from corners', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 20, y: 20, w: 60, h: 60, color: '#000000' }]
    });

    const bg = detectBackground(imageData, 'corners');

    expect(bg.color[0]).toBeCloseTo(255, 0);
    expect(bg.color[1]).toBeCloseTo(255, 0);
    expect(bg.color[2]).toBeCloseTo(255, 0);
    expect(bg.confidence).toBeGreaterThan(0.9);
  });

  it('should detect off-white background', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#F5F5DC',  // Beige
      shapes: [{ type: 'rect', x: 20, y: 20, w: 60, h: 60, color: '#000000' }]
    });

    const bg = detectBackground(imageData, 'corners');

    expect(bg.color[0]).toBeCloseTo(245, 5);
    expect(bg.color[1]).toBeCloseTo(245, 5);
    expect(bg.color[2]).toBeCloseTo(220, 5);
  });
});
```

### Test 2: Colored Background Detection
```typescript
describe('detectBackground - colored', () => {
  it('should detect gray background', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#808080',
      shapes: []
    });

    const bg = detectBackground(imageData, 'corners');

    expect(bg.color[0]).toBeCloseTo(128, 5);
    expect(bg.color[1]).toBeCloseTo(128, 5);
    expect(bg.color[2]).toBeCloseTo(128, 5);
  });

  it('should detect blue technical paper', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#1E3A5F',  // Dark blue
      shapes: [{ type: 'rect', x: 20, y: 20, w: 60, h: 60, color: '#FFFFFF' }]
    });

    const bg = detectBackground(imageData, 'corners');

    expect(bg.color[2]).toBeGreaterThan(bg.color[0]);  // More blue than red
    expect(bg.color[2]).toBeGreaterThan(bg.color[1]);  // More blue than green
  });
});
```

### Test 3: Mode Detection
```typescript
describe('detectBackground - mode', () => {
  it('should find dominant color', () => {
    // Image that's 80% white, 20% black
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 0, y: 0, w: 20, h: 100, color: '#000000' }]
    });

    const bg = detectBackground(imageData, 'mode');

    // Should detect white as dominant
    expect(bg.color[0]).toBeCloseTo(255, 10);
    expect(bg.color[1]).toBeCloseTo(255, 10);
    expect(bg.color[2]).toBeCloseTo(255, 10);
  });

  it('should work when content is in corners', () => {
    // Ship extends to corners (corners method would fail)
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#FFFFFF',
      shapes: [{ type: 'rect', x: 0, y: 40, w: 100, h: 20, color: '#000000' }]
    });

    const cornerBg = detectBackground(imageData, 'corners');
    const modeBg = detectBackground(imageData, 'mode');

    // Mode should still find white
    expect(modeBg.color[0]).toBeCloseTo(255, 10);
    // Corners might be mixed (ship at edges)
    expect(modeBg.confidence).toBeGreaterThan(cornerBg.confidence);
  });
});
```

### Test 4: Custom Color
```typescript
describe('detectBackground - custom', () => {
  it('should use user-specified color', () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#123456',
      shapes: []
    });

    const bg = detectBackground(imageData, 'custom', [100, 150, 200]);

    expect(bg.color).toEqual([100, 150, 200]);
    expect(bg.confidence).toBe(1.0);
    expect(bg.method).toBe('custom');
  });
});
```

### Test 5: Noisy Backgrounds
```typescript
describe('detectBackground - noise', () => {
  it('should handle noisy scanned paper', () => {
    // Add noise to white background
    const imageData = createNoisyImage({
      width: 100,
      height: 100,
      baseColor: '#FFFFFF',
      noiseLevel: 10,  // ±10 per channel
      shapes: [{ type: 'rect', x: 30, y: 30, w: 40, h: 40, color: '#000000' }]
    });

    const bg = detectBackground(imageData, 'corners');

    // Should still detect approximately white
    expect(bg.color[0]).toBeGreaterThan(240);
    expect(bg.color[1]).toBeGreaterThan(240);
    expect(bg.color[2]).toBeGreaterThan(240);
    expect(bg.confidence).toBeGreaterThan(0.7);
  });
});
```

---

## Selection Strategy

```typescript
function autoDetectBackground(imageData: ImageData): BackgroundDetectionOutput {
  const corners = detectBackground(imageData, 'corners');
  const edges = detectBackground(imageData, 'edges');
  const mode = detectBackground(imageData, 'mode');

  // Check if methods agree
  const cornerEdgeDistance = colorDistance(corners.color, edges.color);
  const cornerModeDistance = colorDistance(corners.color, mode.color);

  if (cornerEdgeDistance < 20 && cornerModeDistance < 20) {
    // All methods agree - high confidence
    return { ...corners, confidence: 0.95 };
  }

  if (corners.confidence > 0.8) {
    return corners;
  }

  // Fallback to mode if corners are unreliable
  return mode;
}
```

---

## Success Criteria

1. ✅ Detect white/off-white backgrounds with >95% accuracy
2. ✅ Detect colored backgrounds correctly
3. ✅ Handle noisy scanned images
4. ✅ Provide meaningful confidence scores
5. ✅ Support user override for edge cases
6. ✅ Complete detection in <50ms

---

## Related Documents

- [Stage 2 Overview](./README.md)
- [Profile Extraction](./profile_extraction.md)
