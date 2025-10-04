import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { NORMALIZER_SYSTEM_PROMPT } from "./systemPrompt";
import { validateBomPayload } from "./validator";
import schema from "./bom_payload.schema.json";

const REGION = process.env.AWS_REGION || "us-west-2";
const MODEL_ID = process.env.BEDROCK_MODEL_ID as string;

const br = new BedrockRuntimeClient({ region: REGION });

export async function normalizeWithSonnet(parsedPayload: unknown) {
  if (!MODEL_ID) throw new Error("BEDROCK_MODEL_ID is not set");

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    system: NORMALIZER_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Schema:" },
        { type: "text", text: JSON.stringify(schema) },
        { type: "text", text: "Parsed Payload:" },
        { type: "text", text: JSON.stringify(parsedPayload) }
      ]
    }],
    max_tokens: 2000,
    temperature: 0
  };

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(JSON.stringify(body))
  });

  const resp = await br.send(cmd);
  const json = JSON.parse(new TextDecoder().decode(resp.body as Uint8Array));
  const text = json?.content?.[0]?.text ?? "";
  let out: any;
  try {
    out = JSON.parse(text);
  } catch {
    throw new Error(`Normalizer returned non-JSON. First 200 chars:\n${text.slice(0,200)}`);
  }

  const v = validateBomPayload(out);
  if (!v.ok) throw new Error("Schema validation failed: " + v.errors?.join("; "));
  return out;
}
