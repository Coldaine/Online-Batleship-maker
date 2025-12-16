
/**
 * VisionKernel.ts
 * The "Eyes" of the NavalForge.
 * Responsible for deterministic pixel analysis of ship blueprints.
 */

export interface TraceConfig {
  threshold: number; // 0-255 Luminance cutoff
  smoothing: number; // 0-10 Smoothing factor (moving average)
  isSideView: boolean;
}

/**
 * Scans an image to extract a normalized profile curve.
 * 
 * @param base64Image The source image
 * @param config Parameters for extraction
 * @returns Array of numbers (0.0 to 1.0) representing the shape
 */
export const traceSilhouette = async (
  base64Image: string, 
  config: TraceConfig = { threshold: 200, smoothing: 2, isSideView: false }
): Promise<number[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64Image}`;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const SAMPLES = 100; // Resolution along the Length (Z-axis)
      canvas.width = SAMPLES;
      canvas.height = 100; // Resolution for precision
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject("Could not get canvas context");
        return;
      }

      // 1. Draw and Resize
      ctx.drawImage(img, 0, 0, SAMPLES, 100);
      
      const imgData = ctx.getImageData(0, 0, SAMPLES, 100);
      const data = imgData.data;
      const rawProfile: number[] = [];
      let maxVal = 0;

      // 2. Scan Columns (Iterate along Length)
      for (let x = 0; x < SAMPLES; x++) {
        let minOpaqueY = 100;
        let maxOpaqueY = 0;
        let foundPixels = false;

        for (let y = 0; y < 100; y++) {
          const idx = (y * SAMPLES + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          // Heuristic: Distance from Background (0,0,0 usually if transparent, or paper color)
          // Simplified contrast check
          const bgR = data[0];
          const bgG = data[1];
          const bgB = data[2];
          
          const dist = Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2));
          
          if (dist > 50) { 
            if (y < minOpaqueY) minOpaqueY = y;
            if (y > maxOpaqueY) maxOpaqueY = y;
            foundPixels = true;
          }
        }

        let value = 0;
        if (foundPixels) {
          // Calculate raw thickness/height (0.0 to 1.0 of Image Canvas)
          value = (maxOpaqueY - minOpaqueY) / 100;
        }
        
        if (value > maxVal) maxVal = value;
        rawProfile.push(value);
      }

      // 3. Normalize (Auto-Scale)
      // This ensures that the widest/tallest part of the drawing maps to 
      // the full physical dimension entered by the user (Beam/Draft).
      // Prevents "loose crops" from shrinking the 3D model.
      const normalizedProfile = rawProfile.map(v => maxVal > 0.05 ? v / maxVal : 0);

      // 4. Smoothing (Moving Average)
      const smoothedProfile = [...normalizedProfile];
      if (config.smoothing > 0) {
        for (let i = 0; i < SAMPLES; i++) {
          let sum = 0;
          let count = 0;
          const range = config.smoothing;
          for (let j = -range; j <= range; j++) {
            if (i + j >= 0 && i + j < SAMPLES) {
              sum += normalizedProfile[i + j];
              count++;
            }
          }
          smoothedProfile[i] = sum / count;
        }
      }

      resolve(smoothedProfile);
    };

    img.onerror = () => reject("Failed to load image for tracing");
  });
};
