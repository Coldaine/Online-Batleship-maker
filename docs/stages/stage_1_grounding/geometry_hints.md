---
title: "Stage 1.3: Geometry Hints"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 1
component: geometry_hints
status: Specification (Not Implemented)
---

# Geometry Hints

## Purpose

Extract normalized position hints for key ship features (turrets, superstructure, funnels) from blueprint imagery to guide 3D mesh generation.

## The Problem

To generate accurate 3D models, we need to know:
- Where are the main turrets positioned along the ship?
- Where does the superstructure begin and end?
- Where are the funnels located?

These positions, expressed as normalized values (0 = bow, 1 = stern), provide essential guidance for the lofting phase.

---

## Interface Contract

```typescript
interface GeometryHintsInput {
  cropId: string;
  viewType: 'side_profile' | 'plan_view';
  imageData: string;              // Base64
  dimensions?: {                  // If already grounded
    length: number;
    beam: number;
  };
}

interface GeometryHintsOutput {
  turrets: TurretHint[];
  superstructure: SuperstructureHint;
  funnels: FunnelHint[];
  bridge: BridgeHint | null;
  confidence: number;
}

interface TurretHint {
  position: number;               // 0-1 along ship length
  type: 'main' | 'secondary';
  barrelCount?: number;           // 2, 3, 4
  facing: 'forward' | 'aft';
  confidence: number;
}

interface SuperstructureHint {
  start: number;                  // 0-1
  end: number;                    // 0-1
  height: 'low' | 'medium' | 'tall';
  type: 'pagoda' | 'tower' | 'block' | 'streamlined';
  confidence: number;
}

interface FunnelHint {
  position: number;               // 0-1
  type: 'upright' | 'raked' | 'capped';
  confidence: number;
}

interface BridgeHint {
  position: number;               // 0-1
  type: 'open' | 'enclosed';
  confidence: number;
}
```

---

## Extraction Approach

### LLM Vision Analysis

```typescript
async function extractGeometryHints(input: GeometryHintsInput): Promise<GeometryHintsOutput> {
  const model = getGeminiModel('gemini-2.5-flash');

  const response = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: GEOMETRY_HINTS_PROMPT },
        { inlineData: { mimeType: 'image/png', data: input.imageData } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEOMETRY_HINTS_SCHEMA
    }
  });

  return validateAndNormalize(parseResponse(response));
}
```

### Prompt Specification

```
You are analyzing a warship blueprint to extract geometric feature positions.

VIEW TYPE: ${viewType}

Examine this blueprint and identify the positions of key features.
Express all positions as normalized values from 0 (bow) to 1 (stern).

IDENTIFY:

1. MAIN TURRETS
   - Position along ship length (0-1)
   - Number of turrets visible
   - Approximate barrel count per turret
   - Facing direction (forward or aft)

2. SUPERSTRUCTURE
   - Start position (0-1)
   - End position (0-1)
   - Relative height (low/medium/tall)
   - Style (pagoda, tower, block, streamlined)

3. FUNNELS (if visible)
   - Position along ship length (0-1)
   - Type (upright, raked, capped)

4. BRIDGE (if distinguishable)
   - Position (0-1)
   - Type (open or enclosed)

OUTPUT FORMAT (JSON):
{
  "turrets": [
    { "position": 0.15, "type": "main", "barrelCount": 3, "facing": "forward", "confidence": 0.9 }
  ],
  "superstructure": {
    "start": 0.35,
    "end": 0.55,
    "height": "tall",
    "type": "pagoda",
    "confidence": 0.85
  },
  "funnels": [
    { "position": 0.42, "type": "raked", "confidence": 0.8 }
  ],
  "bridge": {
    "position": 0.4,
    "type": "enclosed",
    "confidence": 0.7
  },
  "confidence": 0.82
}

IMPORTANT:
- Positions must be in 0-1 range
- Bow is 0, stern is 1
- If a feature is not visible or unclear, omit it or mark low confidence
- Be conservative with confidence scores
```

---

## TDD Goals

### Test 1: Basic Extraction
```typescript
describe('geometryHints - basic', () => {
  it('should extract turret positions from side profile', async () => {
    const result = await extractGeometryHints({
      cropId: 'crop_001',
      viewType: 'side_profile',
      imageData: loadTestImage('battleship_side.png')
    });

    expect(result.turrets.length).toBeGreaterThan(0);
    expect(result.turrets.every(t => t.position >= 0 && t.position <= 1)).toBe(true);
  });

  it('should extract superstructure bounds', async () => {
    const result = await extractGeometryHints({
      cropId: 'crop_001',
      viewType: 'side_profile',
      imageData: loadTestImage('battleship_side.png')
    });

    expect(result.superstructure.start).toBeLessThan(result.superstructure.end);
    expect(result.superstructure.start).toBeGreaterThanOrEqual(0);
    expect(result.superstructure.end).toBeLessThanOrEqual(1);
  });
});
```

### Test 2: Position Validation
```typescript
describe('geometryHints - validation', () => {
  it('should reject positions outside 0-1 range', () => {
    const invalid = {
      turrets: [{ position: 1.2, type: 'main', facing: 'forward', confidence: 0.9 }],
      superstructure: { start: -0.1, end: 0.5, height: 'medium', type: 'tower', confidence: 0.8 },
      funnels: [],
      bridge: null,
      confidence: 0.8
    };

    const result = validateGeometryHints(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('turrets[0].position out of range');
  });

  it('should reject superstructure where start >= end', () => {
    const invalid = {
      turrets: [],
      superstructure: { start: 0.6, end: 0.4, height: 'medium', type: 'tower', confidence: 0.8 },
      funnels: [],
      bridge: null,
      confidence: 0.8
    };

    const result = validateGeometryHints(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('superstructure.start must be < end');
  });
});
```

### Test 3: Turret Ordering
```typescript
describe('geometryHints - turret ordering', () => {
  it('should return turrets sorted bow to stern', async () => {
    const result = await extractGeometryHints({
      cropId: 'crop_001',
      viewType: 'side_profile',
      imageData: loadTestImage('four_turret_ship.png')
    });

    for (let i = 1; i < result.turrets.length; i++) {
      expect(result.turrets[i].position).toBeGreaterThanOrEqual(
        result.turrets[i-1].position
      );
    }
  });

  it('should identify forward and aft facing turrets', async () => {
    const result = await extractGeometryHints({
      cropId: 'crop_001',
      viewType: 'side_profile',
      imageData: loadTestImage('yamato_side.png')
    });

    const forward = result.turrets.filter(t => t.facing === 'forward');
    const aft = result.turrets.filter(t => t.facing === 'aft');

    // Forward turrets should be in first half
    expect(forward.every(t => t.position < 0.5)).toBe(true);
    // Aft turret(s) should be in second half
    expect(aft.every(t => t.position > 0.5)).toBe(true);
  });
});
```

### Test 4: Confidence Scoring
```typescript
describe('geometryHints - confidence', () => {
  it('should have lower confidence for ambiguous features', async () => {
    const clearResult = await extractGeometryHints({
      viewType: 'side_profile',
      imageData: loadTestImage('clean_blueprint.png')
    });

    const ambiguousResult = await extractGeometryHints({
      viewType: 'side_profile',
      imageData: loadTestImage('low_quality_scan.png')
    });

    expect(clearResult.confidence).toBeGreaterThan(ambiguousResult.confidence);
  });

  it('should mark features as low confidence when unclear', async () => {
    const result = await extractGeometryHints({
      viewType: 'side_profile',
      imageData: loadTestImage('obscured_features.png')
    });

    // At least some features should have low confidence
    const lowConfFeatures = [
      ...result.turrets.filter(t => t.confidence < 0.7),
      result.superstructure.confidence < 0.7 ? result.superstructure : null,
      ...result.funnels.filter(f => f.confidence < 0.7)
    ].filter(Boolean);

    expect(lowConfFeatures.length).toBeGreaterThan(0);
  });
});
```

### Test 5: Multi-View Combination
```typescript
describe('geometryHints - multi-view', () => {
  it('should combine hints from side and plan views', async () => {
    const sideHints = await extractGeometryHints({
      viewType: 'side_profile',
      imageData: loadTestImage('ship_side.png')
    });

    const planHints = await extractGeometryHints({
      viewType: 'plan_view',
      imageData: loadTestImage('ship_plan.png')
    });

    const combined = combineGeometryHints(sideHints, planHints);

    // Combined should have higher confidence where views agree
    expect(combined.confidence).toBeGreaterThanOrEqual(
      Math.max(sideHints.confidence, planHints.confidence)
    );

    // Turret count should match or be averaged
    expect(combined.turrets.length).toBeGreaterThanOrEqual(
      Math.min(sideHints.turrets.length, planHints.turrets.length)
    );
  });

  it('should flag inconsistencies between views', async () => {
    const sideHints = await extractGeometryHints({
      viewType: 'side_profile',
      imageData: loadTestImage('ship_side_3turrets.png')
    });

    const planHints = await extractGeometryHints({
      viewType: 'plan_view',
      imageData: loadTestImage('ship_plan_4turrets.png')  // Mismatch!
    });

    const combined = combineGeometryHints(sideHints, planHints);

    expect(combined.warnings).toContain('Turret count mismatch between views');
    expect(combined.confidence).toBeLessThan(
      Math.min(sideHints.confidence, planHints.confidence)
    );
  });
});
```

---

## Normalization Rules

1. **Position Range:** All positions clamped to [0, 1]
2. **Turret Ordering:** Sorted by position (bow to stern)
3. **Superstructure Bounds:** Ensure start < end
4. **Funnel Ordering:** Sorted by position
5. **Confidence Range:** Clamped to [0, 1]

---

## Success Criteria

1. ✅ Extract turret positions within ±10% of actual
2. ✅ Correctly identify superstructure bounds
3. ✅ Handle various ship types (battleship, cruiser, destroyer)
4. ✅ Provide meaningful confidence scores
5. ✅ Combine multiple views for better accuracy
6. ✅ Complete extraction in <3 seconds per image

---

## Related Documents

- [Stage 1 Overview](./README.md)
- [Semantic Grounding](./semantic_grounding.md)
- [Stage 3: Lofting](../stage_3_generation/lofting.md) — Consumes this output
