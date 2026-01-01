---
title: Pipeline Specifications Index
date: 2026-01-01
author: Claude (Opus 4.5)
status: Specification (Not Implemented)
---

# Pipeline Specifications

> **Note:** These are specifications for what should be built, not descriptions of existing code. Each document includes TDD goals with specific test cases that an implementation must pass.

## Phases

| Phase | Name | Type | Document |
|-------|------|------|----------|
| 1 | Ingestion & Normalization | Deterministic | [phase_1_ingestion.md](./phase_1_ingestion.md) |
| 2 | Semantic Grounding | AI-Assisted | [phase_2_grounding.md](./phase_2_grounding.md) |
| 3 | Computational Extraction | Deterministic | [phase_3_extraction.md](./phase_3_extraction.md) |
| 4 | Elastic Lofting | Deterministic | [phase_4_lofting.md](./phase_4_lofting.md) |
| 5 | AI Refinement | AI-Assisted | [phase_5_refinement.md](./phase_5_refinement.md) |

## Data Flow

```
[Blueprint Image]
       │
       ▼
┌─────────────────┐
│   PHASE 1       │──▶ topView.base64, sideView.base64
│   Ingestion     │    (separated, cropped views)
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 2       │──▶ GroundingOutput
│   Grounding     │    (shipClass, dimensions, geometryHints)
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 3       │──▶ ProfileData[]
│   Extraction    │    (top/side silhouette curves)
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 4       │──▶ LoftingOutput
│   Lofting       │    (valid OBJ mesh file)
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   PHASE 5       │──▶ VisualizationOutput or CorrectionOutput
│   Refinement    │    (photorealistic renders or geometry corrections)
└─────────────────┘
       │
       ▼
[User Downloads OBJ + Views Output]
```

## Key Principle

**Deterministic First, AI Second**

- Phases 1, 3, 4 are pure computation — reproducible, testable, debuggable
- Phases 2, 5 use AI — for tasks requiring visual understanding or inference
- Each phase has explicit interfaces and can be tested independently
- AI operates on structured outputs from deterministic phases

## How to Use These Specs

Each phase document contains:

1. **Purpose** — What problem this phase solves
2. **Interface Contract** — TypeScript types for input/output
3. **Pain Points & Challenges** — Known difficulties and decisions made
4. **Algorithm Specification** — Pseudocode or real code for the approach
5. **TDD Goals** — Specific test cases with pass criteria
6. **Success Criteria** — What a correct implementation must achieve
7. **What's NOT In Scope** — Explicit boundaries for v1

### Building to Spec

An LLM agent building a phase should:
1. Read the spec carefully
2. Implement the interface contract exactly
3. Write tests matching the TDD goals first
4. Implement until all tests pass
5. Verify success criteria are met

## Related Documents

- [Architecture](../architecture.md) — System overview
- [North Star](../north_star.md) — Vision and goals
- [Gemini Research](../research/gemini_capabilities.md) — AI model capabilities
