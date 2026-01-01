---
title: Open Questions & Research Items
date: 2026-01-01
status: Living Document
---

# Open Questions & Research Items

This document tracks two distinct types of unresolved items:

1. **Open Questions** — Require human judgment, opinions, or decisions
2. **Research Items** — Require factual research (web search, docs) because information is too recent for AI training data

---

## Open Questions

*These need human input to resolve. AI agents should not assume answers.*

### Q1: What's the right balance of pre-computation vs on-demand processing?

- **Decision needed:** Should we pre-extract profiles for all ingested crops, or extract on-demand when generating 3D?
- **Tradeoffs:** Storage/upfront compute vs latency during generation
- **Owner:** TBD
- **Added:** 2026-01-01

---

### Q2: Should Stage 0 ingestion be a separate service?

- **Decision needed:** Is batch-only ingestion acceptable, or do users need interactive ingestion?
- **Tradeoffs:** Architectural complexity vs operational flexibility
- **Owner:** TBD
- **Added:** 2026-01-01

---

### Q3: How should we handle unknown ship classes?

- **Decision needed:** When grounding fails to identify a ship class, what's the UX?
- **Options:**
  - (a) Prompt for manual input
  - (b) Use AI-estimated dimensions with warning
  - (c) Refuse to proceed
- **Owner:** TBD
- **Added:** 2026-01-01

---

### Q4: Is elliptical hull cross-section adequate for v1?

- **Decision needed:** Should we implement multiple hull shapes now, or ship with ellipse-only?
- **Context:** Real ships have varied cross-sections (V-hull, flat bottom, rounded). We currently assume ellipse.
- **Tradeoffs:** Visual accuracy vs implementation complexity
- **Owner:** TBD
- **Added:** 2026-01-01

---

## Research Items

*These are factual gaps. AI agents should use web search to fill these before proceeding. Information is likely too recent (late 2025) for training data.*

### R1: Gemini 3 Flash capabilities for spatial reasoning

- **What we don't know:** Does Gemini 3 Flash (Dec 2025) have comparable spatial reasoning to Gemini 3 Pro for geometry hint extraction?
- **Why it matters:** 4x cost difference between models
- **How to research:** Search for Gemini 3 Flash benchmarks, spatial reasoning comparisons, developer reports
- **Status:** Not started
- **Added:** 2026-01-01

---

### R2: Gemini 3 Flash `thinking_level` parameter behavior

- **What we don't know:** How does the `thinking_level` parameter (minimal/low/medium/high) affect quality and latency for vision tasks?
- **Why it matters:** Could optimize cost/quality per task type
- **How to research:** Search for Gemini 3 Flash thinking_level documentation, benchmarks, developer experiences
- **Status:** Not started
- **Added:** 2026-01-01

---

### R3: Nano Banana Pro API limits and quotas

- **What we don't know:** Rate limits, image size limits, daily quotas for Nano Banana Pro via API
- **Why it matters:** Affects batch processing design and cost estimation
- **How to research:** Search for Nano Banana Pro API documentation, Vertex AI quotas, developer reports
- **Status:** Not started
- **Added:** 2026-01-01

---

### R4: Current best practices for Gemini structured output

- **What we don't know:** Latest patterns for getting reliable JSON from Gemini 3 models (Dec 2025)
- **Why it matters:** AI components need structured output; patterns may have changed
- **How to research:** Search for Gemini 3 JSON mode, structured output, response schemas
- **Status:** Not started
- **Added:** 2026-01-01

---

### R5: Browser vs Node.js image processing performance (2025 state)

- **What we don't know:** Current Canvas API vs sharp performance for profile extraction workloads
- **Why it matters:** Determines if we need server-side processing or can run entirely in browser
- **How to research:** Search for sharp vs canvas benchmarks 2025, browser image processing performance
- **Status:** Not started
- **Added:** 2026-01-01

---

### R6: OBJ format practical limits

- **What we don't know:** Are there practical vertex/face limits for OBJ files in common 3D software (Blender, Three.js, etc.)?
- **Why it matters:** May need LOD or mesh simplification
- **How to research:** Search for OBJ file size limits, Three.js mesh performance, Blender import limits
- **Status:** Not started
- **Added:** 2026-01-01

---

## Resolved

*Move items here with findings.*

### Template

**[Q/R][N]: [Original item]**

- **Answer:** [What we learned]
- **Decision/Finding:** [What we decided or discovered]
- **Evidence:** [Links, benchmarks, sources]
- **Resolved:** [Date]

---

## How to Use This Document

### For Open Questions (need human input)

1. Don't assume an answer
2. Note the question in your response
3. Present options to the user
4. When user decides, move to Resolved with their decision

### For Research Items (need web search)

1. Use web search before implementing anything that touches this area
2. Document findings in the item
3. Move to Resolved with sources
4. Update related docs with new information

### Adding items

**Open Question:**
```markdown
### Q[N]: [Clear question requiring human judgment]

- **Decision needed:** [What choice must be made]
- **Tradeoffs:** [What's at stake]
- **Owner:** TBD
- **Added:** [Date]
```

**Research Item:**
```markdown
### R[N]: [Topic needing research]

- **What we don't know:** [Specific factual gap]
- **Why it matters:** [Impact on implementation]
- **How to research:** [Search queries, docs to check]
- **Status:** Not started / In progress / Done
- **Added:** [Date]
```

---

## Related Documents

- [Model Inventory](../model_inventory.md) — AI model decisions
- [Architecture](../architecture.md) — System design
- [North Star](../north_star.md) — Project principles
