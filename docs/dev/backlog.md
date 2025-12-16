# Development Backlog

## High Priority (Phase 3)
*   **Scanline Splitter**: 
    *   Algorithm: Scan image rows. If a row is 98% "Background Color", mark it as a gap. If gap > 50px, split image.
    *   Usage: Allows users to upload a single sheet containing multiple views.
*   **Alignment Tool**:
    *   UI to manually align the "Bow" and "Stern" of the Top View with the Side View if the automatic cropping was slightly off.

## Future
*   **Dimension Database**: Connect to a scraped DB of naval ship dimensions to auto-ground the scale.
*   **Symmetry Enforcer**: Option to mirror the starboard side trace to the port side to ensure a perfect hull, even if the drawing is slightly hand-drawn/asymmetric.
