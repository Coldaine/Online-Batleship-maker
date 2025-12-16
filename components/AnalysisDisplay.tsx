import React from 'react';
import { AnalysisData, ShipParameters } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Cpu, Crosshair, Anchor } from 'lucide-react';

interface Props {
  data: AnalysisData | null;
  params: ShipParameters;
  loading: boolean;
}

export const AnalysisDisplay: React.FC<Props> = ({ data, params, loading }) => {
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 text-cyan-500 animate-pulse p-8">
        <Cpu size={48} className="animate-spin" />
        <span className="font-mono text-sm tracking-widest">ANALYZING VECTORS...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center border-2 border-dashed border-slate-700 rounded-xl">
        <p>No analysis data available.</p>
        <p className="text-sm">Upload a blueprint and click "Analyze" to begin.</p>
      </div>
    );
  }

  // Derived synthetic stats for the chart based on params
  const displacementData = [
    { name: 'Hull', value: 25000 * (params.hullExtrusion / 100) },
    { name: 'Armor', value: 12000 * (params.armorThickness / 100) },
    { name: 'Superstructure', value: 5000 * (params.superstructureHeight / 100) },
    { name: 'Armament', value: 8000 * (params.turretScale / 100) },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="border border-cyan-500/30 bg-cyan-950/10 p-4 rounded-lg">
        <h3 className="text-cyan-400 font-bold flex items-center gap-2 mb-2">
          <Anchor size={18} />
          <span>Class Identification</span>
        </h3>
        <p className="text-xl text-white font-mono tracking-wide">{data.shipClass}</p>
        <p className="text-sm text-slate-400 font-mono mt-1">Est. Design Year: {data.designYear}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 p-3 rounded border border-slate-700">
            <span className="text-xs text-slate-400 block mb-1">Length (Est.)</span>
            <span className="text-cyan-300 font-mono">{data.estimatedLength}</span>
        </div>
        <div className="bg-slate-800/50 p-3 rounded border border-slate-700">
            <span className="text-xs text-slate-400 block mb-1">Detected Armament</span>
            <span className="text-cyan-300 font-mono text-xs">{data.armament.length} Primary Systems</span>
        </div>
      </div>

      <div className="h-48 w-full bg-slate-900/50 rounded-lg p-2 border border-slate-700">
        <p className="text-xs text-center text-slate-500 mb-2 font-mono uppercase">Mass Distribution Est. (Tons)</p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={displacementData}>
            <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 10}} interval={0} />
            <YAxis hide />
            <Tooltip 
                contentStyle={{backgroundColor: '#0f172a', borderColor: '#22d3ee', color: '#fff'}}
                itemStyle={{color: '#22d3ee'}}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {displacementData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill="#0e7490" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-xs text-slate-400 p-3 bg-slate-900 rounded border border-slate-800">
        <h4 className="font-bold text-slate-300 mb-1 flex items-center gap-2">
            <Crosshair size={12} />
            AI Assessment
        </h4>
        <p className="leading-relaxed">{data.description}</p>
      </div>
    </div>
  );
};