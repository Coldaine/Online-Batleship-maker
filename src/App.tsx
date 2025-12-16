
import React, { useState, useRef, useEffect } from 'react';
import { ParameterControls } from './components/ParameterControls';
import { AnalysisDisplay } from './components/AnalysisDisplay';
import { BlueprintSplitter } from './components/BlueprintSplitter';
import { ShipParameters, ModelStyle, AnalysisData, GenerationState } from './types';
import { analyzeBlueprint, generate3DView } from './services/geminiService';
import { generateShipObj } from './utils/meshGenerator';
import { traceSilhouette } from './utils/VisionKernel';
import { Upload, Play, RefreshCw, Hexagon, AlertCircle, Maximize2, Download, Scissors, FileImage, Globe, Anchor, Box, ScanLine, ArrowLeftRight } from 'lucide-react';

const INITIAL_PARAMS: ShipParameters = {
  hullExtrusion: 100,
  turretScale: 100,
  superstructureHeight: 100,
  armorThickness: 100,
  calibrationScale: 1.0,
  modelStyle: ModelStyle.Photorealistic,
  camouflage: 'Auto',
  dimensions: {
    length: 250,
    beam: 36,
    draft: 15
  }
};

// --- VISUALIZER COMPONENT ---
const TracePreview: React.FC<{ data: number[]; color: string; vertical?: boolean }> = ({ data, color, vertical }) => {
  if (!data || data.length === 0) return null;
  
  // Convert 0..1 array to SVG Path
  // We mirror the top view trace to look like a hull
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    // val is 0..1 (normalized thickness)
    // We want to draw from center out
    return `${x},${50 - (val * 40)}`;
  });
  
  // Create bottom half for symmetry if it's top view
  const bottomPoints = [...data].reverse().map((val, i) => {
    const originalIndex = data.length - 1 - i;
    const x = (originalIndex / (data.length - 1)) * 100;
    return `${x},${50 + (val * 40)}`;
  });

  const pathD = `M ${points.join(' L ')} L ${bottomPoints.join(' L ')} Z`;
  
  // For Side view, we just draw the profile from bottom up
  const sidePoints = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    return `${x},${100 - (val * 80)}`; // 80% height usage
  });
  const sidePathD = `M 0,100 L ${sidePoints.join(' L ')} L 100,100 Z`;

  return (
    <div className="absolute inset-0 pointer-events-none opacity-80">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full drop-shadow-md">
        <path 
          d={vertical ? sidePathD : pathD} 
          fill="none" 
          stroke={color} 
          strokeWidth="2" 
          vectorEffect="non-scaling-stroke"
          className="animate-draw"
        />
        <path 
          d={vertical ? sidePathD : pathD} 
          fill={color} 
          fillOpacity="0.2" 
          stroke="none" 
        />
      </svg>
    </div>
  );
};

function App() {
  const [params, setParams] = useState<ShipParameters>(INITIAL_PARAMS);
  const [topImage, setTopImage] = useState<string | null>(null);
  const [sideImage, setSideImage] = useState<string | null>(null);
  
  const [masterImage, setMasterImage] = useState<string | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);

  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  
  // Trace Data State
  const [topTrace, setTopTrace] = useState<number[]>([]);
  const [sideTrace, setSideTrace] = useState<number[]>([]);
  const [hasTraced, setHasTraced] = useState(false);

  const [state, setState] = useState<GenerationState>({
    isAnalyzing: false,
    isGenerating: false,
    isSampling: false,
    progress: 0,
    step: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [groundingSource, setGroundingSource] = useState<string | null>(null);
  
  const masterInputRef = useRef<HTMLInputElement>(null);
  const topInputRef = useRef<HTMLInputElement>(null);
  const sideInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, viewType: 'top' | 'side') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const cleanBase64 = base64.split(',')[1];
        if (viewType === 'top') {
          setTopImage(cleanBase64);
          setTopTrace([]);
        } else {
          setSideImage(cleanBase64);
          setSideTrace([]);
        }
        setResultImage(null);
        setError(null);
        setHasTraced(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMasterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMasterImage(reader.result as string);
        setIsSplitting(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSplitComplete = (top: string, side: string) => {
    setTopImage(top);
    setSideImage(side);
    setIsSplitting(false);
    setMasterImage(null);
    setResultImage(null);
    setHasTraced(false);
    setTopTrace([]);
    setSideTrace([]);
  };

  const handleAnalyze = async () => {
    if (!topImage) return;
    setState({ isAnalyzing: true, isGenerating: false, isSampling: false, progress: 10, step: 'Initializing Vision Kernel...' });
    setError(null);
    setGroundingSource(null);
    
    try {
      setState(prev => ({ ...prev, progress: 30, step: 'Tracing Hulls (Bilateral)...' }));
      
      const tTrace = await traceSilhouette(topImage, { threshold: 128, smoothing: 3, isSideView: false });
      setTopTrace(tTrace);
      
      let sTrace: number[] = [];
      if (sideImage) {
        setState(prev => ({ ...prev, progress: 50, step: 'Tracing Profile...' }));
        sTrace = await traceSilhouette(sideImage, { threshold: 128, smoothing: 3, isSideView: true });
        setSideTrace(sTrace);
      }

      setHasTraced(true);

      setState(prev => ({ ...prev, progress: 70, step: 'Analyzing Semantics...' }));
      const data = await analyzeBlueprint(topImage);
      
      const mergedData = {
        ...data,
        geometry: {
          ...data.geometry,
          turrets: data.geometry?.turrets || [],
          superstructure: data.geometry?.superstructure || { start: 0.3, end: 0.7 },
          topProfile: tTrace,
          sideProfile: sTrace
        }
      };

      setAnalysisData(mergedData);

      if (data.realDimensions) {
        setParams(prev => ({
          ...prev,
          dimensions: {
            length: data.realDimensions?.length || prev.dimensions.length,
            beam: data.realDimensions?.beam || prev.dimensions.beam,
            draft: data.realDimensions?.draft || prev.dimensions.draft
          }
        }));
        setGroundingSource(`Grounding: Data matched to ${data.shipClass}`);
      }
      
      setState(prev => ({ ...prev, isAnalyzing: false, progress: 100, step: 'Trace Complete' }));
    } catch (err) {
      console.error(err);
      setError("Analysis failed. But keeping partial traces if available.");
      setState(prev => ({ ...prev, isAnalyzing: false }));
    }
  };

  const toggleTraceOrientation = (type: 'top' | 'side') => {
    if (type === 'top' && topTrace.length) {
      setTopTrace([...topTrace].reverse());
    } else if (type === 'side' && sideTrace.length) {
      setSideTrace([...sideTrace].reverse());
    }
  };

  const handleGenerate = async () => {
    if (!topImage) return;
    setState({ isAnalyzing: false, isGenerating: true, isSampling: false, progress: 10, step: 'Lofting 3D Hull...' });
    setError(null);

    try {
      const steps = ['Applying Bilateral Symmetry...', 'Extruding Cross-Sections...', 'Stitching Manifold...', 'Rendering Preview...'];
      let stepIndex = 0;
      const progressTimer = setInterval(() => {
        setState(prev => {
          if (prev.progress >= 90) return prev;
          const nextStep = steps[stepIndex] || prev.step;
          if (prev.progress % 25 === 0 && stepIndex < steps.length - 1) stepIndex++;
          return { ...prev, progress: prev.progress + 10, step: nextStep };
        });
      }, 500);

      // We pass the potentially reversed traces into the geometry map
      const currentGeometry = analysisData ? {
        ...analysisData.geometry,
        topProfile: topTrace,
        sideProfile: sideTrace
      } : undefined;

      // Note: For the preview image, we still send the original image. 
      // The 3D export will use the traces.
      const generatedImage = await generate3DView(topImage, sideImage, params, analysisData?.shipClass);
      
      clearInterval(progressTimer);
      setResultImage(generatedImage);
      setState(prev => ({ ...prev, isGenerating: false, progress: 100, step: 'Pipeline Complete' }));
    } catch (err) {
      setError("Generation failed. Please try again.");
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleExportObj = () => {
    try {
      const currentGeometry = analysisData ? {
        ...analysisData.geometry,
        turrets: analysisData.geometry?.turrets || [],
        superstructure: analysisData.geometry?.superstructure || { start: 0, end: 0 },
        topProfile: topTrace,
        sideProfile: sideTrace
      } : undefined;

      const objContent = generateShipObj(params, currentGeometry);
      const blob = new Blob([objContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `navalforge_${analysisData?.shipClass?.replace(/\s+/g, '_') || 'model'}.obj`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("Failed to generate mesh file.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col grid-bg text-slate-200 selection:bg-cyan-500/30">
      {isSplitting && masterImage && (
        <BlueprintSplitter 
          imageSrc={masterImage}
          onComplete={handleSplitComplete}
          onCancel={() => { setIsSplitting(false); setMasterImage(null); }}
        />
      )}

      <header className="border-b border-cyan-900/50 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded border border-cyan-500/50">
              <Hexagon className="text-cyan-400" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold font-mono tracking-tight text-white">NAVAL<span className="text-cyan-400">FORGE</span> 3D</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Vision-Augmented Mesh Generator</p>
            </div>
          </div>
          {groundingSource && (
             <div className="flex items-center gap-2 text-xs text-green-400 font-mono bg-green-900/20 px-3 py-1 rounded-full border border-green-800 animate-fade-in">
               <Globe size={12} />
               {groundingSource}
             </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden max-h-[calc(100vh-64px)]">
        <aside className="w-80 bg-slate-900 border-r border-cyan-900/30 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="p-6 space-y-8">
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Input & Trace</h2>
               </div>

               <div onClick={() => masterInputRef.current?.click()} className="group border border-cyan-700/50 bg-cyan-900/10 hover:bg-cyan-900/20 p-4 rounded-lg cursor-pointer transition-all flex flex-col items-center gap-2 text-center">
                 <div className="p-2 bg-cyan-500/20 rounded-full group-hover:bg-cyan-500/30 transition-colors">
                   <Scissors size={20} className="text-cyan-400" />
                 </div>
                 <div>
                   <span className="block text-sm font-bold text-cyan-100">Upload Master Blueprint</span>
                   <span className="text-[10px] text-cyan-400/70">Manual Crop Tool</span>
                 </div>
                 <input type="file" ref={masterInputRef} onChange={handleMasterUpload} className="hidden" accept="image/*" />
               </div>

               <div className="grid grid-cols-2 gap-2 mt-2">
                 {/* TOP VIEW CELL */}
                 <div onClick={() => topInputRef.current?.click()} className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden ${topImage ? 'border-green-500/50 bg-green-900/10' : 'border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800'}`}>
                   {topImage ? (
                     <>
                      <img src={`data:image/png;base64,${topImage}`} alt="Top" className="w-full h-full object-contain p-1 opacity-80" />
                      {topTrace.length > 0 && <TracePreview data={topTrace} color="#4ade80" />}
                     </>
                   ) : (
                     <>
                       <Upload className="text-slate-500 mb-1" size={20} />
                       <span className="text-[10px] text-slate-400 font-mono">TOP VIEW</span>
                     </>
                   )}
                   <input type="file" ref={topInputRef} onChange={(e) => handleFileChange(e, 'top')} className="hidden" accept="image/*" />
                   {topImage && (
                     <div className="absolute top-1 left-1 flex gap-1">
                       <div className="bg-green-900/80 px-1 rounded text-[8px] font-mono text-green-400">PLAN</div>
                     </div>
                   )}
                   {topTrace.length > 0 && (
                     <button onClick={(e) => { e.stopPropagation(); toggleTraceOrientation('top'); }} className="absolute bottom-1 right-1 p-1 bg-slate-900/80 rounded hover:bg-slate-700 text-green-400" title="Flip Bow/Stern">
                       <ArrowLeftRight size={12} />
                     </button>
                   )}
                 </div>

                 {/* SIDE VIEW CELL */}
                 <div onClick={() => sideInputRef.current?.click()} className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden ${sideImage ? 'border-amber-500/50 bg-amber-900/10' : 'border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800'}`}>
                   {sideImage ? (
                      <>
                        <img src={`data:image/png;base64,${sideImage}`} alt="Side" className="w-full h-full object-contain p-1 opacity-80" />
                        {sideTrace.length > 0 && <TracePreview data={sideTrace} color="#fbbf24" vertical={true} />}
                      </>
                   ) : (
                     <>
                       <FileImage className="text-slate-500 mb-1" size={20} />
                       <span className="text-[10px] text-slate-400 font-mono">SIDE VIEW</span>
                     </>
                   )}
                   <input type="file" ref={sideInputRef} onChange={(e) => handleFileChange(e, 'side')} className="hidden" accept="image/*" />
                    {sideImage && (
                     <div className="absolute top-1 left-1 flex gap-1">
                        <div className="bg-amber-900/80 px-1 rounded text-[8px] font-mono text-amber-400">PROFILE</div>
                     </div>
                    )}
                    {sideTrace.length > 0 && (
                     <button onClick={(e) => { e.stopPropagation(); toggleTraceOrientation('side'); }} className="absolute bottom-1 right-1 p-1 bg-slate-900/80 rounded hover:bg-slate-700 text-amber-400" title="Flip Bow/Stern">
                       <ArrowLeftRight size={12} />
                     </button>
                   )}
                 </div>
               </div>
               
               <button onClick={handleAnalyze} disabled={!topImage || state.isAnalyzing} className="w-full py-2 bg-slate-800 border border-slate-600 text-slate-200 rounded hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-mono flex items-center justify-center gap-2 transition-colors">
                 {state.isAnalyzing ? <RefreshCw className="animate-spin" size={14} /> : <ScanLine size={14} />}
                 TRACE & ANALYZE
               </button>
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mesh Controls</h2>
              <ParameterControls params={params} setParams={setParams} disabled={state.isGenerating || state.isAnalyzing} />
            </div>
            
            <div className="pt-4 border-t border-slate-800">
               <button onClick={handleGenerate} disabled={!hasTraced || state.isGenerating} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
                 {state.isGenerating ? (<><RefreshCw className="animate-spin" />LOFTING HULL...</>) : (<><Play fill="currentColor" />GENERATE MESH</>)}
               </button>
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col min-w-0 bg-slate-950/50">
          <div className="h-10 border-b border-cyan-900/30 flex items-center px-4 justify-between bg-slate-900/50">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={`w-2 h-2 rounded-full ${state.isGenerating || state.isAnalyzing || state.isSampling ? 'bg-amber-400 animate-pulse' : 'bg-cyan-500'}`}></span>
              <span className="text-cyan-400">{state.step || 'SYSTEM READY'}</span>
            </div>
            {(state.progress > 0 && state.progress < 100) && (
                <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${state.progress}%` }} />
                </div>
            )}
          </div>

          {error && (
            <div className="bg-red-900/20 border-l-4 border-red-500 p-4 mx-6 mt-6 flex items-start gap-3">
              <AlertCircle className="text-red-400 shrink-0" />
              <div>
                <h3 className="text-red-400 font-bold text-sm">Operation Failed</h3>
                <p className="text-red-200 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-y-auto">
            <div className="col-span-12 lg:col-span-4 space-y-6">
               <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-1 overflow-hidden h-full min-h-[400px]">
                 <div className="bg-slate-800/50 px-4 py-2 border-b border-slate-700 mb-4">
                   <h3 className="font-mono text-xs text-cyan-400 font-bold uppercase">Geometric Trace Data</h3>
                 </div>
                 <div className="px-4 pb-4 h-full">
                   {hasTraced ? (
                       <AnalysisDisplay data={analysisData} params={params} loading={state.isAnalyzing} />
                   ) : (
                       <div className="flex flex-col items-center justify-center text-slate-500 h-64 text-center">
                           <ScanLine size={32} className="mb-2 opacity-50" />
                           <p className="text-sm">Upload images and click <br/>"TRACE & ANALYZE"</p>
                       </div>
                   )}
                 </div>
               </div>
            </div>

            <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden relative group min-h-[500px]">
                    <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none z-0"></div>
                    {!resultImage && !state.isGenerating && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-10">
                            <Hexagon size={64} strokeWidth={1} />
                            <p className="mt-4 font-mono text-sm">AWAITING MESH GENERATION</p>
                        </div>
                    )}
                    {resultImage && (
                        <div className="relative w-full h-full z-10">
                             <img src={resultImage} alt="3D Result" className="w-full h-full object-contain p-8 animate-fade-in" />
                             <div className="absolute bottom-4 right-4 flex gap-2">
                                <button onClick={handleExportObj} className="p-2 bg-slate-900/80 hover:bg-cyan-600 text-white rounded border border-slate-600 hover:border-cyan-400 transition-colors flex items-center gap-2 px-4" title="Export 3D Mesh (.OBJ)">
                                    <Box size={18} />
                                    <span className="text-xs font-bold">EXPORT .OBJ</span>
                                </button>
                                <a href={resultImage} download="navalforge-visual.png" className="p-2 bg-slate-900/80 hover:bg-cyan-600 text-white rounded border border-slate-600 hover:border-cyan-400 transition-colors" title="Download Render Image">
                                    <Download size={20} />
                                </a>
                             </div>
                        </div>
                    )}
                    {state.isGenerating && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                            <div className="relative">
                                <Hexagon size={64} className="text-cyan-500 animate-spin" strokeWidth={1} />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs font-mono text-cyan-200">{state.progress}%</span>
                                </div>
                            </div>
                            <p className="mt-6 text-cyan-400 font-mono text-sm animate-pulse">{state.step}</p>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
