// src/mastra/index.ts
import { Mastra } from "@mastra/core/mastra";
import { createLogger } from "@mastra/core/logger";
import { estimatorAgent } from "./agents/estimatorAgent";
import { rfiSummaryWorkflow } from "./workflows/rfiSummary";

export const mastra = new Mastra({
  agents: { estimatorAgent },
  workflows: { rfiSummary: rfiSummaryWorkflow },
  logger: createLogger({ name: "Mastra", level: "info" }),
});
