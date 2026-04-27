import { useEffect, useMemo } from "react";
import {
  canonicalStrapProductName,
  detailPatternToStrapName,
  extractDetailSizeToken,
  normalizeStrapProductKey,
} from "../utils/furnitureUtils";

interface StrapOptionGroup {
  productName: string;
  options: string[];
}

interface UseStrapDerivedDataParams {
  furnitureDetailArticleRows: unknown[];
  strapTargetProduct: string;
  setStrapTargetProduct: (v: string) => void;
  fallbackOptions: string[];
}

interface UseStrapDerivedDataReturn {
  strapOptionsByProduct: StrapOptionGroup[];
  strapProductBySizeToken: Map<string, string>;
  strapProductsByArticleCode: Map<string, string[]>;
  strapProductNames: string[];
  strapOptionsForSelectedProduct: string[];
}

export function useStrapDerivedData({
  furnitureDetailArticleRows,
  strapTargetProduct,
  setStrapTargetProduct,
  fallbackOptions,
}: UseStrapDerivedDataParams): UseStrapDerivedDataReturn {
  const strapOptionsByProduct = useMemo(() => {
    const grouped = new Map<string, { productName: string; options: Set<string> }>();
    (furnitureDetailArticleRows || []).forEach((r) => {
      const row = r as Record<string, unknown>;
      const isActive = row?.is_active ?? row?.isActive;
      if (isActive === false) return;
      const productRaw = String(row.product_name || row.productName || "").trim();
      const productName = canonicalStrapProductName(productRaw);
      const pattern = String(row.detail_name_pattern || row.detailNamePattern || "").trim();
      if (!productName) return;
      const optionName = detailPatternToStrapName(pattern);
      if (!optionName) return;
      const key = normalizeStrapProductKey(productName);
      if (!grouped.has(key)) grouped.set(key, { productName, options: new Set<string>() });
      const bucket = grouped.get(key)!.options;
      if (optionName === "Обвязка") {
        const pKey = normalizeStrapProductKey(productName);
        if (pKey === "донини" || pKey === "донини белый") {
          bucket.add("Обвязка (1000_80)");
          bucket.add("Обвязка (558_80)");
          return;
        }
      }
      bucket.add(optionName);
    });
    const rows: StrapOptionGroup[] = [...grouped.values()].map((x) => ({
      productName: x.productName,
      options: [...x.options].sort((a, b) => a.localeCompare(b, "ru")),
    }));
    rows.sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
    return rows;
  }, [furnitureDetailArticleRows]);

  const strapProductBySizeToken = useMemo(() => {
    const map = new Map<string, string>();
    (furnitureDetailArticleRows || []).forEach((r) => {
      const row = r as Record<string, unknown>;
      const isActive = row?.is_active ?? row?.isActive;
      if (isActive === false) return;
      const productRaw = String(row.product_name || row.productName || "").trim();
      const productName = canonicalStrapProductName(productRaw);
      const pattern = String(row.detail_name_pattern || row.detailNamePattern || "").trim();
      if (!productName) return;
      const token = extractDetailSizeToken(pattern);
      if (!token) return;
      const key = normalizeStrapProductKey(token);
      if (!map.has(key)) {
        map.set(key, productName);
        return;
      }
      const existing = String(map.get(key) || "");
      if (normalizeStrapProductKey(existing) !== normalizeStrapProductKey(productName)) {
        map.set(key, "");
      }
    });
    return map;
  }, [furnitureDetailArticleRows]);

  const strapProductsByArticleCode = useMemo(() => {
    const buckets = new Map<string, Set<string>>();
    const splitArticleCodes = (raw: unknown): string[] =>
      String(raw || "")
        .split(/[,\n;]+/g)
        .map((x) => String(x || "").trim().toUpperCase())
        .filter(Boolean);
    (furnitureDetailArticleRows || []).forEach((r) => {
      const row = r as Record<string, unknown>;
      const isActive = row?.is_active ?? row?.isActive;
      if (isActive === false) return;
      const productRaw = String(row.product_name || row.productName || "").trim();
      const productName = canonicalStrapProductName(productRaw);
      const articles = splitArticleCodes(row.article);
      if (!productName || articles.length === 0) return;
      articles.forEach((article) => {
        if (!buckets.has(article)) buckets.set(article, new Set<string>());
        buckets.get(article)!.add(productName);
      });
    });
    return new Map<string, string[]>(
      [...buckets.entries()].map(([article, set]) => [article, [...set.values()]]),
    );
  }, [furnitureDetailArticleRows]);

  const strapProductNames = useMemo(() => {
    if (strapOptionsByProduct.length > 0) return strapOptionsByProduct.map((x) => x.productName);
    return ["Обвязка"];
  }, [strapOptionsByProduct]);

  const strapOptionsForSelectedProduct = useMemo(() => {
    if (strapOptionsByProduct.length === 0) return fallbackOptions;
    const key = normalizeStrapProductKey(strapTargetProduct || strapProductNames[0] || "");
    const hit = strapOptionsByProduct.find(
      (x) => normalizeStrapProductKey(x.productName) === key,
    );
    return hit?.options?.length ? hit.options : [];
  }, [fallbackOptions, strapOptionsByProduct, strapTargetProduct, strapProductNames]);

  useEffect(() => {
    if (!strapProductNames.length) return;
    if (
      strapProductNames.some(
        (name) =>
          normalizeStrapProductKey(name) === normalizeStrapProductKey(strapTargetProduct),
      )
    ) {
      return;
    }
    setStrapTargetProduct(strapProductNames[0]);
  }, [setStrapTargetProduct, strapProductNames, strapTargetProduct]);

  return {
    strapOptionsByProduct,
    strapProductBySizeToken,
    strapProductsByArticleCode,
    strapProductNames,
    strapOptionsForSelectedProduct,
  };
}
