/** Server-side API base URL (Compose: http://api:8000). */
export function getApiInternalUrl(): string {
  const url = (process.env.API_INTERNAL_URL || "").trim();
  return url.replace(/\/$/, "") || "http://127.0.0.1:8000";
}
