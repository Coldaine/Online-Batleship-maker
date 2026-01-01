---
title: "Phase 2: Semantic Grounding — Specification"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 2
type: AI-Assisted
status: Specification (Not Implemented)
---

# Phase 2: Semantic Grounding

## Purpose

Identify the ship class from blueprint imagery and retrieve authoritative real-world dimensions using AI vision and Google Search grounding.

## The Problem

We have blueprint images, but we don't know:
- What ship is this? (Class identification)
- How big is it actually? (Real dimensions)
- Where are the key features? (Turrets, superstructure positions)

Without this information, we can only generate arbitrary geometry. With grounding, we can create properly scaled, recognizable ships.

---

## Interface Contract

```typescript
// Input
interface GroundingInput {
  topView: string;          // Base64 from Phase 1
  sideView: string;         // Base64 from Phase 1
  userHints?: {
    shipClass?: string;     // User can provide if known
    era?: string;           // e.g., "WW2", "Modern"
    nation?: string;        // e.g., "Japan", "USA"
  };
}

// Output
interface GroundingOutput {
  identification: {
    shipClass: string;      // e.g., "Yamato-class battleship"
    confidence: number;     // 0.0 - 1.0
    alternates: string[];   // Other possible matches
  };
  dimensions: {
    length: number;         // meters
    beam: number;           // meters
    draft: number;          // meters
    displacement?: number;  // tonnes (if available)
    source: 'google_search' | 'ai_estimate' | 'user_provided';
  };
  geometryHints: {
    turretPositions: NormalizedPosition[];  // 0-1 along ship length
    superstructure: {
      start: number;        // 0-1
      end: number;          // 0-1
    };
    funnelPositions?: NormalizedPosition[];
  };
  metadata: {
    designYear?: string;
    nation?: string;
    historicalNotes?: string;
    searchQueriesUsed?: string[];
  };
}

type NormalizedPosition = number;  // 0.0 = bow, 1.0 = stern
```

---

## Pain Points & Challenges

### 1. Ship Identification Accuracy
**Problem:** What if the AI misidentifies the ship?

**Mitigations:**
- Return confidence score + alternatives
- Allow user to correct identification
- Use multiple image views for better accuracy
- Validate against known ship classes database

**Recommendation:** Always show alternatives and allow override. Confidence < 0.7 should prompt user confirmation.

### 2. Search Grounding Reliability
**Problem:** What if Google Search returns wrong dimensions?

**Mitigations:**
- Cross-reference multiple sources
- Validate dimensions are physically plausible (e.g., length > beam > draft)
- Fallback to AI estimation if search fails
- Show source to user for verification

**Recommendation:** Validate dimensions pass sanity checks. Flag suspiciously round numbers or outliers.

### 3. Unknown/Fictional Ships
**Problem:** What if the blueprint is for a fictional or unidentified ship?

**Handling:**
- Return `identification.confidence = 0`
- Provide AI-estimated dimensions based on visual analysis
- Mark `dimensions.source = 'ai_estimate'`
- Allow user to input custom dimensions

**Recommendation:** Graceful degradation. The pipeline should still work with estimated dimensions.

### 4. Geometry Hint Accuracy
**Problem:** How accurately can AI determine turret positions from blueprints?

**Reality check:** This is approximate. Turret positions from AI are hints, not measurements.

**Recommendation:** Use normalized positions (0-1) for flexibility. Accept ±10% error. Allow user adjustment.

---

## API Design

### Gemini Integration

```typescript
async function groundShipBlueprint(input: GroundingInput): Promise<GroundingOutput> {
  const model = getGeminiModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }]  // Enable grounding
  });

  const response = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: GROUNDING_PROMPT },
        { inlineData: { mimeType: 'image/png', data: input.topView } },
        { inlineData: { mimeType: 'image/png', data: input.sideView } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GROUNDING_SCHEMA
    }
  });

  return validateAndParse(response);
}
```

### Prompt Specification

```
You are a naval architecture expert analyzing warship blueprints.

Given the top view and side view blueprints, perform these tasks:

1. IDENTIFICATION
   - Identify the ship class (e.g., "Iowa-class battleship")
   - Provide confidence (0-1) in your identification
   - List 2-3 alternative matches if uncertain

2. DIMENSIONS (Use Google Search for accuracy)
   - Search for official specifications of the identified ship class
   - Return length, beam (width), and draft (depth below waterline) in meters
   - Note the source of your dimensions

3. GEOMETRY ANALYSIS
   - Estimate turret positions as normalized values (0 = bow, 1 = stern)
   - Estimate superstructure bounds (start and end positions)
   - Note any funnel positions if visible

4. VALIDATION
   - Verify dimensions are physically plausible
   - Length should be >> beam >> draft
   - Cross-reference with historical records if possible

Return your analysis as structured JSON.
```

---

## TDD Goals

### Test 1: Response Schema Validation
**Goal:** Verify that AI responses conform to expected schema.

```typescript
describe('validateGroundingResponse', () => {
  it('should accept valid complete response', () => {
    const response = {
      identification: {
        shipClass: 'Yamato-class battleship',
        confidence: 0.95,
        alternates: ['Musashi', 'Shinano']
      },
      dimensions: {
        length: 263,
        beam: 38.9,
        draft: 11,
        source: 'google_search'
      },
      geometryHints: {
        turretPositions: [0.15, 0.25, 0.75],
        superstructure: { start: 0.35, end: 0.55 }
      }
    };

    expect(validateGroundingResponse(response)).toEqual({
      valid: true,
      errors: []
    });
  });

  it('should reject response with missing required fields', () => {
    const response = {
      identification: { shipClass: 'Unknown' }
      // missing dimensions and geometryHints
    };

    const result = validateGroundingResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('dimensions is required');
  });

  it('should reject physically implausible dimensions', () => {
    const response = {
      identification: { shipClass: 'Test Ship', confidence: 0.5, alternates: [] },
      dimensions: {
        length: 50,    // shorter than beam - impossible
        beam: 100,
        draft: 200,
        source: 'ai_estimate'
      },
      geometryHints: { turretPositions: [], superstructure: { start: 0.3, end: 0.6 } }
    };

    const result = validateGroundingResponse(response);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('length must be greater than beam');
  });
});
```

**Pass Criteria:** Validation correctly identifies valid vs invalid responses.

---

### Test 2: Dimension Plausibility Checks
**Goal:** Verify dimension sanity checking logic.

```typescript
describe('validateDimensions', () => {
  it('should accept typical battleship dimensions', () => {
    expect(validateDimensions({
      length: 263,  // Yamato
      beam: 38.9,
      draft: 11
    })).toEqual({ valid: true, warnings: [] });
  });

  it('should accept typical destroyer dimensions', () => {
    expect(validateDimensions({
      length: 119,  // Fletcher-class
      beam: 12,
      draft: 4.2
    })).toEqual({ valid: true, warnings: [] });
  });

  it('should reject if length < beam', () => {
    const result = validateDimensions({ length: 30, beam: 50, draft: 10 });
    expect(result.valid).toBe(false);
  });

  it('should reject if beam < draft', () => {
    const result = validateDimensions({ length: 100, beam: 10, draft: 15 });
    expect(result.valid).toBe(false);
  });

  it('should warn on suspiciously round numbers', () => {
    const result = validateDimensions({ length: 300, beam: 40, draft: 10 });
    expect(result.warnings).toContain('Dimensions are suspiciously round');
  });
});
```

**Pass Criteria:** Validation logic catches impossible dimensions.

---

### Test 3: Normalized Position Validation
**Goal:** Verify geometry hints are in valid range.

```typescript
describe('validateGeometryHints', () => {
  it('should accept positions in 0-1 range', () => {
    const result = validateGeometryHints({
      turretPositions: [0.15, 0.25, 0.75, 0.85],
      superstructure: { start: 0.35, end: 0.55 }
    });
    expect(result.valid).toBe(true);
  });

  it('should reject positions outside 0-1 range', () => {
    const result = validateGeometryHints({
      turretPositions: [0.15, 1.2, -0.1],  // 1.2 and -0.1 are invalid
      superstructure: { start: 0.35, end: 0.55 }
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('turretPositions[1] must be between 0 and 1');
  });

  it('should reject superstructure where start >= end', () => {
    const result = validateGeometryHints({
      turretPositions: [0.2, 0.8],
      superstructure: { start: 0.6, end: 0.4 }  // Invalid: start > end
    });
    expect(result.valid).toBe(false);
  });

  it('should sort turret positions bow to stern', () => {
    const normalized = normalizeGeometryHints({
      turretPositions: [0.75, 0.15, 0.25],  // Out of order
      superstructure: { start: 0.35, end: 0.55 }
    });
    expect(normalized.turretPositions).toEqual([0.15, 0.25, 0.75]);
  });
});
```

**Pass Criteria:** Geometry hints are validated and normalized correctly.

---

### Test 4: Fallback Behavior
**Goal:** Verify graceful degradation when identification fails.

```typescript
describe('handleUnknownShip', () => {
  it('should return estimated dimensions for unidentified ships', async () => {
    // Mock AI response for unknown ship
    mockGeminiResponse({
      identification: {
        shipClass: 'Unknown warship',
        confidence: 0.2,
        alternates: []
      },
      dimensions: {
        length: 150,
        beam: 20,
        draft: 6,
        source: 'ai_estimate'
      },
      geometryHints: {
        turretPositions: [0.2, 0.8],
        superstructure: { start: 0.4, end: 0.6 }
      }
    });

    const result = await groundShipBlueprint(testInput);

    expect(result.identification.confidence).toBeLessThan(0.5);
    expect(result.dimensions.source).toBe('ai_estimate');
  });

  it('should use user-provided dimensions when available', async () => {
    const result = await groundShipBlueprint({
      ...testInput,
      userHints: {
        dimensions: { length: 200, beam: 25, draft: 8 }
      }
    });

    expect(result.dimensions.length).toBe(200);
    expect(result.dimensions.source).toBe('user_provided');
  });
});
```

**Pass Criteria:** Pipeline works even when ship is not identified.

---

### Test 5: Integration with Real API (Mocked)
**Goal:** Verify end-to-end flow with mocked Gemini response.

```typescript
describe('groundShipBlueprint integration', () => {
  beforeEach(() => {
    mockGeminiAPI();
  });

  it('should process Yamato blueprint correctly', async () => {
    const input = {
      topView: loadTestImage('yamato_top.png'),
      sideView: loadTestImage('yamato_side.png')
    };

    const result = await groundShipBlueprint(input);

    expect(result.identification.shipClass).toContain('Yamato');
    expect(result.dimensions.length).toBeCloseTo(263, 0);
    expect(result.dimensions.beam).toBeCloseTo(39, 0);
    expect(result.geometryHints.turretPositions.length).toBe(3);
  });

  it('should handle API timeout gracefully', async () => {
    mockGeminiTimeout(5000);

    await expect(groundShipBlueprint(testInput)).rejects.toThrow('Grounding timeout');
  });

  it('should retry on transient errors', async () => {
    mockGeminiErrorThenSuccess();

    const result = await groundShipBlueprint(testInput);
    expect(result.identification.shipClass).toBeDefined();
  });
});
```

**Pass Criteria:** Integration handles both success and error cases.

---

## Success Criteria

A correct implementation of Phase 2 will:

1. ✅ Identify major WW2 capital ships with >80% accuracy
2. ✅ Return grounded dimensions within 5% of actual specs for known ships
3. ✅ Complete grounding in <10 seconds (including search)
4. ✅ Gracefully handle unknown ships with AI estimates
5. ✅ Validate all responses before returning
6. ✅ Allow user override of identification and dimensions
7. ✅ Log search queries for debugging

---

## Error Handling

| Error | Recovery |
|-------|----------|
| API rate limit | Exponential backoff, max 3 retries |
| Invalid JSON response | Parse with fallback extraction, log error |
| Search grounding fails | Fall back to AI-only estimation |
| All methods fail | Return error, prompt user for manual input |

---

## What's NOT In Scope (v1)

- Multi-ship identification (focus on single ship per blueprint)
- Submarine identification (surface ships only)
- Modern ship classes (focus on historical vessels with available data)
- Non-warship identification (merchant ships, civilian vessels)

---

## Dependencies

- Google Gemini API (gemini-2.5-flash with tools)
- Google Search grounding (for dimension lookup)
- Network connectivity required

---

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Gemini Capabilities](../research/gemini_capabilities.md) — Model research
- [Phase 1: Ingestion](./phase_1_ingestion.md) — Previous phase
- [Phase 3: Extraction](./phase_3_extraction.md) — Next phase
