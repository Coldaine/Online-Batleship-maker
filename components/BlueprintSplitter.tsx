import React, { useState, useRef, useEffect } from 'react';
import { Crop, Check, X, ArrowLeftRight, Scissors } from 'lucide-react';

interface Props {
  imageSrc: string;
  onComplete: (topView: string, sideView: string) => void;
  onCancel: () => void;
}

interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: 'Top' | 'Side';
}

export const BlueprintSplitter: React.FC<Props> = ({ imageSrc, onComplete, onCancel }) => {
  const [crops, setCrops] = useState<CropRegion[]>([]);
  const [currentDrag, setCurrentDrag] = useState<{ startX: number; startY: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Heuristic to guess which is Top vs Side
  const autoClassify = (regions: CropRegion[]) => {
    if (regions.length !== 2) return regions;
    
    // Logic: Side views usually have more vertical variance (superstructure towers) 
    // but less overall pixel mass density than a solid hull plan view.
    // Simple heuristic: In standard naval layouts, Side is often above Top.
    // Also, Top view (Plan) is often "fatter" (Beam) than the side view's hull height (Freeboard),
    // although the Side view includes masts which makes it tall.
    
    const [r1, r2] = regions;
    
    // Check 1: Vertical Position (Standard format often puts Profile above Plan)
    const r1IsUpper = r1.y < r2.y;
    
    // Check 2: Aspect Ratio (Side views with masts are often taller relative to their length than top views)
    const r1Ratio = r1.height / r1.width;
    const r2Ratio = r2.height / r2.width;
    
    // Apply logic: The "Taller" aspect ratio is likely the Side view (due to masts/funnels)
    if (r1Ratio > r2Ratio) {
      r1.label = 'Side';
      r2.label = 'Top';
    } else {
      r1.label = 'Top';
      r2.label = 'Side';
    }
    
    return [r1, r2];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (crops.length >= 2) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentDrag({ startX: x, startY: y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!currentDrag || !mousePos) return;
    
    const width = Math.abs(mousePos.x - currentDrag.startX);
    const height = Math.abs(mousePos.y - currentDrag.startY);
    const x = Math.min(mousePos.x, currentDrag.startX);
    const y = Math.min(mousePos.y, currentDrag.startY);

    if (width > 20 && height > 20) {
      const newCrop = { x, y, width, height };
      const updatedCrops = [...crops, newCrop];
      
      if (updatedCrops.length === 2) {
        autoClassify(updatedCrops);
      }
      
      setCrops(updatedCrops);
    }
    
    setCurrentDrag(null);
  };

  const cropImage = (crop: CropRegion): string => {
    const canvas = document.createElement('canvas');
    const img = imgRef.current;
    if (!img) return '';

    // Calculate scaling factor between displayed image and natural image size
    const rect = containerRef.current!.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(
        img,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
    // Return base64 without prefix for consistency with App.tsx
    return canvas.toDataURL('image/png').split(',')[1];
  };

  const handleFinish = () => {
    const topCrop = crops.find(c => c.label === 'Top');
    const sideCrop = crops.find(c => c.label === 'Side');

    if (topCrop && sideCrop) {
      onComplete(cropImage(topCrop), cropImage(sideCrop));
    }
  };

  const swapLabels = () => {
    if (crops.length !== 2) return;
    const newCrops = [...crops];
    const temp = newCrops[0].label;
    newCrops[0].label = newCrops[1].label;
    newCrops[1].label = temp;
    setCrops(newCrops);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur flex flex-col items-center justify-center p-8">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-5xl h-[90vh] flex flex-col">
        
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Scissors className="text-cyan-400" />
              Blueprint Separation Tool
            </h2>
            <p className="text-sm text-slate-400">
              {crops.length === 0 && "Step 1: Draw a box around the first view (e.g. Top View)."}
              {crops.length === 1 && "Step 2: Draw a box around the second view (e.g. Side View)."}
              {crops.length === 2 && "Step 3: Verify labels and confirm."}
            </p>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-800 rounded">
            <X className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative bg-slate-800/50 rounded-lg border border-slate-700 flex items-center justify-center select-none"
             ref={containerRef}
             onMouseDown={handleMouseDown}
             onMouseMove={handleMouseMove}
             onMouseUp={handleMouseUp}
             onMouseLeave={() => setCurrentDrag(null)}
        >
          <img 
            ref={imgRef}
            src={imageSrc} 
            className="max-w-full max-h-full pointer-events-none select-none"
            alt="Master Blueprint" 
          />
          
          {/* Render Crops */}
          {crops.map((crop, i) => (
            <div
              key={i}
              className={`absolute border-2 bg-cyan-500/10 backdrop-contrast-125 flex items-center justify-center
                ${crop.label === 'Top' ? 'border-green-400' : 'border-amber-400'}`}
              style={{
                left: crop.x,
                top: crop.y,
                width: crop.width,
                height: crop.height
              }}
            >
              <span className={`px-2 py-1 text-xs font-bold text-black rounded shadow
                 ${crop.label === 'Top' ? 'bg-green-400' : 'bg-amber-400'}`}>
                {crop.label || `Region ${i+1}`}
              </span>
            </div>
          ))}

          {/* Render Active Drag */}
          {currentDrag && mousePos && (
             <div
               className="absolute border-2 border-cyan-500 border-dashed bg-cyan-500/5 pointer-events-none"
               style={{
                 left: Math.min(mousePos.x, currentDrag.startX),
                 top: Math.min(mousePos.y, currentDrag.startY),
                 width: Math.abs(mousePos.x - currentDrag.startX),
                 height: Math.abs(mousePos.y - currentDrag.startY)
               }}
             />
          )}
        </div>

        <div className="mt-6 flex justify-between items-center">
          <button 
            onClick={() => setCrops([])} 
            className="text-slate-400 hover:text-white text-sm underline"
          >
            Reset Selection
          </button>

          <div className="flex gap-4">
            {crops.length === 2 && (
              <button 
                onClick={swapLabels}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600"
              >
                <ArrowLeftRight size={16} />
                Swap Labels
              </button>
            )}
            
            <button 
              onClick={handleFinish}
              disabled={crops.length !== 2}
              className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={18} />
              Process & Split
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
