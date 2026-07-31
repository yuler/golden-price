import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_THEME,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  resolveTheme,
  themeBootScript,
} from "./theme";

describe("resolveTheme", () => {
  it("prefers an explicit saved theme", () => {
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
  });

  it("falls back to the system preference", () => {
    assert.equal(resolveTheme(null, true), "dark");
    assert.equal(resolveTheme("weird", false), "light");
  });
});

describe("themeBootScript", () => {
  it("embeds the shared storage key and colors", () => {
    const script = themeBootScript();
    assert.match(script, new RegExp(THEME_STORAGE_KEY));
    assert.match(script, new RegExp(THEME_COLORS.dark));
    assert.match(script, new RegExp(THEME_COLORS.light));
    assert.equal(DEFAULT_THEME, "dark");
  });
});
