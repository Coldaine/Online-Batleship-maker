---
title: "Stage 1.1: Semantic Grounding"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 1
component: semantic_grounding
status: Specification (Not Implemented)
---

# Semantic Grounding

## Purpose

Identify the ship class from blueprint imagery and retrieve authoritative real-world dimensions using AI vision and Google Search grounding.

## The Problem

We have tagged crops with ship class names, but we don't know:
- Is the identification correct? (Validation)
- How big is it actually? (Real dimensions)
- Where are the key features? (Turrets, superstructure positions)

Without this information, we can only generate arbitrary geometry. With grounding, we can create properly scaled, recognizable ships.

---

## Interface Contract

```typescript
// Input
interface GroundingInput {
  cropId: string;             // From Stage 0
  views: CropView[];          // Multiple views if available
  existingTags: TagAssignment[];
  userHints?: {
    shipClass?: string;       // User can override if known
    era?: string;             // e.g., "WW2", "Modern"
    nation?: string;          // e.g., "Japan", "USA"
  };
}

interface CropView {
  cropId: string;
  viewType: ViewType;         // side_profile, plan_view, etc.
  imageData: string;          // Base64
}

// Output
interface GroundingOutput {
  identification: {
    shipClass: string;        // e.g., "Yamato-class battleship"
    confidence: number;       // 0.0 - 1.0
    alternates: string[];     // Other possible matches
    verified: boolean;        // True if from reference DB
  };
  dimensions: {
    length: number;           // meters
    beam: number;             // meters
    draft: number;            // meters
    displacement?: number;    // tonnes (if available)
    source: 'reference_db' | 'google_search' | 'ai_estimate' | 'user_provided';
  };
  geometryHints: {
    turretPositions: NormalizedPosition[];  // 0-1 along ship length
    superstructure: {
      start: number;          // 0-1
      end: number;            // 0-1
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
**Problem:** What if the Stage 0 tag is wrong?

**Mitigations:**
- Return confidence score + alternatives
- Cross-reference multiple views of same class
- Allow user to correct identification
- Validate against reference database

**Recommendation:** Confidence < 0.7 should prompt review or show alternatives.

### 2. Search Grounding Reliability
**Problem:** What if Google Search returns wrong dimensions?

**Mitigations:**
- Cross-reference multiple sources
- Validate dimensions are physically plausible (length > beam > draft)
- Prefer reference database over search
- Show source to user for verification

**Recommendation:** Validate dimensions pass sanity checks. Flag suspiciously round numbers.

### 3. Unknown/Fictional Ships
**Problem:** What about never-built designs or fictional ships?

**Handling:**
- Return `identification.confidence = 0`
- Provide AI-estimated dimensions based on visual analysis
- Mark `dimensions.source = 'ai_estimate'`
- Allow user to input custom dimensions

**Recommendation:** Pipeline should still work with estimated dimensions.

### 4. Geometry Hint Accuracy
**Problem:** How accurately can AI determine turret positions?

**Reality check:** This is approximate. Turret positions are hints, not measurements.

**Recommendation:** Use normalized positions (0-1). Accept ±10% error. Allow adjustment.

---

## API Design

### Gemini Integration

```typescript
async function groundShipFromCrop(input: GroundingInput): Promise<GroundingOutput> {
  // First check reference database
  const cached = await referenceDb.findByClass(input.existingTags);
  if (cached && cached.confidence > 0.9) {
    return formatCachedResult(cached, input);
  }

  // Otherwise use LLM with search grounding
  const model = getGeminiModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }]
  });

  const images = input.views.map(v => ({
    inlineData: { mimeType: 'image/png', data: v.imageData }
  }));

  const response = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: GROUNDING_PROMPT },
        ...images
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GROUNDING_SCHEMA
    }
  });

  const result = validateAndParse(response);

  // Cache for future use
  await referenceDb.save(result);

  return result;
}
```

### Prompt Specification

```
You are a naval architecture expert analyzing warship blueprints.

Given the blueprint views, perform these tasks:

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
```typescript
describe('validateGroundingResponse', () => {
  it('should accept valid complete response', () => {
    const response = {
      identification: {
        shipClass: 'Yamato-class battleship',
        confidence: 0.95,
        alternates: ['Musashi', 'Shinano'],
        verified: false
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

### Test 2: Dimension Plausibility Checks
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

  it('should warn on suspiciously round numbers', () => {
    const result = validateDimensions({ length: 300, beam: 40, draft: 10 });
    expect(result.warnings).toContain('Dimensions are suspiciously round');
  });
});
```

### Test 3: Reference Database Integration
```typescript
describe('referenceDb integration', () => {
  it('should use cached data when available', async () => {
    await referenceDb.save({
      shipClass: 'Iowa-class',
      dimensions: { length: 270, beam: 33, draft: 11 },
      confidence: 0.98
    });

    const result = await groundShipFromCrop({
      views: [testView],
      existingTags: [{ tagId: 'ship-class/iowa' }]
    });

    expect(result.identification.verified).toBe(true);
    expect(result.dimensions.source).toBe('reference_db');
  });

  it('should fall back to search when not cached', async () => {
    mockGeminiResponse(validGroundingResponse);

    const result = await groundShipFromCrop({
      views: [testView],
      existingTags: [{ tagId: 'ship-class/unknown-class' }]
    });

    expect(result.dimensions.source).toBe('google_search');
  });
});
```

### Test 4: Normalized Position Validation
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
      turretPositions: [0.15, 1.2, -0.1],
      superstructure: { start: 0.35, end: 0.55 }
    });
    expect(result.valid).toBe(false);
  });

  it('should sort turret positions bow to stern', () => {
    const normalized = normalizeGeometryHints({
      turretPositions: [0.75, 0.15, 0.25],
      superstructure: { start: 0.35, end: 0.55 }
    });
    expect(normalized.turretPositions).toEqual([0.15, 0.25, 0.75]);
  });
});
```

### Test 5: Fallback for Unknown Ships
```typescript
describe('handleUnknownShip', () => {
  it('should return estimated dimensions for unidentified ships', async () => {
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

    const result = await groundShipFromCrop(testInput);

    expect(result.identification.confidence).toBeLessThan(0.5);
    expect(result.dimensions.source).toBe('ai_estimate');
  });

  it('should use user-provided dimensions when available', async () => {
    const result = await groundShipFromCrop({
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

---

## Success Criteria

1. ✅ Identify major WW2 capital ships with >80% accuracy
2. ✅ Return grounded dimensions within 5% of actual specs
3. ✅ Complete grounding in <10 seconds (including search)
4. ✅ Gracefully handle unknown ships with AI estimates
5. ✅ Cache verified results for instant future lookups
6. ✅ Validate all responses before returning

---

## Error Handling

| Error | Recovery |
|-------|----------|
| API rate limit | Exponential backoff, max 3 retries |
| Invalid JSON response | Parse with fallback extraction |
| Search grounding fails | Fall back to AI-only estimation |
| All methods fail | Return error, prompt user for manual input |

---

## Related Documents

- [Stage 1 Overview](./README.md)
- [Reference Database](./reference_database.md)
- [Geometry Hints](./geometry_hints.md)
