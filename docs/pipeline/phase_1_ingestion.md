---
title: "Phase 1: Ingestion & Normalization — Specification"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 1
type: Deterministic
status: Specification (Not Implemented)
---

# Phase 1: Ingestion & Normalization

## Purpose

Accept blueprint images and produce clean, separated orthographic views (top and side) ready for downstream processing.

## The Problem

Users have blueprint images in various formats:
- Combined images with both top and side views
- Separate files for each view
- Scanned documents with noise, skew, and artifacts
- Vector graphics exported as raster images
- Hand-drawn sketches with inconsistent line weights

We need to normalize these into a consistent format.

---

## Interface Contract

```typescript
// Input: One of these two options
type IngestionInput =
  | { mode: 'combined'; image: File }
  | { mode: 'separate'; topImage: File; sideImage: File };

// Output: Always this structure
interface IngestionOutput {
  topView: {
    dataUrl: string;        // Base64 data URL (image/png)
    width: number;          // Pixels
    height: number;         // Pixels
    aspectRatio: number;    // width / height
  };
  sideView: {
    dataUrl: string;
    width: number;
    height: number;
    aspectRatio: number;
  };
  metadata: {
    originalFilename: string;
    inputMode: 'combined' | 'separate';
    processingSteps: string[];  // Audit trail
  };
}
```

---

## Pain Points & Challenges

### 1. View Classification
**Problem:** How do we know which region is "top" vs "side"?

**Approaches:**
- **Aspect ratio heuristic**: Top views are typically wider than tall (ship from above shows length >> beam)
- **AI classification**: Ask Gemini to identify which is which
- **User confirmation**: Always ask user to verify/swap

**Recommendation:** Use heuristics as default, allow user override. Don't rely on AI for this deterministic step.

### 2. Combined Image Splitting
**Problem:** How do we find the boundary between views in a combined image?

**Approaches:**
- **User-drawn crop regions**: Most reliable but requires interaction
- **Whitespace detection**: Scan for horizontal/vertical gaps
- **Connected component analysis**: Find separate ink regions

**Recommendation:** Start with user-drawn regions. Automated splitting is a future enhancement.

### 3. Content Bounds Detection
**Problem:** How do we crop to just the ship, excluding whitespace?

**Approaches:**
- **Threshold-based**: Find bounding box of non-white pixels
- **Edge-detection**: Use Canny/Sobel to find content edges
- **Conservative padding**: Keep 5% margin around detected content

**Recommendation:** Threshold-based with padding. Simple, predictable, testable.

### 4. Orientation Normalization
**Problem:** What if the ship is rotated or the image is skewed?

**Decision:** For v1, do NOT auto-rotate. Require properly oriented input. Document this as a known limitation.

---

## Algorithm Specification

### For Separate Images (Simple Path)

```
1. Load each image file as HTMLImageElement
2. Draw to canvas at native resolution
3. Detect content bounds (bounding box of non-background pixels)
4. Crop to content bounds with 2% padding
5. Export as base64 PNG
6. Classify views by aspect ratio:
   - If width/height > 2.5 → likely side view (long profile)
   - If 1.2 < width/height < 2.5 → likely top view (plan view)
   - If uncertain → ask user
7. Return IngestionOutput
```

### For Combined Image (Interactive Path)

```
1. Load image and display in canvas
2. User draws two rectangular regions
3. For each region:
   a. Extract pixels at native resolution
   b. Create new canvas with region dimensions
   c. Draw extracted pixels
   d. Export as base64 PNG
4. Classify each region by aspect ratio
5. Allow user to swap classifications
6. Return IngestionOutput
```

---

## TDD Goals

### Test 1: Basic Image Loading
**Goal:** Given a valid image file, successfully load and return dimensions.

```typescript
describe('loadImage', () => {
  it('should load a PNG and return correct dimensions', async () => {
    const file = createTestFile('100x50.png', 100, 50);
    const result = await loadImage(file);

    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('should reject non-image files', async () => {
    const file = createTestFile('document.pdf');
    await expect(loadImage(file)).rejects.toThrow('Invalid image format');
  });
});
```

**Pass Criteria:** Test passes with actual PNG/JPG files.

---

### Test 2: Content Bounds Detection
**Goal:** Given an image with whitespace padding, detect the bounding box of actual content.

```typescript
describe('detectContentBounds', () => {
  it('should find tight bounds around black rectangle on white bg', async () => {
    // Create 100x100 image with 20x20 black rectangle at (40, 30)
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#FFFFFF',
      rectangles: [{ x: 40, y: 30, w: 20, h: 20, color: '#000000' }]
    });

    const bounds = detectContentBounds(imageData);

    expect(bounds.x).toBe(40);
    expect(bounds.y).toBe(30);
    expect(bounds.width).toBe(20);
    expect(bounds.height).toBe(20);
  });

  it('should handle non-white backgrounds', async () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#F0F0F0',  // Light gray
      rectangles: [{ x: 10, y: 10, w: 80, h: 80, color: '#333333' }]
    });

    const bounds = detectContentBounds(imageData, { backgroundTolerance: 20 });

    expect(bounds.x).toBe(10);
    expect(bounds.y).toBe(10);
  });

  it('should return full image bounds if no content detected', async () => {
    const imageData = createTestImage({
      width: 100,
      height: 100,
      background: '#FFFFFF',
      rectangles: []  // Empty image
    });

    const bounds = detectContentBounds(imageData);

    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(100);
  });
});
```

**Pass Criteria:** Correctly identifies content in synthetic test images.

---

### Test 3: View Classification by Aspect Ratio
**Goal:** Given image dimensions, classify as 'top' or 'side' view.

```typescript
describe('classifyView', () => {
  it('should classify very wide images as side view', () => {
    expect(classifyView({ width: 500, height: 100 })).toBe('side');
    expect(classifyView({ width: 800, height: 150 })).toBe('side');
  });

  it('should classify moderately wide images as top view', () => {
    expect(classifyView({ width: 300, height: 150 })).toBe('top');
    expect(classifyView({ width: 400, height: 200 })).toBe('top');
  });

  it('should return uncertain for ambiguous ratios', () => {
    expect(classifyView({ width: 100, height: 100 })).toBe('uncertain');
    expect(classifyView({ width: 150, height: 120 })).toBe('uncertain');
  });
});
```

**Pass Criteria:** Classification matches expected behavior for known aspect ratios.

---

### Test 4: Region Extraction
**Goal:** Given an image and crop coordinates, extract that region accurately.

```typescript
describe('extractRegion', () => {
  it('should extract exact pixels from specified region', async () => {
    // Create image with distinct colored quadrants
    const sourceImage = createQuadrantImage(100, 100, {
      topLeft: '#FF0000',
      topRight: '#00FF00',
      bottomLeft: '#0000FF',
      bottomRight: '#FFFF00'
    });

    // Extract top-right quadrant
    const region = await extractRegion(sourceImage, {
      x: 50, y: 0, width: 50, height: 50
    });

    // Verify extracted image is pure green
    const avgColor = getAverageColor(region);
    expect(avgColor.r).toBe(0);
    expect(avgColor.g).toBe(255);
    expect(avgColor.b).toBe(0);
  });

  it('should handle regions extending beyond image bounds', async () => {
    const sourceImage = createTestImage({ width: 100, height: 100 });

    // Request region partially outside image
    await expect(extractRegion(sourceImage, {
      x: 80, y: 80, width: 50, height: 50
    })).rejects.toThrow('Region extends beyond image bounds');
  });
});
```

**Pass Criteria:** Extracted pixels match source region exactly.

---

### Test 5: Full Ingestion Pipeline
**Goal:** End-to-end test with real blueprint-like test images.

```typescript
describe('ingestBlueprint', () => {
  it('should process combined image with two views', async () => {
    // Create test image with top view (wider) and side view (taller)
    const combined = createCombinedBlueprintTest({
      topView: { x: 10, y: 10, width: 200, height: 100 },
      sideView: { x: 10, y: 130, width: 200, height: 50 }
    });

    const result = await ingestBlueprint({
      mode: 'combined',
      image: combined,
      cropRegions: [
        { x: 10, y: 10, width: 200, height: 100 },
        { x: 10, y: 130, width: 200, height: 50 }
      ]
    });

    expect(result.topView.aspectRatio).toBeCloseTo(2.0, 1);
    expect(result.sideView.aspectRatio).toBeCloseTo(4.0, 1);
    expect(result.metadata.inputMode).toBe('combined');
  });

  it('should process two separate images', async () => {
    const topFile = createTestFile('top.png', 300, 150);
    const sideFile = createTestFile('side.png', 400, 80);

    const result = await ingestBlueprint({
      mode: 'separate',
      topImage: topFile,
      sideImage: sideFile
    });

    expect(result.topView.width).toBe(300);
    expect(result.sideView.width).toBe(400);
    expect(result.metadata.inputMode).toBe('separate');
  });
});
```

**Pass Criteria:** Pipeline produces valid IngestionOutput for both input modes.

---

## Success Criteria

A correct implementation of Phase 1 will:

1. ✅ Accept PNG/JPG images up to 10MB
2. ✅ Detect content bounds with <5px error on clean images
3. ✅ Classify top/side views with >90% accuracy on typical blueprints
4. ✅ Extract regions without pixel distortion
5. ✅ Run in <500ms for images under 4000x4000 pixels
6. ✅ Work entirely client-side (no server calls)
7. ✅ Produce consistent output (deterministic)

---

## What's NOT In Scope (v1)

- Automatic rotation/deskewing
- Automatic view boundary detection (for combined images)
- Text/annotation removal
- Multi-page document handling
- Non-orthographic view detection (isometric, perspective)

---

## Dependencies

- Browser Canvas API
- No external libraries required
- Input: User-selected files via `<input type="file">`
- Output: Base64 data URLs

---

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Phase 2: Grounding](./phase_2_grounding.md) — Next phase (consumes this output)
