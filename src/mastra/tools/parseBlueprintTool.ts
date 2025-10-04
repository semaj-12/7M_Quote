// src/mastra/tools/parseBlueprintTool.ts (replace file contents)
export async function parseBlueprintViaBackend(docId: string, bucket: string, key: string) {
  const resp = await fetch(`/api/dev/normalize-s3/${docId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, key })
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json(); // { bom, estimate, quote }
}
