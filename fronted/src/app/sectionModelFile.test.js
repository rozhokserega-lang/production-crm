import { describe, expect, it } from "vitest";
import { CompressionStream as NodeCompressionStream, DecompressionStream as NodeDecompressionStream } from "node:stream/web";

// jsdom не отдаёт CompressionStream (в браузерах он есть) — берём реализацию из Node,
// чтобы тест проверял тот же путь, что и реальный браузер
if (typeof globalThis.CompressionStream !== "function") {
  globalThis.CompressionStream = NodeCompressionStream;
  globalThis.DecompressionStream = NodeDecompressionStream;
}
import {
  articleCandidatesForOrder,
  buildModelSectionLookup,
  buildUploadPayload,
  decodeStoredModel,
  formatBytes,
  groupArticlesBySection,
  parseModelText,
  readModelFile,
  resolveModelSection,
  resolveModelSectionForOrder,
  splitBase64Parts,
} from "./sectionModelFile";

const VALID = JSON.stringify({
  info: { name: "Авелла тумба" },
  panels: [{ name: "Крышка", thick: 16, poly: [[0, 0], [10, 0], [10, 10]] }],
});

describe("parseModelText", () => {
  it("принимает JSON модели detalQR", () => {
    const m = parseModelText(VALID);
    expect(m.panels).toHaveLength(1);
  });

  it("отклоняет JSON без panels", () => {
    expect(() => parseModelText('{"foo":1}')).toThrow(/panels/);
    expect(() => parseModelText('{"panels":[]}')).toThrow(/panels/);
  });

  it("отклоняет не-JSON", () => {
    expect(() => parseModelText("<xml/>")).toThrow(/не является JSON/);
  });
});

describe("readModelFile", () => {
  it("читает UTF-8 файл модели", async () => {
    const bytes = new TextEncoder().encode(VALID);
    const model = await readModelFile({ arrayBuffer: async () => bytes.buffer });
    expect(model.info.name).toBe("Авелла тумба");
  });

  it("читает cp1251 (классический Базис) — имя секции не превращается в кракозябры", async () => {
    // «Авелла» в windows-1251: C0 E2 E5 EB EB E0
    const json = '{"info":{"name":"\u0410\u0432\u0435\u043b\u043b\u0430"},"panels":[{"name":"x"}]}';
    const utf8 = new TextEncoder().encode(json);
    const cp1251Text = '{"info":{"name":"Авелла"},"panels":[{"name":"x"}]}';
    // кодируем вручную в cp1251 (однобайтовая кодировка для кириллицы)
    const map = { А: 0xc0, в: 0xe2, е: 0xe5, л: 0xeb, а: 0xe0 };
    const cp = new Uint8Array([...cp1251Text].map((ch) => (map[ch] !== undefined ? map[ch] : ch.charCodeAt(0))));
    const model = await readModelFile({ arrayBuffer: async () => cp.buffer });
    expect(model.info.name).toBe("Авелла");
    expect(utf8.length).toBeGreaterThan(0);
  });
});

describe("карта артикул → секция", () => {
  const rows = [
    { article: "gxshrckS1IntEr", section_name: "Ancona" },
    { article: "SP-2E2F08A", section_name: "Donini 806" },
    { article: "SP-2E2F08A", section_name: "Прочее" },
    { article: "", section_name: "Пусто" },
  ];

  it("строит карту в верхнем регистре и не теряет артикулы с разным регистром", () => {
    const lookup = buildModelSectionLookup(rows);
    expect(lookup.byArticle.get("GXSHRCKS1INTER")).toBe("Ancona");
    expect(resolveModelSection("gxshrckS1IntEr", lookup)).toBe("Ancona");
    expect(resolveModelSection("SP-2E2F08A", lookup)).toBe("Donini 806");
  });

  it("возвращает null для неизвестного артикула", () => {
    const lookup = buildModelSectionLookup(rows);
    expect(resolveModelSection("НЕТ-ТАКОГО", lookup)).toBeNull();
    expect(resolveModelSection("", lookup)).toBeNull();
    expect(resolveModelSection("X", null)).toBeNull();
  });

  it("группирует артикулы по секциям (сверка во вкладке «Мебель»)", () => {
    const bySection = groupArticlesBySection(rows);
    expect(bySection.get("Ancona")).toEqual(["gxshrckS1IntEr"]);
    expect(bySection.get("Donini 806")).toEqual(["SP-2E2F08A"]);
    expect(bySection.has("Пусто")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("форматирует КБ и МБ", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(2048)).toBe("2 КБ");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 МБ");
  });
});

describe("резолвер заказа", () => {
  const lookup = buildModelSectionLookup([{ article: "GXCTBLOFTOS", section_name: "ТВ Лофт" }]);

  it("берёт product_article заказа", () => {
    expect(resolveModelSectionForOrder({ product_article: "GXCTBLOFTOS" }, "", lookup)).toBe("ТВ Лофт");
  });

  it("падает на артикул из строки названия, если в заказе поля нет", () => {
    expect(resolveModelSectionForOrder({ item: "Журнальный стол" }, "GXCTBLOFTOS", lookup)).toBe("ТВ Лофт");
  });

  it("список кандидатов без дублей и в верхнем регистре", () => {
    expect(articleCandidatesForOrder({ product_article: "ab-1", article: "AB-1" }, "ab-2")).toEqual(["AB-1", "AB-2"]);
  });

  it("null, если ни один артикул не привязан", () => {
    expect(resolveModelSectionForOrder({ product_article: "НЕТ" }, "ТОЖЕ-НЕТ", lookup)).toBeNull();
  });
});

describe("сжатие модели перед отправкой", () => {
  const model = {
    info: { name: "Авелла тумба" },
    panels: Array.from({ length: 40 }, (_, i) => ({ name: "Деталь " + i, poly: [[0, 0], [100, 0], [100, 50]], thick: 16 })),
  };

  it("упаковывает модель в gzip+base64 (существенно меньше исходного JSON)", async () => {
    const packed = await buildUploadPayload(model);
    expect(packed.compressed).toBe(true);
    expect(packed.payload.p_panels).toBe(40);
    expect(typeof packed.payload.p_model_gz).toBe("string");
    expect(packed.sentBytes).toBeLessThan(packed.rawBytes);
    expect(packed.payload.p_model_json).toBeUndefined();
  });

  it("распаковывает обратно в ту же модель", async () => {
    const packed = await buildUploadPayload(model);
    const back = await decodeStoredModel({ model_gz: packed.payload.p_model_gz });
    expect(back.panels).toHaveLength(40);
    expect(back.info.name).toBe("Авелла тумба");
    expect(back.panels[7].poly[2]).toEqual([100, 50]);
  });

  it("читает и несжатое хранилище (старые записи)", async () => {
    const back = await decodeStoredModel({ model_json: model });
    expect(back.panels).toHaveLength(40);
    expect(await decodeStoredModel(null)).toBeNull();
  });
});

describe("поиск секции по названию изделия (когда артикул в заказе пустой)", () => {
  // реальный случай: заказ SP-03162E56 «Журнальный стол Лофт. Юта», product_article пустой,
  // а в каталоге он привязан к секции «Журнальный стол»
  const lookup = buildModelSectionLookup([
    { article: "GXCTBLOFTUT", item_name: "Журнальный стол Лофт. Юта", section_name: "Журнальный стол" },
    { article: "GXCTBLOFTOS", item_name: "Журнальный стол Лофт. Дуб Сонома", section_name: "Журнальный стол" },
  ]);

  it("находит секцию по названию, если артикула нет", () => {
    expect(resolveModelSectionForOrder({ order_id: "SP-03162E56", item: "Журнальный стол Лофт. Юта" }, "", lookup))
      .toBe("Журнальный стол");
  });

  it("не путается из-за регистра, ё и метаданных в квадратных скобках", () => {
    expect(resolveModelSectionForOrder({ item: "журнальный СТОЛ лофт. юта [QR: 24]" }, "", lookup))
      .toBe("Журнальный стол");
  });

  it("артикул важнее названия, если он есть", () => {
    expect(resolveModelSectionForOrder({ product_article: "GXCTBLOFTOS", item: "Журнальный стол Лофт. Юта" }, "", lookup))
      .toBe("Журнальный стол");
  });

  it("возвращает null для чужого названия", () => {
    expect(resolveModelSectionForOrder({ item: "Обувница Сиена" }, "", lookup)).toBeNull();
  });
});

describe("загрузка частями", () => {
  it("режет base64 так, что склейка даёт исходную строку", () => {
    const b64 = "ABCDEFGHIJ".repeat(2000); // 20 000 символов
    const parts = splitBase64Parts(b64, 4096);
    expect(parts.length).toBe(5);
    expect(parts.join("")).toBe(b64);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(4096));
  });

  it("одна часть, если строка короче размера части", () => {
    expect(splitBase64Parts("abc", 1024)).toEqual(["abc"]);
    expect(splitBase64Parts("", 1024)).toEqual([]);
  });

  it("сжатая модель реального размера (Серена ~250 КБ) влезает в одну часть", async () => {
    const model = { panels: Array.from({ length: 60 }, (_, i) => ({ i, poly: [[0, 0], [10, 0], [10, 10]] })) };
    const packed = await buildUploadPayload(model);
    const parts = splitBase64Parts(packed.payload.p_model_gz);
    expect(parts.join("")).toBe(packed.payload.p_model_gz);
    expect(packed.sentBytes).toBeLessThan(1024 * 1024);
  });
});
