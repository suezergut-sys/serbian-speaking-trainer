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
