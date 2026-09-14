import { describe, it } from "vitest";
import run from "../../scripts/calc-september-plan.mjs";

describe("september plan materials", () => {
  it("fills column D, totals sheet, white Donini strap", async () => {
    await run();
  }, 180000);
});
