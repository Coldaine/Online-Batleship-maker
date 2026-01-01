---
title: "Stage 0.1: Vision Analysis"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 0
component: vision_analysis
status: Specification (Not Implemented)
---

# Vision Analysis

## Purpose

Use LLM vision to examine raw images and produce structured analysis: what type of image, how many views, what ship, what text is present, and quality assessment.

## The Problem

Raw blueprint images come in many forms:
- Single view or multiple views stacked/arranged
- Line drawings, colored renders, photographs, paintings
- Clean or covered in annotations
- Labeled with ship name or completely unlabeled
- High quality scans or low quality web grabs

We need to understand what we're looking at before we can process it.

---

## Interface Contract

```typescript
interface VisionAnalysisInput {
  imagePath: string;           // Path to raw image file
  imageData?: Buffer;          // Or raw image data
  hints?: {
    expectedShipClass?: string;
    source?: string;           // "web", "scan", "user_upload"
  };
}

interface VisionAnalysisOutput {
  imageType: ImageType;
  views: DetectedView[];
  identification: ShipIdentification;
  textContent: ExtractedText[];
  quality: QualityAssessment;
  confidence: number;          // Overall confidence 0-1
  rawLLMResponse: string;      // Keep for debugging
}

type ImageType =
  | 'single_view'
  | 'multi_view_stacked'       // Vertically arranged
  | 'multi_view_grid'          // Grid arrangement
  | 'multi_view_freeform'      // Irregular arrangement
  | 'photograph'
  | 'painting'
  | 'unknown';

interface DetectedView {
  index: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  viewType: ViewType;
  style: ViewStyle;
  orientation: Orientation;
  confidence: number;
}

type ViewType =
  | 'side_profile'             // Ship from side
  | 'plan_view'                // Ship from above
  | 'bow_view'                 // Ship from front
  | 'stern_view'               // Ship from rear
  | 'cross_section'            // Cutaway view
  | 'detail'                   // Closeup of component
  | 'unknown';

type ViewStyle =
  | 'line_drawing_bw'          // Black and white lines
  | 'line_drawing_color'       // Colored line art
  | 'filled_color'             // Solid filled colors
  | 'shaded'                   // Gradients/shading
  | 'photograph'
  | 'painting';

type Orientation =
  | 'bow_left'
  | 'bow_right'
  | 'bow_up'
  | 'bow_down';

interface ShipIdentification {
  shipClass: string | null;    // e.g., "Karl von Müller class"
  shipName: string | null;     // e.g., "SMS Emden"
  shipType: string | null;     // e.g., "cruiser"
  nation: string | null;       // e.g., "Germany"
  era: string | null;          // e.g., "Weimar Republic"
  isHistorical: boolean;       // false if hypothetical/fictional
  designer: string | null;     // Artist attribution if found
  confidence: number;
}

interface ExtractedText {
  text: string;
  location: { x: number; y: number };
  textType: 'title' | 'label' | 'dimension' | 'annotation' | 'attribution' | 'unknown';
  confidence: number;
}

interface QualityAssessment {
  silhouetteClarity: 'clean' | 'moderate' | 'noisy';
  annotationDensity: 'none' | 'light' | 'heavy';
  resolution: 'high' | 'medium' | 'low';
  suitableForExtraction: boolean;
  issues: string[];            // e.g., ["heavy watermark", "low contrast"]
}
```

---

## LLM Prompt Specification

```
You are analyzing a naval ship blueprint or illustration for an automated processing pipeline.

Examine this image carefully and provide a structured analysis.

## TASK 1: Image Classification
- Is this a single view or multiple views?
- If multiple, how are they arranged? (stacked vertically, grid, freeform)
- For each view, identify:
  - Bounding box (approximate pixel coordinates: x, y, width, height)
  - View type (side profile, plan view, bow view, stern view, cross section, detail)
  - Style (line drawing B&W, line drawing color, filled color, shaded, photograph, painting)
  - Orientation (which direction is the bow facing?)

## TASK 2: Ship Identification
- Read any text in the image (titles, labels, attributions)
- Identify the ship class if stated or recognizable
- Identify the nation and era
- Is this a historical ship or hypothetical/fictional design?
- Note any artist/designer attribution

## TASK 3: Quality Assessment
- How clean are the silhouettes? (clean, moderate, noisy)
- How much text/annotation overlays the ship? (none, light, heavy)
- Is the resolution sufficient for processing?
- Any issues that would affect automated processing?

## OUTPUT FORMAT (JSON)
{
  "imageType": "single_view" | "multi_view_stacked" | "multi_view_grid" | "multi_view_freeform" | "photograph" | "painting" | "unknown",
  "views": [
    {
      "index": 0,
      "bounds": { "x": 0, "y": 0, "width": 1000, "height": 300 },
      "viewType": "side_profile" | "plan_view" | "bow_view" | "stern_view" | "cross_section" | "detail" | "unknown",
      "style": "line_drawing_bw" | "line_drawing_color" | "filled_color" | "shaded" | "photograph" | "painting",
      "orientation": "bow_left" | "bow_right" | "bow_up" | "bow_down",
      "confidence": 0.95
    }
  ],
  "identification": {
    "shipClass": "string or null",
    "shipName": "string or null",
    "shipType": "string or null",
    "nation": "string or null",
    "era": "string or null",
    "isHistorical": true | false,
    "designer": "string or null",
    "confidence": 0.8
  },
  "textContent": [
    {
      "text": "extracted text",
      "location": { "x": 100, "y": 50 },
      "textType": "title" | "label" | "dimension" | "annotation" | "attribution" | "unknown",
      "confidence": 0.9
    }
  ],
  "quality": {
    "silhouetteClarity": "clean" | "moderate" | "noisy",
    "annotationDensity": "none" | "light" | "heavy",
    "resolution": "high" | "medium" | "low",
    "suitableForExtraction": true | false,
    "issues": ["list of issues"]
  },
  "confidence": 0.85
}

Be precise with bounding boxes. Err on the side of slightly larger bounds to avoid cutting off content.
If uncertain about any field, include your best guess but lower the confidence score.
```

---

## TDD Goals

### Test 1: Single View Detection
```typescript
describe('vision analysis - single view', () => {
  it('should detect single side profile view', async () => {
    const result = await analyzeImage('test_assets/single_side_view.png');

    expect(result.imageType).toBe('single_view');
    expect(result.views.length).toBe(1);
    expect(result.views[0].viewType).toBe('side_profile');
  });

  it('should detect single plan view', async () => {
    const result = await analyzeImage('test_assets/single_plan_view.png');

    expect(result.imageType).toBe('single_view');
    expect(result.views[0].viewType).toBe('plan_view');
  });
});
```

### Test 2: Multi-View Detection
```typescript
describe('vision analysis - multi view', () => {
  it('should detect vertically stacked views', async () => {
    const result = await analyzeImage('test_assets/four_stacked_views.png');

    expect(result.imageType).toBe('multi_view_stacked');
    expect(result.views.length).toBe(4);

    // Views should be in order top to bottom
    expect(result.views[0].bounds.y).toBeLessThan(result.views[1].bounds.y);
    expect(result.views[1].bounds.y).toBeLessThan(result.views[2].bounds.y);
  });

  it('should correctly identify view types in multi-view image', async () => {
    const result = await analyzeImage('test_assets/karl_von_muller.png');

    const viewTypes = result.views.map(v => v.viewType);
    expect(viewTypes).toContain('side_profile');
    expect(viewTypes).toContain('plan_view');
  });
});
```

### Test 3: Text Extraction
```typescript
describe('vision analysis - text extraction', () => {
  it('should extract ship class from title', async () => {
    const result = await analyzeImage('test_assets/labeled_blueprint.png');

    expect(result.identification.shipClass).toBeTruthy();
    expect(result.textContent.some(t => t.textType === 'title')).toBe(true);
  });

  it('should extract artist attribution', async () => {
    const result = await analyzeImage('test_assets/tzoli_design.png');

    expect(result.identification.designer).toBe('TZoli');
    expect(result.textContent.some(t => t.text.includes('TZoli'))).toBe(true);
  });
});
```

### Test 4: Quality Assessment
```typescript
describe('vision analysis - quality', () => {
  it('should identify clean silhouettes', async () => {
    const result = await analyzeImage('test_assets/clean_colored_view.png');

    expect(result.quality.silhouetteClarity).toBe('clean');
    expect(result.quality.suitableForExtraction).toBe(true);
  });

  it('should flag heavily annotated images', async () => {
    const result = await analyzeImage('test_assets/heavily_annotated.png');

    expect(result.quality.annotationDensity).toBe('heavy');
    expect(result.quality.issues).toContain(expect.stringMatching(/annotation/i));
  });

  it('should detect low resolution', async () => {
    const result = await analyzeImage('test_assets/low_res_thumbnail.png');

    expect(result.quality.resolution).toBe('low');
    expect(result.quality.suitableForExtraction).toBe(false);
  });
});
```

### Test 5: Bounding Box Accuracy
```typescript
describe('vision analysis - bounds accuracy', () => {
  it('should produce non-overlapping bounds for stacked views', async () => {
    const result = await analyzeImage('test_assets/four_stacked_views.png');

    for (let i = 0; i < result.views.length - 1; i++) {
      const current = result.views[i];
      const next = result.views[i + 1];

      // Bottom of current should be above top of next (no overlap)
      expect(current.bounds.y + current.bounds.height).toBeLessThanOrEqual(next.bounds.y);
    }
  });

  it('should cover most of image area with detected views', async () => {
    const result = await analyzeImage('test_assets/four_stacked_views.png');
    const imageArea = 1000 * 1200; // Known test image size

    const viewsArea = result.views.reduce((sum, v) =>
      sum + v.bounds.width * v.bounds.height, 0);

    // Views should cover at least 70% of image
    expect(viewsArea / imageArea).toBeGreaterThan(0.7);
  });
});
```

---

## Implementation Notes

### Model Selection
- Use Gemini 2.5 Flash for speed (most images)
- Fall back to Gemini 2.5 Pro for complex/ambiguous images
- Consider caching results by image hash

### Error Handling
```typescript
interface VisionAnalysisError {
  code: 'INVALID_IMAGE' | 'LLM_ERROR' | 'PARSE_ERROR' | 'TIMEOUT';
  message: string;
  recoverable: boolean;
}
```

### Performance
- Target: <5 seconds per image for standard resolution
- Batch images to LLM where possible (if supported)
- Resize large images before sending to LLM (keep aspect ratio)

---

## Success Criteria

1. ✅ Correctly classify image type 95%+ of the time
2. ✅ Detect all views in multi-view images 90%+ of the time
3. ✅ Extract ship class from labeled images 85%+ accuracy
4. ✅ Produce valid bounding boxes (within 5% of actual boundaries)
5. ✅ Complete analysis in <5 seconds per image
6. ✅ Handle edge cases gracefully (blank images, photos, paintings)

---

## Related Documents

- [Stage 0 Overview](./README.md)
- [Auto-Cropping](./auto_cropping.md) — Consumes this output
- [Gemini Capabilities](../../research/gemini_capabilities.md)
