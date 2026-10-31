export type FailureDiagnostic = {
  kind: "external_model" | "response_parse" | "response_return";
  stage: string; reason: string; diagnostic_id: string; retryable: boolean;
};

export function parseFailure(value: unknown): FailureDiagnostic | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as Record<string, unknown>;
  if (!["external_model", "response_parse", "response_return"].includes(String(item.kind))
      || typeof item.stage !== "string" || !/^[a-z_]{1,64}$/.test(item.stage)
      || typeof item.reason !== "string" || !/^[a-z_]{1,64}$/.test(item.reason)
      || typeof item.diagnostic_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.diagnostic_id)
      || typeof item.retryable !== "boolean") return;
  return { kind: item.kind as FailureDiagnostic["kind"], stage: item.stage, reason: item.reason,
    diagnostic_id: item.diagnostic_id, retryable: item.retryable };
}

export function failureOf(error: unknown): FailureDiagnostic | undefined {
  return error && typeof error === "object" && "failure" in error ? parseFailure(error.failure) : undefined;
}

export function withClientFailure(error: unknown, stage: string, reason: string, diagnosticId: string): Error {
  const failure: FailureDiagnostic = { kind: "response_return", stage, reason, diagnostic_id: diagnosticId, retryable: true };
  // Log metadata only: never request bodies, transcript, audio, credentials or arbitrary error messages.
  console.warn("SerboTalk request failure", failure);
  return Object.assign(error instanceof Error || error instanceof DOMException ? error : new Error("Request failed"), { failure });
}
