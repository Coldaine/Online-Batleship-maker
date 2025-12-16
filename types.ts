
export interface ShipDimensions {
  length: number; // meters
  beam: number;   // meters
  draft: number;  // meters (height from waterline)
}

export interface ShipParameters {
  hullExtrusion: number;
  turretScale: number;
  superstructureHeight: number;
  armorThickness: number;
  calibrationScale: number; // meters per pixel (conceptual)
  modelStyle: ModelStyle;
  camouflage: string;
  dimensions: ShipDimensions;
}

export enum ModelStyle {
  Wireframe = 'Wireframe Blueprint',
  Clay = 'Clay Render',
  Photorealistic = 'Photorealistic Metallic',
  Cyberpunk = 'Cyberpunk Hologram'
}

export interface GeometricMap {
  turrets: number[]; // Array of normalized positions (0.0 = stern, 1.0 = bow)
  superstructure: {
    start: number;
    end: number;
  };
}

export interface AnalysisData {
  shipClass: string;
  estimatedLength: string;
  armament: string[];
  designYear: string;
  description: string;
  realDimensions?: {
    length: number;
    beam: number;
    draft: number;
  };
  geometry?: GeometricMap; // New field for topological data
}

export interface GenerationState {
  isAnalyzing: boolean;
  isGenerating: boolean;
  isSampling: boolean;
  progress: number; // 0-100
  step: string;
}
