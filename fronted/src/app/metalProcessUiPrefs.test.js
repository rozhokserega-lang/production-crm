import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readMetalUiPrefs, writeMetalUiPrefs } from "./metalProcessUiPrefs";

describe("metalProcessUiPrefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when storage is empty", () => {
    expect(readMetalUiPrefs()).toEqual({ subView: "plan", productionTab: "laser" });
  });

  it("persists and restores sub view and production tab", () => {
    writeMetalUiPrefs({ subView: "production", productionTab: "welding" });
    expect(readMetalUiPrefs()).toEqual({ subView: "production", productionTab: "welding" });
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem("crm_metal_process_ui_v1", JSON.stringify({
      subView: "unknown",
      productionTab: "bad",
    }));
    expect(readMetalUiPrefs()).toEqual({ subView: "plan", productionTab: "laser" });
  });
});
