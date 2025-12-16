# Logging & Observability: The Flight Recorder

## 1. Goal
To transform the "Magic" of AI generation into an engineering process we can debug, refine, and trust. We need to capture the **Decision Tree** of the AI and the **Visual States** of the Computer Vision (CV) tools.

## 2. The `TelemetryEvent` Schema

We will use a structured JSON log format for all events. This allows us to visualize the process timeline later.

```typescript
type EventSource = 'AI_AGENT' | 'VISION_KERNEL' | 'USER_INTERACTION' | 'SYSTEM';

interface TelemetryEvent {
  id: string;
  timestamp: number;
  source: EventSource;
  type: string; 
  payload: any;
  // Crucial: Snapshot of the visual state at this moment
  snapshotRef?: string; // ID or Base64 reference to the Canvas state
}
```

### Event Types

#### A. `AI_THOUGHT`
Captures the reasoning process before an action is taken.
*   *Payload*: `{ prompt_summary: string, reasoning: string, confidence: number }`
*   *UI Rep*: A "Thoughts" terminal that types out as the AI thinks.

#### B. `TOOL_EXECUTION`
Captures the invocation of a client-side tool.
*   *Payload*: `{ tool_name: "detectHullBoundary", parameters: { threshold: 125, blur: 2 } }`
*   *UI Rep*: The "Configuration Panel" sliders visibly moving to match these parameters.

#### C. `VISUAL_INTERMEDIATE`
Captures the output of a CV operation.
*   *Payload*: `{ vector_count: 450, bounding_box: [...] }`
*   *Snapshot*: A low-res thumbnail of the binary mask produced by the edge detector.

## 3. The "Flight Recorder" UI

The application will feature a collapsible **Telemetry Drawer** (or "Log Console") at the bottom of the screen.

### Features
1.  **Timeline View**: A horizontal scrubber showing the sequence of events.
2.  **State Inspection**: Clicking an event (e.g., "Step 3: Edge Detection") restores the main viewport to show exactly what the Computer Vision engine "saw" at that moment (e.g., the black-and-white Sobel filter output).
3.  **Diff View**: Overlaying the AI's *intended* selection (Red Line) vs. the *User's* manual correction (Green Line).

## 4. Retrospective Analysis (The "Black Box")

At the end of a session, the user (or developer) can download a `.navaljson` file. This contains:
1.  The original Blueprint.
2.  The full array of `TelemetryEvents`.
3.  The final 3D Mesh.

**Usage**: If a user reports "The bow shape is wrong," they send us this file. We can replay the session, see that the AI chose `threshold: 50` (too low), and adjust our system instructions to favor higher thresholds for noisy blueprints.

## 5. Implementation Strategy
*   Use a React Context (`TelemetryContext`) to act as the central bus.
*   Wrap the `GeminiService` and `VisionKernel` in proxies that automatically dispatch events to this bus.
*   Persist the last 5 minutes of visual snapshots in memory (Canvas blobs) to allow scrubbing.
