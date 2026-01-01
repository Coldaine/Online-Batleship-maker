---
title: "Stage 3: 3D Generation"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 3
status: Specification (Not Implemented)
---

# Stage 3: 3D Generation

## Purpose

Transform profile curves and grounded dimensions into 3D meshes, then optionally refine with AI for visualization and correction.

## The Problem

After Stages 1-2, we have:
- Verified ship dimensions (length, beam, draft)
- Geometry hints (turret positions, superstructure bounds)
- Extracted profile curves (top and side silhouettes)

We need to:
- Generate valid 3D mesh geometry from profiles
- Place components (turrets, superstructure, funnels)
- Export to standard 3D formats (OBJ)
- Optionally refine with AI visualization

---

## Stage Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Stage 3: 3D Generation                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Profile Data    Hull         Component       OBJ        AI       │
│   + Dimensions → Lofting  →  Placement  →   Export  → Refinement  │
│                     │            │             │           │        │
│                     │            │             │           ▼        │
│                     │            │             │     ┌───────────┐ │
│                     │            │             │     │  Rendered │ │
│                     │            │             │     │  Images   │ │
│                     │            │             │     └───────────┘ │
│                     ▼            ▼             ▼                    │
│              ┌─────────────────────────────────────────────────┐   │
│              │              Valid OBJ Mesh                      │   │
│              │   - Watertight hull                              │   │
│              │   - Turrets and superstructure                   │   │
│              │   - Grouped by component                         │   │
│              └─────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Two Sub-Stages

### 3A: Lofting (Deterministic)
Transform 2D profiles into 3D hull mesh using mathematical hull lofting.
- No AI — pure geometry
- Deterministic output
- Fast execution

### 3B: AI Refinement (Optional)
Use Gemini 3 Pro Image to:
- Generate photorealistic visualizations
- Suggest geometric corrections
- Validate mesh against blueprints

---

## Components

| Document | Description |
|----------|-------------|
| [Lofting](./lofting.md) | Hull mesh generation from profiles |
| [Component Placement](./component_placement.md) | Turrets, superstructure, funnels |
| [OBJ Export](./obj_export.md) | Wavefront OBJ file generation |
| [AI Refinement](./ai_refinement.md) | Gemini-powered visualization and correction |

---

## Data Flow

```
Input:
  - TopProfile (Float32Array, normalized)
  - SideProfile (Float32Array, normalized)
  - Dimensions { length, beam, draft }
  - GeometryHints { turrets, superstructure, funnels }

Lofting:
  1. Generate cross-sections along ship length
  2. Scale by profile values at each position
  3. Connect cross-sections into hull mesh
  4. Add bow and stern caps

Component Placement:
  1. Calculate deck surface
  2. Place turrets at normalized positions
  3. Generate superstructure block
  4. Add funnels if specified

Export:
  1. Combine all geometry
  2. Generate OBJ text format
  3. Include groups for each component

Refinement (optional):
  1. Render orthographic views of mesh
  2. Send to Gemini with blueprints
  3. Get corrections or visualizations
```

---

## Coordinate System

```
        Y (up)
        │
        │     Z (length, bow to stern)
        │    ╱
        │   ╱
        │  ╱
        │ ╱
        │╱
        └────────── X (beam, port to starboard)

- Origin: Midships, at waterline
- X: Positive = starboard, Negative = port
- Y: Positive = up (above waterline), Negative = down (below waterline)
- Z: 0 = bow, length = stern
```

---

## Success Criteria

1. ✅ Generate valid, parseable OBJ files
2. ✅ Produce watertight hull meshes
3. ✅ Match input dimensions within 1% error
4. ✅ Follow profile curves for hull shape
5. ✅ Place components at specified positions
6. ✅ Complete standard generation in <100ms
7. ✅ Optional AI refinement with <15s per view

---

## Dependencies

### Lofting
- No external libraries
- Pure TypeScript/JavaScript geometry
- Output: Plain text OBJ string

### AI Refinement
- Google Gemini API (`gemini-3-pro-image-preview`)
- Network connectivity
- API key with sufficient quota

---

## Related Documents

- [Stage 2: Extraction](../stage_2_extraction/README.md) — Input source
- [Gemini Capabilities](../../research/gemini_capabilities.md) — AI model research
- [North Star](../../north_star.md) — Guiding principles
