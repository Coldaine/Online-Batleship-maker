import { GoogleGenAI, Type } from "@google/genai";
import { ShipParameters, AnalysisData } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates a sample vector blueprint.
 * Can be used for a specific ship class (Preset) or a generic sample.
 */
export const generateSampleBlueprint = async (shipClass?: string): Promise<string> => {
  try {
    const prompt = shipClass 
      ? `A precise technical top-down blueprint plan view of the ${shipClass}. High contrast white vector lines on a standard naval blue background. Detailed deck layout including main turrets and superstructure. Schematic style.`
      : "A high-contrast technical 2D vector line drawing of a generic WW2 battleship top-down view (plan view). White vector lines on a solid dark blue blueprint background. Simple, clean, schematic style.";

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: prompt }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated for sample");
  } catch (error) {
    console.error("Sample generation failed:", error);
    throw error;
  }
};

/**
 * Helper to clean JSON strings that might be wrapped in Markdown
 */
const cleanJsonString = (str: string): string => {
  return str.replace(/```json\n?|\n?```/g, "").trim();
};

/**
 * Analyzes the 2D blueprint to extract technical details.
 * Uses Google Search to ground the analysis in real-world data if a match is found.
 */
export const analyzeBlueprint = async (base64Image: string): Promise<AnalysisData> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png", 
              data: base64Image
            }
          },
          {
            text: `Analyze this naval blueprint. 
            1. Identify the specific ship class (e.g., Yamato, Iowa, Bismarck) if possible.
            2. If a class is identified, use Google Search to find its standard physical dimensions (Length, Beam, Draft).
            3. Estimate the armament and design era.
            4. CRITICAL: Analyze the visual layout for 3D reconstruction.
               - Locate the centerpoints of main battery turrets along the length (0.0 = Stern/Left, 1.0 = Bow/Right).
               - Locate the start and end points of the main superstructure block (0.0 to 1.0).
            
            Return the data in JSON format.`
          }
        ]
      },
      config: {
        tools: [{googleSearch: {}}],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shipClass: { type: Type.STRING },
            estimatedLength: { type: Type.STRING },
            armament: { type: Type.ARRAY, items: { type: Type.STRING } },
            designYear: { type: Type.STRING },
            description: { type: Type.STRING },
            realDimensions: {
              type: Type.OBJECT,
              properties: {
                length: { type: Type.NUMBER, description: "Length in meters" },
                beam: { type: Type.NUMBER, description: "Beam/Width in meters" },
                draft: { type: Type.NUMBER, description: "Draft in meters" }
              }
            },
            geometry: {
              type: Type.OBJECT,
              description: "Normalized coordinates for 3D reconstruction (0.0 to 1.0)",
              properties: {
                turrets: { 
                  type: Type.ARRAY, 
                  items: { type: Type.NUMBER },
                  description: "List of normalized X-positions (0-1) for main turrets"
                },
                superstructure: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.NUMBER },
                    end: { type: Type.NUMBER }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (response.text) {
      // Clean up potential markdown formatting before parsing
      const cleanJson = cleanJsonString(response.text);
      return JSON.parse(cleanJson) as AnalysisData;
    }
    throw new Error("No analysis data returned");
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

/**
 * Generates a 3D visualization by simulating a technical 3D modeling pipeline.
 * Uses Search Grounding to find reference meshes for identified ships.
 */
export const generate3DView = async (
  topView: string, 
  sideView: string | null, 
  params: ShipParameters,
  shipClassContext?: string
): Promise<string> => {
  try {
    const parts = [];
    
    // Add Top View
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: topView
      }
    });

    // Add Side View if available
    if (sideView) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: sideView
        }
      });
    }

    const modelingTechniqueDescription = `
      **NAVAL ARCHITECTURE & HULL TOPOLOGY PROTOCOL:**
      
      **Phase 1: Vector Alignment**
      - Align the Top View (Breadth) and Side View (Depth) to establish the bounding box.
      - **Dimensions**: Length: ${params.dimensions.length}m | Beam: ${params.dimensions.beam}m | Draft: ${params.dimensions.draft}m.
      
      **Phase 2: Hull Form Inference (Crucial Step)**
      Since the blueprint lacks a Body Plan (cross-sections), you must synthesize the underwater geometry using these rules:
      1.  **Midship Coefficient**: Assume a high Block Coefficient (>0.60). The midship section should be "Box-like" with a flat bottom (0° deadrise) and a distinct **Bilge Radius** (turn of the bilge), transitioning to vertical sides. Do NOT create a simple cylinder or canoe shape.
      2.  **Bulbous Bow**: If the ship appears to be a WW2-era battleship (like Yamato or Iowa), generate a **Bulbous Bow** protrusion below the waterline to reduce wave resistance.
      3.  **Stern Skegs**: Taper the hull aft into structural **Skegs** to support the propeller shafts, rather than a smooth taper.
      4.  **Flare**: Apply significant outward curvature (Flare) to the bow section above the waterline.
      
      **Phase 3: Superstructure Lofting**
      - Extrude the "Castle" or "Pagoda" mast structures vertically based on the Side View silhouette.
      - Ensure armor belts and barbettes (turret mounts) are cylindrical.
      
      **Phase 4: Refining Details**
      - **Context Search**: Use Google Search to verify the "Hull Lines" of ${shipClassContext || 'Standard Battleship'} to ensure the curvature is historically plausible.
      - **Turrets**: Place ${params.turretScale}% scale turrets on the centerline barbettes.
      
      **Phase 5: Rendering**
      - View: Isometric (showing both deck layout and hull depth).
      - Style: ${params.modelStyle}.
      - Waterline: Visible indication of where the draft line sits.
    `;

    const prompt = `
      Generate a technically accurate 3D naval model from these 2D blueprints.
      
      Input Sources:
      - Image 1: Top/Plan View
      ${sideView ? '- Image 2: Side/Profile View' : ''}
      
      Execution Instructions:
      ${modelingTechniqueDescription}
    `;

    parts.push({ text: prompt });

    // Using gemini-3-pro-image-preview for high fidelity and search capability
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview", 
      contents: {
        parts: parts
      },
      config: {
        tools: [{googleSearch: {}}], // Enable search for "Refinement" step
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "2K"
        }
      }
    });

    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Generation failed:", error);
    throw error;
  }
};
