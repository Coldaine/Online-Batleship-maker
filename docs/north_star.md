---
title: NavalForge 3D — North Star
date: 2026-01-01
author: Claude (Opus 4.5)
status: Living Document
---

# North Star

## The Goal

**Transform 2D naval blueprint images into geometrically plausible 3D ship models through a hybrid pipeline that combines deterministic computational geometry with AI-powered spatial reasoning and refinement.**

Simply put: *Give us a top view and side view of a battleship, and we'll give you a 3D model you can rotate, export, and use.*

---

## Core Principles

### 1. Deterministic First, AI Second

We do not ask AI to conjure geometry from nothing. The pipeline:
- **Extracts** silhouettes mathematically from input images
- **Extrudes** hull envelopes using proven lofting algorithms
- **Refines** with AI only after we have a valid geometric foundation

This makes the system debuggable, reproducible, and grounded.

### 2. Constrained Inference

When AI must infer (e.g., hull bottom curvature from top/side views), it operates within constraints:
- Physical laws of hydrodynamics
- Historical ship class knowledge (via grounding)
- Geometric bounds established by deterministic extraction

The AI fills gaps; it doesn't guess wholesale.

### 3. Leverage Model Capabilities

Gemini 3 Pro is not a traditional image generator. It is:
- Google's strongest spatial understanding model
- Capable of 3D correspondence from multiple 2D views
- Trained on architectural and engineering blueprints
- Able to reason about physics, not just aesthetics

We use these capabilities strategically, not as a black box.

### 4. Verifiable Outputs

Every stage produces inspectable artifacts:
- Silhouette curves (normalized float arrays)
- OBJ mesh files (text-based, diffable)
- Structured analysis JSON (ship class, dimensions, geometry hints)

If something looks wrong, we can trace exactly where.

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Hybrid deterministic + AI pipeline | Combines reliability of math with flexibility of AI |
| Google Gemini for grounding | Real-time ship dimension lookup via Search integration |
| Nano Banana Pro for refinement | State-of-the-art spatial reasoning + 3D understanding |
| OBJ as primary export | Universal format, text-based, easy to debug |
| Human-in-the-loop cropping | Eliminates ambiguity in view separation |

---

## Success Criteria

1. **Recognizable**: Output model is identifiable as the input ship class
2. **Proportional**: Dimensions match real-world specs (±5% tolerance)
3. **Exportable**: OBJ files load correctly in standard 3D software
4. **Fast**: End-to-end pipeline completes in under 60 seconds
5. **Transparent**: User can see intermediate steps and understand what happened

---

## What We're NOT Building

- A CAD replacement (we approximate, not engineer)
- A game-ready asset pipeline (no LOD, no rigging)
- A historical accuracy tool (we're geometrically plausible, not archivally precise)
- A fully automated system (human judgment remains in the loop)

---

## The Bet

We believe that:

> Given two orthographic views of a ship, modern AI spatial reasoning can infer the third dimension well enough to produce useful, recognizable 3D models — especially when constrained by deterministic geometry extraction and grounded in real-world ship data.

This document is our compass. When in doubt, return here.
