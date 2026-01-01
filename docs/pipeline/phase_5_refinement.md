---
title: "Phase 5: AI Refinement — Specification"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 5
type: AI-Assisted
status: Specification (Not Implemented)
---

# Phase 5: AI Refinement

## Purpose

Enhance the base 3D output using Gemini 3 Pro Image (Nano Banana Pro) to produce refined visualizations and, optionally, geometric corrections. This is where AI spatial reasoning fills the gaps that pure geometry cannot.

## The Problem

After Phase 4, we have:
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

## Interface Contract

```typescript
// Input
interface RefinementInput {
  baseMesh: string;              // OBJ from Phase 4
  blueprints: {
    topView: string;             // Base64 from Phase 1
    sideView: string;            // Base64 from Phase 1
  };
  grounding: GroundingOutput;    // From Phase 2
  mode: RefinementMode;
}

type RefinementMode =
  | 'visualization'              // Generate pretty images
  | 'correction';                // Suggest geometry changes

// Output for visualization mode
interface VisualizationOutput {
  renders: {
    view: ViewAngle;
    image: string;               // Base64 PNG
    resolution: [number, number];
  }[];
  metadata: {
    model: string;               // 'gemini-3-pro-image-preview'
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

// Output for correction mode
interface CorrectionOutput {
  corrections: GeometryCorrection[];
  confidence: number;            // 0-1
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

## Pain Points & Challenges

### 1. AI Output Validation
**Problem:** How do we know the AI-generated visualization is accurate, not just pretty?

**Approaches:**
- **Blueprint overlay**: Show original blueprint alongside generated view
- **Silhouette comparison**: Extract silhouette from generated image, compare to blueprint
- **Human review**: Always show to user for validation
- **Multi-view consistency**: Generate multiple views, check they're consistent

**Decision:** For v1, always show blueprint + generated side-by-side. Trust user judgment.

### 2. Prompt Engineering
**Problem:** How to get consistent, accurate output from AI?

**Approaches:**
- **Detailed system prompt**: Describe exactly what we want
- **Reference images**: Include blueprint as strong reference
- **Structured output**: Use JSON schema for corrections
- **Few-shot examples**: Show examples of good outputs

**Recommendation:** Use detailed prompts with explicit constraints. Include dimensions.

### 3. Geometric Correction Loop
**Problem:** How to turn AI suggestions into actual mesh changes?

**Approach for v1:** Return corrections as structured data. Do NOT auto-apply. Let user review and apply.

**Future:** Feed corrections back to Phase 4 and regenerate mesh.

### 4. Consistency Across Views
**Problem:** Multiple views of the same ship should be consistent.

**Approaches:**
- **Single prompt, multiple outputs**: One API call, request multiple views
- **Reference consistency**: Include previously generated view in new prompt
- **Seed locking**: Use same random seed (if supported)

**Decision:** Generate views in single prompt if possible. Otherwise, include reference.

### 5. Cost and Latency
**Problem:** AI generation is slow and expensive.

**Mitigations:**
- Cache results (same input → cached output)
- Start with single view, generate more on demand
- Show progress indicator
- Allow user to skip refinement

---

## Prompt Specifications

### Visualization Prompt

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
3. FEATURES: Include visible turrets, superstructure, and major details from blueprint
4. STYLE: Photorealistic rendering with:
   - Ocean water surface
   - Realistic lighting (${timeOfDay} conditions)
   - ${camouflage} paint scheme
5. CAMERA: ${viewAngleDescription}

Do NOT add features not visible in the blueprints.
Do NOT change proportions to look more "dramatic".
Match the blueprint exactly, then add realistic rendering.
```

### Correction Prompt

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
**Goal:** Prompts are correctly constructed from input data.

```typescript
describe('prompt construction', () => {
  it('should include ship dimensions in visualization prompt', () => {
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
    expect(prompt).toContain('bow_quarter');
  });

  it('should include all required sections', () => {
    const prompt = buildVisualizationPrompt(testInput);

    expect(prompt).toContain('SHIP IDENTIFICATION');
    expect(prompt).toContain('REFERENCE BLUEPRINTS');
    expect(prompt).toContain('REQUIREMENTS');
  });

  it('should sanitize user-provided values', () => {
    const maliciousInput = {
      ...testInput,
      grounding: {
        ...testInput.grounding,
        shipClass: 'Ship<script>alert("xss")</script>'
      }
    };

    const prompt = buildVisualizationPrompt(maliciousInput);
    expect(prompt).not.toContain('<script>');
  });
});
```

**Pass Criteria:** Prompts are correctly formatted and sanitized.

---

### Test 2: Response Validation
**Goal:** AI responses are validated before use.

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

  it('should reject response with invalid base64', () => {
    const response = {
      renders: [{
        view: 'bow_quarter',
        image: 'not-valid-base64!!!',
        resolution: [1024, 768]
      }]
    };

    const result = validateVisualizationResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid base64 image data');
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
      reasoning: 'Bow angle appears steeper in blueprint than in model'
    };

    expect(validateCorrectionResponse(response)).toEqual({
      valid: true,
      errors: []
    });
  });

  it('should reject corrections with out-of-range confidence', () => {
    const response = {
      corrections: [],
      confidence: 1.5,  // Invalid: > 1.0
      reasoning: 'Test'
    };

    const result = validateCorrectionResponse(response);
    expect(result.valid).toBe(false);
  });
});
```

**Pass Criteria:** Validation catches invalid responses.

---

### Test 3: API Integration (Mocked)
**Goal:** API calls are correctly structured and errors handled.

```typescript
describe('API integration', () => {
  beforeEach(() => {
    mockGeminiAPI();
  });

  it('should send images as inline data', async () => {
    const input = {
      blueprints: {
        topView: 'base64topdata...',
        sideView: 'base64sidedata...'
      },
      grounding: testGrounding,
      mode: 'visualization' as const
    };

    await generateRefinement(input);

    const lastCall = getLastAPICall();
    expect(lastCall.contents[0].parts).toContainEqual(
      expect.objectContaining({
        inlineData: expect.objectContaining({
          mimeType: 'image/png'
        })
      })
    );
  });

  it('should handle API timeout gracefully', async () => {
    mockGeminiTimeout(30000);

    await expect(generateRefinement(testInput))
      .rejects.toThrow('Refinement timeout');
  });

  it('should retry on transient errors', async () => {
    mockGeminiErrorThenSuccess({
      firstError: 'RESOURCE_EXHAUSTED',
      successResponse: mockSuccessResponse
    });

    const result = await generateRefinement(testInput);
    expect(result.renders.length).toBeGreaterThan(0);
    expect(getAPICallCount()).toBe(2);  // One retry
  });

  it('should not retry on permanent errors', async () => {
    mockGeminiError('INVALID_ARGUMENT');

    await expect(generateRefinement(testInput))
      .rejects.toThrow('Invalid argument');
    expect(getAPICallCount()).toBe(1);  // No retry
  });
});
```

**Pass Criteria:** API integration handles success and failure cases.

---

### Test 4: Correction Application
**Goal:** Corrections can be applied to regenerate mesh.

```typescript
describe('correction application', () => {
  it('should map corrections to Phase 4 parameters', () => {
    const corrections: GeometryCorrection[] = [{
      type: 'hull_shape',
      description: 'Hull too round',
      parameter: 'hullShape',
      currentValue: 0,  // ellipse
      suggestedValue: 1,  // rounded_v
      magnitude: 'moderate'
    }];

    const params = mapCorrectionsToParams(corrections, defaultParams);

    expect(params.config.hullShape).toBe('rounded_v');
  });

  it('should only apply corrections above threshold', () => {
    const corrections: GeometryCorrection[] = [
      { type: 'bow_angle', magnitude: 'minor', currentValue: 30, suggestedValue: 31, ... },
      { type: 'hull_shape', magnitude: 'significant', currentValue: 0, suggestedValue: 1, ... }
    ];

    const params = mapCorrectionsToParams(corrections, defaultParams, {
      minMagnitude: 'moderate'
    });

    // Only significant correction should be applied
    expect(params.bowAngle).toBe(30);  // Unchanged
    expect(params.config.hullShape).toBe('rounded_v');  // Changed
  });

  it('should preserve unmentioned parameters', () => {
    const corrections: GeometryCorrection[] = [{
      type: 'bow_angle',
      parameter: 'bowAngle',
      currentValue: 30,
      suggestedValue: 45,
      magnitude: 'moderate'
    }];

    const originalParams = {
      bowAngle: 30,
      sternAngle: 20,
      hullShape: 'ellipse'
    };

    const params = mapCorrectionsToParams(corrections, originalParams);

    expect(params.sternAngle).toBe(20);  // Preserved
    expect(params.hullShape).toBe('ellipse');  // Preserved
    expect(params.bowAngle).toBe(45);  // Updated
  });
});
```

**Pass Criteria:** Corrections correctly map to mesh generation parameters.

---

### Test 5: View Consistency
**Goal:** Multiple views are geometrically consistent.

```typescript
describe('view consistency', () => {
  it('should generate multiple views in single request when possible', async () => {
    const result = await generateRefinement({
      ...testInput,
      viewAngles: ['bow_quarter', 'stern_quarter', 'profile_port']
    });

    expect(result.renders.length).toBe(3);
    expect(getAPICallCount()).toBe(1);  // Single call for all views
  });

  it('should include reference image for sequential generation', async () => {
    // When views must be generated separately
    mockGeminiSingleViewMode();

    await generateRefinement({
      ...testInput,
      viewAngles: ['bow_quarter', 'stern_quarter']
    });

    const secondCall = getAPICall(1);
    // Second call should include first generated image as reference
    expect(secondCall.contents[0].parts).toContainEqual(
      expect.objectContaining({
        text: expect.stringContaining('reference')
      })
    );
  });
});
```

**Pass Criteria:** Multiple views maintain visual consistency.

---

### Test 6: Caching
**Goal:** Identical requests return cached results.

```typescript
describe('caching', () => {
  it('should cache and return identical results for same input', async () => {
    const input = { ...testInput };

    const result1 = await generateRefinement(input);
    const result2 = await generateRefinement(input);

    expect(result1).toEqual(result2);
    expect(getAPICallCount()).toBe(1);  // Only first call hits API
  });

  it('should invalidate cache when input changes', async () => {
    const result1 = await generateRefinement({
      ...testInput,
      grounding: { ...testInput.grounding, shipClass: 'Yamato' }
    });

    const result2 = await generateRefinement({
      ...testInput,
      grounding: { ...testInput.grounding, shipClass: 'Iowa' }
    });

    expect(getAPICallCount()).toBe(2);  // Both hit API
  });

  it('should respect cache TTL', async () => {
    jest.useFakeTimers();

    await generateRefinement(testInput);
    jest.advanceTimersByTime(60 * 60 * 1000);  // 1 hour
    await generateRefinement(testInput);

    expect(getAPICallCount()).toBe(2);  // Cache expired

    jest.useRealTimers();
  });
});
```

**Pass Criteria:** Caching reduces redundant API calls.

---

## Success Criteria

A correct implementation of Phase 5 will:

1. ✅ Generate photorealistic visualizations from 4+ camera angles
2. ✅ Maintain visual consistency with original blueprints
3. ✅ Complete single-view generation in <15 seconds
4. ✅ Return structured correction suggestions (when in correction mode)
5. ✅ Validate all AI responses before returning
6. ✅ Cache results to avoid redundant API calls
7. ✅ Handle API errors gracefully with retry logic

---

## Nano Banana Pro Capabilities (Reference)

Based on research, the model can:

| Capability | Relevance |
|------------|-----------|
| Blueprint → 3D visualization | Direct application |
| 3D spatial reasoning | Infer unseen angles |
| Physics-aware rendering | Realistic lighting/water |
| Multi-image consistency | Generate consistent views |
| 4K output | High-resolution renders |

See: [Gemini Capabilities Research](../research/gemini_capabilities.md)

---

## What's NOT In Scope (v1)

- Auto-applying corrections to mesh
- Real-time preview (too slow/expensive)
- Style transfer (historical photos, paintings)
- Animation generation
- Multi-ship scenes

---

## Cost Considerations

| Operation | Estimated Cost |
|-----------|---------------|
| Single view generation | ~$0.02-0.05 |
| Multi-view (4 angles) | ~$0.08-0.15 |
| Correction analysis | ~$0.03-0.07 |

Recommend: Show cost estimate to user before generating.

---

## Dependencies

- Google Gemini API (`gemini-3-pro-image-preview`)
- Network connectivity required
- API key with sufficient quota

---

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Gemini Capabilities](../research/gemini_capabilities.md) — Model research
- [Phase 4: Lofting](./phase_4_lofting.md) — Previous phase
- [North Star](../north_star.md) — Guiding principles
