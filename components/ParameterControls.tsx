import React from 'react';
import { ShipParameters, ModelStyle } from '../types';
import { Sliders, Box, Shield, Layers, Camera, PaintBucket, Ruler } from 'lucide-react';

interface Props {
  params: ShipParameters;
  setParams: React.Dispatch<React.SetStateAction<ShipParameters>>;
  disabled: boolean;
}

const CAMOUFLAGE_OPTIONS = [
  "Auto", 
  "Standard Navy Grey", 
  "Dazzle Pattern", 
  "Measure 22 (Two-Tone)", 
  "Jungle / Coastal", 
  "Arctic White",
  "Rusty / Weathered"
];

export const ParameterControls: React.FC<Props> = ({ params, setParams, disabled }) => {
  const handleChange = (key: keyof ShipParameters, value: number | string) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleDimensionChange = (key: keyof ShipParameters['dimensions'], value: number) => {
    setParams(prev => ({
      ...prev,
      dimensions: {
        ...prev.dimensions,
        [key]: value
      }
    }));
  };

  return (
    <div className="space-y-6 text-sm text-slate-300">
      
      {/* Group: Physical Dimensions (Grounding) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-700 pb-2">
          <Ruler size={16} />
          <span>Physical Dimensions (Grounding)</span>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
                <label className="text-xs text-slate-400">Length (m)</label>
                <input
                    type="number"
                    value={params.dimensions.length}
                    onChange={(e) => handleDimensionChange('length', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-cyan-300 font-mono text-xs focus:border-cyan-500 outline-none"
                />
            </div>
            <div className="space-y-1">
                <label className="text-xs text-slate-400">Beam (m)</label>
                <input
                    type="number"
                    value={params.dimensions.beam}
                    onChange={(e) => handleDimensionChange('beam', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-cyan-300 font-mono text-xs focus:border-cyan-500 outline-none"
                />
            </div>
            <div className="col-span-2 space-y-1">
                <label className="text-xs text-slate-400">Draft / Height (m)</label>
                <input
                    type="number"
                    value={params.dimensions.draft}
                    onChange={(e) => handleDimensionChange('draft', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-cyan-300 font-mono text-xs focus:border-cyan-500 outline-none"
                />
            </div>
        </div>
      </div>

      {/* Group: Geometry */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-700 pb-2">
          <Box size={16} />
          <span>Extrusion Geometry</span>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <label>Hull Inflation / Extrusion</label>
            <span className="font-mono text-cyan-400">{params.hullExtrusion}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="150"
            disabled={disabled}
            value={params.hullExtrusion}
            onChange={(e) => handleChange('hullExtrusion', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400"
          />
          <p className="text-[10px] text-slate-500">Adjusts the degree of 3D volume added to the 2D footprint.</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label>Superstructure Height</label>
            <span className="font-mono text-cyan-400">{params.superstructureHeight}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="200"
            disabled={disabled}
            value={params.superstructureHeight}
            onChange={(e) => handleChange('superstructureHeight', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400"
          />
        </div>
      </div>

      {/* Group: Calibration */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-700 pb-2">
          <Layers size={16} />
          <span>Component Calibration</span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label>Turret Scaling</label>
            <span className="font-mono text-cyan-400">{params.turretScale}%</span>
          </div>
          <input
            type="range"
            min="80"
            max="150"
            disabled={disabled}
            value={params.turretScale}
            onChange={(e) => handleChange('turretScale', parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400"
          />
        </div>
      </div>

      {/* Group: Texture & Camouflage */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-700 pb-2">
          <PaintBucket size={16} />
          <span>Texture & Camouflage</span>
        </div>
        
        <div className="space-y-2">
          <label className="block mb-2">Pattern Strategy</label>
          <select 
             value={params.camouflage}
             onChange={(e) => handleChange('camouflage', e.target.value)}
             disabled={disabled}
             className="w-full bg-slate-800 border border-slate-700 text-slate-300 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-cyan-500 outline-none"
          >
             {CAMOUFLAGE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
             ))}
          </select>
        </div>
      </div>

       {/* Group: Style */}
       <div className="space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-700 pb-2">
          <Camera size={16} />
          <span>Render Output</span>
        </div>
        <div className="space-y-2">
          <label className="block mb-2">Visual Style</label>
          <div className="grid grid-cols-1 gap-2">
            {Object.values(ModelStyle).map((style) => (
              <button
                key={style}
                onClick={() => handleChange('modelStyle', style)}
                disabled={disabled}
                className={`px-3 py-2 text-left text-xs rounded border transition-all ${
                  params.modelStyle === style
                    ? 'bg-cyan-900/50 border-cyan-400 text-cyan-100'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};