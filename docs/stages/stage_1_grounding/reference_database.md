---
title: "Stage 1.2: Reference Database"
date: 2026-01-01
author: Claude (Opus 4.5)
stage: 1
component: reference_database
status: Specification (Not Implemented)
---

# Reference Database

## Purpose

Maintain a local cache of verified ship specifications to avoid redundant API calls and provide instant lookups for known ship classes.

## The Problem

Every time we ground a "Yamato-class battleship," we shouldn't have to call Google Search. We should cache the result and reuse it. Over time, this builds a comprehensive reference library.

---

## Interface Contract

```typescript
interface ShipReference {
  id: string;                       // e.g., "ref_yamato_class"
  shipClass: string;                // "Yamato-class battleship"
  aliases: string[];                // ["Yamato", "大和型戦艦"]

  dimensions: {
    length: number;                 // meters
    beam: number;                   // meters
    draft: number;                  // meters
    displacement?: number;          // tonnes
  };

  geometryHints: {
    turretPositions: number[];      // 0-1 normalized
    superstructure: { start: number; end: number };
    funnelPositions?: number[];
  };

  metadata: {
    nation: string;
    era: string;
    shipType: string;               // battleship, cruiser, etc.
    designYear?: string;
    notes?: string;
  };

  sources: {
    url?: string;
    name: string;
    retrievedAt: string;            // ISO date
  }[];

  confidence: number;               // 0-1
  verified: boolean;                // Human-verified
  createdAt: string;
  updatedAt: string;
}

interface ReferenceQuery {
  shipClass?: string;
  aliases?: string[];
  nation?: string;
  era?: string;
  shipType?: string;
}

interface ReferenceDatabase {
  find(query: ReferenceQuery): Promise<ShipReference | null>;
  findByClass(shipClass: string): Promise<ShipReference | null>;
  save(ref: ShipReference): Promise<void>;
  update(id: string, updates: Partial<ShipReference>): Promise<void>;
  verify(id: string, reviewer: string): Promise<void>;
  list(filter?: ReferenceQuery): Promise<ShipReference[]>;
  stats(): Promise<DatabaseStats>;
}

interface DatabaseStats {
  totalReferences: number;
  verifiedCount: number;
  byNation: Record<string, number>;
  byEra: Record<string, number>;
  lastUpdated: string;
}
```

---

## Data Structure

### SQLite Schema

```sql
CREATE TABLE ship_references (
  id              TEXT PRIMARY KEY,
  ship_class      TEXT NOT NULL UNIQUE,
  aliases         JSON,                    -- ["alias1", "alias2"]

  length_m        REAL NOT NULL,
  beam_m          REAL NOT NULL,
  draft_m         REAL NOT NULL,
  displacement_t  REAL,

  geometry_hints  JSON,                    -- { turretPositions, superstructure, ... }

  nation          TEXT,
  era             TEXT,
  ship_type       TEXT,
  design_year     TEXT,
  notes           TEXT,

  sources         JSON,                    -- [{ url, name, retrievedAt }]

  confidence      REAL NOT NULL DEFAULT 0.5,
  verified        BOOLEAN DEFAULT FALSE,
  verified_by     TEXT,
  verified_at     TIMESTAMP,

  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ref_class ON ship_references(ship_class);
CREATE INDEX idx_ref_nation ON ship_references(nation);
CREATE INDEX idx_ref_era ON ship_references(era);
CREATE INDEX idx_ref_type ON ship_references(ship_type);

-- Full-text search for fuzzy matching
CREATE VIRTUAL TABLE ship_references_fts USING fts5(
  ship_class,
  aliases,
  content='ship_references',
  content_rowid='rowid'
);
```

---

## Seed Data

Start with well-known capital ships:

```typescript
const seedData: ShipReference[] = [
  {
    id: 'ref_yamato',
    shipClass: 'Yamato-class battleship',
    aliases: ['Yamato', 'Musashi', '大和型戦艦'],
    dimensions: { length: 263, beam: 38.9, draft: 11 },
    geometryHints: {
      turretPositions: [0.12, 0.22, 0.72],
      superstructure: { start: 0.32, end: 0.52 }
    },
    metadata: {
      nation: 'Japan',
      era: 'WW2',
      shipType: 'battleship',
      designYear: '1937'
    },
    sources: [{ name: 'Naval History and Heritage Command', retrievedAt: '2026-01-01' }],
    confidence: 0.98,
    verified: true
  },
  {
    id: 'ref_iowa',
    shipClass: 'Iowa-class battleship',
    aliases: ['Iowa', 'Missouri', 'New Jersey', 'Wisconsin'],
    dimensions: { length: 270.4, beam: 32.9, draft: 11.6 },
    geometryHints: {
      turretPositions: [0.15, 0.25, 0.75],
      superstructure: { start: 0.35, end: 0.55 }
    },
    metadata: {
      nation: 'USA',
      era: 'WW2',
      shipType: 'battleship',
      designYear: '1938'
    },
    sources: [{ name: 'Naval History and Heritage Command', retrievedAt: '2026-01-01' }],
    confidence: 0.98,
    verified: true
  },
  {
    id: 'ref_bismarck',
    shipClass: 'Bismarck-class battleship',
    aliases: ['Bismarck', 'Tirpitz'],
    dimensions: { length: 251, beam: 36, draft: 10.6 },
    geometryHints: {
      turretPositions: [0.12, 0.24, 0.68, 0.82],
      superstructure: { start: 0.35, end: 0.55 }
    },
    metadata: {
      nation: 'Germany',
      era: 'WW2',
      shipType: 'battleship',
      designYear: '1935'
    },
    sources: [{ name: 'German Naval History', retrievedAt: '2026-01-01' }],
    confidence: 0.95,
    verified: true
  }
  // ... more seed data
];
```

---

## TDD Goals

### Test 1: Basic CRUD Operations
```typescript
describe('referenceDatabase - CRUD', () => {
  beforeEach(async () => {
    await db.clear();
  });

  it('should save and retrieve ship reference', async () => {
    const ref: ShipReference = {
      id: 'ref_test',
      shipClass: 'Test-class cruiser',
      aliases: [],
      dimensions: { length: 180, beam: 20, draft: 6 },
      geometryHints: { turretPositions: [], superstructure: { start: 0.4, end: 0.6 } },
      metadata: { nation: 'Test', era: 'WW2', shipType: 'cruiser' },
      sources: [],
      confidence: 0.8,
      verified: false
    };

    await db.save(ref);
    const retrieved = await db.findByClass('Test-class cruiser');

    expect(retrieved).not.toBeNull();
    expect(retrieved.dimensions.length).toBe(180);
  });

  it('should update existing reference', async () => {
    await db.save(testRef);
    await db.update(testRef.id, { dimensions: { ...testRef.dimensions, length: 200 } });

    const updated = await db.findByClass(testRef.shipClass);
    expect(updated.dimensions.length).toBe(200);
    expect(updated.updatedAt).not.toBe(testRef.updatedAt);
  });

  it('should mark reference as verified', async () => {
    await db.save(testRef);
    await db.verify(testRef.id, 'reviewer@example.com');

    const verified = await db.findByClass(testRef.shipClass);
    expect(verified.verified).toBe(true);
    expect(verified.verified_by).toBe('reviewer@example.com');
  });
});
```

### Test 2: Alias Matching
```typescript
describe('referenceDatabase - aliases', () => {
  it('should find by alias', async () => {
    await db.save({
      ...testRef,
      shipClass: 'Yamato-class battleship',
      aliases: ['Yamato', 'Musashi', '大和']
    });

    const byYamato = await db.find({ aliases: ['Yamato'] });
    expect(byYamato).not.toBeNull();
    expect(byYamato.shipClass).toBe('Yamato-class battleship');

    const byMusashi = await db.find({ aliases: ['Musashi'] });
    expect(byMusashi).not.toBeNull();

    const byJapanese = await db.find({ aliases: ['大和'] });
    expect(byJapanese).not.toBeNull();
  });

  it('should match case-insensitively', async () => {
    await db.save({
      ...testRef,
      shipClass: 'Iowa-class battleship',
      aliases: ['Iowa', 'IOWA', 'iowa']
    });

    const result = await db.find({ aliases: ['IOWA'] });
    expect(result).not.toBeNull();
  });
});
```

### Test 3: Fuzzy Search
```typescript
describe('referenceDatabase - fuzzy search', () => {
  it('should find with partial match', async () => {
    await db.save({
      ...testRef,
      shipClass: 'Kongō-class battlecruiser'
    });

    const results = await db.search('Kongo');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].shipClass).toContain('Kongō');
  });

  it('should find with typos', async () => {
    await db.save({
      ...testRef,
      shipClass: 'Scharnhorst-class battleship'
    });

    const results = await db.search('Scharnhost');  // Missing 'r'
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### Test 4: Filtering
```typescript
describe('referenceDatabase - filters', () => {
  beforeEach(async () => {
    await seedDatabase();  // Add multiple ships
  });

  it('should filter by nation', async () => {
    const japanese = await db.list({ nation: 'Japan' });

    expect(japanese.every(s => s.metadata.nation === 'Japan')).toBe(true);
    expect(japanese.length).toBeGreaterThan(0);
  });

  it('should filter by era', async () => {
    const ww2 = await db.list({ era: 'WW2' });

    expect(ww2.every(s => s.metadata.era === 'WW2')).toBe(true);
  });

  it('should combine filters', async () => {
    const japaneseWw2Battleships = await db.list({
      nation: 'Japan',
      era: 'WW2',
      shipType: 'battleship'
    });

    expect(japaneseWw2Battleships.every(s =>
      s.metadata.nation === 'Japan' &&
      s.metadata.era === 'WW2' &&
      s.metadata.shipType === 'battleship'
    )).toBe(true);
  });
});
```

### Test 5: Statistics
```typescript
describe('referenceDatabase - stats', () => {
  it('should return accurate statistics', async () => {
    await seedDatabase();

    const stats = await db.stats();

    expect(stats.totalReferences).toBeGreaterThan(0);
    expect(stats.byNation['Japan']).toBeGreaterThan(0);
    expect(stats.byEra['WW2']).toBeGreaterThan(0);
    expect(new Date(stats.lastUpdated)).toBeInstanceOf(Date);
  });

  it('should track verified count', async () => {
    await db.save({ ...testRef, verified: false });
    await db.save({ ...testRef, id: 'ref_2', shipClass: 'Other', verified: true });

    const stats = await db.stats();
    expect(stats.verifiedCount).toBe(1);
  });
});
```

---

## Success Criteria

1. ✅ Instant lookup (<10ms) for known ship classes
2. ✅ Fuzzy matching for typos and variations
3. ✅ Alias support for ship names
4. ✅ Full-text search capability
5. ✅ Verification tracking
6. ✅ Statistics and reporting

---

## Related Documents

- [Stage 1 Overview](./README.md)
- [Semantic Grounding](./semantic_grounding.md)
- [Database Schema (Stage 0)](../stage_0_ingestion/database_schema.md)
