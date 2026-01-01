---
title: AI Model Inventory
date: 2026-01-01
author: Claude (Opus 4.5)
status: Living Document
---

# AI Model Inventory

This document catalogs AI models available for the NavalForge 3D pipeline.

**Note:** Role assignments in this project are still being determined. This document focuses on *what models exist* and *what they can do*, not prescriptive decisions about which model handles which task.

---

## Available Models (December 2025)

| Model | Type | Input Cost | Output Cost | Notes |
|-------|------|------------|-------------|-------|
| **Gemini 3 Flash** | Multimodal LLM | $0.50/M | $3.00/M | New default, outperforms 2.5 Pro |
| **Gemini 3 Pro** | Multimodal LLM | ~$2.00/M | ~$12.00/M | Strongest spatial reasoning |
| **Nano Banana Pro** | Visual reasoning | Subscription | — | Image generation, 4K output |
| Gemini 2.5 Flash | Multimodal LLM | $0.30/M | $2.50/M | Previous generation |
| Gemini 2.5 Pro | Multimodal LLM | $1.25/M | $10.00/M | Previous flagship |
| Gemini 2.5 Flash-Lite | Multimodal LLM | Cheapest | — | High-volume, low-latency |

---

## Model Cards

### Gemini 3 Flash

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-3-flash` |
| **Provider** | Google DeepMind |
| **Release** | December 17, 2025 |
| **Context Window** | 1M tokens |
| **Max Output** | 65K tokens |
| **Input** | Text, image, video, audio, PDF |
| **Pricing** | $0.50 input / $3.00 output per M tokens |

**Why this matters:**

Gemini 3 Flash is now the default model in the Gemini app, replacing 2.5 Flash. It represents a significant leap:

- **Outperforms 2.5 Pro** while being 3x faster at a fraction of the cost
- **78% on SWE-bench Verified** — outperforms even Gemini 3 Pro for agentic coding
- **90.4% on GPQA Diamond** — PhD-level reasoning
- **81.2% on MMMU-Pro** — top multimodal score

It has a `thinking_level` parameter (minimal, low, medium, high) to balance quality vs latency.

**Consideration:** For most tasks in this pipeline, Gemini 3 Flash is likely the best cost/performance choice. It's cheap enough for high-volume analysis while being capable enough for complex reasoning.

**Sources:**
- [Google Blog: Introducing Gemini 3 Flash](https://blog.google/products/gemini/gemini-3-flash/)
- [TechCrunch: Google launches Gemini 3 Flash](https://techcrunch.com/2025/12/17/google-launches-gemini-3-flash-makes-it-the-default-model-in-the-gemini-app/)
- [Vertex AI Documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash)

---

### Gemini 3 Pro

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-3-pro-preview` |
| **Provider** | Google DeepMind |
| **Release** | November 18, 2025 |
| **Context Window** | 1M tokens |
| **Pricing** | ~$2.00 input / ~$12.00 output per M tokens |

**Spatial reasoning capabilities:**

Google's strongest spatial understanding model:

- **Pixel-precise pointing** — outputs exact coordinates `[ymin, xmin, ymax, xmax]`
- **3D correspondence from 2D views** — matches points across multiple images
- **3D bounding box output** — structured `[x, y, z, w, h, d, roll, pitch, yaw]`
- **Physical reasoning** — understands depth, occlusion, perspective

> "Gemini 3 Pro is Google's strongest spatial understanding model so far. Combined with its strong reasoning, this enables the model to make sense of the physical world."

**Consideration:** The spatial reasoning capabilities are directly relevant to inferring 3D structure from 2D blueprints. Whether this justifies the 4x cost over 3 Flash depends on how well Flash handles the specific geometry tasks.

**Sources:**
- [Google DeepMind: Gemini 3 Pro](https://deepmind.google/models/gemini/pro/)
- [Analytics Vidhya: 3D Spatial Understanding](https://www.analyticsvidhya.com/blog/2025/11/3d-spatial-understanding-with-gemini/)

---

### Nano Banana Pro (Gemini 3 Pro Image)

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-3-pro-image-preview` |
| **Codename** | Nano Banana Pro |
| **Provider** | Google DeepMind |
| **Release** | November 2025 |
| **Max Resolution** | 4K |
| **Access** | Gemini app, Vertex AI, AI Studio |
| **Pricing** | Google AI Pro subscription ($19.99/mo) or per-image via API |

**What makes it different:**

Nano Banana Pro is NOT a traditional diffusion image generator. It's a *visual reasoning* model:

> "A visual reasoning model... combines layout engine + diagram engine + typography engine + data-viz engine + style engine in one model."

**Key capabilities:**
- **Blueprint to 3D transformation** — reads technical drawings and generates accurate 3D visualizations
- **Multi-image blending** — up to 14 source images
- **4K output** with physics-based lighting and materials
- **Search grounding** — understands real-world context

**Demonstrated results:**
- 13 million new users in 4 days
- 200+ million image edits within weeks of launch

> "It did not just create the image, it first read the blueprint properly and then created the final output with every small detail."

**Role in this project:** This is the only model that can generate images. Required for visualization and render output.

**Sources:**
- [Google Blog: Nano Banana Pro](https://blog.google/technology/ai/nano-banana-pro/)
- [Google DeepMind: Gemini Image Pro](https://deepmind.google/models/gemini-image/pro/)
- [CNBC: Google launches Nano Banana Pro](https://www.cnbc.com/2025/11/20/google-nano-banana-pro-gemini-3.html)

---

### Gemini 2.5 Flash

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-2.5-flash` |
| **Provider** | Google DeepMind |
| **Context Window** | 1M tokens |
| **Pricing** | $0.30 input / $2.50 output per M tokens |

**Status:** Previous generation. Still available but superseded by Gemini 3 Flash.

**When to consider:**
- Slightly cheaper than 3 Flash ($0.30 vs $0.50 input)
- May be sufficient for simple classification tasks
- Existing code may reference this model

**Recommendation:** Evaluate whether 3 Flash's improved capabilities justify the ~60% price increase for your use case. For most tasks, 3 Flash is probably worth it.

---

### Gemini 2.5 Pro

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-2.5-pro` |
| **Provider** | Google DeepMind |
| **Context Window** | 1M tokens |
| **Pricing** | $1.25 input / $10.00 output per M tokens |

**Status:** Previous flagship. Gemini 3 Flash now outperforms it at ~40% of the cost.

**When to consider:**
- Legacy compatibility
- Specific edge cases where 2.5 Pro was tuned

**Recommendation:** For new development, prefer Gemini 3 Flash or 3 Pro.

---

## Pipeline Roles (To Be Determined)

The project needs AI for these tasks:

| Role | What's Needed | Candidates |
|------|---------------|------------|
| **Vision Analysis** | Classify images, extract metadata | 3 Flash, 2.5 Flash |
| **Semantic Grounding** | Ship ID + dimension lookup (Search) | 3 Flash, 3 Pro |
| **Geometry Hints** | 3D inference from 2D views | 3 Pro, 3 Flash |
| **Visualization** | Generate renders from mesh + blueprints | Nano Banana Pro (required) |

**Open questions:**
1. Does Gemini 3 Flash's spatial reasoning match 3 Pro for geometry hints?
2. Is the $0.20 savings per call (2.5 Flash vs 3 Flash) worth the capability tradeoff for high-volume ingestion?
3. Should we use `thinking_level` parameter on 3 Flash to balance cost/quality per task?

These decisions should be made based on testing, not assumptions.

---

## Cost Comparison

**Per 1M tokens:**

| Model | Input | Output | Relative Cost |
|-------|-------|--------|---------------|
| Gemini 2.5 Flash-Lite | Cheapest | — | Baseline |
| Gemini 2.5 Flash | $0.30 | $2.50 | 1x |
| **Gemini 3 Flash** | $0.50 | $3.00 | ~1.3x |
| Gemini 2.5 Pro | $1.25 | $10.00 | ~4x |
| Gemini 3 Pro | $2.00 | $12.00 | ~5x |

**Key insight:** Gemini 3 Flash offers 3 Pro-level quality at Flash-level pricing. It's the sweet spot for most use cases.

---

## Related Documents

- [Gemini Capabilities Research](./research/gemini_capabilities.md) — Detailed analysis of 3 Pro and Nano Banana Pro
- [Architecture Overview](./architecture.md) — System design
- [North Star](./north_star.md) — Project principles

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-01 | Rewrote with factual model data, added Gemini 3 Flash |
| 2026-01-01 | Initial inventory created |
