// backend/services/textract.ts
import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  Block,
} from "@aws-sdk/client-textract";

let textract: TextractClient | null = null;

function ensureTextract() {
  const region = process.env.AWS_REGION || "us-west-1";
  if (!textract) textract = new TextractClient({ region });
  return textract;
}

export async function startAnalysis(bucket: string, key: string): Promise<string> {
  if (!bucket || !key) throw new Error("startAnalysis: bucket/key required");
  const client = ensureTextract();

  const cmd = new StartDocumentAnalysisCommand({
    DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
    FeatureTypes: ["TABLES", "FORMS"], // add "LAYOUT" if you want page-level structure
  });

  const out = await client.send(cmd);
  if (!out.JobId) throw new Error("Textract did not return a JobId");
  return out.JobId;
}

export async function getAnalysis(jobId: string): Promise<{ status: string; blocks: Block[] }> {
  const client = ensureTextract();

  let blocks: Block[] = [];
  let nextToken: string | undefined = undefined;

  // first call to get status
  let resp = await client.send(new GetDocumentAnalysisCommand({ JobId: jobId }));
  const status = resp.JobStatus ?? "UNKNOWN";

  if (status !== "SUCCEEDED") {
    // Early return to let the caller keep polling (or handle FAILED)
    return { status, blocks: [] };
  }

  // If SUCCEEDED, page through all results
  while (true) {
    if (nextToken) {
      resp = await client.send(new GetDocumentAnalysisCommand({ JobId: jobId, NextToken: nextToken }));
    }
    if (resp.Blocks) blocks.push(...resp.Blocks);
    if (!resp.NextToken) break;
    nextToken = resp.NextToken;
  }

  return { status: "SUCCEEDED", blocks };
}
