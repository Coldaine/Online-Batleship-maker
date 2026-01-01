---
title: "Stage 0.3: Tagging Taxonomy"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 0
component: tagging_taxonomy
status: Specification (Not Implemented)
---

# Tagging Taxonomy

## Purpose

Maintain a hierarchical tag taxonomy and assign tags to ingested assets. LLM proposes tags, system matches to canonical names, new tags are created when needed.

## The Problem

Without consistent tagging:
- You can't find assets later ("show me all German cruiser plan views")
- Different names for the same thing ("Deutschland" vs "German" vs "germany")
- No hierarchy (can't query "all European ships")
- Tag explosion (thousands of one-off tags)

We need a controlled vocabulary that's:
- Hierarchical (nation/germany is under nation/)
- Canonical (one correct name per concept)
- Extensible (new tags can be added)
- LLM-friendly (AI can propose and match tags)

---

## Taxonomy Structure

```
tags/
├── nation/
│   ├── germany/
│   │   ├── imperial          # Pre-WW1
│   │   ├── weimar            # Interwar
│   │   ├── kriegsmarine      # WW2
│   │   └── bundesmarine      # Post-WW2
│   ├── usa/
│   │   ├── usn               # US Navy
│   │   └── uscg              # Coast Guard
│   ├── uk/
│   │   └── royal-navy
│   ├── japan/
│   │   ├── imperial          # Pre-1945
│   │   └── jmsdf             # Post-1945
│   └── [other nations...]
│
├── ship-type/
│   ├── capital/
│   │   ├── battleship
│   │   ├── battlecruiser
│   │   └── aircraft-carrier
│   ├── cruiser/
│   │   ├── heavy-cruiser
│   │   ├── light-cruiser
│   │   └── armored-cruiser
│   ├── destroyer/
│   │   ├── fleet-destroyer
│   │   └── escort-destroyer
│   ├── submarine/
│   │   ├── attack-sub
│   │   └── fleet-sub
│   └── auxiliary/
│       ├── supply
│       └── tender
│
├── view-type/
│   ├── side-profile
│   ├── plan-view
│   ├── bow-view
│   ├── stern-view
│   ├── cross-section
│   └── detail
│
├── style/
│   ├── line-drawing/
│   │   ├── monochrome
│   │   └── colored
│   ├── filled/
│   │   ├── flat-color
│   │   └── shaded
│   ├── photograph
│   └── painting
│
├── quality/
│   ├── silhouette/
│   │   ├── clean
│   │   ├── moderate
│   │   └── noisy
│   ├── resolution/
│   │   ├── high
│   │   ├── medium
│   │   └── low
│   └── extraction-ready    # Suitable for Stage 2
│
├── content/
│   ├── annotations/
│   │   ├── none
│   │   ├── light
│   │   └── heavy
│   ├── has-scale-bar
│   ├── has-waterline
│   └── has-dimensions
│
├── era/
│   ├── pre-dreadnought     # Before 1906
│   ├── dreadnought         # 1906-1920s
│   ├── interwar            # 1920s-1939
│   ├── ww2                 # 1939-1945
│   ├── cold-war            # 1945-1991
│   └── modern              # 1991+
│
└── meta/
    ├── historical          # Real ship
    ├── hypothetical        # Never-built design
    ├── fictional           # Fantasy/game
    ├── reconstruction      # Based on limited data
    └── needs-review        # Flagged for human review
```

---

## Interface Contract

```typescript
interface Tag {
  id: string;                  // e.g., "nation/germany/weimar"
  slug: string;                // e.g., "weimar"
  displayName: string;         // e.g., "Weimar Republic"
  parentId: string | null;     // e.g., "nation/germany"
  aliases: string[];           // e.g., ["weimar republic", "weimarer republik"]
  description?: string;
  createdAt: string;
  createdBy: 'system' | 'llm' | 'human';
  needsReview: boolean;
}

interface TagAssignment {
  assetId: string;             // Crop or ingestion ID
  tagId: string;
  confidence: number;          // 0-1, how confident LLM was
  assignedAt: string;
  assignedBy: 'llm' | 'human';
}

interface TagProposal {
  proposedText: string;        // What LLM suggested
  matchedTagId: string | null; // Existing tag if found
  newTagSuggestion?: {
    parentId: string;
    slug: string;
    displayName: string;
  };
  confidence: number;
}

interface TaggingInput {
  assetId: string;
  llmAnalysis: VisionAnalysisOutput;
  existingTags?: string[];     // Tags already assigned
}

interface TaggingOutput {
  assignedTags: TagAssignment[];
  proposedNewTags: TagProposal[];
  confidence: number;
}
```

---

## Tag Matching Algorithm

```typescript
async function matchTag(proposedText: string): Promise<TagProposal> {
  const normalized = normalizeTagText(proposedText);

  // 1. Exact match on slug
  let match = await tagDb.findBySlug(normalized);
  if (match) {
    return { proposedText, matchedTagId: match.id, confidence: 1.0 };
  }

  // 2. Alias match
  match = await tagDb.findByAlias(normalized);
  if (match) {
    return { proposedText, matchedTagId: match.id, confidence: 0.95 };
  }

  // 3. Fuzzy match (Levenshtein distance)
  const fuzzyMatches = await tagDb.fuzzySearch(normalized, { maxDistance: 2 });
  if (fuzzyMatches.length > 0) {
    return {
      proposedText,
      matchedTagId: fuzzyMatches[0].id,
      confidence: 0.8
    };
  }

  // 4. LLM semantic match
  const semanticMatch = await llmFindSimilarTag(proposedText);
  if (semanticMatch) {
    return {
      proposedText,
      matchedTagId: semanticMatch.id,
      confidence: semanticMatch.confidence
    };
  }

  // 5. No match - suggest new tag
  const suggestedParent = await llmSuggestParentCategory(proposedText);
  return {
    proposedText,
    matchedTagId: null,
    newTagSuggestion: {
      parentId: suggestedParent,
      slug: normalized,
      displayName: proposedText
    },
    confidence: 0.5
  };
}

function normalizeTagText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

---

## TDD Goals

### Test 1: Exact Tag Matching
```typescript
describe('tagging - exact match', () => {
  beforeEach(async () => {
    await seedTaxonomy();  // Load standard tags
  });

  it('should match exact slug', async () => {
    const result = await matchTag('battleship');

    expect(result.matchedTagId).toBe('ship-type/capital/battleship');
    expect(result.confidence).toBe(1.0);
  });

  it('should match via alias', async () => {
    const result = await matchTag('BB');  // Common alias for battleship

    expect(result.matchedTagId).toBe('ship-type/capital/battleship');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('should normalize input before matching', async () => {
    const result = await matchTag('Battle Ship');  // Spaces
    expect(result.matchedTagId).toBe('ship-type/capital/battleship');

    const result2 = await matchTag('BATTLESHIP');  // Caps
    expect(result2.matchedTagId).toBe('ship-type/capital/battleship');
  });
});
```

### Test 2: Fuzzy Matching
```typescript
describe('tagging - fuzzy match', () => {
  it('should match with minor typos', async () => {
    const result = await matchTag('battlship');  // Missing 'e'

    expect(result.matchedTagId).toBe('ship-type/capital/battleship');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.confidence).toBeLessThan(1.0);
  });

  it('should match German spelling variants', async () => {
    const result = await matchTag('schlachtschiff');  // German for battleship

    expect(result.matchedTagId).toBe('ship-type/capital/battleship');
  });
});
```

### Test 3: New Tag Proposals
```typescript
describe('tagging - new tags', () => {
  it('should propose new tag when no match found', async () => {
    const result = await matchTag('hydrofoil-cruiser');  // Not in taxonomy

    expect(result.matchedTagId).toBeNull();
    expect(result.newTagSuggestion).toBeDefined();
    expect(result.newTagSuggestion.parentId).toBe('ship-type/cruiser');
  });

  it('should flag new tags for review', async () => {
    const result = await matchTag('unknown-type');

    if (result.newTagSuggestion) {
      const created = await createTag(result.newTagSuggestion);
      expect(created.needsReview).toBe(true);
    }
  });
});
```

### Test 4: Hierarchical Queries
```typescript
describe('tagging - hierarchy', () => {
  it('should find all children of a parent tag', async () => {
    const children = await tagDb.getChildren('nation/germany');

    expect(children.map(c => c.slug)).toContain('weimar');
    expect(children.map(c => c.slug)).toContain('kriegsmarine');
  });

  it('should find assets by parent tag (includes children)', async () => {
    // Tag an asset with specific tag
    await assignTag('asset_001', 'nation/germany/weimar');

    // Query by parent should find it
    const assets = await findAssetsByTag('nation/germany', { includeChildren: true });

    expect(assets).toContain('asset_001');
  });
});
```

### Test 5: Bulk Tagging from LLM Analysis
```typescript
describe('tagging - bulk from analysis', () => {
  it('should assign multiple tags from vision analysis', async () => {
    const analysis: VisionAnalysisOutput = {
      identification: {
        shipClass: 'Yamato',
        nation: 'Japan',
        era: 'WW2',
        shipType: 'battleship',
        isHistorical: true
      },
      views: [{ viewType: 'side_profile', style: 'filled_color', ... }],
      quality: { silhouetteClarity: 'clean', ... }
    };

    const result = await assignTagsFromAnalysis('asset_001', analysis);

    const tagIds = result.assignedTags.map(t => t.tagId);
    expect(tagIds).toContain('nation/japan/imperial');
    expect(tagIds).toContain('ship-type/capital/battleship');
    expect(tagIds).toContain('era/ww2');
    expect(tagIds).toContain('view-type/side-profile');
    expect(tagIds).toContain('style/filled/flat-color');
    expect(tagIds).toContain('quality/silhouette/clean');
    expect(tagIds).toContain('meta/historical');
  });
});
```

---

## LLM Prompts for Tag Operations

### Find Semantic Match
```
Given these existing tags in our taxonomy:
${JSON.stringify(relevantTags)}

The user wants to tag something as: "${proposedText}"

Which existing tag best matches this concept? If none match well, say "NO_MATCH".

Respond with JSON: { "matchedTagId": "path/to/tag" | null, "confidence": 0.0-1.0, "reasoning": "..." }
```

### Suggest Parent Category
```
Our taxonomy has these top-level categories:
- nation/ (countries and their naval services)
- ship-type/ (battleship, cruiser, destroyer, etc.)
- view-type/ (side profile, plan view, etc.)
- style/ (line drawing, photograph, etc.)
- quality/ (resolution, clarity)
- content/ (annotations, scale bars)
- era/ (time periods)
- meta/ (historical, fictional, etc.)

Where should the tag "${proposedText}" be placed?

Respond with the parent path (e.g., "ship-type/cruiser") or "unknown" if unclear.
```

---

## Success Criteria

1. ✅ Match known tags with 98%+ accuracy
2. ✅ Handle common typos and aliases
3. ✅ Propose sensible parent categories for new tags
4. ✅ Support hierarchical queries (find by parent)
5. ✅ Process 1000 tag assignments in <5 seconds
6. ✅ Flag uncertain assignments for optional review

---

## Related Documents

- [Stage 0 Overview](./README.md)
- [Vision Analysis](./vision_analysis.md) — Provides raw tags
- [Database Schema](./database_schema.md) — Tag storage
