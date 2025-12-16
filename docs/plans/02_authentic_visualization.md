# Implementation Plan: Phase 2 - Authentic Visualization

## Objective
Replace the "Hallucinated" Image Preview with a **Real-Time 3D Renderer**. This ensures the user sees exactly what they will export. If the generated model looks "low poly" or "ugly", the tool should honestly show that, encouraging the user to tune parameters or improve the algorithm, rather than masking it with a pretty AI drawing.

## Core Components

### 1. 3D Viewer Component (`components/ShipViewer.tsx`)
**Technology:** `react-three-fiber` (R3F) + `drei`.
**Features:**
*   **Canvas:** A WebGL canvas replacing the static `<img>` tag in the main viewport.
*   **Camera:** OrbitControls for zooming and rotating.
*   **Lighting:** Standard 3-point lighting setup to highlight hull curves.
*   **Grid:** A technical "blueprint" grid floor.

### 2. Live Mesh Generation
**Goal:** The 3D mesh must update instantly when sliders change.
**Logic:**
*   The current `generateShipObj` returns a raw string (OBJ format).
*   **Refactor:** Create a `useShipGeometry` hook that returns a Three.js `BufferGeometry` directly, instead of parsing a string.
*   **Reactivity:**
    *   `hullExtrusion` slider -> Updates Hull vertex positions.
    *   `turretScale` slider -> Updates Turret mesh scaling.
    *   *No "Generate" button needed for previewing parameters.*

### 3. Material System
**Goal:** Make the procedural mesh look acceptable (even if low-poly).
**Styles:**
*   **Technical:** Wireframe / Blue lines (Tron style).
*   **Standard:** Grey Hull, Red Anti-fouling paint below waterline, Wood Deck.
*   **Shaders:** Simple custom shaders to handle the "Waterline" split color automatically based on Y-height.

### 4. Interactive Feedback Loop
**Goal:** Allow users to correct the CV analysis.
**Interaction:**
*   If the CV detects a turret at `x=0.8` but it's actually at `x=0.82`:
    *   User can drag a "Turret Marker" in the 2D view.
    *   The 3D model updates instantly.
*   This turns the tool from a "One-Shot Generator" into a "Assisted Modeling Workbench".

## Architecture Changes
1.  **Dependencies:** Install `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`.
2.  **State Management:** Move `AnalysisData` and `ShipParameters` into a context or unified store to drive the R3F scene.
3.  **Removal:** Delete the `generate3DView` function in `geminiService.ts` (or repurpose it for "Inspiration" only).

## Success Metrics
*   **Honesty:** The visual on screen matches the exported `.obj` file byte-for-byte in geometry.
*   **Performance:** 60 FPS rotation of the ship model.
*   **Responsiveness:** <100ms latency between slider change and mesh update.
