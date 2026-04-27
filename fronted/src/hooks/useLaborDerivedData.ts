import { useMemo } from "react";

interface LaborTableRow {
  orderId: string;
  item: string;
  week: string;
  qty: number;
  pilkaMin: number;
  kromkaMin: number;
  prasMin: number;
  assemblyMin: number;
  totalMin: number;
  dateFinished: string;
  importedLocal: boolean;
  importKey: string;
}

interface LaborOrdersRow {
  group: string;
  orders: number;
  qty: number;
  pilkaMin: number;
  kromkaMin: number;
  prasMin: number;
  totalMin: number;
  lastDate: string;
  laborPerOrderHour: number;
  laborPerQtyMin: number;
  laborPerQtyHour: number;
  pilkaShare: number;
  kromkaShare: number;
  prasShare: number;
}

interface UseLaborDerivedDataParams {
  view: string;
  filtered: Record<string, unknown>[];
  laborSort: string;
}

interface UseLaborDerivedDataReturn {
  laborTableRows: LaborTableRow[];
  laborOrdersRows: LaborOrdersRow[];
}

const isImportedLaborRow = (row: Record<string, unknown>): boolean =>
  Boolean(row?.importedLocal) || /^import-/i.test(String(row?.orderId || "").trim());

export function useLaborDerivedData({ view, filtered, laborSort }: UseLaborDerivedDataParams): UseLaborDerivedDataReturn {
  const laborTableRows = useMemo((): LaborTableRow[] => {
    if (view !== "labor") return [];
    const toNum = (v: unknown): number => Number(v || 0);
    const list = [...filtered].map((x) => ({
      orderId: String(x.order_id || x.orderId || ""),
      item: String(x.item || ""),
      week: String(x.week || ""),
      qty: toNum(x.qty),
      pilkaMin: toNum(x.pilka_min ?? x.pilkaMin),
      kromkaMin: toNum(x.kromka_min ?? x.kromkaMin),
      prasMin: toNum(x.pras_min ?? x.prasMin),
      assemblyMin: toNum(x.assembly_min ?? x.assemblyMin),
      totalMin: toNum(x.total_min ?? x.totalMin),
      dateFinished: String(x.date_finished || x.dateFinished || ""),
      importedLocal: Boolean(x.imported_local || x.importedLocal),
      importKey: String(x.import_key || x.importKey || ""),
    }));
    list.sort((a, b) => {
      if (laborSort === "total_asc") return a.totalMin - b.totalMin;
      if (laborSort === "week") return Number(a.week || 0) - Number(b.week || 0);
      if (laborSort === "item") return a.item.localeCompare(b.item, "ru");
      return b.totalMin - a.totalMin;
    });
    return list;
  }, [filtered, laborSort, view]);

  const laborOrdersRows = useMemo((): LaborOrdersRow[] => {
    if (view !== "labor") return [];
    const completed = laborTableRows.filter(
      (x) => !isImportedLaborRow(x as unknown as Record<string, unknown>) && x.pilkaMin > 0 && x.kromkaMin > 0 && x.prasMin > 0,
    );
    const extractSizeToken = (value: string): string => {
      const raw = String(value || "");
      const m = raw.match(/(\d{2,4})\s*[_xх]\s*(\d{2,4})/i);
      if (!m) return "";
      return `${m[1]}_${m[2]}`;
    };
    const norm = (v: string): string =>
      String(v || "")
        .toLowerCase()
        .replace(/[ё]/g, "е")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    const resolveGroup = (itemRaw: string): string => {
      const n = norm(itemRaw);
      const sizeToken = extractSizeToken(itemRaw);
      // "Обвязка (1000_80)" and "1000_80" should be one group for labor aggregation.
      if (n.includes("обвязка") || n.includes("планка") || sizeToken) {
        return sizeToken ? `Обвязка ${sizeToken}` : "Обвязка";
      }
      if (n.includes("1153") && n.includes("320")) return "";
      if (n.includes("avella lite") || n.includes("авелла лайт") || n.includes("авела лайт")) return "Avella lite";
      if (n.includes("avella") || n.includes("авелла") || n.includes("авела")) return "Avella";
      if (n.includes("cremona") || n.includes("кремона")) return "Cremona";
      if (n.includes("stabile") || n.includes("стабиле")) return "Stabile";
      if (n.includes("donini grande")) return "Donini Grande";
      if (n.includes("donini r")) return "Donini r";
      if (n.includes("donini")) return "Donini";
      if (n.includes("solito2")) return "Solito2";
      if (n.includes("solito") || n.includes("солито")) return "Solito";
      if (n.includes("премьер") || n.includes("premier")) return "Премьер";
      if (n.includes("тв лофт") || n.includes("tv loft") || n.includes("тумба под тв")) return "ТВ Лофт";
      if (n.includes("классико") || n.includes("classico")) return "Классико";
      if (n.includes("siena")) return "Siena";
      const first = String(itemRaw || "").split(".")[0].trim();
      return first || "Прочее";
    };
    const grouped = new Map<string, LaborOrdersRow>();
    completed.forEach((x) => {
      const group = resolveGroup(x.item);
      if (!group) return;
      if (!grouped.has(group)) {
        grouped.set(group, {
          group,
          orders: 0,
          qty: 0,
          pilkaMin: 0,
          kromkaMin: 0,
          prasMin: 0,
          totalMin: 0,
          lastDate: "",
          laborPerOrderHour: 0,
          laborPerQtyMin: 0,
          laborPerQtyHour: 0,
          pilkaShare: 0,
          kromkaShare: 0,
          prasShare: 0,
        });
      }
      const g = grouped.get(group)!;
      g.orders += 1;
      g.qty += Number(x.qty || 0);
      g.pilkaMin += Number(x.pilkaMin || 0);
      g.kromkaMin += Number(x.kromkaMin || 0);
      g.prasMin += Number(x.prasMin || 0);
      g.totalMin += Number(x.totalMin || 0);
      const d = String(x.dateFinished || "");
      if (d && (!g.lastDate || d > g.lastDate)) g.lastDate = d;
    });
    const ORDER = ["Avella", "Avella lite", "Cremona", "Donini", "Donini Grande", "Donini r", "Solito", "Solito2", "Stabile", "Премьер", "ТВ Лофт"];
    const rank = new Map(ORDER.map((x, i) => [x, i]));
    return [...grouped.values()]
      .map((g) => {
        const total = Number(g.totalMin || 0);
        const pilkaShare = total > 0 ? (g.pilkaMin * 100) / total : 0;
        const kromkaShare = total > 0 ? (g.kromkaMin * 100) / total : 0;
        const prasShare = total > 0 ? (g.prasMin * 100) / total : 0;
        return {
          ...g,
          laborPerOrderHour: g.orders > 0 ? total / g.orders / 60 : 0,
          laborPerQtyMin: g.qty > 0 ? total / g.qty : 0,
          laborPerQtyHour: g.qty > 0 ? total / g.qty / 60 : 0,
          pilkaShare,
          kromkaShare,
          prasShare,
        };
      })
      .sort((a, b) => {
        const ra = rank.has(a.group) ? rank.get(a.group)! : 9999;
        const rb = rank.has(b.group) ? rank.get(b.group)! : 9999;
        if (ra !== rb) return ra - rb;
        return a.group.localeCompare(b.group, "ru");
      });
  }, [laborTableRows, view]);

  return { laborTableRows, laborOrdersRows };
}
