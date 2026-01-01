# NavalForge 3D Documentation

## Quick Links

| Document | Purpose |
|----------|---------|
| [North Star](./north_star.md) | Vision, principles, and success criteria |
| [Architecture](./architecture.md) | System design and pipeline overview |
| [Model Inventory](./model_inventory.md) | AI models, capabilities, and pricing |

## Research & Decisions

| Document | Purpose |
|----------|---------|
| [Open Questions](./research/open_questions.md) | **Unresolved decisions—check before assuming** |
| [Gemini Capabilities](./research/gemini_capabilities.md) | Research on Gemini 3 Pro and Nano Banana Pro |

## Pipeline Stages

| Stage | Documentation | Purpose |
|-------|---------------|---------|
| 0 | [Ingestion](./stages/stage_0_ingestion/README.md) | Asset management, vision analysis, tagging |
| 1 | [Grounding](./stages/stage_1_grounding/README.md) | Ship identification, dimension lookup |
| 2 | [Extraction](./stages/stage_2_extraction/README.md) | Profile curve extraction from blueprints |
| 3 | [Generation](./stages/stage_3_generation/README.md) | 3D mesh creation and AI refinement |

## Development

| Document | Purpose |
|----------|---------|
| [Testing Strategy](./dev/testing_strategy.md) | How to test AI + deterministic components |
| [Logging & Observability](./dev/logging_observability.md) | Event tracking approach |
| [Backlog](./dev/backlog.md) | Future work and ideas |

## For AI Agents

Before implementing anything:

1. **Check [Open Questions](./research/open_questions.md)** — Don't assume answers to unresolved decisions
2. **Read the stage spec** — Each stage has TDD goals and interface contracts
3. **See [CLAUDE.md](../CLAUDE.md) or [AGENTS.md](../AGENTS.md)** — Agent-specific guidelines
