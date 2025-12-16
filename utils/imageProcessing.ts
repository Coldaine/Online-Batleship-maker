
/**
 * Scans a side-view image to extract the top profile (Sheer Line).
 * Returns an array of normalized heights (0.0 to 1.0) along the X-axis.
 */
export const extractSilhouette = async (base64Image: string, samples: number): Promise<number[]> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64Image}`;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // We scale the image to the number of samples for easy column mapping
      canvas.width = samples;
      canvas.height = 100; // Normalized height resolution
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(new Array(samples).fill(0));
        return;
      }

      // Draw image to fill canvas (stretch is acceptable for profile extraction)
      ctx.drawImage(img, 0, 0, samples, 100);
      
      const imgData = ctx.getImageData(0, 0, samples, 100);
      const data = imgData.data;
      const profile: number[] = [];

      // Scan each column
      for (let x = 0; x < samples; x++) {
        let firstOpaqueY = 100;
        
        // Scan from top down to find first non-transparent pixel
        for (let y = 0; y < 100; y++) {
          const alphaIndex = (y * samples + x) * 4 + 3;
          if (data[alphaIndex] > 128) { // Threshold
            firstOpaqueY = y;
            break;
          }
        }
        
        // Convert Y coordinate to normalized height (0 at bottom, 1 at top)
        // If firstOpaqueY is 100 (empty column), height is 0
        const height = (100 - firstOpaqueY) / 100;
        profile.push(height);
      }
      
      resolve(profile);
    };

    img.onerror = () => {
      resolve(new Array(samples).fill(0)); // Return flat profile on error
    };
  });
};
