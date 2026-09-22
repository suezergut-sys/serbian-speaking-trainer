import { afterEach, describe, expect, it } from "vitest";

import { apiUrl, getApiBaseUrl, setApiBaseUrl } from "../api/baseUrl";

describe("mobile API base URL", () => {
  afterEach(() => window.localStorage.clear());

  it("keeps browser requests relative by default", () => {
    expect(getApiBaseUrl()).toBe("");
    expect(apiUrl("/api/health")).toBe("/api/health");
  });

  it("stores a normalized shared backend URL", () => {
    setApiBaseUrl("https://trainer.example.com///");

    expect(getApiBaseUrl()).toBe("https://trainer.example.com");
    expect(apiUrl("/api/topics")).toBe("https://trainer.example.com/api/topics");
  });

  it("rejects non-http endpoints", () => {
    expect(() => setApiBaseUrl("javascript:alert(1)")).toThrow();
  });
});
