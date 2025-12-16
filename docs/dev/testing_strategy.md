# Testing Strategy: Validating the Hybrid Engine

## 1. The Challenge
Testing `NavalForge` is difficult because it combines:
1.  **Probabilistic AI** (Gemini output changes slightly every time).
2.  **Deterministic CV** (Canvas pixel manipulation).
3.  **Visual Output** (3D Meshes).

We cannot rely on simple snapshot testing for the AI parts. We need a layered approach.

## 2. Layer 1: Unit Testing the "Vision Kernel" (Deterministic)

The Computer Vision tools (`VisionKernel.ts`) must be strictly deterministic.

*   **Test Assets**: "Synthetic Blueprints". Instead of real noisy images, we create clean, generated PNGs of known shapes (e.g., a perfect ellipse, a rectangle).
*   **Assertions**:
    *   `detectHullBoundary(perfect_ellipse.png)` must return a vector path within 0.1% variance of the mathematical ellipse.
    *   `sampleCrossSection` at 50% width must match the known pixel width of the synthetic image.
*   **Tooling**: Vitest + Canvas (JSDOM or headless-gl).

## 3. Layer 2: Visual Regression (The "Golden Master")

For the 3D Mesh Generation (`meshGenerator.ts`), we ensure that *given* a specific set of vector inputs, the OBJ output is identical.

*   **Strategy**:
    1.  Create a `fixtures/` folder with mock Vector Data (JSON) representing a "Standard Battleship".
    2.  Run the generator.
    3.  Compare the output `.obj` text against a `gold_standard_battleship.obj`.
*   **Goal**: Ensure that refactoring the mesh code doesn't accidentally flip normals or break UVs.

## 4. Layer 3: AI Evaluation (The "Turing Test")

We need to score the AI's ability to *parameterize* the tools.

*   **Dataset**: 20 labeled blueprints ranging from "Clean Vector" to "Noisy Scan".
    *   Each blueprint has "Ideal Parameters" manually defined by a human (e.g., `threshold: 140`).
*   **Eval Script**:
    1.  Feed the blueprint to the AI.
    2.  Ask it to suggest parameters.
    3.  Calculate the distance between AI_Params and Ideal_Params.
*   **Scoring**:
    *   Pass: Parameters result in a hull mask with >90% IoU (Intersection over Union) with the ground truth mask.
    *   Fail: Parameters result in noise or empty masks.

## 5. Layer 4: Human Observational Testing (Manual)

Because of the "Glass Box" architecture, manual testing is formalized.

*   **The Protocol**:
    1.  Tester uploads a file.
    2.  Tester *must* watch the "Visual Verification" step.
    3.  Tester explicitly rates the AI's initial guess (Good/Bad) in the UI before manually correcting.
    4.  These ratings are logged to the analytics backend to track model drift over time.
