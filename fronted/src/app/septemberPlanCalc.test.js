import { existsSync } from "node:fs";
import { describe, it } from "vitest";
import run, { SEPTEMBER_PLAN_INPUT_PATH } from "../../scripts/calc-september-plan.mjs";

// Это не юнит-тест, а прогон локальной утилиты: она читает личный xlsx с рабочего стола
// и ПЕРЕЗАПИСЫВАЕТ выходной файл. На сервере (VPS/CI) входного файла нет — пропускаем,
// иначе падает вся сборка деплоя.
const hasInput = existsSync(SEPTEMBER_PLAN_INPUT_PATH);

describe("september plan materials", () => {
  it.skipIf(!hasInput)("fills column D, totals sheet, white Donini strap", async () => {
    await run();
  }, 180000);
});
