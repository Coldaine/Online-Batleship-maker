---
title: "Stage 1: Grounding & Enrichment"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 1
status: Specification (Not Implemented)
---

# Stage 1: Grounding & Enrichment

## Purpose

Identify ship classes from tagged crops and enrich them with real-world data: authoritative dimensions, historical context, and geometry hints for 3D generation.

## The Problem

After Stage 0, we have:
- Hundreds of tagged crops with ship class names (e.g., "Yamato class battleship")
- View types, styles, and quality assessments
- But NO authoritative dimensions or verified data

We need to:
- Verify/correct ship identification from tags
- Look up real-world specifications (length, beam, draft)
- Find geometry hints (turret positions, superstructure bounds)
- Build a reference database for known ships

---

## Stage Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Stage 1: Grounding & Enrichment                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Tagged Crops      Ship Class         Reference        Grounded   │
│   (from Stage 0) → Verification →  Lookup & Search →    Output    │
│                         │                 │                 │       │
│                         │                 ▼                 ▼       │
│                         │          ┌─────────────┐   ┌───────────┐ │
│                         └─────────>│  Reference  │   │  Grounded │ │
│                                    │  Database   │   │   Crops   │ │
│                                    └─────────────┘   └───────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Ship Class Verification
**Purpose:** Confirm or correct the ship class identified during ingestion.

Uses LLM vision with multiple views of the same ship class to:
- Validate identification confidence
- Cross-reference with known ship silhouettes
- Suggest alternatives if confidence is low

### 2. Reference Lookup
**Purpose:** Find authoritative specifications for identified ships.

Two-tier approach:
1. **Local Database:** Known ships with cached specifications
2. **Google Search Grounding:** For ships not in database

Key data to retrieve:
- Length, beam, draft (meters)
- Displacement (tons)
- Era and nation (for context)
- Notable features

### 3. Geometry Hints
**Purpose:** Provide normalized positions for key ship features.

Infer from blueprints:
- Turret positions (0-1 along ship length)
- Superstructure bounds (start/end)
- Funnel positions
- Bridge location

### 4. Reference Database
**Purpose:** Cache verified ship data for future use.

Store:
- Ship class → specifications mapping
- Verified silhouette templates
- Historical notes and sources

---

## Data Flow

```
Input:
  - Crop with tags (from Stage 0)
  - Optional: Other crops of same ship class

Processing:
  1. Check reference database for known ship
  2. If unknown, use LLM + Google Search grounding
  3. Validate dimensions (sanity checks)
  4. Extract geometry hints from blueprint

Output:
  - Grounded crop with verified dimensions
  - Reference database entry (cached for future)
```

---

## Component Documents

| Document | Description |
|----------|-------------|
| [Semantic Grounding](./semantic_grounding.md) | LLM + search for ship identification and dimensions |
| [Reference Database](./reference_database.md) | Local cache of known ship specifications |
| [Geometry Hints](./geometry_hints.md) | Extracting turret/superstructure positions |

---

## Success Criteria

1. ✅ Identify major WW2 capital ships with >80% accuracy
2. ✅ Return grounded dimensions within 5% of actual specs
3. ✅ Complete grounding in <10 seconds (including search)
4. ✅ Cache verified ships for instant future lookups
5. ✅ Gracefully handle unknown ships with AI estimates
6. ✅ Build reference database over time

---

## Dependencies

- Completed Stage 0 (crops with tags)
- Google Gemini API (gemini-2.5-flash with tools)
- Google Search grounding capability
- Network connectivity

---

## Related Documents

- [Stage 0: Ingestion](../stage_0_ingestion/README.md) — Input source
- [Stage 2: Extraction](../stage_2_extraction/README.md) — Next stage
- [Gemini Capabilities](../../research/gemini_capabilities.md) — Model research
