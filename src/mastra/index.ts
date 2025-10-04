// src/mastra/index.ts
import { Mastra } from "@mastra/core/mastra";
import { createLogger } from "@mastra/core/logger";
import { rfiSummaryWorkflow } from "./workflows/rfiSummary";

export const mastra = new Mastra({
  agents: { },
  workflows: { rfiSummary: rfiSummaryWorkflow },
  logger: createLogger({ name: "Mastra", level: "info" }),
});
