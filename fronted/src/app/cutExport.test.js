import { describe, expect, it } from "vitest";
import { generateCUTFile } from "./cutExport";

// Реальные позиции из листа, присланного пользователем (Layout ID=9 из
// экспортированного .cut файла для станка King Stone AutoSAW), где ряды
// на станке визуально оказывались перевёрнуты по вертикали относительно CRM.
function buildSampleSheet() {
  return {
    sheetW: 2800,
    sheetH: 2070,
    pieces: [
      { label: "887x340", x: 20, y: 20, w: 887, h: 340 },
      { label: "887x340", x: 912, y: 20, w: 887, h: 340 },
      { label: "887x340", x: 1804, y: 20, w: 887, h: 340 },
      { label: "887x340", x: 20, y: 365, w: 887, h: 340 },
      { label: "887x340", x: 912, y: 365, w: 887, h: 340 },
      { label: "887x340", x: 1804, y: 365, w: 887, h: 340 },
      { label: "887x340", x: 20, y: 710, w: 887, h: 340 },
      { label: "887x340", x: 912, y: 710, w: 887, h: 340 },
      { label: "887x340", x: 1804, y: 710, w: 887, h: 340 },
      { label: "887x340", x: 20, y: 1054, w: 887, h: 340 },
      { label: "587x340", x: 912, y: 1054, w: 587, h: 340 },
      { label: "587x340", x: 1504, y: 1054, w: 587, h: 340 },
      { label: "587x340", x: 2095, y: 1054, w: 587, h: 340 },
      { label: "587x340", x: 20, y: 1399, w: 587, h: 340 },
      { label: "587x340", x: 612, y: 1399, w: 587, h: 340 },
      { label: "587x340", x: 1204, y: 1399, w: 587, h: 340 },
      { label: "587x340", x: 1795, y: 1399, w: 587, h: 340 },
      { label: "387x340", x: 2387, y: 1399, w: 387, h: 340 },
    ],
  };
}

function extractStripPys(xml) {
  const layoutMatch = xml.match(/<Layout[\s\S]*?<\/Layout>/);
  const layoutXml = layoutMatch[0];
  const stripRegex = /<Part X="2800" Y="[\d.]+" Py="([\d.]+)">/g;
  const pys = [];
  let m;
  while ((m = stripRegex.exec(layoutXml))) pys.push(Number(m[1]));
  return pys;
}

describe("cutExport mirrorY", () => {
  it("without mirrorY keeps original top-to-bottom screen order (Py ascending)", () => {
    const groups = [{ material: "test", sheets: [buildSampleSheet()], totalPieces: 18, totalSheets: 1 }];
    const xml = generateCUTFile(groups, "test", {
      sheetW: 2800, sheetH: 2070, kerf: 4.8, marginX: 20, marginY: 20, mirrorY: false,
    });
    const pys = extractStripPys(xml);
    expect(pys).toEqual([20, 365, 710, 1054, 1399]);
  });

  it("with mirrorY reverses row order and moves bottom remain to Py=0", () => {
    const groups = [{ material: "test", sheets: [buildSampleSheet()], totalPieces: 18, totalSheets: 1 }];
    const xml = generateCUTFile(groups, "test", {
      sheetW: 2800, sheetH: 2070, kerf: 4.8, marginX: 20, marginY: 20, mirrorY: true,
    });
    const pys = extractStripPys(xml);
    // Полосы физически переставлены местами (высота листа - экранный Y - высота полосы),
    // но их относительный порядок в файле не меняется — меняется только Py.
    expect(pys).toEqual([1710, 1365, 1020, 676, 331]);

    // Деталь 887x340, ранее занимавшая верхний левый угол (screen y=20), теперь внизу листа.
    expect(xml).toContain('<Part X="887" Y="340" Px="20" Py="1710" UID="0"/>');
    // Нижний остаток листа (было: экранный низ) переезжает на самый верх (Py=0).
    expect(xml).toContain('<Part X="2800" Y="326.2" Py="0" UID="1005" Spare="true"/>');
  });

  it("short piece in a sub-column is bottom-aligned within its strip after mirroring", () => {
    const sheet = {
      sheetW: 1000,
      sheetH: 500,
      pieces: [
        { label: "tall", x: 20, y: 20, w: 300, h: 200 },
        { label: "short", x: 340, y: 20, w: 200, h: 100 },
      ],
    };
    const groups = [{ material: "test", sheets: [sheet], totalPieces: 2, totalSheets: 1 }];
    const settings = { sheetW: 1000, sheetH: 500, kerf: 4.8, marginX: 20, marginY: 20 };

    const xmlPlain = generateCUTFile(groups, "test", { ...settings, mirrorY: false });
    // Изначально короткая деталь прижата к ВЕРХУ полосы (Py совпадает со strip.y=20).
    expect(xmlPlain).toContain('<Part X="200" Y="100" Px="340" Py="20"');

    const xmlMirrored = generateCUTFile(groups, "test", { ...settings, mirrorY: true });
    // После переворота она прижимается к НИЗУ полосы: Py = sheetH - strip.y - h = 500-20-100 = 380.
    expect(xmlMirrored).toContain('<Part X="200" Y="100" Px="340" Py="380"');
  });
});
