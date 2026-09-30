import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("includes iPhone viewport and safe-area support", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
});

test("keeps mobile controls touch-sized and prevents input zoom", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(css, /\.action-buttons button \{ min-height: 44px/);
  assert.match(css, /\.wager-custom input \{ min-height: 44px; font-size: 16px/);
  assert.match(css, /\.wager-presets button, \.seat-options button \{ min-height: 44px/);
  assert.match(css, /\.settings-form input, \.modal-card input, \.create-card input, \.chat-form input \{ font-size: 16px/);
  assert.match(css, /\.player-cards \.card \{ width: 28px; height: 41px/);
});
