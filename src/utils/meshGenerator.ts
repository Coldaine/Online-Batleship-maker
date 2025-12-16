
import { ShipParameters, GeometricMap } from '../types';

/**
 * procedural mesh generator that creates a Wavefront .OBJ string
 * based on the ship parameters and geometric analysis.
 */
export const generateShipObj = (
  params: ShipParameters, 
  geometry?: GeometricMap
): string => {
  const { length, beam, draft } = params.dimensions;
  
  // Scale factors from percentages
  const hullFatness = params.hullExtrusion / 100;
  const superHeight = (length * 0.08) * (params.superstructureHeight / 100);
  const turretSize = (beam * 0.4) * (params.turretScale / 100);

  // Trace Data (Default to parametric if missing)
  const topTrace = geometry?.topProfile;
  const sideTrace = geometry?.sideProfile;

  // Defaults if analysis failed
  const turrets = geometry?.turrets?.length ? geometry.turrets : [0.8, 0.7, 0.2];
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
  const segments = 50; // Higher resolution for traced shapes
  const crossSectionRes = 12; 
  const rings: number[][] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 to 1 (Stern to Bow)
    const z = (t - 0.5) * length; 

    // --- BEAM CALCULATION (WIDTH) ---
    let currentBeamHalf = 0;
    if (topTrace && topTrace.length > 0) {
      // Sample the trace array
      const index = Math.min(Math.floor(t * (topTrace.length - 1)), topTrace.length - 1);
      // topTrace is normalized 0..1 relative to the IMAGE width.
      // We assume the maximum width in the trace corresponds to the Ship's Beam.
      // But noise can spike it. Let's trust the trace.
      // We also multiply by 'hullFatness' user override.
      const rawWidth = topTrace[index]; 
      // Normalize: We assume the MAX width in the array is "The Beam". 
      // Or we just map 1.0 = Beam. Let's map 1.0 = Beam for safety.
      currentBeamHalf = (beam / 2) * rawWidth * hullFatness; 
    } else {
      // Fallback Parametric Taper
      const taper = 1 - Math.pow(Math.abs(2 * t - 1), 2.5); 
      currentBeamHalf = (beam / 2) * taper * hullFatness;
    }

    // --- DRAFT/PROFILE CALCULATION (HEIGHT) ---
    let currentTotalHeight = draft; // Default
    if (sideTrace && sideTrace.length > 0) {
      const index = Math.min(Math.floor(t * (sideTrace.length - 1)), sideTrace.length - 1);
      // Side trace includes superstructure often. 
      // We map the side trace 0..1 to the estimated ship height (Draft + Freeboard).
      // Let's assume the max height in the image is roughly Draft + Freeboard.
      const rawHeight = sideTrace[index];
      currentTotalHeight = (draft * 1.5) * rawHeight; 
    } else {
       // Fallback
       const taper = 1 - Math.pow(Math.abs(2 * t - 1), 2.5);
       currentTotalHeight = draft * (0.8 + 0.2 * taper);
    }

    // Generate Cross Section Ring
    const ringIndices: number[] = [];
    for (let j = 0; j <= crossSectionRes; j++) {
      const u = j / crossSectionRes; 
      // U-shape hull section
      const angle = Math.PI * u; 
      const xRaw = Math.cos(angle); // -1 to 1
      const yRaw = -Math.sin(angle); // 0 to -1 (Keel is down)
      
      let x = xRaw * currentBeamHalf;
      // Map Y so that:
      // -1 (Keel) -> Bottom of currentTotalHeight
      // 0 (Deck) -> Top of currentTotalHeight
      // Actually yRaw is 0 (deck) to -1 (keel).
      
      // Let's assume currentTotalHeight is the full hull depth.
      // We place the "Waterline" roughly at y=0.
      let y = yRaw * currentTotalHeight;
      
      // Shift up so keel is at -Draft?
      // For simplicity, let's keep Deck at roughly +Freeboard and Keel at -Draft.
      // If we assume currentTotalHeight includes both.
      y += (currentTotalHeight * 0.3); // Shift up slightly

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

  // --- 2. SUPERSTRUCTURE ---
  // Simple Box for now (Phase 1 Goal: Outer Hull is priority)
  const ssZStart = (ssStart - 0.5) * length;
  const ssZEnd = (ssEnd - 0.5) * length;
  const realSSLength = Math.abs(ssZEnd - ssZStart);
  const ssCenterZ = (ssZStart + ssZEnd) / 2;
  const realSSWidth = beam * 0.5;

  // Only generate if we have valid length
  if (realSSLength > 1) {
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
  }

  // --- 3. TURRETS ---
  const addTurret = (zPos: number) => {
    const tHeight = superHeight * 0.4;
    const sides = 8;
    let yBase = 0;
    if (zPos > ssZStart && zPos < ssZEnd) yBase = superHeight * 0.6; 

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

  turrets.forEach(tNorm => {
    const zPos = (tNorm - 0.5) * length;
    addTurret(zPos);
  });

  // Write Data
  vertices.forEach(v => {
    objOutput += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
  });

  objOutput += `\ng Battleship\n`;

  faces.forEach(f => {
    if (f.length === 3) {
      objOutput += `f ${f[0]} ${f[1]} ${f[2]}\n`;
    } else if (f.length === 4) {
      objOutput += `f ${f[0]} ${f[1]} ${f[2]} ${f[3]}\n`;
    }
  });

  return objOutput;
};
