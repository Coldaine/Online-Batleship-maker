
import { ShipParameters, GeometricMap } from '../types';

/**
 * procedural mesh generator that creates a Wavefront .OBJ string
 * based on the ship parameters and geometric analysis.
 */
export const generateShipObj = (
  params: ShipParameters, 
  geometry?: GeometricMap,
  profileCurve?: number[]
): string => {
  const { length, beam, draft } = params.dimensions;
  
  // Scale factors from percentages
  const hullFatness = params.hullExtrusion / 100;
  const superHeight = (length * 0.08) * (params.superstructureHeight / 100);
  const turretSize = (beam * 0.4) * (params.turretScale / 100);

  // Defaults if analysis failed
  const turrets = geometry?.turrets?.length ? geometry.turrets : [0.8, 0.7, 0.2];
  // Ensure superstructure values are valid (0-1)
  const ssStart = geometry?.superstructure?.start ?? 0.35;
  const ssEnd = geometry?.superstructure?.end ?? 0.65;

  let objOutput = `# NavalForge 3D Export
# Generated from 2D Blueprint Analysis
# Length: ${length}m, Beam: ${beam}m, Draft: ${draft}m
o Battleship_Hull
`;

  let vCount = 1; 
  const vertices: number[][] = [];
  const faces: number[][] = [];

  const addVertex = (x: number, y: number, z: number) => {
    vertices.push([x, y, z]);
    return vCount++;
  };

  const addQuad = (v1: number, v2: number, v3: number, v4: number) => {
    faces.push([v1, v2, v3, v4]);
  };
  
  const addTri = (v1: number, v2: number, v3: number) => {
    faces.push([v1, v2, v3]);
  };

  // --- 1. GENERATE HULL WITH SILHOUETTE ---
  const segments = 24; 
  const crossSectionRes = 8; 
  const rings: number[][] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 to 1 (Stern to Bow usually, or vice versa depending on image)
    // Map 0..1 to Z (-L/2 to L/2)
    // Note: Analysis assumes 0=Left, 1=Right. In OBJ, usually +Z is front. 
    // Let's assume standard alignment 0=Stern, 1=Bow for ease.
    const z = (t - 0.5) * length; 

    // Taper Logic (Plan View)
    // If we had Top View sampling, we'd use that. For now, we use parametric taper.
    const taper = 1 - Math.pow(Math.abs(2 * t - 1), 2.5); 
    const currentBeamHalf = (beam / 2) * taper * hullFatness;
    const currentDraft = draft * (0.8 + 0.2 * taper);

    // Profile Logic (Side View)
    // Sample the profileCurve if available
    let sheerHeight = 0;
    if (profileCurve && profileCurve.length > 0) {
      // Map 't' to index in profileCurve
      const pIndex = Math.floor(t * (profileCurve.length - 1));
      // profileCurve is 0..1. Scale it to some reasonable sheer height variance
      // Let's assume the profile curve primarily dictates the DECK height variation.
      // Base deck is at 0. Add sheer based on curve.
      // E.g. sheer is 10% of length max.
      sheerHeight = (profileCurve[pIndex] - 0.5) * (length * 0.1); 
    }

    const ringIndices: number[] = [];
    for (let j = 0; j <= crossSectionRes; j++) {
      const u = j / crossSectionRes; 
      const angle = Math.PI * u; 
      const xRaw = Math.cos(angle);
      const yRaw = -Math.sin(angle);
      
      let x = xRaw * currentBeamHalf;
      let y = yRaw * currentDraft;
      
      // Apply Sheer to the top vertices (where angle approaches 0 or PI)
      // Actually, we shift the whole section up/down or just the top?
      // Standard naval: Sheer raises the whole deck level.
      // So we add sheerHeight to Y, but clamp bottom at keel? 
      // Simplified: Just shift top Y (y=0) up by sheerHeight.
      // Interpolate shift based on yRaw (0 at keel, 1 at deck)
      const deckFactor = 1 - Math.abs(yRaw); // 1 at top, 0 at bottom
      y += sheerHeight * deckFactor;

      ringIndices.push(addVertex(x, y, z));
    }
    rings.push(ringIndices);
  }

  // Stitch Hull
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < crossSectionRes; j++) {
      const currentRing = rings[i];
      const nextRing = rings[i + 1];
      addQuad(currentRing[j], nextRing[j], nextRing[j+1], currentRing[j+1]);
    }
  }

  // Cap Deck
  for (let i = 0; i < segments; i++) {
    const r1 = rings[i];
    const r2 = rings[i+1];
    addQuad(r1[r1.length - 1], r2[r2.length - 1], r2[0], r1[0]);
  }

  // --- 2. SUPERSTRUCTURE FROM DATA ---
  // Convert normalized 0..1 coordinates to Z positions
  const ssZStart = (ssStart - 0.5) * length;
  const ssZEnd = (ssEnd - 0.5) * length;
  const realSSLength = Math.abs(ssZEnd - ssZStart);
  const ssCenterZ = (ssZStart + ssZEnd) / 2;
  const realSSWidth = beam * 0.5;

  const ssV = [
    addVertex(-realSSWidth/2, 0, ssCenterZ - realSSLength/2),
    addVertex(realSSWidth/2, 0, ssCenterZ - realSSLength/2),
    addVertex(realSSWidth/2, 0, ssCenterZ + realSSLength/2),
    addVertex(-realSSWidth/2, 0, ssCenterZ + realSSLength/2),
    addVertex(-realSSWidth/2, superHeight, ssCenterZ - realSSLength/2),
    addVertex(realSSWidth/2, superHeight, ssCenterZ - realSSLength/2),
    addVertex(realSSWidth/2, superHeight, ssCenterZ + realSSLength/2),
    addVertex(-realSSWidth/2, superHeight, ssCenterZ + realSSLength/2),
  ];
  
  addQuad(ssV[0], ssV[1], ssV[5], ssV[4]);
  addQuad(ssV[1], ssV[2], ssV[6], ssV[5]);
  addQuad(ssV[2], ssV[3], ssV[7], ssV[6]);
  addQuad(ssV[3], ssV[0], ssV[4], ssV[7]);
  addQuad(ssV[4], ssV[5], ssV[6], ssV[7]);

  // --- 3. TURRETS FROM DATA ---
  const addTurret = (zPos: number) => {
    const tHeight = superHeight * 0.4;
    const sides = 12;
    // Check if turret is inside superstructure, raise it up (superfiring)
    let yBase = 0;
    if (zPos > ssZStart && zPos < ssZEnd) {
       yBase = superHeight * 0.6; // Place on top of superstructure
    }

    const centerTop = addVertex(0, yBase + tHeight, zPos);
    const topRing: number[] = [];
    const baseRing: number[] = [];
    
    for(let i=0; i<sides; i++) {
      const angle = (i/sides) * Math.PI * 2;
      const x = Math.cos(angle) * turretSize;
      const z = Math.sin(angle) * turretSize + zPos;
      topRing.push(addVertex(x, yBase + tHeight, z));
      baseRing.push(addVertex(x, yBase, z));
    }
    
    for(let i=0; i<sides; i++) {
      const next = (i+1)%sides;
      addQuad(baseRing[i], baseRing[next], topRing[next], topRing[i]);
      addTri(topRing[i], topRing[next], centerTop);
    }
  };

  // Iterate over detected turret positions
  turrets.forEach(tNorm => {
    const zPos = (tNorm - 0.5) * length;
    addTurret(zPos);
  });

  // Write Vertices
  vertices.forEach(v => {
    objOutput += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
  });

  objOutput += `\ng Battleship\n`;

  // Write Faces
  faces.forEach(f => {
    if (f.length === 3) {
      objOutput += `f ${f[0]} ${f[1]} ${f[2]}\n`;
    } else if (f.length === 4) {
      objOutput += `f ${f[0]} ${f[1]} ${f[2]} ${f[3]}\n`;
    }
  });

  return objOutput;
};
