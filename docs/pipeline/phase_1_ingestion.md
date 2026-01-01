---
title: "Phase 1: Ingestion & Normalization"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 1
type: Deterministic (Human-Assisted)
status: Implemented
---

# Phase 1: Ingestion & Normalization

## Purpose

Receive blueprint images and separate them into distinct orthographic views (top and side) with human verification.

## Component

**File:** `components/BlueprintSplitter.tsx`

## Interface

```typescript
// Input
interface IngestionInput {
  masterImage: File | null;      // Combined blueprint image
  topImage: File | null;         // Pre-separated top view
  sideImage: File | null;        // Pre-separated side view
}

// Output
interface IngestionOutput {
  topView: string;               // Base64 encoded top view
  sideView: string;              // Base64 encoded side view
  metadata: {
    originalWidth: number;
    originalHeight: number;
    cropRegions: CropRegion[];
  }
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label: 'top' | 'side';
}
```

## Process Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     USER UPLOADS IMAGE                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
     ┌─────────────────┐            ┌─────────────────┐
     │ Combined Image  │            │ Separate Images │
     │ (Master Upload) │            │ (Top + Side)    │
     └─────────────────┘            └─────────────────┘
              │                               │
              ▼                               │
     ┌─────────────────┐                      │
     │ BlueprintSplitter                      │
     │ ─────────────────                      │
     │ • Interactive crop                     │
     │ • Aspect ratio heuristics              │
     │ • Label assignment                     │
     │ • User verification                    │
     └─────────────────┘                      │
              │                               │
              ▼                               ▼
     ┌─────────────────────────────────────────────────────────┐
     │              topView.base64 + sideView.base64           │
     └─────────────────────────────────────────────────────────┘
```

## Classification Heuristics

The BlueprintSplitter uses aspect ratio to auto-classify views:

```typescript
function classifyView(region: CropRegion): 'top' | 'side' {
  const aspectRatio = region.width / region.height;

  // Top views are typically wider than tall (ship from above)
  // Side views are typically longer than tall (ship profile)

  if (aspectRatio > 3.0) {
    return 'side';  // Very elongated = side profile
  } else if (aspectRatio > 1.5) {
    return 'top';   // Moderately wide = top view
  } else {
    return 'side';  // Default to side if ambiguous
  }
}
```

**Note:** User can swap labels if heuristic is incorrect.

## UI Features

1. **Canvas-based cropping**
   - Drag to draw rectangular regions
   - Precise coordinate capture
   - Visual feedback with colored overlays

2. **Region visualization**
   - Green overlay = Top view
   - Amber overlay = Side view
   - Labels displayed on regions

3. **Label management**
   - Click to swap top/side designation
   - Validation ensures both views present

4. **Scale handling**
   - Displays at screen size
   - Extracts at native resolution
   - Coordinate math handles display/native mapping

## Implementation Notes

### Coordinate Scaling

```typescript
// Convert display coordinates to natural image coordinates
function toNaturalCoords(displayX: number, displayY: number): Point {
  const scaleX = naturalWidth / displayWidth;
  const scaleY = naturalHeight / displayHeight;

  return {
    x: displayX * scaleX,
    y: displayY * scaleY
  };
}
```

### Base64 Extraction

```typescript
async function extractRegion(image: HTMLImageElement, region: CropRegion): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = region.width;
  canvas.height = region.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    image,
    region.x, region.y, region.width, region.height,  // Source
    0, 0, region.width, region.height                  // Destination
  );

  return canvas.toDataURL('image/png');
}
```

## Error Handling

| Error Case | Handling |
|------------|----------|
| No image uploaded | Disable proceed button |
| Only one region defined | Prompt for second view |
| Both regions same label | Auto-correct or prompt |
| Overlapping regions | Allow (user discretion) |

## Future Enhancements

1. **Scanline auto-detection**: Automatically find view boundaries
2. **Rotation correction**: Detect and correct skewed blueprints
3. **Text removal**: Clean up annotations before extraction
4. **Multi-view support**: Handle 3+ views (front, stern, etc.)

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Phase 2: Grounding](./phase_2_grounding.md) — Next phase
