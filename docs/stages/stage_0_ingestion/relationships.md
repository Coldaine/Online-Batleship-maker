---
title: "Stage 0.5: Relationship Mapping"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 0
component: relationships
status: Specification (Not Implemented)
---

# Relationship Mapping

## Purpose

Establish and track relationships between assets: crops from the same source, different views of the same ship, enhanced versions of base images, artist attribution, and more.

## The Problem

Assets don't exist in isolation:
- 4 crops came from 1 source image (siblings)
- A colored render is an enhanced version of a B&W drawing
- 50 different images all show the Yamato class
- This artist (TZoli) created 200 designs in our library

Without relationships:
- Can't find "all views of this ship"
- Can't track provenance ("where did this crop come from?")
- Can't identify duplicates
- Can't attribute work to creators

---

## Relationship Types

### Structural Relationships

```typescript
// Automatic - created during ingestion
type StructuralRelationship =
  | 'crop_of'           // Crop → Ingestion (crop was made from this source)
  | 'sibling_crop';     // Crop → Crop (both from same source)
```

### Content Relationships

```typescript
// Detected by LLM or rules
type ContentRelationship =
  | 'enhanced_version'      // Colored version of B&W, higher res, etc.
  | 'same_ship_class'       // Different images of same ship class
  | 'same_ship_instance'    // Same specific ship (e.g., both are SMS Emden)
  | 'same_artist'           // Same designer/artist
  | 'same_source'           // From same book, website, archive
  | 'variant_design'        // Alternative design of same concept
  | 'predecessor'           // Earlier design that led to this one
  | 'successor';            // Later design based on this one
```

### Quality Relationships

```typescript
// For deduplication and version control
type QualityRelationship =
  | 'duplicate'         // Identical or near-identical (needs review)
  | 'supersedes'        // Newer/better version replaces older
  | 'superseded_by';    // Older version replaced by newer
```

---

## Interface Contract

```typescript
interface Relationship {
  id: string;
  fromType: 'crop' | 'ingestion';
  fromId: string;
  toType: 'crop' | 'ingestion';
  toId: string;
  relationship: RelationshipType;
  confidence: number;           // 0-1 for LLM-detected relationships
  metadata: Record<string, unknown>;
  createdAt: Date;
  createdBy: 'system' | 'llm' | 'human';
}

interface RelationshipQuery {
  assetType: 'crop' | 'ingestion';
  assetId: string;
  relationshipTypes?: RelationshipType[];
  direction?: 'from' | 'to' | 'both';
  minConfidence?: number;
}

interface RelationshipResult {
  relationships: Relationship[];
  relatedAssets: Map<string, Crop | Ingestion>;
}
```

---

## Automatic Relationship Detection

### During Ingestion (Structural)

```typescript
async function createStructuralRelationships(
  ingestionId: string,
  cropIds: string[]
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  // Each crop is 'crop_of' the ingestion
  for (const cropId of cropIds) {
    relationships.push({
      fromType: 'crop',
      fromId: cropId,
      toType: 'ingestion',
      toId: ingestionId,
      relationship: 'crop_of',
      confidence: 1.0,
      createdBy: 'system'
    });
  }

  // Crops are siblings of each other
  for (let i = 0; i < cropIds.length; i++) {
    for (let j = i + 1; j < cropIds.length; j++) {
      relationships.push({
        fromType: 'crop',
        fromId: cropIds[i],
        toType: 'crop',
        toId: cropIds[j],
        relationship: 'sibling_crop',
        confidence: 1.0,
        createdBy: 'system'
      });
    }
  }

  return relationships;
}
```

### During Tagging (Content)

```typescript
async function detectContentRelationships(
  cropId: string,
  analysis: VisionAnalysisOutput
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];
  const { shipClass, designer } = analysis.identification;

  if (shipClass) {
    // Find other crops of same ship class
    const sameClass = await db.crops.findByShipClass(shipClass);
    for (const other of sameClass) {
      if (other.id !== cropId) {
        relationships.push({
          fromType: 'crop',
          fromId: cropId,
          toType: 'crop',
          toId: other.id,
          relationship: 'same_ship_class',
          confidence: 0.9,
          metadata: { shipClass },
          createdBy: 'system'
        });
      }
    }
  }

  if (designer) {
    // Find other crops by same artist
    const sameArtist = await db.crops.findByDesigner(designer);
    for (const other of sameArtist) {
      if (other.id !== cropId) {
        relationships.push({
          fromType: 'crop',
          fromId: cropId,
          toType: 'crop',
          toId: other.id,
          relationship: 'same_artist',
          confidence: 0.85,
          metadata: { designer },
          createdBy: 'system'
        });
      }
    }
  }

  return relationships;
}
```

### Enhanced Version Detection

```typescript
async function detectEnhancedVersions(
  ingestionId: string,
  crops: CropWithAnalysis[]
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];

  // Group crops by view type
  const byViewType = groupBy(crops, c => c.viewType);

  for (const [viewType, viewCrops] of Object.entries(byViewType)) {
    if (viewCrops.length < 2) continue;

    // Separate B&W and colored
    const bw = viewCrops.filter(c => c.style === 'line_drawing_bw');
    const colored = viewCrops.filter(c =>
      c.style === 'line_drawing_color' ||
      c.style === 'filled_color' ||
      c.style === 'shaded'
    );

    // Each colored version might be enhanced version of B&W
    for (const coloredCrop of colored) {
      for (const bwCrop of bw) {
        // Use LLM to confirm they're the same view
        const isSame = await llmConfirmSameView(bwCrop, coloredCrop);
        if (isSame.confidence > 0.7) {
          relationships.push({
            fromType: 'crop',
            fromId: coloredCrop.id,
            toType: 'crop',
            toId: bwCrop.id,
            relationship: 'enhanced_version',
            confidence: isSame.confidence,
            metadata: { enhancementType: 'colorization' },
            createdBy: 'llm'
          });
        }
      }
    }
  }

  return relationships;
}
```

### Duplicate Detection

```typescript
async function detectDuplicates(cropId: string): Promise<Relationship[]> {
  const crop = await db.crops.findById(cropId);
  const relationships: Relationship[] = [];

  // 1. Exact hash match (identical files)
  const exactMatches = await db.crops.findByHash(crop.fileHash);
  for (const match of exactMatches) {
    if (match.id !== cropId) {
      relationships.push({
        fromType: 'crop',
        fromId: cropId,
        toType: 'crop',
        toId: match.id,
        relationship: 'duplicate',
        confidence: 1.0,
        metadata: { matchType: 'exact_hash' },
        createdBy: 'system'
      });
    }
  }

  // 2. Perceptual hash similarity (visually similar)
  const pHash = await computePerceptualHash(crop.filePath);
  const similarHashes = await db.crops.findSimilarHash(pHash, { threshold: 0.95 });
  for (const match of similarHashes) {
    if (match.id !== cropId && !exactMatches.find(e => e.id === match.id)) {
      relationships.push({
        fromType: 'crop',
        fromId: cropId,
        toType: 'crop',
        toId: match.id,
        relationship: 'duplicate',
        confidence: match.similarity,
        metadata: { matchType: 'perceptual_hash', similarity: match.similarity },
        createdBy: 'system'
      });
    }
  }

  return relationships;
}
```

---

## TDD Goals

### Test 1: Structural Relationships
```typescript
describe('relationships - structural', () => {
  it('should create crop_of relationships', async () => {
    const ing = await createIngestion();
    const crops = await createCrops(ing.id, 4);

    const rels = await db.relationships.findByAsset('ingestion', ing.id);
    const cropOfRels = rels.filter(r => r.relationship === 'crop_of');

    expect(cropOfRels.length).toBe(4);
    expect(cropOfRels.every(r => r.toId === ing.id)).toBe(true);
  });

  it('should create sibling relationships', async () => {
    const ing = await createIngestion();
    const crops = await createCrops(ing.id, 4);

    const rels = await db.relationships.findByAsset('crop', crops[0].id);
    const siblingRels = rels.filter(r => r.relationship === 'sibling_crop');

    expect(siblingRels.length).toBe(3);  // 3 siblings
  });
});
```

### Test 2: Content Relationships
```typescript
describe('relationships - content', () => {
  it('should link crops of same ship class', async () => {
    // Create two crops with same ship class
    const crop1 = await createCrop({ shipClass: 'Yamato' });
    const crop2 = await createCrop({ shipClass: 'Yamato' });

    await detectContentRelationships(crop1.id);

    const rels = await db.relationships.findBetween(crop1.id, crop2.id);
    expect(rels.some(r => r.relationship === 'same_ship_class')).toBe(true);
  });

  it('should link crops by same artist', async () => {
    const crop1 = await createCrop({ designer: 'TZoli' });
    const crop2 = await createCrop({ designer: 'TZoli' });

    await detectContentRelationships(crop1.id);

    const rels = await db.relationships.findBetween(crop1.id, crop2.id);
    expect(rels.some(r => r.relationship === 'same_artist')).toBe(true);
  });
});
```

### Test 3: Enhanced Version Detection
```typescript
describe('relationships - enhanced versions', () => {
  it('should detect colored version of B&W', async () => {
    const ing = await createIngestion();

    // Same view, different styles
    const bwCrop = await createCrop({
      ingestionId: ing.id,
      viewType: 'side_profile',
      style: 'line_drawing_bw'
    });
    const colorCrop = await createCrop({
      ingestionId: ing.id,
      viewType: 'side_profile',
      style: 'filled_color'
    });

    await detectEnhancedVersions(ing.id, [bwCrop, colorCrop]);

    const rels = await db.relationships.findBetween(colorCrop.id, bwCrop.id);
    expect(rels.some(r => r.relationship === 'enhanced_version')).toBe(true);
  });
});
```

### Test 4: Duplicate Detection
```typescript
describe('relationships - duplicates', () => {
  it('should detect exact duplicates by hash', async () => {
    const crop1 = await createCrop({ fileHash: 'sha256:identical' });
    const crop2 = await createCrop({ fileHash: 'sha256:identical' });

    await detectDuplicates(crop1.id);

    const rels = await db.relationships.findBetween(crop1.id, crop2.id);
    expect(rels.some(r =>
      r.relationship === 'duplicate' &&
      r.metadata.matchType === 'exact_hash'
    )).toBe(true);
  });

  it('should detect near-duplicates by perceptual hash', async () => {
    // Create two visually similar but not identical images
    const crop1 = await createCrop({ /* slightly different */ });
    const crop2 = await createCrop({ /* slightly different */ });

    await detectDuplicates(crop1.id);

    const rels = await db.relationships.findBetween(crop1.id, crop2.id);
    const dupRel = rels.find(r => r.relationship === 'duplicate');

    expect(dupRel).toBeDefined();
    expect(dupRel.confidence).toBeLessThan(1.0);
    expect(dupRel.metadata.matchType).toBe('perceptual_hash');
  });
});
```

### Test 5: Relationship Queries
```typescript
describe('relationships - queries', () => {
  it('should find all related assets', async () => {
    const crop = await createCropWithRelationships();

    const result = await db.relationships.findRelated({
      assetType: 'crop',
      assetId: crop.id,
      direction: 'both'
    });

    expect(result.relationships.length).toBeGreaterThan(0);
    expect(result.relatedAssets.size).toBeGreaterThan(0);
  });

  it('should filter by relationship type', async () => {
    const crop = await createCropWithRelationships();

    const result = await db.relationships.findRelated({
      assetType: 'crop',
      assetId: crop.id,
      relationshipTypes: ['same_ship_class']
    });

    expect(result.relationships.every(r =>
      r.relationship === 'same_ship_class'
    )).toBe(true);
  });

  it('should filter by confidence', async () => {
    const result = await db.relationships.findRelated({
      assetType: 'crop',
      assetId: 'crop_001',
      minConfidence: 0.9
    });

    expect(result.relationships.every(r => r.confidence >= 0.9)).toBe(true);
  });
});
```

---

## Relationship Graph Visualization

For debugging and exploration, relationships form a graph:

```
                    ┌─────────────────┐
                    │   Ingestion     │
                    │   (source.png)  │
                    └────────┬────────┘
                             │ crop_of
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │ Crop 1  │◄───────►│ Crop 2  │◄───────►│ Crop 3  │
    │ (B&W)   │ sibling │(colored)│ sibling │ (B&W)   │
    └────┬────┘         └────┬────┘         └─────────┘
         │                   │
         │ enhanced_version  │
         └───────────────────┘
                │
                │ same_ship_class
                ▼
         ┌─────────────┐
         │ Other crops │
         │ of Yamato   │
         └─────────────┘
```

---

## Success Criteria

1. ✅ All structural relationships created automatically
2. ✅ Same-class relationships detected with 90%+ accuracy
3. ✅ Duplicate detection catches 95%+ of exact duplicates
4. ✅ Perceptual hash similarity works across resolutions
5. ✅ Relationship queries execute in <50ms
6. ✅ Graph can be traversed to find all related assets

---

## Related Documents

- [Stage 0 Overview](./README.md)
- [Database Schema](./database_schema.md) — Storage for relationships
- [Tagging Taxonomy](./tagging_taxonomy.md) — Tags can inform relationships
