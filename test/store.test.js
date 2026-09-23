import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveDataDirectory } from "../src/store.js";

test("uses the configured persistent data directory", () => {
  assert.equal(
    resolveDataDirectory({ DATA_DIR: "/app/data" }),
    path.resolve("/app/data"),
  );
});

test("falls back to the repository data directory", () => {
  assert.match(resolveDataDirectory({}), /poker-room-app\/data$/);
});
