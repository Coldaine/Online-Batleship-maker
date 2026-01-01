# CLAUDE.md

Project-specific instructions for Claude Code and other AI assistants working on NavalForge 3D.

## Project Overview

NavalForge 3D transforms 2D naval blueprint images into 3D ship models using a hybrid deterministic-AI pipeline. See [docs/architecture.md](docs/architecture.md) for full system design.

## Key Documents

Before making changes, familiarize yourself with:

| Document | Purpose |
|----------|---------|
| [docs/north_star.md](docs/north_star.md) | Project vision and principles |
| [docs/architecture.md](docs/architecture.md) | System architecture specification |
| [docs/model_inventory.md](docs/model_inventory.md) | AI models and their roles |
| [docs/research/open_questions.md](docs/research/open_questions.md) | Unresolved decisions—check before assuming |

## Open Questions Pattern

**Before making architectural decisions, check [docs/research/open_questions.md](docs/research/open_questions.md).**

If you encounter an unresolved question:
1. Do NOT assume an answer
2. Add it to `open_questions.md` if not already there
3. Note the question in your response
4. Propose options rather than making unilateral decisions

If you resolve a question through research or testing:
1. Move it to the "Resolved" section with evidence
2. Update any documents that referenced the question

## Coding Conventions

### TypeScript

- Strict mode enabled
- Use interfaces for public contracts
- Use types for internal unions/aliases
- Prefer `Float32Array` for profile data (memory efficiency)

### File Structure

```
src/
  stages/
    stage0_ingestion/
    stage1_grounding/
    stage2_extraction/
    stage3_generation/
  services/
  utils/
docs/
  stages/           # Per-stage specifications
  research/         # Research and open questions
  dev/              # Development guides
```

### Testing

- TDD approach: tests should exist before implementation
- Each stage document includes specific test cases
- Use Vitest for testing

## AI Model Usage

See [docs/model_inventory.md](docs/model_inventory.md) for current model decisions.

**Key points:**
- Gemini 3 Flash is the current best cost/performance model (as of Dec 2025)
- Nano Banana Pro is required for image generation
- Model assignments for specific tasks are still TBD—don't hardcode assumptions

## Commit Messages

Follow conventional commits:

```
feat: Add profile extraction for side views
fix: Correct hull height calculation (diameter vs radius)
docs: Add open question about model selection
refactor: Extract grounding into separate service
```

## What NOT to Do

- Don't make unilateral decisions about model selection
- Don't implement features without checking the specification docs
- Don't skip the TDD goals defined in stage documents
- Don't add dependencies without documenting rationale
