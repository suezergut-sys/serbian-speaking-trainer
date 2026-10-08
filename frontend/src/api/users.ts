import { authenticatedFetch } from "../auth";
import type { AdminUser, CurrentUser } from "../types/auth";
import { apiUrl } from "./baseUrl";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await authenticatedFetch(apiUrl(path), { signal });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
  return getJson<CurrentUser>("/api/auth/me", signal);
}

export function fetchAdminUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  return getJson<AdminUser[]>("/api/admin/users", signal);
}

export function fetchModelDebug(signal: AbortSignal): Promise<{ enabled: boolean }> {
  return getJson("/api/admin/model-debug", signal);
}

export async function updateModelDebug(enabled: boolean, signal: AbortSignal): Promise<{ enabled: boolean }> {
  const response = await authenticatedFetch(apiUrl("/api/admin/model-debug"), {
    method: "PATCH", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json();
}

export async function fetchPreferences(signal: AbortSignal): Promise<import("../types/auth").UserPreferences> {
  return getJson("/api/auth/me/preferences", signal);
}

export async function updatePreferences(enabled: boolean, signal: AbortSignal): Promise<import("../types/auth").UserPreferences> {
  const response = await authenticatedFetch(apiUrl("/api/auth/me/preferences"), {
    method: "PATCH", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assistance_enabled: enabled }),
  });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json();
}
