# Phase 2 Implementation Plan: The Vision Kernel

## Goal
**"The Outer Shell"**. Generate a watertight 3D Hull Mesh that mathematically matches the silhouette of the uploaded images.

## Step 1: The `VisionKernel` (The Eyes)
Update `src/utils/VisionKernel.ts` to be AI-driven rather than user-driven.

*   **Capabilities**:
    *   `analyzeHistogram()`: Identify dominant colors (for AI to decide "Red" vs "Blue").
    *   `segmentByColor(hex, tolerance)`: The "Auto-Magic Wand".
    *   `segmentByLuminance(threshold)`: For standard blueprints.
    *   `traceBitmap()`: Convert the binary mask into a simplified coordinate array (SVG Path).

## Step 2: The "Glass Box" UI
Update the UI to show the AI's "Thinking" and the visual result.

*   **Component**: `components/ExtractionDebugger.tsx`
*   **Behavior**:
    *   Displays the AI's "Thought": *"Detecting Red Hull..."*
    *   Displays the **Binary Mask** (Black/White view of what the computer sees).
    *   Displays the **Vector Overlay** (Final result).
    *   **NO** manual sliders by default. Hidden "Developer Mode" reveals them if AI fails completely.

## Step 3: The Elastic Mesh Generator
Rewrite `meshGenerator.ts` to accept `topProfile` and `sideProfile` arrays.

*   **Algorithm**:
    *   Normalize both arrays to `Length = 1.0`.
    *   Iterate `Z` from 0 to 1.
    *   `Ring[z].width = topProfile[z]`
    *   `Ring[z].height = sideProfile[z]`
    *   This guarantees the 3D object matches the images, regardless of the ship's actual dimensions.

## Step 4: Future / Backlog
*   **Scanline Splitter**: A pre-processing step to auto-detect the gap between Top and Side views by finding rows of continuous background color.
*   **Text Healer**: Specific logic to identify and patch holes created by text labels intersecting the hull.
