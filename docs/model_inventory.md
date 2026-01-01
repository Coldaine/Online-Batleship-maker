---
title: AI Model Inventory
date: 2026-01-01
author: Claude (Opus 4.5)
status: Living Document
---

# AI Model Inventory

This document catalogs all AI models used in the NavalForge 3D pipeline, organized by their role in the system.

---

## Quick Reference

| Role | Primary Model | Fallback | Stage |
|------|---------------|----------|-------|
| Vision Analysis | Gemini 2.5 Flash | Gemini 2.5 Pro | 0 |
| Semantic Grounding | Gemini 2.5 Flash | — | 1 |
| Geometry Hints | Gemini 3 Pro | — | 1 |
| AI Refinement | Nano Banana Pro | — | 3 |

---

## Roles

### 1. Vision Analysis

**Purpose:** Classify and understand blueprint images during ingestion.

**What it does:**
- Determines image type (top view, side view, detail, photo)
- Extracts structural metadata (orientation, quality, content regions)
- Identifies ship class when visible

**Models assigned:**
- **Primary:** Gemini 2.5 Flash (speed)
- **Fallback:** Gemini 2.5 Pro (complex/ambiguous images)

**Stage:** 0 (Ingestion)

---

### 2. Semantic Grounding

**Purpose:** Identify ship class and retrieve real-world dimensions.

**What it does:**
- Confirms ship identification from vision analysis
- Uses Google Search to look up historical specifications
- Returns structured data: length, beam, draft, displacement

**Models assigned:**
- **Primary:** Gemini 2.5 Flash with Search tool

**Stage:** 1 (Grounding)

---

### 3. Geometry Hints

**Purpose:** Understand 3D structure from 2D blueprint views.

**What it does:**
- Locates key features (turrets, superstructure, bow shape)
- Provides pixel coordinates for component placement
- Infers depth relationships between views

**Models assigned:**
- **Primary:** Gemini 3 Pro (spatial reasoning)

**Stage:** 1 (Grounding)

---

### 4. AI Refinement

**Purpose:** Generate visualizations and validate 3D output against blueprints.

**What it does:**
- Creates photorealistic renders from mesh + blueprints
- Compares generated 3D model to original blueprints
- Suggests geometric corrections

**Models assigned:**
- **Primary:** Nano Banana Pro (Gemini 3 Pro Image)

**Stage:** 3 (Generation)

---

## Model Cards

### Gemini 2.5 Flash

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-2.5-flash` |
| **Provider** | Google DeepMind |
| **Type** | Multimodal LLM |
| **Context Window** | 1M tokens |
| **Strengths** | Fast, cheap, good vision |
| **Use Cases** | High-volume analysis, real-time classification |

**Why we use it:**
Fast and cost-effective for the high volume of images processed during ingestion. Vision capabilities are sufficient for classification tasks.

**Pricing:**
- Input: ~$0.075 / million tokens
- Output: ~$0.30 / million tokens

---

### Gemini 2.5 Pro

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-2.5-pro` |
| **Provider** | Google DeepMind |
| **Type** | Multimodal LLM |
| **Context Window** | 1M tokens |
| **Strengths** | Higher accuracy, better reasoning |
| **Use Cases** | Complex analysis, ambiguous inputs |

**Why we use it:**
Fallback for images where Flash struggles—low contrast, unusual layouts, or ambiguous content. Better at nuanced classification.

**Pricing:**
- Input: ~$1.25 / million tokens
- Output: ~$5.00 / million tokens

---

### Gemini 3 Pro

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-3-pro-preview` |
| **Provider** | Google DeepMind |
| **Type** | Multimodal LLM with spatial reasoning |
| **Release** | November 2025 |
| **Context Window** | 1M tokens |
| **Strengths** | 3D understanding, physics reasoning, Search grounding |
| **Use Cases** | Geometry inference, feature localization |

**Why we use it:**
Google's strongest spatial understanding model. Can infer 3D structure from 2D views, match corresponding points across images, and reason about physical geometry—exactly what we need for blueprint analysis.

**Key capabilities:**
- Pixel-precise pointing with coordinates
- 3D correspondence from multiple 2D views
- 3D bounding box output (meter-based)
- Physical reasoning (depth, occlusion, perspective)

**Pricing:**
- Input: ~$2.00 / million tokens
- Output: ~$12.00 / million tokens

**Documentation:** [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)

---

### Nano Banana Pro

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-3-pro-image-preview` |
| **Official Name** | Gemini 3 Pro Image |
| **Codename** | Nano Banana Pro |
| **Provider** | Google DeepMind |
| **Type** | Visual reasoning + image generation |
| **Release** | November 2025 |
| **Max Resolution** | 4K |
| **Strengths** | Blueprint-to-3D, spatial awareness, professional output |
| **Use Cases** | 3D visualization, render generation, visual QA |

**Why we use it:**
Not a traditional diffusion model—it's a *visual reasoning* model that understands what it's generating. Can read blueprints and produce accurate 3D visualizations that maintain source fidelity.

**Key capabilities:**
- Blueprint → realistic 3D transformation
- Reads and respects technical drawings
- Multi-image blending (up to 14 sources)
- Physics-based lighting and materials
- 4K output resolution

**What makes it different:**
> "A visual reasoning model... combines layout engine + diagram engine + typography engine + data-viz engine + style engine in one model."

It generates "finished, professional-grade visual artifacts in one shot" rather than iteratively diffusing noise.

**Pricing:**
- Included with Google AI Pro subscription ($19.99/month)
- 2 free generations/day on free tier

**Documentation:** [Nano Banana API Docs](https://ai.google.dev/gemini-api/docs/nanobanana)

---

## Model Selection Logic

```
┌─────────────────────────────────────────────────────────────┐
│                    IMAGE ARRIVES                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 0: Vision Analysis                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Gemini 2.5 Flash                                     │    │
│  │ • Classify image type                                │    │
│  │ • Extract metadata                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│            ┌────────────┴────────────┐                      │
│            │  Confidence < 80%?      │                      │
│            └────────────┬────────────┘                      │
│                   YES   │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Gemini 2.5 Pro (fallback)                            │    │
│  │ • Re-analyze with stronger model                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: Grounding                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Gemini 2.5 Flash + Search                            │    │
│  │ • Identify ship class                                │    │
│  │ • Look up real-world dimensions                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Gemini 3 Pro                                         │    │
│  │ • Extract geometry hints                             │    │
│  │ • Locate features with pixel coordinates             │    │
│  │ • Infer 3D relationships                             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 2: Extraction (Deterministic - No AI)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 3: Generation                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Lofting + OBJ Export (Deterministic)                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Nano Banana Pro                                      │    │
│  │ • Generate 3D visualizations                         │    │
│  │ • Compare output to blueprints                       │    │
│  │ • Suggest corrections                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Cost Estimation

**Per ship processed (typical):**

| Stage | Model | Calls | Est. Cost |
|-------|-------|-------|-----------|
| 0 | Gemini 2.5 Flash | 2-5 images | ~$0.01 |
| 1 | Gemini 2.5 Flash | 1 call | ~$0.005 |
| 1 | Gemini 3 Pro | 1 call | ~$0.05 |
| 3 | Nano Banana Pro | 2-3 renders | ~$0.15 |
| **Total** | | | **~$0.20/ship** |

*Assumes average image sizes and typical prompt lengths.*

---

## Related Documents

- [Gemini Capabilities Research](./research/gemini_capabilities.md) — Detailed capability analysis
- [Architecture Overview](./architecture.md) — System design
- [North Star](./north_star.md) — Project principles

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-01 | Initial inventory created |
