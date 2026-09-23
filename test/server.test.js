import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("serves a secured health endpoint", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "riverroom-health-"));
  process.env.DATA_DIR = dataDirectory;

  const { startServer, stopServer } = await import("../src/server.js");
  const port = await startServer(0);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  } finally {
    await stopServer();
    await rm(dataDirectory, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  }
});
