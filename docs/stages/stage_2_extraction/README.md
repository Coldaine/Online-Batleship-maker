---
title: "Stage 2: Extraction & Geometry"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 2
status: Specification (Not Implemented)
---

# Stage 2: Extraction & Geometry

## Purpose

Extract precise silhouette profiles from blueprint images using deterministic pixel-level analysis. Transform raster images into mathematical curves that define the ship's envelope.

## The Problem

After grounding, we have verified dimensions and geometry hints. But we still need the actual hull shape:
- **Top view** → Beam (width) distribution along ship length
- **Side view** → Draft (height) distribution along ship length

These profile curves drive the 3D mesh generation in Stage 3.

---

## Stage Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Stage 2: Extraction & Geometry                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Grounded Crops    Background      Column          Profile        │
│   (from Stage 1) → Detection  →   Scanning  →   Smoothing  →     │
│                         │             │              │              │
│                         ▼             ▼              ▼              │
│                   ┌─────────────────────────────────────────┐      │
│                   │         ProfileData                     │      │
│                   │   - Top profile (beam distribution)     │      │
│                   │   - Side profile (height distribution)  │      │
│                   │   - Normalized 0-1 values               │      │
│                   └─────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Principle: Deterministic Processing

This stage is **entirely deterministic** — no AI, pure math:
- Same input → Same output, every time
- Reproducible results
- Fast execution
- Predictable behavior

---

## Components

### 1. Background Detection
**Purpose:** Identify the background color to distinguish ship pixels.

Approaches:
- Corner sampling (default)
- Edge pixel averaging
- Mode detection (most common color)
- User-specified override

### 2. Profile Extraction
**Purpose:** Scan columns/rows to measure ship extent at each position.

Algorithm:
1. For each column (x), find topmost and bottommost non-background pixels
2. Record height = bottom - top
3. Normalize to 0-1 scale

### 3. Smoothing
**Purpose:** Reduce noise while preserving profile shape.

Techniques:
- Moving average
- Configurable window size
- Edge preservation

---

## Data Flow

```
Input:
  - Grounded crop (side_profile or plan_view)
  - Extraction config (threshold, smoothing)

Processing:
  1. Load image as pixel array
  2. Detect background color
  3. Scan each column for content extent
  4. Normalize to 0-1 range
  5. Apply smoothing

Output:
  - ProfileData with curve, resolution, and bounds
```

---

## Component Documents

| Document | Description |
|----------|-------------|
| [Profile Extraction](./profile_extraction.md) | Core column-scanning algorithm |
| [Background Detection](./background_detection.md) | Identifying background vs. content |
| [Smoothing](./smoothing.md) | Noise reduction techniques |

---

## Success Criteria

1. ✅ Extract profiles from clean blueprints with >95% accuracy
2. ✅ Handle white, gray, and colored backgrounds
3. ✅ Complete extraction in <1 second for 4000px images
4. ✅ Produce deterministic output (same input → same output)
5. ✅ Configurable threshold and smoothing parameters
6. ✅ Gracefully handle edge cases (blank, tiny, huge images)

---

## Performance Requirements

| Image Size | Max Processing Time |
|------------|---------------------|
| 1000 × 500 | 100ms |
| 2000 × 1000 | 400ms |
| 4000 × 2000 | 1500ms |

---

## Dependencies

- Browser Canvas API (getImageData) or Node.js sharp/jimp
- No external ML/AI dependencies
- Pure TypeScript/JavaScript computation

---

## Related Documents

- [Stage 1: Grounding](../stage_1_grounding/README.md) — Input source
- [Stage 3: Generation](../stage_3_generation/README.md) — Next stage (consumes profiles)
