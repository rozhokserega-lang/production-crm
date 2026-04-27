import { useMemo } from "react";

interface UseCommonDerivedDataParams {
  view: string;
  filtered: unknown[];
  orderDrawerLines: unknown[];
  setOrderDrawerLines: (v: unknown[]) => void;
}

interface UseCommonDerivedDataReturn {
  filtered: unknown[];
  orderDrawerLines: unknown[];
  setOrderDrawerLines: (v: unknown[]) => void;
}

export function useCommonDerivedData({
  view,
  filtered,
  orderDrawerLines,
  setOrderDrawerLines,
}: UseCommonDerivedDataParams): UseCommonDerivedDataReturn {
  const result = useMemo(() => {
    if (view === "shipment") {
      return { filtered, orderDrawerLines };
    }
    return { filtered, orderDrawerLines };
  }, [view, filtered, orderDrawerLines]);

  return {
    filtered: result.filtered,
    orderDrawerLines: result.orderDrawerLines,
    setOrderDrawerLines,
  };
}
