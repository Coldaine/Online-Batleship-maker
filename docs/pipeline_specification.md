
# NavalForge 3D: Pipeline Specification & Data Flow

This document explicitly defines the requirements, inputs, transformations, and outputs for the 2D-to-3D conversion process. It serves as the "contract" between the probabilistic AI, the deterministic code, and the human operator.

---

## Phase 1: Ingestion & Normalization
**Goal**: Establish clean, separated source material.

*   **Responsible Actor**: **Human** (assisted by Deterministic Tooling).
*   **Input**: 
    *   Single master image file (JPG/PNG).
    *   User mouse interactions (Crop Selection).
*   **Transformation (Deterministic Code)**:
    *   `BlueprintSplitter.tsx`: Extracts sub-regions from the master canvas based on coordinates.
    *   **Requirements**: Output images must be cropped tightly to the hull content to maximize resolution for the tracer.
*   **Intermediate Visuals**: 
    *   Interactive cropping overlay with "Top" and "Side" labels.
*   **Output**: 
    *   `topView` (Base64 String): The Plan view.
    *   `sideView` (Base64 String): The Profile view.

---

## Phase 2: Semantic Grounding (The "Brain")
**Goal**: Determine *what* we are looking at to calibrate the mathematical scale.

*   **Responsible Actor**: **LLM** (Gemini 2.5/3.0).
*   **Input**: 
    *   `topView` (Image).
    *   **Prompt**: "Identify this ship class and finding its real-world Beam, Length, and Draft via Google Search."
*   **Transformation (Probabilistic AI)**:
    *   **Visual Classification**: Identify the ship (e.g., "Yamato-class").
    *   **Search Grounding**: Query knowledge base for "Yamato beam width meters".
    *   **Parameter Inference**: Analyze image contrast to suggest `TraceConfig` (e.g., "Image is dark blueprint, set threshold to 200").
*   **Output (JSON)**:
    *   `AnalysisData`:
        *   `shipClass`: string (e.g., "Yamato").
        *   `realDimensions`: `{ length: 263, beam: 38.9, draft: 11 }`.
        *   `suggestedThreshold`: number (0-255).

---

## Phase 3: Computational Extraction (The "Eyes")
**Goal**: Convert pixels into normalized mathematical arrays. This is a **Deterministic** step to ensure symmetry and clean lines.

*   **Responsible Actor**: **Deterministic Code** (`VisionKernel.ts`).
*   **Input**:
    *   `topView` / `sideView` (Images).
    *   `TraceConfig` (Threshold, Smoothing Factor) - derived from Phase 2 or User Overrides.
*   **Transformation (Computer Vision)**:
    *   **Scanline Raycasting**: Iterate column-by-column (Z-axis).
    *   **Bilateral Symmetry Assumption**: For Top View, measure distance from Centerline to Max Opaque Pixel.
    *   **Profile Extraction**: For Side View, measure total opaque height per column.
    *   **Moving Average Smoothing**: Apply kernel (size=3 to 5) to remove "salt and pepper" noise from text labels.
*   **Intermediate Visuals**: 
    *   **The Green Line**: A neon vector path overlay drawn directly on top of the original image in the UI. This allows the human to instantly verify if the tracer "saw" the correct shape.
*   **Output**:
    *   `topProfile`: `number[]` (Array of floats 0.0 to 1.0, length=100).
    *   `sideProfile`: `number[]` (Array of floats 0.0 to 1.0, length=100).

---

## Phase 4: Elastic Lofting (The "Forge")
**Goal**: Synthesize the 3D geometry using the extracted data.

*   **Responsible Actor**: **Deterministic Code** (`meshGenerator.ts`).
*   **Input**:
    *   `topProfile` (Shape of the Width).
    *   `sideProfile` (Shape of the Height/Sheer).
    *   `realDimensions` (The scalar multipliers).
    *   `ShipParameters` (User extrusion overrides).
*   **Transformation (Procedural Geometry)**:
    *   **Iterate Z** (Length) from Stern to Bow.
    *   **Calculate Vertex Width**: `x = topProfile[z] * (realBeam / 2)`.
    *   **Calculate Vertex Height**: `y = sideProfile[z] * realDraft`.
    *   **Topology**: Generate Quads connecting Ring[i] to Ring[i+1].
    *   **Superstructure**: Place procedural primitives based on heuristic analysis of the Side View.
*   **Output**:
    *   `Wavefront OBJ` (String): The text-based 3D mesh definition.

---

## Phase 5: Visualization & Export
**Goal**: Show the user the result and deliver the file.

*   **Responsible Actor**: **Hybrid** (LLM for Render, Code for Export).
*   **Transformation 1 (Preview)**:
    *   **Actor**: LLM (Gemini).
    *   **Input**: Source Images + Context.
    *   **Action**: Generate a photorealistic "Artist's Impression" of the model (until WebGL viewer is implemented).
*   **Transformation 2 (File)**:
    *   **Actor**: Browser.
    *   **Action**: Blob creation of the OBJ string.
*   **Final Output**:
    *   `.obj` file download.
    *   Preview Image on screen.
