---
title: "Stage 0.4: Database Schema"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 0
component: database_schema
status: Specification (Not Implemented)
---

# Database Schema

## Purpose

Define the data model for storing ingested assets, crops, tags, and relationships. The database is the source of truth for the entire asset library.

## The Problem

We need to store:
- Original ingested images with full provenance
- Individual crops derived from originals
- Tags and tag assignments
- Relationships between assets
- LLM analysis results for debugging
- Processing history and status

And query it efficiently:
- Find all German battleship side profiles
- Find all crops from a specific source image
- Find assets that need human review
- Find assets ready for Stage 2 processing

---

## Schema Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ingestions    │────<│     crops       │────<│ tag_assignments │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ llm_analyses    │     │  relationships  │     │      tags       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Table Definitions

### ingestions

Tracks each original image ingested into the system.

```sql
CREATE TABLE ingestions (
  id              TEXT PRIMARY KEY,           -- e.g., "ing_20260101_abc123"
  original_path   TEXT NOT NULL,              -- Original file location
  archive_path    TEXT,                       -- Where we archived it
  file_hash       TEXT NOT NULL,              -- SHA-256 for deduplication
  file_size       INTEGER NOT NULL,           -- Bytes
  mime_type       TEXT NOT NULL,              -- e.g., "image/png"
  dimensions      JSON NOT NULL,              -- { width, height }

  source_type     TEXT NOT NULL,              -- "upload", "scan", "web", "api"
  source_url      TEXT,                       -- If from web
  source_meta     JSON,                       -- Additional source info

  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, processed, failed, archived
  error_message   TEXT,

  ingested_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at    TIMESTAMP,
  reviewed_by     TEXT,                       -- Human reviewer ID if reviewed
  reviewed_at     TIMESTAMP,

  UNIQUE(file_hash)                           -- Prevent duplicate ingestion
);

CREATE INDEX idx_ingestions_status ON ingestions(status);
CREATE INDEX idx_ingestions_hash ON ingestions(file_hash);
```

### crops

Individual view crops derived from ingested images.

```sql
CREATE TABLE crops (
  id              TEXT PRIMARY KEY,           -- e.g., "crop_abc123_001"
  ingestion_id    TEXT NOT NULL REFERENCES ingestions(id),

  file_path       TEXT NOT NULL,              -- Where crop is saved
  filename        TEXT NOT NULL,
  file_hash       TEXT NOT NULL,
  file_size       INTEGER NOT NULL,
  dimensions      JSON NOT NULL,              -- { width, height }

  -- Crop bounds within source image
  bounds          JSON NOT NULL,              -- { x, y, width, height }
  source_view_idx INTEGER NOT NULL,           -- Which view in source (0-indexed)

  -- View metadata
  view_type       TEXT,                       -- side_profile, plan_view, etc.
  style           TEXT,                       -- line_drawing_bw, filled_color, etc.
  orientation     TEXT,                       -- bow_left, bow_right, etc.

  -- Ship identification (may be null if unknown)
  ship_class      TEXT,
  ship_name       TEXT,
  nation          TEXT,
  era             TEXT,
  is_historical   BOOLEAN,

  -- Quality assessment
  quality         JSON,                       -- { silhouetteClarity, annotationDensity, ... }
  suitable_for_extraction BOOLEAN DEFAULT FALSE,

  -- Processing status
  status          TEXT NOT NULL DEFAULT 'created',  -- created, tagged, processed, failed
  extraction_id   TEXT,                       -- Link to Stage 2 result if processed

  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (ingestion_id) REFERENCES ingestions(id)
);

CREATE INDEX idx_crops_ingestion ON crops(ingestion_id);
CREATE INDEX idx_crops_ship_class ON crops(ship_class);
CREATE INDEX idx_crops_view_type ON crops(view_type);
CREATE INDEX idx_crops_status ON crops(status);
CREATE INDEX idx_crops_suitable ON crops(suitable_for_extraction);
```

### tags

The tag taxonomy.

```sql
CREATE TABLE tags (
  id              TEXT PRIMARY KEY,           -- e.g., "nation/germany/weimar"
  slug            TEXT NOT NULL,              -- e.g., "weimar"
  display_name    TEXT NOT NULL,              -- e.g., "Weimar Republic"
  parent_id       TEXT REFERENCES tags(id),   -- Hierarchical parent
  description     TEXT,
  aliases         JSON,                       -- ["weimar republic", "weimarer republik"]

  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      TEXT NOT NULL,              -- "system", "llm", "human"
  needs_review    BOOLEAN DEFAULT FALSE,

  UNIQUE(slug, parent_id)
);

CREATE INDEX idx_tags_parent ON tags(parent_id);
CREATE INDEX idx_tags_slug ON tags(slug);
```

### tag_assignments

Links tags to assets (crops or ingestions).

```sql
CREATE TABLE tag_assignments (
  id              TEXT PRIMARY KEY,
  asset_type      TEXT NOT NULL,              -- "crop" or "ingestion"
  asset_id        TEXT NOT NULL,              -- ID of the crop or ingestion
  tag_id          TEXT NOT NULL REFERENCES tags(id),

  confidence      REAL NOT NULL DEFAULT 1.0,  -- 0.0 - 1.0
  assigned_by     TEXT NOT NULL,              -- "llm", "human", "rule"
  assigned_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(asset_type, asset_id, tag_id)
);

CREATE INDEX idx_tag_assign_asset ON tag_assignments(asset_type, asset_id);
CREATE INDEX idx_tag_assign_tag ON tag_assignments(tag_id);
```

### llm_analyses

Store raw LLM outputs for debugging and reprocessing.

```sql
CREATE TABLE llm_analyses (
  id              TEXT PRIMARY KEY,
  ingestion_id    TEXT NOT NULL REFERENCES ingestions(id),

  analysis_type   TEXT NOT NULL,              -- "vision", "grounding", "tagging"
  model_used      TEXT NOT NULL,              -- e.g., "gemini-2.5-flash"
  prompt_hash     TEXT,                       -- Hash of prompt for caching

  input_summary   TEXT,                       -- Brief description of input
  raw_response    TEXT NOT NULL,              -- Full LLM response
  parsed_response JSON,                       -- Parsed structured output
  parse_errors    JSON,                       -- Any parsing issues

  tokens_in       INTEGER,
  tokens_out      INTEGER,
  latency_ms      INTEGER,
  cost_estimate   REAL,

  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (ingestion_id) REFERENCES ingestions(id)
);

CREATE INDEX idx_llm_ingestion ON llm_analyses(ingestion_id);
CREATE INDEX idx_llm_type ON llm_analyses(analysis_type);
```

### relationships

Links related assets together.

```sql
CREATE TABLE relationships (
  id              TEXT PRIMARY KEY,
  from_type       TEXT NOT NULL,              -- "crop", "ingestion"
  from_id         TEXT NOT NULL,
  to_type         TEXT NOT NULL,
  to_id           TEXT NOT NULL,

  relationship    TEXT NOT NULL,              -- See relationship types below
  metadata        JSON,                       -- Additional relationship data

  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      TEXT NOT NULL,              -- "system", "llm", "human"

  UNIQUE(from_type, from_id, to_type, to_id, relationship)
);

CREATE INDEX idx_rel_from ON relationships(from_type, from_id);
CREATE INDEX idx_rel_to ON relationships(to_type, to_id);
CREATE INDEX idx_rel_type ON relationships(relationship);
```

---

## Relationship Types

```typescript
type RelationshipType =
  | 'crop_of'              // Crop was made from ingestion
  | 'sibling_crop'         // Crops from same source image
  | 'enhanced_version'     // Colored version of B&W
  | 'same_ship_class'      // Different views of same ship class
  | 'same_ship_instance'   // Different views of exact same ship
  | 'same_artist'          // Same artist/designer
  | 'duplicate'            // Possible duplicate (for review)
  | 'supersedes'           // Newer version replaces older
  | 'related';             // Generic relationship
```

---

## TypeScript Interfaces

```typescript
interface Ingestion {
  id: string;
  originalPath: string;
  archivePath: string | null;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  dimensions: { width: number; height: number };
  sourceType: 'upload' | 'scan' | 'web' | 'api';
  sourceUrl: string | null;
  sourceMeta: Record<string, unknown> | null;
  status: 'pending' | 'processed' | 'failed' | 'archived';
  errorMessage: string | null;
  ingestedAt: Date;
  processedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

interface Crop {
  id: string;
  ingestionId: string;
  filePath: string;
  filename: string;
  fileHash: string;
  fileSize: number;
  dimensions: { width: number; height: number };
  bounds: { x: number; y: number; width: number; height: number };
  sourceViewIdx: number;
  viewType: ViewType | null;
  style: ViewStyle | null;
  orientation: Orientation | null;
  shipClass: string | null;
  shipName: string | null;
  nation: string | null;
  era: string | null;
  isHistorical: boolean | null;
  quality: QualityAssessment | null;
  suitableForExtraction: boolean;
  status: 'created' | 'tagged' | 'processed' | 'failed';
  extractionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Query Examples

### Find all German battleship side profiles
```sql
SELECT c.*
FROM crops c
JOIN tag_assignments ta1 ON ta1.asset_type = 'crop' AND ta1.asset_id = c.id
JOIN tag_assignments ta2 ON ta2.asset_type = 'crop' AND ta2.asset_id = c.id
JOIN tag_assignments ta3 ON ta3.asset_type = 'crop' AND ta3.asset_id = c.id
WHERE ta1.tag_id LIKE 'nation/germany%'
  AND ta2.tag_id = 'ship-type/capital/battleship'
  AND ta3.tag_id = 'view-type/side-profile';
```

### Find crops ready for extraction
```sql
SELECT * FROM crops
WHERE suitable_for_extraction = TRUE
  AND status = 'tagged'
  AND extraction_id IS NULL
ORDER BY created_at;
```

### Find all crops from same source
```sql
SELECT c2.*
FROM crops c1
JOIN crops c2 ON c1.ingestion_id = c2.ingestion_id
WHERE c1.id = 'crop_abc123'
  AND c2.id != c1.id;
```

### Find potential duplicates
```sql
SELECT c1.id, c2.id, c1.ship_class
FROM crops c1
JOIN crops c2 ON c1.ship_class = c2.ship_class
  AND c1.view_type = c2.view_type
  AND c1.id < c2.id
WHERE c1.ship_class IS NOT NULL;
```

---

## TDD Goals

### Test 1: Ingestion CRUD
```typescript
describe('database - ingestions', () => {
  it('should create and retrieve ingestion', async () => {
    const ing = await db.ingestions.create({
      originalPath: '/uploads/test.png',
      fileHash: 'sha256:abc123',
      fileSize: 1024,
      mimeType: 'image/png',
      dimensions: { width: 800, height: 600 },
      sourceType: 'upload'
    });

    const retrieved = await db.ingestions.findById(ing.id);
    expect(retrieved.originalPath).toBe('/uploads/test.png');
  });

  it('should prevent duplicate file hashes', async () => {
    await db.ingestions.create({ fileHash: 'sha256:same', ... });

    await expect(
      db.ingestions.create({ fileHash: 'sha256:same', ... })
    ).rejects.toThrow(/unique/i);
  });
});
```

### Test 2: Tag Queries
```typescript
describe('database - tag queries', () => {
  it('should find assets by tag hierarchy', async () => {
    // Setup: crop with tag 'nation/germany/weimar'
    await db.tagAssignments.create({
      assetType: 'crop',
      assetId: 'crop_001',
      tagId: 'nation/germany/weimar'
    });

    // Query by parent 'nation/germany' should find it
    const results = await db.crops.findByTagPrefix('nation/germany');
    expect(results.map(c => c.id)).toContain('crop_001');
  });

  it('should find assets with multiple tags (AND)', async () => {
    const results = await db.crops.findByTags([
      'nation/germany',
      'ship-type/capital/battleship'
    ], { operator: 'AND' });

    // Only crops with BOTH tags
    expect(results.every(c =>
      c.tags.includes('nation/germany') &&
      c.tags.includes('ship-type/capital/battleship')
    )).toBe(true);
  });
});
```

### Test 3: Relationship Queries
```typescript
describe('database - relationships', () => {
  it('should find sibling crops', async () => {
    // Create ingestion with 4 crops
    const ing = await db.ingestions.create({ ... });
    const crops = await Promise.all([
      db.crops.create({ ingestionId: ing.id, ... }),
      db.crops.create({ ingestionId: ing.id, ... }),
      db.crops.create({ ingestionId: ing.id, ... }),
      db.crops.create({ ingestionId: ing.id, ... })
    ]);

    // Query siblings of first crop
    const siblings = await db.relationships.findSiblings(crops[0].id);
    expect(siblings.length).toBe(3);
  });
});
```

---

## Migrations Strategy

Use numbered migration files:

```
migrations/
├── 001_initial_schema.sql
├── 002_add_quality_fields.sql
├── 003_add_extraction_link.sql
└── ...
```

```typescript
async function migrate() {
  const applied = await db.query('SELECT id FROM migrations ORDER BY id');
  const appliedIds = new Set(applied.map(m => m.id));

  const migrations = loadMigrationFiles();
  for (const migration of migrations) {
    if (!appliedIds.has(migration.id)) {
      await db.transaction(async (tx) => {
        await tx.exec(migration.sql);
        await tx.query('INSERT INTO migrations (id) VALUES (?)', [migration.id]);
      });
    }
  }
}
```

---

## Success Criteria

1. ✅ Support 100,000+ crops without performance degradation
2. ✅ Complex tag queries execute in <100ms
3. ✅ Full-text search on ship names (optional enhancement)
4. ✅ Atomic transactions for all write operations
5. ✅ Graceful schema migrations
6. ✅ Export/import capability for backup

---

## Related Documents

- [Stage 0 Overview](./README.md)
- [Tagging Taxonomy](./tagging_taxonomy.md)
- [Relationships](./relationships.md)
