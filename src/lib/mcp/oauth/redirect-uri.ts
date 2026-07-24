const CURSOR_CALLBACK = "cursor://anysphere.cursor-mcp/oauth/callback";

export function isValidRedirectUri(value: string): boolean {
  if (value === CURSOR_CALLBACK) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

export function validateRedirectUris(values: unknown): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 10) {
    throw new Error("redirect_uris must contain between 1 and 10 values");
  }
  const uris = values.map(String);
  if (!uris.every(isValidRedirectUri)) {
    throw new Error("Every redirect URI must be HTTPS or a supported loopback callback");
  }
  return [...new Set(uris)];
}
