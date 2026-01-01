---
title: "Stage 0.2: Auto-Cropping"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 0
component: auto_cropping
status: Specification (Not Implemented)
---

# Auto-Cropping

## Purpose

Execute deterministic image cropping based on LLM-detected view boundaries. Each detected view becomes a separate, individually tracked asset.

## The Problem

After vision analysis tells us "there are 4 views at these coordinates," we need to:
- Actually perform the crops
- Save each crop as a separate file
- Generate consistent, meaningful filenames
- Handle edge cases (overlapping views, views at image edges)
- Preserve the original image as an archive

This is **deterministic** — given the same bounds, always produce the same crop.

---

## Interface Contract

```typescript
interface CropInput {
  sourceImage: string;         // Path to original image
  sourceImageId: string;       // Database ID of source
  views: DetectedView[];       // From vision analysis
  options?: CropOptions;
}

interface CropOptions {
  padding: number;             // Pixels to add around detected bounds (default: 5)
  minSize: { width: number; height: number };  // Minimum crop size
  outputFormat: 'png' | 'webp' | 'jpg';
  outputQuality: number;       // 1-100 for lossy formats
  outputDirectory: string;
}

interface CropOutput {
  crops: CropResult[];
  archivePath: string;         // Where original was archived
  errors: CropError[];
}

interface CropResult {
  cropId: string;              // Generated unique ID
  filePath: string;            // Where crop was saved
  filename: string;            // Just the filename
  bounds: {                    // Actual bounds used (may differ from input if adjusted)
    x: number;
    y: number;
    width: number;
    height: number;
  };
  sourceViewIndex: number;     // Which view this came from
  metadata: {
    viewType: ViewType;
    style: ViewStyle;
    orientation: Orientation;
    sourceImageId: string;
    croppedAt: string;         // ISO timestamp
  };
}

interface CropError {
  viewIndex: number;
  error: string;
  recoverable: boolean;
}
```

---

## Filename Convention

Crops should have meaningful, sortable filenames:

```
{shipClass}_{viewType}_{style}_{index}_{hash}.{ext}

Examples:
- karl_von_muller_side_profile_colored_001_a1b2c3.png
- yamato_plan_view_line_bw_002_d4e5f6.png
- unknown_side_profile_colored_001_g7h8i9.png
```

**Components:**
- `shipClass`: From identification, slugified (or "unknown")
- `viewType`: side_profile, plan_view, etc.
- `style`: colored, line_bw, etc.
- `index`: Sequential number for this type
- `hash`: Short hash of crop content for uniqueness
- `ext`: File extension based on format

---

## Algorithm Specification

```typescript
async function executeCrops(input: CropInput): Promise<CropOutput> {
  const { sourceImage, sourceImageId, views, options = defaultOptions } = input;

  // Load source image
  const image = await loadImage(sourceImage);
  const { width: imgWidth, height: imgHeight } = image;

  const crops: CropResult[] = [];
  const errors: CropError[] = [];

  for (const view of views) {
    try {
      // Adjust bounds with padding, clamped to image dimensions
      const bounds = adjustBounds(view.bounds, options.padding, imgWidth, imgHeight);

      // Validate minimum size
      if (bounds.width < options.minSize.width || bounds.height < options.minSize.height) {
        errors.push({
          viewIndex: view.index,
          error: `Crop too small: ${bounds.width}x${bounds.height}`,
          recoverable: false
        });
        continue;
      }

      // Execute crop
      const cropped = await cropImage(image, bounds);

      // Generate filename
      const filename = generateFilename(view, sourceImageId, cropped);
      const filePath = path.join(options.outputDirectory, filename);

      // Save crop
      await saveCrop(cropped, filePath, options.outputFormat, options.outputQuality);

      // Generate ID
      const cropId = generateCropId();

      crops.push({
        cropId,
        filePath,
        filename,
        bounds,
        sourceViewIndex: view.index,
        metadata: {
          viewType: view.viewType,
          style: view.style,
          orientation: view.orientation,
          sourceImageId,
          croppedAt: new Date().toISOString()
        }
      });

    } catch (err) {
      errors.push({
        viewIndex: view.index,
        error: err.message,
        recoverable: true
      });
    }
  }

  // Archive original
  const archivePath = await archiveOriginal(sourceImage, sourceImageId);

  return { crops, archivePath, errors };
}

function adjustBounds(
  bounds: Bounds,
  padding: number,
  maxWidth: number,
  maxHeight: number
): Bounds {
  return {
    x: Math.max(0, bounds.x - padding),
    y: Math.max(0, bounds.y - padding),
    width: Math.min(maxWidth - bounds.x + padding, bounds.width + padding * 2),
    height: Math.min(maxHeight - bounds.y + padding, bounds.height + padding * 2)
  };
}
```

---

## TDD Goals

### Test 1: Basic Cropping
```typescript
describe('auto cropping - basic', () => {
  it('should crop single view correctly', async () => {
    const result = await executeCrops({
      sourceImage: 'test_assets/single_view.png',
      sourceImageId: 'test_001',
      views: [{
        index: 0,
        bounds: { x: 10, y: 10, width: 100, height: 50 },
        viewType: 'side_profile',
        style: 'line_drawing_bw',
        orientation: 'bow_right',
        confidence: 0.95
      }]
    });

    expect(result.crops.length).toBe(1);
    expect(result.errors.length).toBe(0);
    expect(fs.existsSync(result.crops[0].filePath)).toBe(true);
  });

  it('should crop multiple views from single image', async () => {
    const result = await executeCrops({
      sourceImage: 'test_assets/four_views.png',
      sourceImageId: 'test_002',
      views: [
        { index: 0, bounds: { x: 0, y: 0, width: 800, height: 200 }, ... },
        { index: 1, bounds: { x: 0, y: 210, width: 800, height: 180 }, ... },
        { index: 2, bounds: { x: 0, y: 400, width: 800, height: 200 }, ... },
        { index: 3, bounds: { x: 0, y: 610, width: 800, height: 180 }, ... }
      ]
    });

    expect(result.crops.length).toBe(4);

    // Each crop should be a separate file
    const paths = result.crops.map(c => c.filePath);
    expect(new Set(paths).size).toBe(4);
  });
});
```

### Test 2: Bounds Adjustment
```typescript
describe('auto cropping - bounds', () => {
  it('should add padding to crops', async () => {
    const inputBounds = { x: 100, y: 100, width: 200, height: 100 };
    const padding = 10;

    const result = await executeCrops({
      sourceImage: 'test_assets/test.png',
      sourceImageId: 'test_003',
      views: [{ index: 0, bounds: inputBounds, ... }],
      options: { padding }
    });

    const actualBounds = result.crops[0].bounds;
    expect(actualBounds.x).toBe(90);  // 100 - 10
    expect(actualBounds.y).toBe(90);
    expect(actualBounds.width).toBe(220);  // 200 + 20
    expect(actualBounds.height).toBe(120);
  });

  it('should clamp bounds to image dimensions', async () => {
    // Request bounds that extend beyond image
    const result = await executeCrops({
      sourceImage: 'test_assets/small_100x100.png',
      sourceImageId: 'test_004',
      views: [{
        index: 0,
        bounds: { x: 80, y: 80, width: 50, height: 50 },  // Would extend to 130x130
        ...
      }],
      options: { padding: 10 }
    });

    const bounds = result.crops[0].bounds;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(100);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(100);
  });
});
```

### Test 3: Filename Generation
```typescript
describe('auto cropping - filenames', () => {
  it('should generate meaningful filenames', async () => {
    const result = await executeCrops({
      sourceImage: 'test_assets/yamato.png',
      sourceImageId: 'test_005',
      views: [{
        index: 0,
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        viewType: 'side_profile',
        style: 'filled_color',
        orientation: 'bow_right',
        confidence: 0.9
      }],
      shipClass: 'yamato'  // From identification
    });

    const filename = result.crops[0].filename;
    expect(filename).toMatch(/^yamato_side_profile_/);
    expect(filename).toMatch(/\.png$/);
  });

  it('should use "unknown" for unidentified ships', async () => {
    const result = await executeCrops({
      sourceImage: 'test_assets/unlabeled.png',
      sourceImageId: 'test_006',
      views: [{ ... }],
      shipClass: null
    });

    expect(result.crops[0].filename).toMatch(/^unknown_/);
  });

  it('should ensure unique filenames for duplicate content', async () => {
    const result1 = await executeCrops({ ... });
    const result2 = await executeCrops({ ... });  // Same inputs

    // Hashes ensure uniqueness
    expect(result1.crops[0].filename).not.toBe(result2.crops[0].filename);
  });
});
```

### Test 4: Error Handling
```typescript
describe('auto cropping - errors', () => {
  it('should skip crops below minimum size', async () => {
    const result = await executeCrops({
      sourceImage: 'test_assets/test.png',
      sourceImageId: 'test_007',
      views: [
        { index: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }, ... },  // Too small
        { index: 1, bounds: { x: 0, y: 50, width: 200, height: 100 }, ... }  // OK
      ],
      options: { minSize: { width: 50, height: 50 } }
    });

    expect(result.crops.length).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].viewIndex).toBe(0);
  });

  it('should continue processing after non-fatal errors', async () => {
    const result = await executeCrops({
      views: [
        { index: 0, bounds: { x: -10, y: 0, width: 100, height: 50 }, ... },  // Invalid
        { index: 1, bounds: { x: 0, y: 100, width: 100, height: 50 }, ... }   // Valid
      ]
    });

    expect(result.crops.length).toBe(1);
    expect(result.errors.length).toBe(1);
  });
});
```

### Test 5: Archive Original
```typescript
describe('auto cropping - archive', () => {
  it('should archive original image', async () => {
    const result = await executeCrops({
      sourceImage: 'test_assets/test.png',
      ...
    });

    expect(result.archivePath).toBeTruthy();
    expect(fs.existsSync(result.archivePath)).toBe(true);
  });

  it('should not delete original until archived', async () => {
    const originalPath = 'test_assets/test.png';
    const originalExists = fs.existsSync(originalPath);

    await executeCrops({ sourceImage: originalPath, ... });

    // Original should still exist (we copy, not move, in test mode)
    expect(fs.existsSync(originalPath)).toBe(originalExists);
  });
});
```

---

## Success Criteria

1. ✅ Produce pixel-perfect crops matching specified bounds
2. ✅ Handle padding correctly, clamped to image boundaries
3. ✅ Generate unique, meaningful filenames
4. ✅ Archive original images with full traceability
5. ✅ Report errors without failing entire batch
6. ✅ Process 100 crops in <10 seconds
7. ✅ Support PNG, WebP, and JPEG output formats

---

## Dependencies

- Image processing library: `sharp` (recommended) or `jimp`
- Filesystem access
- Crypto for hashing

---

## Related Documents

- [Stage 0 Overview](./README.md)
- [Vision Analysis](./vision_analysis.md) — Provides input bounds
- [Database Schema](./database_schema.md) — Where results are stored
