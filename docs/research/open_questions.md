---
title: Open Questions
date: 2026-01-01
status: Living Document
---

# Open Questions

This document tracks unresolved technical questions, design decisions pending validation, and research items that need investigation before implementation.

**Process:**
1. Add questions here when they arise during planning or implementation
2. Move answered questions to the "Resolved" section with findings
3. Reference this document in architectural decisions

---

## Active Questions

### Model Selection

**Q1: Does Gemini 3 Flash match Gemini 3 Pro for geometry hint extraction?**

- **Context:** Gemini 3 Pro has documented spatial reasoning capabilities. Gemini 3 Flash is 4x cheaper but benchmarks suggest comparable performance.
- **Stakes:** ~$1.50 cost difference per ship if we use Pro unnecessarily
- **To validate:** Run identical geometry hint prompts through both models on test blueprints, compare accuracy
- **Owner:** TBD
- **Added:** 2026-01-01

---

**Q2: Is Gemini 2.5 Flash adequate for high-volume vision analysis?**

- **Context:** Stage 0 ingestion processes many images. 2.5 Flash is $0.20/M cheaper than 3 Flash.
- **Stakes:** For 1000 images, ~$20 cost difference
- **To validate:** Compare classification accuracy between 2.5 Flash and 3 Flash on diverse blueprint set
- **Owner:** TBD
- **Added:** 2026-01-01

---

**Q3: Should we use the `thinking_level` parameter on Gemini 3 Flash?**

- **Context:** 3 Flash supports `thinking_level` (minimal, low, medium, high) to trade latency/cost for quality
- **Stakes:** Could optimize per-task—use "minimal" for classification, "high" for geometry
- **To validate:** Benchmark quality vs latency across thinking levels for each task type
- **Owner:** TBD
- **Added:** 2026-01-01

---

### Pipeline Architecture

**Q4: Should Stage 0 ingestion be a separate service?**

- **Context:** Ingestion is batch-oriented and could run independently from the interactive pipeline
- **Stakes:** Architectural complexity vs operational flexibility
- **To validate:** Determine if users need interactive ingestion or batch-only is acceptable
- **Owner:** TBD
- **Added:** 2026-01-01

---

**Q5: What's the right balance of pre-computation vs on-demand processing?**

- **Context:** We could pre-extract profiles for all ingested crops, or extract on-demand when generating 3D
- **Stakes:** Storage/upfront compute vs latency during generation
- **To validate:** Measure profile extraction time, estimate storage requirements
- **Owner:** TBD
- **Added:** 2026-01-01

---

### 3D Generation

**Q6: Is elliptical hull cross-section adequate for v1?**

- **Context:** Real ships have varied cross-sections (V-hull, flat bottom, rounded). We currently assume ellipse.
- **Stakes:** Visual accuracy vs implementation complexity
- **To validate:** Compare ellipse approximation to real hull photos for common ship classes
- **Owner:** TBD
- **Added:** 2026-01-01

---

**Q7: How should we handle unknown ship classes?**

- **Context:** Grounding may fail to identify ship class from blueprints
- **Stakes:** User experience when processing unidentified ships
- **Options:** (a) Prompt for manual input, (b) Use AI-estimated dimensions, (c) Refuse to proceed
- **Owner:** TBD
- **Added:** 2026-01-01

---

## Research Needed

### R1: Nano Banana Pro API limits and quotas

- **Question:** What are the rate limits, image size limits, and daily quotas for Nano Banana Pro via API?
- **Why it matters:** Affects batch processing design and cost estimation
- **Status:** Not started
- **Added:** 2026-01-01

---

### R2: OBJ format limitations for complex geometry

- **Question:** Are there practical limits to OBJ file complexity for our target use cases?
- **Why it matters:** May need to implement LOD or mesh simplification
- **Status:** Not started
- **Added:** 2026-01-01

---

### R3: Browser vs Node.js image processing performance

- **Question:** How does Canvas API (browser) compare to sharp (Node.js) for profile extraction?
- **Why it matters:** Determines if we need server-side processing or can run entirely in browser
- **Status:** Not started
- **Added:** 2026-01-01

---

## Resolved Questions

*Move answered questions here with findings.*

### [Template]

**Q: [Original question]**

- **Answer:** [What we learned]
- **Decision:** [What we decided to do]
- **Evidence:** [Links to tests, benchmarks, or documentation]
- **Resolved:** [Date]

---

## How to Use This Document

### Adding a question

```markdown
**Q[N]: [Clear, specific question]**

- **Context:** [Why this question arose]
- **Stakes:** [What depends on the answer]
- **To validate:** [How to find the answer]
- **Owner:** [Who's responsible, or TBD]
- **Added:** [Date]
```

### Resolving a question

1. Move the question to "Resolved Questions"
2. Add Answer, Decision, Evidence, and Resolved date
3. Update any documents that reference this question
4. Commit with message: `docs: Resolve open question Q[N] - [summary]`

---

## Related Documents

- [Model Inventory](../model_inventory.md) — AI model decisions
- [Architecture](../architecture.md) — System design
- [North Star](../north_star.md) — Project principles
