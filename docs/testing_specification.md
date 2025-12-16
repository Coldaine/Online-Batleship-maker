
# NavalForge 3D: Testing Specification

This document outlines the strategy for validating each phase of the pipeline defined in `pipeline_specification.md`.

## Phase 1: Ingestion & Normalization (The UI)
**Target**: `components/BlueprintSplitter.tsx`
**Type**: Component / Interaction Tests
**Tooling**: React Testing Library + User Event

### Test Cases
1.  **Coordinate Math**:
    *   *Input*: Simulate a mouse drag from (50, 50) to (150, 150) on a 500x500 container.
    *   *Assertion*: Verify the resulting state contains a crop region `{x: 50, y: 50, width: 100, height: 100}`.
2.  **Auto-Classification Heuristic**:
    *   *Input*: Create two crops. Crop A is "Flat/Wide" (Aspect Ratio 4:1). Crop B is "Tall" (Aspect Ratio 1:1).
    *   *Assertion*: Verify Crop A is auto-labeled "Top" and Crop B is "Side".
3.  **Image Projection**:
    *   *Input*: Container is 500px wide. Source Image is 1000px wide (Scale = 2x). Crop is 100px wide on screen.
    *   *Assertion*: The output `canvas` extraction must be 200px wide (Physical Pixels).

---

## Phase 2: Semantic Grounding (The AI)
**Target**: `services/geminiService.ts`
**Type**: Unit Tests (Mocked) & Evals (Live)

### Strategy A: Unit Tests (Stability)
We must test the *parsing logic* without calling Google.
1.  **JSON Resilience**:
    *   *Input*: A Mock LLM response containing markdown: `Here is the data: \`\`\`json { "shipClass": "Yamato" } \`\`\``
    *   *Assertion*: `analyzeBlueprint` correctly strips markdown and parses the object.
2.  **Schema Validation**:
    *   *Input*: A Mock LLM response missing the `geometry` field.
    *   *Assertion*: Function uses default fallbacks or throws a specific `ValidationError`.

### Strategy B: "Golden Dataset" Evals (Accuracy)
*Separate script, not part of CI/CD*
1.  **Input**: Folder of 10 known ship blueprints (Yamato, Bismarck, Iowa, etc.).
2.  **Process**: Run live `gemini-2.5-flash` calls.
3.  **Assertion**:
    *   `shipClass` matches ground truth string (fuzzy match).
    *   `realDimensions` are within 5% of Wikipedia data.

---

## Phase 3: Computational Extraction (The Vision Kernel)
**Target**: `utils/VisionKernel.ts`
**Type**: Deterministic Unit Tests
**Tooling**: Vitest + JSDOM (Canvas Mock)

### Test Fixtures
We do not use real blueprints for unit tests. We use **Synthetic Fixtures**.
1.  **The "White Square"**: A 100x100 image, black background, white square in the middle (x:25-75).
2.  **The "Gradient"**: A 100x100 image fading from black to white.

### Test Cases
1.  **Luminance Thresholding**:
    *   *Input*: "Gradient" image, Threshold = 128.
    *   *Assertion*: Output array has `0.0` for indices 0-49 and `1.0` (or height value) for indices 50-100.
2.  **Profile Normalization**:
    *   *Input*: "White Square" (Height 50px inside 100px canvas).
    *   *Assertion*: `sideProfile` array returns `0.5` at the center index.
3.  **Noise Smoothing**:
    *   *Input*: A profile array `[0, 0, 1.0 (noise spike), 0, 0]`.
    *   *Action*: Run with `smoothing: 2`.
    *   *Assertion*: The spike at index 2 is reduced (e.g., `< 0.5`) due to averaging with neighbors.

---

## Phase 4: Elastic Lofting (The Geometry)
**Target**: `utils/meshGenerator.ts`
**Type**: Snapshot Testing

### Test Cases
1.  **Vertex Count Determinism**:
    *   *Input*: Standard Parameters, `segments=10`, `rings=8`.
    *   *Assertion*: The resulting OBJ string always has exactly `(segments + 1) * (rings + 1)` vertices.
2.  **Dimensional Accuracy**:
    *   *Input*: `length: 100m`. `topProfile` is all `1.0`. `beam: 10m`.
    *   *Assertion*: Check specific vertex lines. Vertices at `z=0` should have `x` values of approximately `5.0` (Beam/2).
3.  **Snapshot Registry**:
    *   Save the output of `generateShipObj(defaultParams)` to `__snapshots__/battleship.obj`.
    *   Any code change that alters the mesh topology requires a manual review of the diff.

---

## Phase 5: Visualization
**Target**: `App.tsx` Integration
**Type**: End-to-End (Cypress/Playwright)

1.  **Happy Path**:
    *   Upload Top View -> Upload Side View -> Click Analyze -> Wait for Mock -> Click Generate -> Verify `<img src="data:..." />` appears.
