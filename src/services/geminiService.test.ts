
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeBlueprint } from './geminiService';

// --- MOCK SETUP ---
const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent
      }
    })),
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      ARRAY: 'ARRAY'
    }
  };
});

describe('geminiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid JSON responses correctly', async () => {
    // 1. Setup Mock Response
    const mockResponseData = {
      shipClass: "Yamato",
      realDimensions: { length: 263, beam: 38.9, draft: 11 },
      geometry: { turrets: [0.2, 0.8], superstructure: { start: 0.4, end: 0.6 } }
    };

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(mockResponseData)
    });

    // 2. Execution
    const result = await analyzeBlueprint('fake-base64');

    // 3. Assertion
    expect(result.shipClass).toBe("Yamato");
    expect(result.realDimensions?.length).toBe(263);
  });

  it('cleans Markdown code blocks from JSON', async () => {
    // 1. Setup Mock Response with ```json wrapping
    const rawJson = JSON.stringify({ shipClass: "Bismarck" });
    const markdownResponse = "```json\n" + rawJson + "\n```";

    mockGenerateContent.mockResolvedValue({
      text: markdownResponse
    });

    // 2. Execution
    const result = await analyzeBlueprint('fake-base64');

    // 3. Assertion
    expect(result.shipClass).toBe("Bismarck");
  });

  it('handles empty API responses gracefully', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });
    await expect(analyzeBlueprint('fake')).rejects.toThrow("No analysis data returned");
  });
});
