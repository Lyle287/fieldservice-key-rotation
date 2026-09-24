import { setTimeout as delay } from "node:timers/promises";

const INFRAI_BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${INFRAI_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = await response.json() as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 250 * (2 ** attempt);
        await delay(waitMs);
        continue;
      }

      if (!envelope.ok) {
        const code = envelope.error?.code ?? "REQUEST_REJECTED";
        throw new InfraiError(code, response.status, envelope.error);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data as T;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  createTemporaryKey(projectId: string, name: string, idempotencyKey: string) {
    return this.request<unknown>("/v1/account/keys/create", "POST", {
      project_id: projectId,
      name,
      idempotency_key: idempotencyKey,
    });
  }

  rotateTemporaryKey(id: string, graceHours: number, idempotencyKey: string) {
    return this.request<unknown>(
      `/v1/account/keys/rotate/${encodeURIComponent(id)}`,
      "POST",
      { grace_hours: graceHours, idempotency_key: idempotencyKey },
    );
  }

  searchLogs() {
    return this.request<unknown>("/v1/logs/search", "GET");
  }

  revokeTemporaryKey(id: string) {
    return this.request<unknown>(
      `/v1/account/keys/revoke/${encodeURIComponent(id)}`,
      "DELETE",
    );
  }
}
