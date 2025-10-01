import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/** Lookup company SOPs, prior quotes, price lists, etc. Return snippets for grounding. */
export const ragSearchTool = createTool({
  id: "sevenm.ragSearch",
  description: "RAG: retrieve relevant context from vector DB for the prompt.",
  inputSchema: z.object({
    query: z.string(),
    topK: z.number().min(1).max(20).default(6),
  }),
  outputSchema: z.object({
    hits: z.array(z.object({ text: z.string(), source: z.string().optional() })),
  }),
  execute: async ({ input }) => {
    // TODO: call Pinecone/Weaviate/Elasticsearch/Couchbase vector store
    return { hits: [] };
  },
});
