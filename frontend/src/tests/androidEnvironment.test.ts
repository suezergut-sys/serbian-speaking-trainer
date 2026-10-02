import { describe, expect, it } from "vitest";
import { validateAndroidEnvironment } from "../../build/androidEnvironment";

const valid = {
  VITE_API_BASE_URL: "https://api.example.com",
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};

describe("Android release environment", () => {
  it("accepts an explicit public HTTPS backend", () => {
    expect(() => validateAndroidEnvironment(valid)).not.toThrow();
  });
  it.each(["", "/api", "http://10.0.2.2:8000", "https://10.0.2.2:8000", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://user:password@api.example.com", "https://api.example.com?token=fixture"])("rejects unusable release API %s", (url) => {
    expect(() => validateAndroidEnvironment({ ...valid, VITE_API_BASE_URL: url })).toThrow(/Android release requires/);
  });
  it("requires client Auth configuration", () => {
    expect(() => validateAndroidEnvironment({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: "" })).toThrow(/SUPABASE/);
  });
  it.each(["https://", "http://example.supabase.co", "https://localhost", "https://user:password@example.supabase.co"])("rejects invalid Auth URL %s", (url) => {
    expect(() => validateAndroidEnvironment({ ...valid, VITE_SUPABASE_URL: url })).toThrow(/SUPABASE/);
  });
});
