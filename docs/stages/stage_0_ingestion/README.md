---
title: "Stage 0: Ingestion & Asset Management"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 0
status: Specification (Not Implemented)
---

# Stage 0: Ingestion & Asset Management

## Overview

Stage 0 is the foundation of the entire pipeline. It transforms raw image files into a searchable, tagged, relational asset library — with minimal human intervention.

**This is not a simple "upload image" step.** It's a full LLM-powered asset management system that:
- Ingests images in batch from folders, URLs, or scanners
- Uses LLM vision to detect, classify, and segment views
- Auto-crops multi-view images into individual assets
- Tags assets using a hierarchical taxonomy
- Establishes relationships between related assets
- Stores everything in a queryable database with full provenance

## Core Principle

> **LLM analysis at every step, supported by deterministic tools. Human review is optional.**

The system should be able to ingest 1000 blueprint images overnight with no human intervention, producing a fully tagged, searchable library by morning.

---

## Sub-Components

| Component | Purpose | Document |
|-----------|---------|----------|
| Vision Analysis | LLM examines raw images, detects views, reads text | [vision_analysis.md](./vision_analysis.md) |
| Auto-Cropping | Segment multi-view images into individual crops | [auto_cropping.md](./auto_cropping.md) |
| Tagging System | Hierarchical taxonomy with LLM-driven assignment | [tagging_taxonomy.md](./tagging_taxonomy.md) |
| Database Schema | Storage, relationships, provenance tracking | [database_schema.md](./database_schema.md) |
| Relationship Mapping | Connect related assets (same ship, same source, etc.) | [relationships.md](./relationships.md) |

---

## Data Flow

```
Raw Image Files (batch)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  VISION ANALYSIS (LLM)                                        │
│  ─────────────────────────────────────────────────────────── │
│  • Detect image type (combined views, single view, photo)     │
│  • Count and locate individual views                          │
│  • Read text annotations (ship name, class, artist)           │
│  • Classify content (line drawing vs colored, view angle)     │
│  • Assess quality (clean silhouette? heavy annotations?)      │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  AUTO-CROPPING (Deterministic)                                │
│  ─────────────────────────────────────────────────────────── │
│  • Execute crops at LLM-specified boundaries                  │
│  • Save each crop as separate asset                           │
│  • Preserve original file as archive                          │
│  • Generate consistent filenames/IDs                          │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  TAGGING (LLM + Taxonomy Lookup)                              │
│  ─────────────────────────────────────────────────────────── │
│  • LLM proposes tags based on analysis                        │
│  • Match to existing taxonomy (canonical tag names)           │
│  • Create new tags if needed (flagged for optional review)    │
│  • Assign confidence scores                                   │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  RELATIONSHIP MAPPING (LLM + Rules)                           │
│  ─────────────────────────────────────────────────────────── │
│  • Link crops to parent image                                 │
│  • Group by ship class                                        │
│  • Identify enhanced versions (B&W → colored)                 │
│  • Track artist/source attribution                            │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  DATABASE STORAGE                                             │
│  ─────────────────────────────────────────────────────────── │
│  • Ingestion record with full provenance                      │
│  • Crop records with bounds, tags, relationships              │
│  • Searchable by any attribute                                │
│  • Version history for updates                                │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
Queryable Asset Library
```

---

## Example Workflow

**Input:** A folder containing 50 naval blueprint images

**Process:**
```
1. Scanner picks up /ingestion/incoming/*.png
2. For each image:
   a. LLM Vision: "This contains 4 stacked views of Karl von Müller class cruiser"
   b. Auto-crop: Create 4 separate crop files
   c. Tag each: [german, cruiser, weimar, hypothetical, ...]
   d. Relate: These 4 are siblings, crops 3-4 are colored versions of 1-2
   e. Store: Write to database with full metadata
3. Move original to /ingestion/archive/
4. Log: "Ingested 50 images → 187 crops, 423 tags assigned"
```

**Output:** 187 individually queryable, tagged, related assets

---

## Success Criteria

A correct implementation of Stage 0 will:

1. ✅ Process images in batch with no human intervention required
2. ✅ Correctly detect 90%+ of view boundaries in multi-view images
3. ✅ Extract text annotations with 85%+ accuracy
4. ✅ Assign relevant tags from taxonomy (validated by spot-check)
5. ✅ Establish correct parent-child relationships for all crops
6. ✅ Complete ingestion of 100 images in <10 minutes
7. ✅ Produce queryable database with full provenance trail
8. ✅ Support incremental re-ingestion (don't duplicate existing assets)

---

## What's NOT In Scope (Stage 0)

- Grounding to real-world dimensions (Stage 1)
- Silhouette extraction (Stage 2)
- 3D mesh generation (Stage 3)
- Real-time processing (batch is fine)
- User-facing web UI (CLI/API first)

---

## Dependencies

- LLM with vision capabilities (Gemini 2.5 Flash or better)
- Database (SQLite for dev, PostgreSQL for prod)
- File storage (local filesystem or S3-compatible)
- Image processing library (sharp, jimp, or canvas)

---

## Related Documents

- [Architecture](../../architecture.md) — System overview
- [North Star](../../north_star.md) — Project vision
- [Stage 1: Grounding](../stage_1_grounding/) — Next stage
