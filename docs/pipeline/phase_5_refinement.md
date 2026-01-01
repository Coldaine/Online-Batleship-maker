---
title: "Phase 5: AI Refinement"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 5
type: AI-Assisted (Probabilistic)
status: Implemented (Visualization) / Planned (Geometric Correction)
---

# Phase 5: AI Refinement

## Purpose

Enhance the base 3D output using Gemini 3 Pro Image (Nano Banana Pro) to produce photorealistic visualizations and, in future iterations, geometric corrections fed back to the mesh.

## Component

**File:** `src/services/geminiService.ts`
**Function:** `generate3DView()`

## The Hybrid Approach

This phase embodies our core philosophy: **deterministic first, AI second**.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   PHASE 4 OUTPUT              PHASE 5 REFINEMENT            │
│   ───────────────             ──────────────────            │
│                                                             │
│   ┌─────────────┐             ┌─────────────────────┐       │
│   │             │             │                     │       │
│   │  Base OBJ   │────────────▶│   Nano Banana Pro   │       │
│   │   Mesh      │             │                     │       │
│   │             │             │   • Spatial reason  │       │
│   └─────────────┘             │   • Physics aware   │       │
│        +                      │   • Blueprint match │       │
│   ┌─────────────┐             │                     │       │
│   │  Original   │────────────▶│                     │       │
│   │  Blueprints │             └─────────────────────┘       │
│   └─────────────┘                       │                   │
│                                         ▼                   │
│                               ┌─────────────────────┐       │
│                               │  Refined 3D Output  │       │
│                               └─────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Interface

```typescript
// Input
interface RefinementInput {
  topView: string;           // Original blueprint (base64)
  sideView: string;          // Original blueprint (base64)
  params: ShipParameters;    // User parameters
  shipClass: string;         // From Phase 2 grounding
  baseMesh?: string;         // OBJ file (for future render-refine loop)
}

// Output (Current)
interface VisualizationOutput {
  image: string;             // Base64 PNG of 3D visualization
  metadata: {
    model: string;           // "gemini-3-pro-image-preview"
    timestamp: string;
  };
}

// Output (Future)
interface GeometricCorrectionOutput {
  corrections: {
    bow_angle?: number;      // Degrees adjustment
    hull_curve?: number;     // Multiplier at waterline
    stern_taper?: number;    // Reduction factor
    draft_adjustment?: number;
  };
  confidence: number;        // 0-1
  reasoning: string;         // Explanation of changes
}
```

## Current Implementation

### Visualization Generation

```typescript
export async function generate3DView(
  topView: string,
  sideView: string,
  params: ShipParameters,
  shipClass: string
): Promise<string> {
  const model = ai.getGenerativeModel({
    model: 'gemini-3-pro-image-preview'
  });

  const prompt = `
    Create a photorealistic 3D visualization of a ${shipClass}.

    Reference blueprints are provided (top and side views).

    Parameters:
    - Length: ${params.dimensions.length}m
    - Beam: ${params.dimensions.beam}m
    - Draft: ${params.dimensions.draft}m
    - Style: ${params.modelStyle}
    - Camouflage: ${params.camouflage}

    Generate a 3/4 view showing the ship from slightly above and to the side.
    Ensure hull proportions match the blueprints.
    Include realistic water, lighting, and atmosphere.
  `;

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: topView } },
        { inlineData: { mimeType: 'image/png', data: sideView } }
      ]
    }]
  });

  return result.response.inlineData?.data;
}
```

## Refinement Strategies

### Option A: 2D Visual Refinement (Near-term)

Enhance rendered images without modifying geometry:

```
1. Render base OBJ from standard angles (front, side, 3/4)
2. Send renders + original blueprints to Nano Banana Pro
3. Prompt: "Enhance this 3D render to better match the blueprint.
            Add realistic hull curvature, deck details, and proper lighting."
4. Output: Visually enhanced 2D image
```

**Advantages:**
- Works with current pipeline
- Fast iteration
- No mesh topology changes

**Limitations:**
- Output is image, not geometry
- Cannot export enhanced OBJ
- Each angle requires separate generation

### Option B: 3D Geometric Correction (Future)

Feed AI corrections back to mesh generation:

```typescript
async function getGeometricCorrections(
  renderedViews: string[],
  blueprints: { top: string; side: string },
  currentMesh: string
): Promise<GeometricCorrectionOutput> {
  const prompt = `
    Compare these rendered views of a 3D ship model against the original blueprints.

    Identify geometric discrepancies and suggest corrections as structured JSON:
    {
      "bow_angle": <degrees to adjust bow rake>,
      "hull_curve": <multiplier for hull beam at waterline>,
      "stern_taper": <factor to adjust stern narrowing>,
      "superstructure_height": <multiplier for superstructure>,
      "turret_scale": <multiplier for turret size>
    }

    Only include corrections for significant discrepancies (>5% error).
    Explain your reasoning.
  `;

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        ...renderedViews.map(v => ({ inlineData: { mimeType: 'image/png', data: v } })),
        { inlineData: { mimeType: 'image/png', data: blueprints.top } },
        { inlineData: { mimeType: 'image/png', data: blueprints.side } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  return JSON.parse(result.response.text());
}
```

### Option C: Iterative Refinement Loop (Future)

Multiple passes until convergence:

```typescript
async function iterativeRefinement(
  input: RefinementInput,
  maxIterations: number = 3
): Promise<{ mesh: string; history: CorrectionHistory[] }> {
  let currentMesh = input.baseMesh;
  const history: CorrectionHistory[] = [];

  for (let i = 0; i < maxIterations; i++) {
    // 1. Render current mesh
    const renders = await renderMesh(currentMesh, ['front', 'side', '3/4']);

    // 2. Get AI corrections
    const corrections = await getGeometricCorrections(
      renders,
      { top: input.topView, side: input.sideView },
      currentMesh
    );

    history.push({ iteration: i, corrections });

    // 3. Check convergence
    if (corrections.confidence < 0.1) {
      break;  // Corrections are minimal, we're done
    }

    // 4. Apply corrections to mesh
    currentMesh = applyCorrections(currentMesh, corrections);
  }

  return { mesh: currentMesh, history };
}
```

## Nano Banana Pro Capabilities

Key features relevant to refinement (from research):

| Capability | Application |
|------------|-------------|
| Blueprint reading | "First read the blueprint properly" |
| 3D spatial awareness | Understands geometry in 2D space |
| Physics control | Lighting, camera, materials |
| Multi-image input | Up to 14 source images |
| 4K output | High resolution for detail |

See: [Gemini Capabilities Research](../research/gemini_capabilities.md)

## Style Options

```typescript
enum ModelStyle {
  WIREFRAME = 'wireframe',       // Technical line drawing
  CLAY = 'clay',                 // Matte gray, no textures
  PHOTOREALISTIC = 'photorealistic',  // Full materials, lighting
  BLUEPRINT = 'blueprint',       // Blueprint aesthetic
  CYBERPUNK = 'cyberpunk'        // Stylized neon aesthetic
}

enum Camouflage {
  NAVY_GREY = 'Navy Grey',
  DAZZLE = 'Dazzle Camouflage',
  MEASURE_22 = 'Measure 22',
  HAZE_GREY = 'Haze Grey',
  IMPERIAL_NAVY = 'Imperial Japanese Navy Grey'
}
```

## Multi-View Generation

For comprehensive visualization:

```typescript
async function generateMultipleViews(
  input: RefinementInput
): Promise<Map<ViewAngle, string>> {
  const angles: ViewAngle[] = [
    'front',
    'side_port',
    'side_starboard',
    'stern',
    '3/4_bow_port',
    '3/4_stern_starboard',
    'top_down',
    'waterline'
  ];

  const views = new Map<ViewAngle, string>();

  // Generate in parallel for speed
  const results = await Promise.all(
    angles.map(angle =>
      generate3DView({ ...input, viewAngle: angle })
    )
  );

  angles.forEach((angle, i) => views.set(angle, results[i]));

  return views;
}
```

## Error Handling

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| Generation failed | API error | Retry with simpler prompt |
| Low quality output | User feedback | Regenerate with adjusted params |
| Doesn't match blueprint | Visual comparison | Request specific corrections |
| Inconsistent views | Compare generated angles | Use consistency mode |

## Future Enhancements

1. **WebGL Preview**: Real-time 3D viewer before AI refinement
2. **A/B Comparison**: Side-by-side blueprint vs. generated
3. **Selective Refinement**: Refine only specific parts (bow, superstructure)
4. **Style Transfer**: Apply historical photograph styles
5. **Animation**: Generate turnaround animations

## Integration with Existing Pipeline

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5
Ingestion   Grounding   Extraction  Lofting     Refinement
   │            │           │           │            │
   ▼            ▼           ▼           ▼            ▼
[Images]    [Metadata]   [Curves]    [Mesh]      [Output]
                                        │            │
                                        └────────────┘
                                          Feedback
                                         (Future)
```

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Gemini Capabilities](../research/gemini_capabilities.md) — Model research
- [North Star](../north_star.md) — Guiding principles
- [Phase 4: Lofting](./phase_4_lofting.md) — Previous phase
