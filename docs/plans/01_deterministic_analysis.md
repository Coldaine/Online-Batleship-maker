# Implementation Plan: Phase 1 - Deterministic Analysis Engine

## Objective
Replace the current "Simulacrum" analysis pipeline (which relies on LLM hallucination for geometry) with a **Deterministic Computer Vision (CV) Engine**. This ensures that the 3D model is built upon measurable, accurate pixel data from the user's blueprint, rather than AI guesses.

## Core Components

### 1. Auto-Splitter (Smart Crop)
**Goal:** Remove the need for manual dragging to separate Top and Side views.
**Logic:**
1.  **Input:** Master Blueprint Image.
2.  **Process:**
    *   Convert to Grayscale.
    *   Apply Thresholding (Separating White lines from Blue background).
    *   Perform Connected Component Labeling (CCL) or Contour Finding to identify distinct "blobs".
    *   Filter noise (small specks).
    *   Select the two largest bounding boxes.
3.  **Heuristic Classification:**
    *   *Side View:* Typically taller aspect ratio (due to masts) or less dense pixel fill.
    *   *Top View:* Typically wider and more uniform density (Hull).
4.  **Output:** Two coordinate boxes (Top, Side) auto-populated in the `BlueprintSplitter` UI.

### 2. CV Analysis Service (`utils/cvService.ts`)
**Goal:** Extract mathematical geometry from the cropped images.

#### A. Hull Profiler (Top View)
*   **Technique:** Scan-line algorithm.
*   **Steps:**
    1.  Determine the Centerline (Line of symmetry).
    2.  For every X (longitudinal) step, find the Y (transverse) distance to the first opaque pixel (Beam).
    3.  **Output:** An array of `beam_width` values normalized 0..1 along the length.
    4.  *Benefit:* This replaces the generic "Taper Logic" in `meshGenerator.ts` with the *actual* hull shape of the ship.

#### B. Turret Detector (Top View)
*   **Technique:** Blob Detection / Shape Matching.
*   **Steps:**
    1.  Isolate the central deck region.
    2.  Scan for large, roughly circular blobs.
    3.  Filter by size (Turrets are significant fraction of beam).
    4.  Sort by X-position.
    5.  **Output:** Array of normalized X-coordinates for Main Battery Turrets.
    6.  *Benefit:* Turrets appear exactly where they are drawn, not where an LLM thinks they "should" be.

#### C. Superstructure Lofting (Side View)
*   **Technique:** Silhouette Extraction (Refinement of existing `imageProcessing.ts`).
*   **Steps:**
    1.  Scan Top-Down to find the highest pixel at each X-step.
    2.  Identify "Plateaus" (continuous high sections) to denote the Superstructure blocks.
    3.  **Output:** Start/End points and Height maps for the superstructure.

## Architecture Changes
1.  **New Service:** `src/services/analysisService.ts` (Or heavily modified `geminiService.ts`).
    *   It will still call Gemini for *Metadata* (Ship Name, Year, History).
    *   It will run `cvService` functions for *Geometry*.
    *   It will merge these into the `AnalysisData` object.
2.  **UI Updates:**
    *   The `AnalysisDisplay` should show a "Confidence: 100% (Measured)" badge for geometry.
    *   Visual overlay on the blueprint images showing the detected green lines/circles.

## Success Metrics
*   **Accuracy:** The exported 3D model's hull shape matches the 2D drawing's curvature.
*   **Reliability:** Re-running analysis on the same image produces identical results (Deterministic).
*   **UX:** User spends 0 seconds splitting images (Auto-split).
