---
title: NavalForge 3D — System Architecture Specification
date: 2026-01-01
author: Claude (Opus 4.5)
status: Specification (Not Implemented)
---

# System Architecture Specification

> **Note:** This document describes the *target* architecture. It is a specification to build toward, not a description of existing code.

## Overview

NavalForge 3D is a **hybrid deterministic-AI pipeline** that transforms 2D naval blueprints into 3D ship models. The system is organized into five sequential phases, each with clear inputs, outputs, and responsibilities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NAVALFORGE 3D PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │     PHASE 1     │───▶│     PHASE 2     │───▶│     PHASE 3     │         │
│  │    Ingestion    │    │    Grounding    │    │   Extraction    │         │
│  │  (Deterministic)│    │  (AI-Assisted)  │    │ (Deterministic) │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│          │                      │                      │                    │
│          ▼                      ▼                      ▼                    │
│     [Base64 imgs]          [Metadata]            [Profiles]                 │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                                │
│  │     PHASE 4     │───▶│     PHASE 5     │                                │
│  │     Lofting     │    │   Refinement    │                                │
│  │ (Deterministic) │    │  (AI-Assisted)  │                                │
│  └─────────────────┘    └─────────────────┘                                │
│          │                      │                                           │
│          ▼                      ▼                                           │
│       [OBJ Mesh]          [Final Output]                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Architecture Principle

**Deterministic First, AI Second**

The system alternates between deterministic (reproducible, testable) and AI-assisted (flexible, intelligent) phases:

| Phase | Type | Why |
|-------|------|-----|
| 1. Ingestion | Deterministic | Image cropping is pure coordinate math |
| 2. Grounding | AI-Assisted | Ship identification requires visual understanding |
| 3. Extraction | Deterministic | Pixel scanning is pure computation |
| 4. Lofting | Deterministic | Mesh generation is geometry math |
| 5. Refinement | AI-Assisted | Filling in unknowns requires inference |

This separation means:
- **Bugs in deterministic phases** can be traced and fixed with unit tests
- **AI phases** are constrained by deterministic outputs (less hallucination surface)
- **Each phase** can be developed and tested independently

---

## Phase Specifications

### Phase 1: Ingestion & Normalization

**Purpose:** Accept blueprint images, separate into orthographic views (top, side)

**Input:**
- One combined image (containing both views), OR
- Two separate images (top view, side view)

**Output:**
```typescript
interface IngestionOutput {
  topView: string;      // Base64 PNG, cropped to content bounds
  sideView: string;     // Base64 PNG, cropped to content bounds
  sourceMetadata: {
    originalDimensions: { width: number; height: number };
    cropRegions: CropRegion[];
  };
}
```

**Key Challenges:**
1. How to reliably distinguish top view from side view?
2. How to handle arbitrary image orientations?
3. How to crop tightly without losing content?

**See:** [Phase 1 Specification](./pipeline/phase_1_ingestion.md)

---

### Phase 2: Semantic Grounding

**Purpose:** Identify ship class, retrieve real-world dimensions

**Input:**
- Blueprint image(s) from Phase 1

**Output:**
```typescript
interface GroundingOutput {
  shipClass: string;           // e.g., "Yamato-class battleship"
  confidence: number;          // 0-1
  dimensions: {
    length: number;            // meters
    beam: number;              // meters
    draft: number;             // meters
    source: 'grounded' | 'estimated';
  };
  geometryHints: {
    turretPositions: number[]; // normalized 0-1 along length
    superstructureBounds: { start: number; end: number };
  };
}
```

**Key Challenges:**
1. What if the ship class is unknown or fictional?
2. How to validate grounded dimensions are accurate?
3. How to handle ambiguous or partial blueprints?

**See:** [Phase 2 Specification](./pipeline/phase_2_grounding.md)

---

### Phase 3: Computational Extraction

**Purpose:** Extract silhouette profiles from blueprint images

**Input:**
- Top view image (base64)
- Side view image (base64)
- Optional: extraction parameters (threshold, smoothing)

**Output:**
```typescript
interface ExtractionOutput {
  topProfile: Float32Array;    // Beam distribution along length (0-1)
  sideProfile: Float32Array;   // Draft distribution along length (0-1)
  resolution: number;          // Samples per unit length
  debug: {
    backgroundColorDetected: [number, number, number];
    pixelsCounted: number;
    profilePeaks: { index: number; value: number }[];
  };
}
```

**Key Challenges:**
1. How to handle varying blueprint styles (clean vector vs. scanned)?
2. How to separate ship from annotations/text/scale bars?
3. How to handle non-white backgrounds?

**See:** [Phase 3 Specification](./pipeline/phase_3_extraction.md)

---

### Phase 4: Elastic Lofting

**Purpose:** Generate 3D mesh from profile curves

**Input:**
- Profile curves from Phase 3
- Dimensions from Phase 2
- User parameters (optional overrides)

**Output:**
```typescript
interface LoftingOutput {
  objContent: string;          // Valid Wavefront OBJ file
  stats: {
    vertexCount: number;
    faceCount: number;
    groups: string[];          // ['hull', 'superstructure', 'turrets']
    boundingBox: { min: Vector3; max: Vector3 };
  };
}
```

**Key Challenges:**
1. What cross-section shape to use? (Ellipse is a guess)
2. How to handle bow/stern tapering realistically?
3. How to place components (turrets, superstructure) correctly?

**See:** [Phase 4 Specification](./pipeline/phase_4_lofting.md)

---

### Phase 5: AI Refinement

**Purpose:** Enhance output using AI spatial reasoning

**Input:**
- Base mesh from Phase 4
- Original blueprints from Phase 1
- Ship class from Phase 2

**Output:**
```typescript
// Option A: Visual refinement
interface VisualOutput {
  renderedViews: Map<ViewAngle, string>;  // Base64 images
}

// Option B: Geometric correction (future)
interface GeometricOutput {
  corrections: MeshCorrection[];
  correctedObj: string;
}
```

**Key Challenges:**
1. How to ensure AI output matches blueprints, not just "looks good"?
2. How to feed geometric corrections back to mesh?
3. How to validate AI output quality?

**See:** [Phase 5 Specification](./pipeline/phase_5_refinement.md)

---

## Technology Requirements

| Component | Requirement | Rationale |
|-----------|-------------|-----------|
| Runtime | Browser (client-side) | No backend needed, user privacy |
| Image Processing | Canvas API | Universal, fast, no dependencies |
| 3D Export | OBJ format | Text-based, universal, debuggable |
| AI Provider | Google Gemini API | Grounding + Nano Banana Pro spatial reasoning |
| Testing | Vitest or Jest | Fast, TypeScript-native |

---

## Data Flow Contract

Each phase must satisfy this contract:

1. **Defined Input Schema**: TypeScript interface, validated at runtime
2. **Defined Output Schema**: TypeScript interface, validated at runtime
3. **Deterministic Phases**: Same input → same output (testable)
4. **AI Phases**: Structured output schema (JSON), validated before use
5. **Error Propagation**: Clear error types that identify failing phase

```typescript
type PipelineResult<T> =
  | { success: true; data: T; phase: PhaseNumber }
  | { success: false; error: PipelineError; phase: PhaseNumber };

interface PipelineError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}
```

---

## Testing Strategy

| Phase | Test Type | Example |
|-------|-----------|---------|
| Phase 1 | Unit | Cropping math produces correct coordinates |
| Phase 2 | Integration (mocked) | Mock Gemini returns valid JSON |
| Phase 3 | Unit + Golden | Known image → known profile |
| Phase 4 | Unit + Snapshot | Profile → valid OBJ (parseable) |
| Phase 5 | Integration | AI returns valid structured response |

**Golden Dataset**: A set of known-good blueprints with expected outputs at each phase.

---

## Open Questions

These need resolution before implementation:

1. **Cross-section shape**: Ellipse is an assumption. Should we use hull form coefficients?
2. **Coordinate system**: Y-up or Z-up? How does this affect OBJ compatibility?
3. **Scale calibration**: How to map pixel dimensions to real-world meters?
4. **Error handling**: What happens if AI grounding fails? Fallback to user input?
5. **Progressive rendering**: Should we show intermediate results or wait for completion?

---

## Related Documents

- [North Star](./north_star.md) — Vision and goals
- [Gemini Capabilities](./research/gemini_capabilities.md) — AI model research
- [Pipeline Phase Specifications](./pipeline/) — Detailed phase docs
