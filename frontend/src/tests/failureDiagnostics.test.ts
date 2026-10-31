import { afterEach, expect, it, vi } from "vitest";
vi.mock("../auth", () => ({ authenticatedFetch: vi.fn() }));
import { authenticatedFetch } from "../auth";
import { fetchReviewSummary, BackendError } from "../api/training";
import { failureOf, parseFailure } from "../api/failureDiagnostics";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

it.each(["external_model", "response_parse", "response_return"])("keeps safe %s details and request correlation", async kind => {
  const id = "49d2c9b9-5978-402b-90d6-3822f88d1ae2";
  const failure = { kind, stage: "structured_output", reason: "invalid_schema", retryable: true, diagnostic_id: id };
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({ detail: { code: "analysis_unavailable", failure } }), { status: 503 }));
  const error = await fetchReviewSummary().catch(value => value);
  expect(error).toBeInstanceOf(BackendError);
  expect(failureOf(error)).toEqual(failure);
  expect(new Headers(vi.mocked(authenticatedFetch).mock.calls[0][1]?.headers).get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
});

it("distinguishes final HTTP JSON decoding from model-output parsing", async () => {
  const id = "49d2c9b9-5978-402b-90d6-3822f88d1ae2";
  vi.mocked(authenticatedFetch).mockResolvedValue(new Response("PRIVATE invalid JSON", { headers: { "X-Request-ID": id } }));
  const error = await fetchReviewSummary().catch(value => value);
  expect(failureOf(error)).toMatchObject({ kind: "response_return", stage: "client_response_decode", reason: "invalid_json", diagnostic_id: id });
});

it("labels a network failure without assuming the external model failed", async () => {
  vi.mocked(authenticatedFetch).mockRejectedValue(new TypeError("PRIVATE network credentials"));
  const error = await fetchReviewSummary().catch(value => value);
  expect(failureOf(error)).toMatchObject({ kind: "response_return", stage: "client_network", reason: "connection" });
});

it("rejects untrusted diagnostic objects instead of rendering arbitrary provider data", () => {
  expect(parseFailure({ kind: "PRIVATE", diagnostic_id: "unsafe" })).toBeUndefined();
  expect(parseFailure({ kind: "external_model", stage: "PRIVATE message with credentials", reason: "timeout", retryable: true, diagnostic_id: "49d2c9b9-5978-402b-90d6-3822f88d1ae2" })).toBeUndefined();
});
