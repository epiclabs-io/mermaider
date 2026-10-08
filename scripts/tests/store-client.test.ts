import { expect, test, vi } from "vitest";
import { publishStore } from "../store-client.js";

const config = {
  publisherId: "publisher",
  extensionId: "item",
  clientId: "client",
  clientSecret: "secret",
  refreshToken: "refresh",
};
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

test("refreshes OAuth, waits for upload processing, and submits for automatic publication after review", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ access_token: "access" }))
    .mockResolvedValueOnce(json({ uploadState: "IN_PROGRESS" }))
    .mockResolvedValueOnce(json({ lastAsyncUploadState: "SUCCEEDED" }))
    .mockResolvedValueOnce(json({ state: "PENDING_REVIEW" }));
  const wait = vi.fn().mockResolvedValue(undefined);
  expect(await publishStore(config, new Uint8Array([1, 2]), request, wait)).toBe("PENDING_REVIEW");
  expect(wait).toHaveBeenCalledWith(5000);
  expect(request.mock.calls[1][0]).toContain("/upload/v2/publishers/publisher/items/item:upload");
  expect(request.mock.calls[3][0]).toContain(":publish");
  expect(request.mock.calls[3][1]?.body).toBe(JSON.stringify({ publishType: "DEFAULT_PUBLISH" }));
});

test("failed upload never publishes", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ access_token: "access" }))
    .mockResolvedValueOnce(json({ uploadState: "FAILED" }));
  await expect(publishStore(config, new Uint8Array(), request)).rejects.toThrow(
    "did not succeed: FAILED"
  );
  expect(request).toHaveBeenCalledTimes(2);
});

test("OAuth errors do not expose token-response contents", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json({ refresh_token: "secret-value" }, 401));
  await expect(publishStore(config, new Uint8Array(), request)).rejects.toThrow(
    "OAuth token refresh failed (HTTP 401)"
  );
  expect(request).toHaveBeenCalledTimes(1);
});

test("rejects unsuccessful publication even when HTTP succeeds", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ access_token: "access" }))
    .mockResolvedValueOnce(json({ uploadState: "SUCCEEDED" }))
    .mockResolvedValueOnce(json({ state: "REJECTED" }));
  await expect(publishStore(config, new Uint8Array(), request)).rejects.toThrow(
    "not accepted: REJECTED"
  );
});
