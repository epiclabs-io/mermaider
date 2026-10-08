export interface StoreConfig {
  publisherId: string;
  extensionId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface StoreResponse {
  access_token?: string;
  uploadState?: string;
  lastAsyncUploadState?: string;
  state?: string;
}

export async function publishStore(
  config: StoreConfig,
  zip: Uint8Array,
  request: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<string> {
  const oauth = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!oauth.ok) {
    throw new Error(`OAuth token refresh failed (HTTP ${oauth.status})`);
  }
  const token = ((await oauth.json()) as StoreResponse).access_token;
  if (!token) {
    throw new Error("OAuth response did not contain an access token");
  }
  const resource = `publishers/${encodeURIComponent(config.publisherId)}/items/${encodeURIComponent(config.extensionId)}`;
  const base = `https://chromewebstore.googleapis.com/v2/${resource}`;
  const authorization = `Bearer ${token}`;
  const upload = await request(
    `https://chromewebstore.googleapis.com/upload/v2/${resource}:upload?uploadType=media`,
    {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/zip" },
      body: new Blob([new Uint8Array(zip)]),
      signal: AbortSignal.timeout(120_000),
    }
  );
  if (!upload.ok) {
    throw new Error(`Chrome Web Store upload failed (HTTP ${upload.status})`);
  }
  let state = ((await upload.json()) as StoreResponse).uploadState;
  for (let attempt = 0; state === "IN_PROGRESS" && attempt < 24; attempt++) {
    await wait(5_000);
    const status = await request(`${base}:fetchStatus`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(30_000),
    });
    if (!status.ok) {
      throw new Error(`Upload status check failed (HTTP ${status.status})`);
    }
    state = ((await status.json()) as StoreResponse).lastAsyncUploadState;
  }
  if (state !== "SUCCEEDED") {
    throw new Error(`Chrome Web Store upload did not succeed: ${state}`);
  }
  const publish = await request(`${base}:publish`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!publish.ok) {
    throw new Error(
      `Chrome Web Store publish failed (HTTP ${publish.status}); check the developer dashboard`
    );
  }
  const published = ((await publish.json()) as StoreResponse).state;
  if (!published || !["PENDING_REVIEW", "PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(published)) {
    throw new Error(`Chrome Web Store submission was not accepted: ${published}`);
  }
  return published;
}
