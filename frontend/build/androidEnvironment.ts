export function validateAndroidEnvironment(env: Record<string, string | undefined>): void {
  const api = (env.VITE_API_BASE_URL ?? "").trim();
  let endpoint: URL;
  try { endpoint = new URL(api); }
  catch { throw new Error("Android release requires an absolute HTTPS VITE_API_BASE_URL; web-relative API routing cannot work in an APK."); }
  if (endpoint.protocol !== "https:" || ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(endpoint.hostname)
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Android release requires a public HTTPS API endpoint without credentials, query or fragment.");
  }
  let authEndpoint: URL;
  try { authEndpoint = new URL((env.VITE_SUPABASE_URL ?? "").trim()); }
  catch { throw new Error("Android release requires an absolute HTTPS VITE_SUPABASE_URL."); }
  if (authEndpoint.protocol !== "https:" || ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(authEndpoint.hostname)
    || authEndpoint.username || authEndpoint.password || authEndpoint.search || authEndpoint.hash
    || !(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim()) {
    throw new Error("Android release requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
}
