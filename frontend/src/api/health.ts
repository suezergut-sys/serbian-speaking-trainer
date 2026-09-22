import { apiUrl } from "./baseUrl";

export type HealthResponse = {
  status: "ok";
  service: "serbian-speaking-trainer";
};

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(apiUrl("/api/health"), { signal });
  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}
