import { randomUUID } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.ts";
import { checksFromLogData, decideRotation } from "./rotation_decision.ts";

const rotationRequest = z.object({
  projectId: z.string().min(1),
  temporaryKeyName: z.string().min(1),
  graceHours: z.number().int().min(1).max(168),
  oldKeyMarker: z.string().min(4),
  deployments: z.array(z.string().min(1)).min(1),
  workOrderPhotos: z.array(z.string().url()).max(12),
  credentialOutputPath: z.string().min(1),
});

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function persistOneTimeCredentials(path: string, contents: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(contents, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const infrai = new InfraiClient(apiKey);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/rotate-field-service-key") {
    send(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const input = rotationRequest.parse(await readJson(request));
    const runId = randomUUID();
    const created = await infrai.createTemporaryKey(
      input.projectId,
      input.temporaryKeyName,
      `${runId}:create`,
    );
    const createdRecord = z.object({ key_id: z.string().min(1) }).passthrough().parse(created);

    const rotated = await infrai.rotateTemporaryKey(
      createdRecord.key_id,
      input.graceHours,
      `${runId}:rotate`,
    );
    await persistOneTimeCredentials(input.credentialOutputPath, { created, rotated });

    const logs = await infrai.searchLogs();
    const checks = checksFromLogData(logs, input.deployments, input.oldKeyMarker);
    const decision = decideRotation(checks, input.workOrderPhotos);

    send(response, 200, {
      temporaryKeyId: createdRecord.key_id,
      credentialsStoredAt: input.credentialOutputPath,
      graceHours: input.graceHours,
      ...decision,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        details: error.details,
      });
      return;
    }
    send(response, 500, { error: "service_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Field-service rotation route listening on http://localhost:${port}`);
});
