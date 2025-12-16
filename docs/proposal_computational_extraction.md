# Architecture: AI-Supervised Computational Geometry Extraction

## 1. Executive Summary
Current generation systems suffer from "hallucinated geometry." Our goal is to fix this by implementing an **Agentic Vision Workflow**.

**The Prime Directive**: Extract the **Outer Shell** (the "Loaf of Bread") with absolute silhouette accuracy. We do not care about small details (turrets, railings) in Phase 2. If the 3D mesh's shadow matches the input image's silhouette, we have succeeded.

## 2. Core Philosophy: "The Glass Box"
We reject the "Black Box" pattern.
*   **Visibility**: When the AI says "I'm detecting the hull," the user sees the mask apply in real-time.
*   **AI Autonomy**: The user does *not* manually select colors or threshold sliders. The AI analyzes the image, determines it is a "Red Hull on White Background," and configures the computer vision tools automatically. The user only intervenes if the AI fails.

## 3. The "Visual Feedback Loop" Architecture

### Step 1: Semantic Analysis & Auto-Configuration
The user uploads an image (Blueprint or Illustration).
*   **AI Action**: Gemini analyzes the image.
    *   *Input*: Yamato Pixel Art (Red hull, white BG).
    *   *Reasoning*: "This is a side profile. The hull is the large red region (#AA0000). The background is white (#FFFFFF). I need to isolate the red region."
    *   *Command*: `executeTool('extractColorMask', { targetColor: '#AA0000', tolerance: 30, smooth: true })`

### Step 2: Client-Side Extraction
The React frontend executes the CV logic.
*   It runs the color keying algorithm.
*   It applies a "Morphological Close" (Dilate -> Erode) to heal any text labels (`<-- 20mm`) that might cut into the hull shape.
*   It generates a vector path of the outline.

### Step 3: Visual Verification
The frontend generates a **Composite Verification Image**:
*   The original image is dimmed.
*   The extracted vector path is drawn as a **Neon Green** overlay.
*   This image is sent back to Gemini.

### Step 4: The Review Turn
*   *Prompt*: "Here is the extraction (Green). Did I miss any part of the bow, or include any label text?"
*   *AI Response*: "The rudder area is noisy due to the propeller pixels. Increase the `smoothing` parameter to 5 to clean up the stern."

## 4. The Tool Definitions (Client-Side)

### `extractHullSilhouette(params)`
The primary workhorse for the "Outer Shell".
*   `strategy`: "LUMINANCE" (for blueprints) | "CHROMA" (for illustrations).
*   `target_hex`: The dominant color to extract (if CHROMA).
*   `bg_hex`: The background color to ignore.
*   `smoothing_iterations`: How aggressively to smooth pixel-art jaggies into curves.

### `scanlineSplitter(params)`
*Future Capability*: detecting gaps in the image to auto-crop Top/Side views.
*   `axis`: "HORIZONTAL" | "VERTICAL".
*   `gap_threshold`: Minimum pixels of solid background color to constitute a split.

## 5. Geometric Synthesis: The "Elastic Mesh"
We do not use parametric guessing. We use **Elastic Tracing**.
1.  **Top View Trace** -> Defines the **Beam** (Width) at every Z-coordinate.
2.  **Side View Trace** -> Defines the **Draft** (Depth) and **Freeboard** (Height) at every Z-coordinate.
3.  **Mesh Generation**: We create a cylinder and "pinch" it using these two curves.
    *   `Vertex(x, y, z).width = TopTrace(z).width`
    *   `Vertex(x, y, z).height = SideTrace(z).height`
