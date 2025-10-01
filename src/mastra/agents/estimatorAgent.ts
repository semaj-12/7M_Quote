import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai"; // or your provider

export const estimatorAgent = new Agent({
  id: "agent.estimator",
  model: openai("gpt-4o-mini"), // pick model you use
  instructions: `
You are 7M Quote's estimator copilot. 
- Summarize RFIs, highlight risks, due dates, missing info.
- Use provided context only. If unsure, say so.
- Output: short brief with bullets + a table of RFIs (id, subject, status, due).
`,
  tools: [], // tools can also be attached here if you want the agent to call them directly
});
