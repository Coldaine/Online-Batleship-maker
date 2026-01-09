
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Basic Computer Vision utilities for Blueprint Analysis.
 * Operates on the Canvas API.
 */

/**
 * Detects distinct islands of non-background pixels in a blueprint.
 * Used to auto-separate Top and Side views.
 */
export const findBlueprintRegions = async (base64Image: string): Promise<Rect[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;

    img.onload = () => {
      // 1. Setup Canvas (Downscale for performance)
      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.floor(img.width * scale);
      const h = Math.floor(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("No context");

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // 2. Binary Map (0 = Background, 1 = Content)
      const binaryMap = new Uint8Array(w * h);

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const luminance = 0.299*r + 0.587*g + 0.114*b;
        // Simple heuristic: Bright pixels are content
        binaryMap[i / 4] = luminance > 100 ? 1 : 0;
      }

      // 3. Find Connected Components / Projections

      // PROJECT TO Y-AXIS (Split Top vs Side)
      const yProjection = new Uint32Array(h);
      for (let y = 0; y < h; y++) {
        let count = 0;
        for (let x = 0; x < w; x++) {
          if (binaryMap[y * w + x]) count++;
        }
        yProjection[y] = count;
      }

      const rows: {start: number, end: number}[] = [];
      let inRow = false;
      let startY = 0;
      const rowThreshold = w * 0.01;

      for (let y = 0; y < h; y++) {
        const hasContent = yProjection[y] > rowThreshold;
        if (hasContent && !inRow) {
          inRow = true;
          startY = y;
        } else if (!hasContent && inRow) {
          inRow = false;
          if (y - startY > h * 0.05) {
            rows.push({ start: startY, end: y });
          }
        }
      }
      if (inRow) rows.push({ start: startY, end: h });

      // PROJECT TO X-AXIS
      const regions: Rect[] = [];
      rows.forEach(row => {
        const rowH = row.end - row.start;
        const xProjection = new Uint32Array(w);
        for (let x = 0; x < w; x++) {
          let count = 0;
          for (let y = row.start; y < row.end; y++) {
            if (binaryMap[y * w + x]) count++;
          }
          xProjection[x] = count;
        }

        let firstX = -1;
        let lastX = -1;
        for (let x = 0; x < w; x++) {
            if (xProjection[x] > (rowH * 0.01)) {
                if (firstX === -1) firstX = x;
                lastX = x;
            }
        }

        if (firstX !== -1 && lastX !== -1) {
             regions.push({
               x: Math.floor(firstX / scale),
               y: Math.floor(row.start / scale),
               width: Math.floor((lastX - firstX) / scale),
               height: Math.floor((row.end - row.start) / scale)
             });
        }
      });

      regions.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      resolve(regions);
    };

    img.onerror = reject;
  });
};

/**
 * Extracts the Hull Profile (Beam width along length) from the Top View.
 * Returns normalized widths [0..1] along the length.
 */
export const extractHullProfile = async (base64Image: string, samples: number = 50): Promise<number[]> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = samples;
            canvas.height = 100; // Resolution for width measurement
            const ctx = canvas.getContext('2d');
            if(!ctx) { resolve([]); return; }

            // Draw scaled down
            ctx.drawImage(img, 0, 0, samples, 100);
            const data = ctx.getImageData(0,0, samples, 100).data;
            const profile: number[] = [];

            // Find max width first to normalize? Or just assume image bounds = max width?
            // Usually top view is cropped to hull, so image width = max beam.

            for(let x=0; x<samples; x++) {
                let firstY = -1;
                let lastY = -1;

                // Scan column
                for(let y=0; y<100; y++) {
                    const idx = (y*samples + x)*4;
                    const lum = (data[idx] + data[idx+1] + data[idx+2])/3;
                    if(lum > 50) { // Threshold
                        if(firstY === -1) firstY = y;
                        lastY = y;
                    }
                }

                let width = 0;
                if(firstY !== -1) {
                    width = (lastY - firstY) / 100;
                }
                profile.push(width);
            }
            resolve(profile);
        };
        img.onerror = () => resolve([]);
    });
};

/**
 * Detects Main Turrets in the Top View using Blob Detection.
 * Returns normalized X positions [0..1].
 */
export const detectTurrets = async (base64Image: string): Promise<number[]> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;
        img.onload = () => {
            const w = 512;
            const h = Math.floor(w * (img.height/img.width));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if(!ctx) { resolve([]); return; }

            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0,0, w, h).data;

            // 1. Binary Map
            const bin = new Uint8Array(w*h);
            for(let i=0; i<data.length; i+=4) {
                const lum = (data[i]+data[i+1]+data[i+2])/3;
                bin[i/4] = lum > 80 ? 1 : 0;
            }

            // 2. Simple Blob Finding (Grid search for centers of mass)
            // Turrets are "large circular blobs" on the centerline.
            const blobs: {x: number, y: number, area: number}[] = [];
            const visited = new Uint8Array(w*h);

            const queue: number[] = [];

            for(let y=0; y<h; y++) {
                for(let x=0; x<w; x++) {
                    const idx = y*w+x;
                    if(bin[idx] && !visited[idx]) {
                        // Start BFS/floodfill
                        let area = 0;
                        let sumX = 0;
                        let sumY = 0;
                        let minX = x, maxX = x, minY = y, maxY = y;

                        queue.push(idx);
                        visited[idx] = 1;

                        while(queue.length > 0) {
                            const curr = queue.pop()!;
                            const cy = Math.floor(curr/w);
                            const cx = curr%w;

                            area++;
                            sumX += cx;
                            sumY += cy;
                            minX = Math.min(minX, cx);
                            maxX = Math.max(maxX, cx);
                            minY = Math.min(minY, cy);
                            maxY = Math.max(maxY, cy);

                            // Neighbors
                            const neighbors = [curr-1, curr+1, curr-w, curr+w];
                            for(const n of neighbors) {
                                if(n >=0 && n < w*h && bin[n] && !visited[n]) {
                                    visited[n] = 1;
                                    queue.push(n);
                                }
                            }
                        }

                        // Check if blob is Turret-like
                        const width = maxX - minX;
                        const height = maxY - minY;
                        const ratio = width/height;
                        const density = area / (width*height);

                        // Constraints:
                        // 1. Aspect ratio ~ 1.0 (Square/Circle)
                        // 2. High density (Solid shape)
                        // 3. Size: Significant relative to image width (e.g. > 2%)
                        if(area > (w*h * 0.002) && ratio > 0.6 && ratio < 1.4 && density > 0.5) {
                            blobs.push({
                                x: sumX/area,
                                y: sumY/area,
                                area
                            });
                        }
                    }
                }
            }

            // 3. Filter Blobs on Centerline
            const centerlineY = h/2;
            const tolerance = h * 0.15; // 15% deviation allowed

            const turretBlobs = blobs.filter(b => Math.abs(b.y - centerlineY) < tolerance);

            // 4. Return normalized X coordinates
            const coords = turretBlobs.map(b => b.x / w).sort((a,b) => a-b);
            resolve(coords);
        };
        img.onerror = () => resolve([]);
    });
};
