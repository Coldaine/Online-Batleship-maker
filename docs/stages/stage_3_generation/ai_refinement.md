---
title: "Stage 3.4: AI Refinement"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 3
component: ai_refinement
status: Specification (Not Implemented)
---

# AI Refinement

## Purpose

Enhance the base 3D output using Gemini 3 Pro Image (Nano Banana Pro) to produce refined visualizations and geometric corrections.

## The Problem

After lofting, we have:
- A valid OBJ mesh based on extracted profiles
- An elliptical hull cross-section (approximation)
- Turrets and superstructure at approximate positions

What we don't have:
- Realistic hull curvature (true cross-section shape)
- Fine details (railings, masts, secondary weapons)
- Proper lighting and materials for visualization
- Validation that the mesh matches the original blueprints

AI refinement bridges this gap.

---

## Refinement Modes

### 1. Visualization Mode
Generate photorealistic renders of the ship from multiple angles.

### 2. Correction Mode
Analyze the generated mesh against original blueprints and suggest geometric adjustments.

---

## Interface Contract

```typescript
// Input
interface RefinementInput {
  baseMesh: string;              // OBJ from lofting
  blueprints: {
    topView: string;             // Base64 from Stage 0
    sideView: string;            // Base64 from Stage 0
  };
  grounding: GroundingOutput;    // From Stage 1
  mode: 'visualization' | 'correction';
}

// Visualization Output
interface VisualizationOutput {
  renders: {
    view: ViewAngle;
    image: string;               // Base64 PNG
    resolution: [number, number];
  }[];
  metadata: {
    model: string;
    promptTokens: number;
    generationTimeMs: number;
  };
}

type ViewAngle =
  | 'bow_quarter'                // 3/4 view from front
  | 'stern_quarter'              // 3/4 view from back
  | 'profile_port'               // Side view
  | 'profile_starboard'
  | 'plan'                       // Top-down
  | 'waterline';                 // Eye-level from water

// Correction Output
interface CorrectionOutput {
  corrections: GeometryCorrection[];
  confidence: number;
  reasoning: string;
}

interface GeometryCorrection {
  type: 'hull_shape' | 'bow_angle' | 'stern_shape' | 'component_position';
  description: string;
  parameter: string;
  currentValue: number;
  suggestedValue: number;
  magnitude: 'minor' | 'moderate' | 'significant';
}
```

---

## Visualization Prompt

```
You are visualizing a 3D warship model based on original blueprints.

SHIP IDENTIFICATION:
- Class: ${grounding.shipClass}
- Length: ${grounding.dimensions.length} meters
- Beam: ${grounding.dimensions.beam} meters
- Draft: ${grounding.dimensions.draft} meters

REFERENCE BLUEPRINTS:
[Image 1: Top view blueprint]
[Image 2: Side view blueprint]

TASK:
Generate a photorealistic 3D visualization of this warship from the following angle:
${viewAngle}

REQUIREMENTS:
1. PROPORTIONS: Hull length-to-beam ratio must match blueprint exactly
2. SILHOUETTE: Ship outline must match blueprint profile
3. FEATURES: Include visible turrets, superstructure, and major details
4. STYLE: Photorealistic rendering with:
   - Ocean water surface
   - Realistic lighting
   - Appropriate paint scheme for era
5. CAMERA: ${viewAngleDescription}

Do NOT add features not visible in the blueprints.
Do NOT change proportions to look more "dramatic".
Match the blueprint exactly, then add realistic rendering.
```

---

## Correction Prompt

```
You are a naval architecture expert comparing a 3D model to original blueprints.

SHIP: ${grounding.shipClass}
DIMENSIONS: ${length}m × ${beam}m × ${draft}m

REFERENCE BLUEPRINTS:
[Image 1: Top view - original blueprint]
[Image 2: Side view - original blueprint]

3D MODEL RENDERS:
[Image 3: 3D model - top view]
[Image 4: 3D model - side view]

TASK:
Compare the 3D model renders against the original blueprints.
Identify geometric discrepancies and suggest corrections.

OUTPUT FORMAT (JSON):
{
  "corrections": [
    {
      "type": "hull_shape" | "bow_angle" | "stern_shape" | "component_position",
      "description": "Clear description of what's wrong",
      "parameter": "Name of parameter to adjust",
      "currentValue": <number>,
      "suggestedValue": <number>,
      "magnitude": "minor" | "moderate" | "significant"
    }
  ],
  "confidence": 0.0-1.0,
  "reasoning": "Explanation of your analysis"
}

Only report discrepancies >5% error. Ignore minor rendering artifacts.
Focus on major proportional and positional errors.
```

---

## TDD Goals

### Test 1: Prompt Construction
```typescript
describe('prompt construction', () => {
  it('should include ship dimensions', () => {
    const prompt = buildVisualizationPrompt({
      grounding: {
        shipClass: 'Yamato-class battleship',
        dimensions: { length: 263, beam: 38.9, draft: 11 }
      },
      viewAngle: 'bow_quarter'
    });

    expect(prompt).toContain('263 meters');
    expect(prompt).toContain('38.9 meters');
    expect(prompt).toContain('Yamato-class');
  });

  it('should include all required sections', () => {
    const prompt = buildVisualizationPrompt(testInput);

    expect(prompt).toContain('SHIP IDENTIFICATION');
    expect(prompt).toContain('REFERENCE BLUEPRINTS');
    expect(prompt).toContain('REQUIREMENTS');
  });

  it('should sanitize user values', () => {
    const malicious = {
      ...testInput,
      grounding: {
        ...testInput.grounding,
        shipClass: 'Ship<script>alert("xss")</script>'
      }
    };

    const prompt = buildVisualizationPrompt(malicious);
    expect(prompt).not.toContain('<script>');
  });
});
```

### Test 2: Response Validation
```typescript
describe('response validation', () => {
  it('should accept valid visualization response', () => {
    const response = {
      renders: [{
        view: 'bow_quarter',
        image: 'data:image/png;base64,iVBORw0KGgo...',
        resolution: [1024, 768]
      }],
      metadata: {
        model: 'gemini-3-pro-image-preview',
        promptTokens: 1500,
        generationTimeMs: 3200
      }
    };

    expect(validateVisualizationResponse(response)).toEqual({
      valid: true,
      errors: []
    });
  });

  it('should reject invalid base64', () => {
    const response = {
      renders: [{
        view: 'bow_quarter',
        image: 'not-valid-base64!!!',
        resolution: [1024, 768]
      }]
    };

    const result = validateVisualizationResponse(response);
    expect(result.valid).toBe(false);
  });

  it('should accept valid correction response', () => {
    const response = {
      corrections: [{
        type: 'bow_angle',
        description: 'Bow too blunt',
        parameter: 'bowRakeAngle',
        currentValue: 30,
        suggestedValue: 45,
        magnitude: 'moderate'
      }],
      confidence: 0.85,
      reasoning: 'Bow angle appears steeper in blueprint'
    };

    expect(validateCorrectionResponse(response)).toEqual({
      valid: true,
      errors: []
    });
  });
});
```

### Test 3: API Integration
```typescript
describe('API integration', () => {
  beforeEach(() => {
    mockGeminiAPI();
  });

  it('should send images as inline data', async () => {
    await generateRefinement({
      blueprints: {
        topView: 'base64topdata...',
        sideView: 'base64sidedata...'
      },
      grounding: testGrounding,
      mode: 'visualization'
    });

    const lastCall = getLastAPICall();
    expect(lastCall.contents[0].parts).toContainEqual(
      expect.objectContaining({
        inlineData: expect.objectContaining({
          mimeType: 'image/png'
        })
      })
    );
  });

  it('should handle API timeout', async () => {
    mockGeminiTimeout(30000);

    await expect(generateRefinement(testInput))
      .rejects.toThrow('Refinement timeout');
  });

  it('should retry on transient errors', async () => {
    mockGeminiErrorThenSuccess({
      firstError: 'RESOURCE_EXHAUSTED',
      successResponse: mockResponse
    });

    const result = await generateRefinement(testInput);
    expect(result.renders.length).toBeGreaterThan(0);
    expect(getAPICallCount()).toBe(2);
  });
});
```

### Test 4: Correction Mapping
```typescript
describe('correction application', () => {
  it('should map corrections to lofting parameters', () => {
    const corrections: GeometryCorrection[] = [{
      type: 'hull_shape',
      description: 'Hull too round',
      parameter: 'hullShape',
      currentValue: 0,
      suggestedValue: 1,
      magnitude: 'moderate'
    }];

    const params = mapCorrectionsToParams(corrections, defaultParams);

    expect(params.config.hullShape).toBe('rounded_v');
  });

  it('should filter by magnitude threshold', () => {
    const corrections: GeometryCorrection[] = [
      { type: 'bow_angle', magnitude: 'minor', currentValue: 30, suggestedValue: 31 },
      { type: 'hull_shape', magnitude: 'significant', currentValue: 0, suggestedValue: 1 }
    ];

    const params = mapCorrectionsToParams(corrections, defaultParams, {
      minMagnitude: 'moderate'
    });

    // Only significant correction applied
    expect(params.bowAngle).toBe(30);  // Unchanged
    expect(params.config.hullShape).toBe('rounded_v');  // Changed
  });
});
```

### Test 5: Caching
```typescript
describe('caching', () => {
  it('should cache identical requests', async () => {
    const input = { ...testInput };

    await generateRefinement(input);
    await generateRefinement(input);

    expect(getAPICallCount()).toBe(1);
  });

  it('should invalidate on input change', async () => {
    await generateRefinement({
      ...testInput,
      grounding: { ...testInput.grounding, shipClass: 'Yamato' }
    });

    await generateRefinement({
      ...testInput,
      grounding: { ...testInput.grounding, shipClass: 'Iowa' }
    });

    expect(getAPICallCount()).toBe(2);
  });
});
```

---

## Nano Banana Pro Capabilities

Based on research, the model can:

| Capability | Application |
|------------|-------------|
| Blueprint → 3D visualization | Direct rendering |
| 3D spatial reasoning | Infer unseen angles |
| Physics-aware rendering | Realistic lighting/water |
| Multi-image consistency | Consistent views |
| 4K output | High-resolution renders |

---

## Cost Considerations

| Operation | Estimated Cost |
|-----------|---------------|
| Single view generation | ~$0.02-0.05 |
| Multi-view (4 angles) | ~$0.08-0.15 |
| Correction analysis | ~$0.03-0.07 |

Recommend: Show cost estimate to user before generating.

---

## Success Criteria

1. ✅ Generate photorealistic visualizations from 4+ angles
2. ✅ Maintain visual consistency with blueprints
3. ✅ Complete single-view generation in <15 seconds
4. ✅ Return structured correction suggestions
5. ✅ Validate all AI responses before returning
6. ✅ Cache results to avoid redundant API calls

---

## Related Documents

- [Stage 3 Overview](./README.md)
- [Gemini Capabilities](../../research/gemini_capabilities.md)
- [North Star](../../north_star.md)
