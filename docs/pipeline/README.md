---
title: Pipeline Documentation Index
date: 2026-01-01
author: Claude (Opus 4.5)
---

# Pipeline Documentation

This folder contains detailed specifications for each phase of the NavalForge 3D pipeline.

## Phases

| Phase | Name | Type | Status | Document |
|-------|------|------|--------|----------|
| 1 | Ingestion & Normalization | Deterministic | ✅ Implemented | [phase_1_ingestion.md](./phase_1_ingestion.md) |
| 2 | Semantic Grounding | AI-Assisted | ✅ Implemented | [phase_2_grounding.md](./phase_2_grounding.md) |
| 3 | Computational Extraction | Deterministic | 🔄 Basic/In Dev | [phase_3_extraction.md](./phase_3_extraction.md) |
| 4 | Elastic Lofting | Deterministic | 🔄 Basic/Planned | [phase_4_lofting.md](./phase_4_lofting.md) |
| 5 | AI Refinement | AI-Assisted | 🔄 Viz/Planned | [phase_5_refinement.md](./phase_5_refinement.md) |

## Data Flow

```
[Blueprint Image]
       │
       ▼
┌─────────────────┐
│   PHASE 1       │──▶ topView.base64, sideView.base64
│   Ingestion     │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 2       │──▶ AnalysisData { shipClass, dimensions, geometry }
│   Grounding     │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 3       │──▶ topProfile[], sideProfile[]
│   Extraction    │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 4       │──▶ ship.obj
│   Lofting       │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 5       │──▶ Refined visualization / Corrected mesh
│   Refinement    │
└─────────────────┘
       │
       ▼
[User Downloads OBJ + Views Output]
```

## Key Principle

**Deterministic First, AI Second**

- Phases 1, 3, 4 are pure computation (reproducible, debuggable)
- Phases 2, 5 use AI (grounding, refinement)
- AI operates on structured outputs, not raw data
- Every intermediate artifact is inspectable

## Related Documents

- [Architecture](../architecture.md) — System overview
- [North Star](../north_star.md) — Vision and goals
- [Gemini Research](../research/gemini_capabilities.md) — AI model capabilities
