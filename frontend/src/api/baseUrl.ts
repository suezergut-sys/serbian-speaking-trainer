import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "serbian-trainer-api-base-url-v2";
const EMULATOR_API_URL = "http://10.0.2.2:8000";

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getDefaultApiBaseUrl(): string {
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "");
  if (configured) return configured;
  return Capacitor.isNativePlatform() ? EMULATOR_API_URL : "";
}

export function getApiBaseUrl(): string {
  const stored = typeof window === "undefined" ? "" : window.localStorage.getItem(STORAGE_KEY) ?? "";
  return normalizeBaseUrl(stored) || getDefaultApiBaseUrl();
}

export function setApiBaseUrl(value: string): void {
  const normalized = normalizeBaseUrl(value);
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error("API URL must start with http:// or https://");
  }
  window.localStorage.setItem(STORAGE_KEY, normalized);
}

export function apiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`;
}
