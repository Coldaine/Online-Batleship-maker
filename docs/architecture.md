---
title: NavalForge 3D — System Architecture
date: 2026-01-01
author: Claude (Opus 4.5)
status: Living Document
---

# System Architecture

## Overview

NavalForge 3D is a **hybrid deterministic-AI pipeline** that transforms 2D naval blueprints into 3D ship models. The system is organized into five sequential phases, each with clear inputs, outputs, and responsibilities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NAVALFORGE 3D PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐   │
│  │ PHASE 1 │───▶│ PHASE 2 │───▶│ PHASE 3 │───▶│ PHASE 4 │───▶│ PHASE 5 │   │
│  │Ingestion│    │Grounding│    │Extract  │    │ Lofting │    │ Refine  │   │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘   │
│       │              │              │              │              │         │
│       ▼              ▼              ▼              ▼              ▼         │
│   [Images]      [Metadata]     [Curves]        [Mesh]        [Output]      │
│   base64        ShipClass      Float[]          OBJ          Refined       │
│   top/side      Dimensions     profiles        geometry       3D viz       │
│                                                                             │
│  ════════════════════════════════════════════════════════════════════════  │
│  │← DETERMINISTIC ──────────────────────────▶│←── AI-ASSISTED ─────────▶│  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown

### Phase 1: Ingestion & Normalization

**Type:** Deterministic (Human-Assisted)
**Component:** `BlueprintSplitter.tsx`
**Purpose:** Separate and classify blueprint views

| Input | Output |
|-------|--------|
| Single combined blueprint image | Two base64 images: `topView`, `sideView` |

**Process:**
1. User uploads combined or individual blueprint images
2. Interactive canvas allows rectangular region selection
3. Aspect ratio heuristics auto-classify "Top" vs "Side"
4. User can swap labels if misclassified
5. Regions extracted at native resolution

**Key Decisions:**
- Human-in-the-loop for view separation (eliminates ambiguity)
- Coordinate math preserves precision across display/native scaling

---

### Phase 2: Semantic Grounding

**Type:** AI-Assisted (Probabilistic)
**Component:** `geminiService.ts` → `analyzeBlueprint()`
**Purpose:** Identify ship class and retrieve real-world data

| Input | Output |
|-------|--------|
| Blueprint image (base64) | `AnalysisData` JSON |

**Process:**
1. Image sent to Gemini 2.5 Flash with structured schema
2. AI identifies ship class (e.g., "Yamato", "Iowa", "Bismarck")
3. Google Search grounding retrieves real dimensions (length, beam, draft)
4. Geometric hints extracted (turret positions, superstructure bounds)
5. Structured JSON returned with metadata

**Output Schema:**
```typescript
AnalysisData {
  shipClass: string
  estimatedLength: string
  armament: string[]
  designYear: string
  description: string
  realDimensions?: { length, beam, draft }  // From grounding
  geometry?: {
    turrets: number[]        // Normalized 0-1 positions
    superstructure: { start, end }
  }
}
```

**Key Decisions:**
- Use Google Search for authoritative ship specifications
- Structured output prevents hallucinated formats
- Geometry hints are normalized (0-1) for resolution independence

---

### Phase 3: Computational Extraction

**Type:** Deterministic
**Component:** `VisionKernel.ts` → `traceSilhouette()`
**Purpose:** Extract profile curves from blueprint images

| Input | Output |
|-------|--------|
| Blueprint image (ImageData) | Normalized float arrays (0.0-1.0) |

**Process:**
1. Scan image column-by-column (Z-axis = ship length)
2. For each column, find min/max opaque pixels (Y-axis)
3. Calculate distance from background color (Euclidean)
4. Normalize peaks to 1.0
5. Apply moving-average smoothing to eliminate noise

**Algorithm:**
```
for each column z in [0, width]:
    for each pixel y in [0, height]:
        if euclidean_distance(pixel, background) > threshold:
            record y as opaque
    profile[z] = (max_y - min_y) / height  // Normalized
```

**Output:**
- `topProfile: Float32Array` — Beam distribution along length
- `sideProfile: Float32Array` — Draft distribution along length

**Key Decisions:**
- Pure pixel math (no AI) for reproducibility
- Smoothing factor configurable per-image
- Threshold adjustable for different blueprint styles

---

### Phase 4: Elastic Lofting

**Type:** Deterministic
**Component:** `meshGenerator.ts` → `generateShipObj()`
**Purpose:** Generate 3D mesh from profile curves

| Input | Output |
|-------|--------|
| Profile curves + AnalysisData + ShipParameters | Wavefront OBJ file |

**Process:**
1. Create hull cross-sections by combining top/side profiles
2. Interpolate cross-sections along ship length (bow → stern)
3. Generate superstructure box from geometry hints
4. Place turrets procedurally at detected positions
5. Apply user parameter overrides (extrusion %, scales)
6. Export as OBJ with proper vertex/face topology

**Hull Lofting Algorithm:**
```
for each z in [0, ship_length]:
    beam = topProfile[z] * maxBeam
    draft = sideProfile[z] * maxDraft

    for each angle in [0, 2π]:
        x = beam * cos(angle)
        y = draft * sin(angle)  // Elliptical cross-section
        vertices.push(x, y, z)
```

**Key Decisions:**
- Elliptical cross-section as default hull shape
- 24 length segments, 8 radial resolution (configurable)
- Separate geometry groups for hull/superstructure/turrets

---

### Phase 5: AI Refinement

**Type:** AI-Assisted (Probabilistic)
**Component:** `geminiService.ts` → `generate3DView()` + Future refinement
**Purpose:** Enhance and refine the 3D output

| Input | Output |
|-------|--------|
| Base mesh + Original blueprints | Refined 3D visualization |

**Current Implementation:**
- Gemini 3 Pro Image (Nano Banana Pro) generates photorealistic visualization
- Uses original blueprints + ship class as context

**Planned Enhancement (Hybrid Refinement):**
```
┌─────────────────────────────────────────────────────────────┐
│  REFINEMENT OPTIONS                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Option A: 2D Correction (Near-term)                        │
│  ───────────────────────────────────────                    │
│  1. Render base OBJ from multiple angles                    │
│  2. Send renders + blueprints to Nano Banana Pro            │
│  3. AI refines visual (adds detail, fixes proportions)      │
│  4. Output: Enhanced 2D renders                             │
│                                                             │
│  Option B: 3D Correction (Future)                           │
│  ───────────────────────────────────────                    │
│  1. Send base mesh geometry to AI                           │
│  2. AI suggests structured corrections:                     │
│     - "Hull should curve inward 15% at waterline"           │
│     - "Bow angle too steep, reduce by 10°"                  │
│  3. Apply corrections to mesh programmatically              │
│  4. Output: Corrected OBJ file                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
User uploads blueprint
        │
        ▼
┌───────────────────┐
│ BlueprintSplitter │ ──▶ topView.base64, sideView.base64
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Gemini Analysis  │ ──▶ AnalysisData { shipClass, dimensions, geometry }
└───────────────────┘
        │
        ▼
┌───────────────────┐
│   VisionKernel    │ ──▶ topProfile[], sideProfile[]
└───────────────────┘
        │
        ▼
┌───────────────────┐
│   meshGenerator   │ ──▶ ship.obj (vertices, faces, groups)
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Nano Banana Pro  │ ──▶ Refined 3D visualization
└───────────────────┘
        │
        ▼
User downloads OBJ + views rendered output
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19 + TypeScript | UI, state management |
| Build | Vite 6 | Fast dev server, bundling |
| Styling | Tailwind CSS | Utility-first CSS |
| AI - Analysis | Gemini 2.5 Flash | Blueprint analysis, grounding |
| AI - Generation | Gemini 3 Pro Image | 3D visualization, refinement |
| Grounding | Google Search | Real-world ship dimensions |
| 3D Export | Custom OBJ generator | Mesh file creation |
| Testing | Vitest | Unit tests |

---

## Key Interfaces

```typescript
// User-adjustable parameters
interface ShipParameters {
  hullExtrusion: number      // % inflation of hull envelope
  turretScale: number        // % scaling of turret geometry
  superstructureHeight: number
  calibrationScale: number   // meters per pixel
  modelStyle: ModelStyle     // Wireframe | Clay | Photorealistic
  camouflage: string         // Navy Grey | Dazzle | Measure 22
  dimensions: ShipDimensions // length, beam, draft (meters)
}

// AI analysis output
interface AnalysisData {
  shipClass: string
  realDimensions?: ShipDimensions
  geometry?: GeometricMap
  // ... additional metadata
}

// Extracted silhouettes
interface ProfileData {
  top: Float32Array    // Beam at each length position
  side: Float32Array   // Draft at each length position
  resolution: number   // Samples per meter
}
```

---

## Design Principles

1. **Separation of Concerns**: Each phase has single responsibility
2. **Deterministic Core**: Geometry extraction/generation is pure math
3. **AI at Boundaries**: AI handles ambiguity, not computation
4. **Progressive Enhancement**: Each phase improves on the last
5. **Inspectable Artifacts**: Every intermediate output is human-readable
6. **Graceful Degradation**: System works without AI (just less refined)

---

## Future Architecture Considerations

- **WebGL Viewport**: Real-time 3D preview (Three.js) instead of AI-rendered images
- **Mesh Feedback Loop**: AI corrections fed back to lofting stage
- **Batch Processing**: Multiple ships in parallel
- **Version Control**: Track mesh iterations per ship
- **Plugin System**: Custom extractors for different blueprint styles

---

## Related Documents

- [North Star](./north_star.md) — Vision and goals
- [Gemini Capabilities](./research/gemini_capabilities.md) — AI model research
- [Pipeline Specification](./pipeline_specification.md) — Detailed phase specs
- [Phase 2 Implementation](./implementation_plan_phase_2.md) — VisionKernel roadmap
