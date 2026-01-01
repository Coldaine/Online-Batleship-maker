# AGENTS.md

Guidelines for AI agents working on NavalForge 3D. This applies to Claude Code, Codex, Jules, or any other AI development agents.

## Before You Start

1. **Read the spec first**: Each stage has documentation in `docs/stages/`. Read before implementing.
2. **Check open questions**: See [docs/research/open_questions.md](docs/research/open_questions.md) for unresolved decisions.
3. **Understand the architecture**: See [docs/architecture.md](docs/architecture.md) for system design.

## The Open Questions Pattern

This project uses a centralized open questions document to track unresolved technical decisions.

### When you encounter uncertainty

```
Is this decision documented?
  → Yes → Follow the documentation
  → No → Is it in open_questions.md?
    → Yes → Don't assume an answer, note the uncertainty
    → No → Add it to open_questions.md, then proceed carefully
```

### Why this matters

- Prevents different agents from making conflicting assumptions
- Creates institutional memory for the project
- Makes it clear what's decided vs what's still open

### Adding a question

When you encounter something unresolved:

```markdown
**Q[N]: [Clear, specific question]**

- **Context:** [Why this question arose]
- **Stakes:** [What depends on the answer]
- **To validate:** [How to find the answer]
- **Owner:** TBD
- **Added:** [Date]
```

### Resolving a question

If you find the answer through research or testing:

1. Move the question to "Resolved Questions"
2. Include evidence (benchmarks, docs, test results)
3. Update documents that referenced the question
4. Commit: `docs: Resolve open question Q[N] - [summary]`

## Stage-Based Development

Each pipeline stage is a mini-project:

| Stage | Focus | Key Docs |
|-------|-------|----------|
| 0 | Ingestion & asset management | `docs/stages/stage_0_ingestion/` |
| 1 | Grounding & ship identification | `docs/stages/stage_1_grounding/` |
| 2 | Profile extraction | `docs/stages/stage_2_extraction/` |
| 3 | 3D generation | `docs/stages/stage_3_generation/` |

**Each stage document includes:**
- Interface contracts (TypeScript)
- Algorithm specifications
- TDD goals with test cases
- Success criteria

**Your job:** Implement to the spec, write the tests first.

## AI Model Decisions

See [docs/model_inventory.md](docs/model_inventory.md).

**Current state (Dec 2025):**
- Model selection for specific tasks is largely TBD
- Gemini 3 Flash is the best cost/performance default
- Don't hardcode model choices without checking open questions

## Code Quality Expectations

### Tests First

Each stage doc has a "TDD Goals" section with specific test cases. Write these tests before implementing.

### Deterministic Components

Stages 2 and 3 have deterministic (non-AI) components. These must be:
- Pure functions where possible
- Same input → same output
- Fully testable

### AI Components

AI-assisted components (Stages 0, 1, and refinement in 3) must:
- Use structured output (JSON schema)
- Validate responses before using
- Handle failures gracefully

## Coordination

If multiple agents are working on this project:

1. **Claim your work**: Note in commit messages which stage/component you're working on
2. **Check open questions first**: Don't duplicate research
3. **Add to open questions**: If you discover new uncertainties
4. **Resolve questions you answer**: Update the doc with findings

## Key Files

```
CLAUDE.md              # Claude-specific instructions
AGENTS.md              # This file
docs/
  architecture.md      # System design
  north_star.md        # Vision and principles
  model_inventory.md   # AI models reference
  research/
    open_questions.md  # ← CHECK THIS
    gemini_capabilities.md
  stages/              # Per-stage specifications
```
