---
title: NavalForge 3D — System Architecture Specification
date: 2026-01-01
author: Claude (Opus 4.5)
status: Specification (Not Implemented)
---

# System Architecture Specification

> **Note:** This document describes the *target* architecture. It is a specification to build toward, not a description of existing code.

## Overview

NavalForge 3D is a **hybrid deterministic-AI image pipeline studio** that transforms 2D naval blueprint collections into 3D ship models. The system is organized into four sequential stages, each functioning as an independent mini-project with clear inputs, outputs, and responsibilities.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           NAVALFORGE 3D PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        STAGE 0: INGESTION                                │   │
│  │                    (Asset Management Foundation)                         │   │
│  │                                                                          │   │
│  │   Raw Images → Vision Analysis → Auto-Crop → Tag → Database → Relate   │   │
│  │        ↓            ↓              ↓         ↓        ↓          ↓      │   │
│  │   [Archive]   [Structure]    [Crops]    [Tags]   [Store]   [Graph]     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                        │
│                                        ▼                                        │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────────┐  │
│  │     STAGE 1       │  │     STAGE 2       │  │        STAGE 3            │  │
│  │    Grounding      │→ │    Extraction     │→ │      Generation           │  │
│  │  (AI-Assisted)    │  │ (Deterministic)   │  │ (Deterministic + AI)      │  │
│  │                   │  │                   │  │                           │  │
│  │ • Ship ID         │  │ • Profile curves  │  │ • Hull lofting            │  │
│  │ • Dimensions      │  │ • Background det  │  │ • Component placement     │  │
│  │ • Geometry hints  │  │ • Smoothing       │  │ • OBJ export              │  │
│  │ • Reference DB    │  │                   │  │ • AI refinement (opt)     │  │
│  └───────────────────┘  └───────────────────┘  └───────────────────────────┘  │
│          │                      │                          │                    │
│          ▼                      ▼                          ▼                    │
│   [Verified Specs]        [Float32 Curves]          [3D OBJ + Renders]         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Architecture Principle

**Semi-Automated, LLM-Driven, Database-Backed**

This is NOT a simple web app for one-at-a-time image processing. It's the foundation of a vast image pipeline studio that:

- **Batch processes** entire blueprint collections
- **LLM vision** handles classification, cropping, tagging automatically
- **Database stores** everything with full provenance
- **Human review is optional**, not required
- **Relationships** track connections between assets

### Deterministic First, AI Second

Where possible, we use deterministic (reproducible, testable) processing, reserving AI for tasks that require understanding:

| Stage | Type | Why |
|-------|------|-----|
| 0. Ingestion | AI + Deterministic | Vision analysis + pure cropping math |
| 1. Grounding | AI-Assisted | Ship identification requires visual understanding |
| 2. Extraction | Deterministic | Pixel scanning is pure computation |
| 3. Generation | Deterministic + AI | Mesh = math; refinement = inference |

---

## Stage Overview

### Stage 0: Ingestion & Asset Management

**The Foundation** — This is the largest and most complex stage.

**Purpose:** Ingest raw blueprint images, analyze with LLM vision, auto-crop to individual views, tag with hierarchical taxonomy, store in database, and track relationships.

**Documentation:** [`/docs/stages/stage_0_ingestion/`](./stages/stage_0_ingestion/README.md)

**Components:**
- Vision Analysis — LLM examines images, detects views
- Auto-Cropping — Deterministic cropping based on LLM bounds
- Tagging Taxonomy — Hierarchical tag system with LLM matching
- Database Schema — SQLite storage for all assets
- Relationships — Track siblings, duplicates, versions

**Output:**
- Tagged, organized crop database
- Full provenance tracking
- Relationship graph

---

### Stage 1: Grounding & Enrichment

**Purpose:** Identify ship classes from tagged crops and enrich with real-world specifications.

**Documentation:** [`/docs/stages/stage_1_grounding/`](./stages/stage_1_grounding/README.md)

**Components:**
- Semantic Grounding — LLM + Google Search for dimensions
- Reference Database — Cache of verified ship specs
- Geometry Hints — Turret/superstructure position extraction

**Output:**
```typescript
interface GroundingOutput {
  identification: {
    shipClass: string;
    confidence: number;
    verified: boolean;
  };
  dimensions: {
    length: number;  // meters
    beam: number;    // meters
    draft: number;   // meters
    source: 'reference_db' | 'google_search' | 'ai_estimate';
  };
  geometryHints: {
    turretPositions: number[];  // 0-1 normalized
    superstructure: { start: number; end: number };
  };
}
```

---

### Stage 2: Extraction & Geometry

**Purpose:** Extract precise silhouette profiles from blueprint images using deterministic pixel-level analysis.

**Documentation:** [`/docs/stages/stage_2_extraction/`](./stages/stage_2_extraction/README.md)

**Components:**
- Profile Extraction — Column-scanning algorithm
- Background Detection — Auto-detect background color
- Smoothing — Noise reduction techniques

**Output:**
```typescript
interface ExtractionOutput {
  topProfile: Float32Array;    // Beam distribution (0-1)
  sideProfile: Float32Array;   // Height distribution (0-1)
  resolution: number;
  bounds: {
    minIndex: number;
    maxIndex: number;
    peakIndex: number;
  };
}
```

---

### Stage 3: 3D Generation

**Purpose:** Transform profiles into 3D meshes with optional AI refinement.

**Documentation:** [`/docs/stages/stage_3_generation/`](./stages/stage_3_generation/README.md)

**Components:**
- Lofting — Hull mesh from profile curves
- Component Placement — Turrets, superstructure, funnels
- OBJ Export — Wavefront OBJ file generation
- AI Refinement — Optional visualization and correction

**Output:**
```typescript
interface GenerationOutput {
  obj: string;                  // Valid OBJ file content
  stats: {
    vertexCount: number;
    faceCount: number;
    groups: string[];
  };
  renders?: {                   // If AI refinement enabled
    view: string;
    image: string;              // Base64
  }[];
}
```

---

## Technology Requirements

| Component | Requirement | Rationale |
|-----------|-------------|-----------|
| Runtime | Node.js / Browser | Pipeline processing + optional UI |
| Database | SQLite (better-sqlite3) | Embedded, fast, portable |
| Image Processing | sharp (Node) / Canvas (Browser) | Industry standard |
| 3D Export | OBJ format | Text-based, universal |
| AI Provider | Google Gemini API | Vision + grounding + Nano Banana Pro |
| Testing | Vitest | Fast, TypeScript-native |

---

## Data Flow Contract

Each stage must satisfy this contract:

1. **Defined Input Schema**: TypeScript interface, validated at runtime
2. **Defined Output Schema**: TypeScript interface, validated at runtime
3. **Deterministic Components**: Same input → same output (testable)
4. **AI Components**: Structured output schema (JSON), validated before use
5. **Error Propagation**: Clear error types that identify failing component

```typescript
type StageResult<T> =
  | { success: true; data: T; stage: number; component: string }
  | { success: false; error: StageError; stage: number; component: string };

interface StageError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}
```

---

## Testing Strategy

| Stage | Test Type | Example |
|-------|-----------|---------|
| Stage 0 | Unit + Integration | Vision schema validation, crop bounds |
| Stage 1 | Integration (mocked) | Mock Gemini returns valid JSON |
| Stage 2 | Unit + Golden | Known image → known profile |
| Stage 3 | Unit + Snapshot | Profile → valid OBJ (parseable) |

**TDD Goals:** Each component document includes specific test cases that an LLM agent can build to.

---

## Coordinate System

All 3D geometry uses this coordinate system:

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
- Y: Positive = up, Negative = down (below waterline)
- Z: 0 = bow, length = stern
```

---

## Related Documents

- [North Star](./north_star.md) — Vision and goals
- [Model Inventory](./model_inventory.md) — AI models and role assignments
- [Open Questions](./research/open_questions.md) — Unresolved technical decisions
- [Gemini Capabilities](./research/gemini_capabilities.md) — AI model research

### Stage Documentation

- [Stage 0: Ingestion](./stages/stage_0_ingestion/README.md) — Asset management foundation
- [Stage 1: Grounding](./stages/stage_1_grounding/README.md) — Ship identification & enrichment
- [Stage 2: Extraction](./stages/stage_2_extraction/README.md) — Profile curve extraction
- [Stage 3: Generation](./stages/stage_3_generation/README.md) — 3D mesh generation
