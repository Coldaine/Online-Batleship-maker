---
title: "Phase 2: Semantic Grounding"
date: 2026-01-01
author: Claude (Opus 4.5)
phase: 2
type: AI-Assisted (Probabilistic)
status: Implemented
---

# Phase 2: Semantic Grounding

## Purpose

Identify the ship class from blueprint imagery and retrieve authoritative real-world specifications via Google Search grounding.

## Component

**File:** `src/services/geminiService.ts`
**Function:** `analyzeBlueprint()`

## Interface

```typescript
// Input
interface GroundingInput {
  imageBase64: string;           // Blueprint image (top or side view)
}

// Output
interface AnalysisData {
  shipClass: string;             // e.g., "Yamato-class battleship"
  estimatedLength: string;       // e.g., "263 meters"
  armament: string[];            // e.g., ["9 × 46cm guns", "12 × 15.5cm guns"]
  designYear: string;            // e.g., "1937"
  description: string;           // Brief historical context

  // From Google Search grounding
  realDimensions?: {
    length: number;              // meters
    beam: number;                // meters
    draft: number;               // meters
  };

  // Geometric hints for Phase 4
  geometry?: {
    turrets: number[];           // Normalized positions [0-1] along length
    superstructure: {
      start: number;             // Normalized start position
      end: number;               // Normalized end position
    };
  };
}
```

## Process Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Blueprint Image (base64)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     GEMINI 2.5 FLASH                         │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  System Prompt:                                             │
│  "You are a naval architecture expert analyzing ship        │
│   blueprints. Identify the vessel and extract geometric     │
│   information."                                             │
│                                                             │
│  Tools Enabled:                                             │
│  • Google Search (for real-world ship specifications)       │
│                                                             │
│  Output Schema:                                             │
│  • Structured JSON matching AnalysisData interface          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     AnalysisData JSON                        │
└─────────────────────────────────────────────────────────────┘
```

## Implementation

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeBlueprint(imageBase64: string): Promise<AnalysisData> {
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }]  // Enable grounding
  });

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: ANALYSIS_PROMPT },
        { inlineData: { mimeType: 'image/png', data: imageBase64 } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA
    }
  });

  return JSON.parse(result.response.text());
}
```

## Prompt Engineering

### Analysis Prompt

```
Analyze this naval blueprint image and identify the warship.

1. IDENTIFICATION
   - Determine the ship class (e.g., "Iowa-class battleship")
   - Note the design era and nation of origin

2. DIMENSIONS (use Google Search for accuracy)
   - Overall length in meters
   - Beam (width) in meters
   - Draft (depth below waterline) in meters

3. ARMAMENT
   - List main battery configuration
   - Note secondary armaments

4. GEOMETRY EXTRACTION
   - Estimate turret positions as normalized values (0 = bow, 1 = stern)
   - Estimate superstructure bounds (start and end positions)

Return structured JSON matching the provided schema.
```

### Output Schema

```typescript
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    shipClass: { type: 'string' },
    estimatedLength: { type: 'string' },
    armament: { type: 'array', items: { type: 'string' } },
    designYear: { type: 'string' },
    description: { type: 'string' },
    realDimensions: {
      type: 'object',
      properties: {
        length: { type: 'number' },
        beam: { type: 'number' },
        draft: { type: 'number' }
      }
    },
    geometry: {
      type: 'object',
      properties: {
        turrets: { type: 'array', items: { type: 'number' } },
        superstructure: {
          type: 'object',
          properties: {
            start: { type: 'number' },
            end: { type: 'number' }
          }
        }
      }
    }
  },
  required: ['shipClass', 'estimatedLength', 'armament']
};
```

## Google Search Grounding

When enabled, Gemini can query Google Search to find authoritative ship specifications:

**Example Query Flow:**
1. AI recognizes "Yamato-class battleship" from blueprint
2. AI searches: "Yamato battleship dimensions specifications"
3. Results include naval history sites, Wikipedia, Jane's Fighting Ships
4. AI extracts: Length 263m, Beam 38.9m, Draft 11m
5. Values returned in `realDimensions` field

**Grounding Indicator:**
The API response includes grounding metadata showing which claims were verified via search.

## Geometry Extraction

### Turret Position Detection

The AI analyzes the blueprint visually to estimate turret positions:

```
Bow                                                     Stern
 │                                                        │
 ▼                                                        ▼
 0.0 ─────────────────────────────────────────────────── 1.0
      ▲           ▲                       ▲           ▲
      │           │                       │           │
   Turret A    Turret B               Turret X    Turret Y
    (0.15)      (0.25)                 (0.70)      (0.85)
```

### Superstructure Bounds

```
     ┌─────────────────────────────────────┐
     │         SUPERSTRUCTURE              │
     │           (bridge, mast, funnels)   │
     └─────────────────────────────────────┘
           ▲                           ▲
           │                           │
        start: 0.35                 end: 0.55
```

## Error Handling

| Error Case | Handling |
|------------|----------|
| Unrecognized ship | Return generic "Unknown warship" with estimated dimensions |
| No search results | Use AI's training knowledge (may be less accurate) |
| Malformed JSON | Retry with stricter schema enforcement |
| API rate limit | Exponential backoff, user notification |

## Validation

```typescript
function validateAnalysis(data: AnalysisData): boolean {
  // Required fields present
  if (!data.shipClass || !data.estimatedLength) return false;

  // Geometry in valid range
  if (data.geometry) {
    const { turrets, superstructure } = data.geometry;
    if (turrets.some(t => t < 0 || t > 1)) return false;
    if (superstructure.start >= superstructure.end) return false;
  }

  // Dimensions are positive
  if (data.realDimensions) {
    const { length, beam, draft } = data.realDimensions;
    if (length <= 0 || beam <= 0 || draft <= 0) return false;
  }

  return true;
}
```

## Testing

**File:** `src/services/geminiService.test.ts`

Tests cover:
- JSON parsing from various response formats
- Markdown code block stripping
- Schema validation
- Mock API responses

## Future Enhancements

1. **Multi-image analysis**: Send both top and side views together
2. **Confidence scores**: Return certainty levels for each field
3. **Alternative matches**: Suggest similar ship classes if uncertain
4. **Historical context**: Link to reference images and documentation

## Related Documents

- [Architecture](../architecture.md) — System overview
- [Gemini Capabilities](../research/gemini_capabilities.md) — Model research
- [Phase 1: Ingestion](./phase_1_ingestion.md) — Previous phase
- [Phase 3: Extraction](./phase_3_extraction.md) — Next phase
