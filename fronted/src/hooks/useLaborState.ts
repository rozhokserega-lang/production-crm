import { useEffect, useState } from "react";

interface LaborPlannerQtyByGroup {
  [group: string]: number;
}

interface LaborSaveSelected {
  [key: string]: boolean;
}

interface LaborSavingByKey {
  [key: string]: boolean;
}

interface LaborSavedByKey {
  [key: string]: boolean;
}

interface UseLaborStateReturn {
  laborSort: string;
  setLaborSort: (v: string) => void;
  laborSubView: string;
  setLaborSubView: (v: string) => void;
  laborPlannerQtyByGroup: LaborPlannerQtyByGroup;
  setLaborPlannerQtyByGroup: (
    v: LaborPlannerQtyByGroup | ((prev: LaborPlannerQtyByGroup) => LaborPlannerQtyByGroup),
  ) => void;
  laborRows: unknown[];
  setLaborRows: (v: unknown[]) => void;
  laborImportedRows: unknown[];
  setLaborImportedRows: (v: unknown[]) => void;
  laborSaveSelected: LaborSaveSelected;
  setLaborSaveSelected: (
    v: LaborSaveSelected | ((prev: LaborSaveSelected) => LaborSaveSelected),
  ) => void;
  laborSavingByKey: LaborSavingByKey;
  setLaborSavingByKey: (
    v: LaborSavingByKey | ((prev: LaborSavingByKey) => LaborSavingByKey),
  ) => void;
  laborSavedByKey: LaborSavedByKey;
  setLaborSavedByKey: (
    v: LaborSavedByKey | ((prev: LaborSavedByKey) => LaborSavedByKey),
  ) => void;
}

export function useLaborState(view: string): UseLaborStateReturn {
  const [laborSort, setLaborSort] = useState("total_desc");
  const [laborSubView, setLaborSubView] = useState("total");
  const [laborPlannerQtyByGroup, setLaborPlannerQtyByGroup] = useState<LaborPlannerQtyByGroup>({});
  const [laborRows, setLaborRows] = useState<unknown[]>([]);
  const [laborImportedRows, setLaborImportedRows] = useState<unknown[]>([]);
  const [laborSaveSelected, setLaborSaveSelected] = useState<LaborSaveSelected>({});
  const [laborSavingByKey, setLaborSavingByKey] = useState<LaborSavingByKey>({});
  const [laborSavedByKey, setLaborSavedByKey] = useState<LaborSavedByKey>({});

  useEffect(() => {
    if (view !== "labor") setLaborSubView("total");
  }, [view]);

  return {
    laborSort,
    setLaborSort,
    laborSubView,
    setLaborSubView,
    laborPlannerQtyByGroup,
    setLaborPlannerQtyByGroup,
    laborRows,
    setLaborRows,
    laborImportedRows,
    setLaborImportedRows,
    laborSaveSelected,
    setLaborSaveSelected,
    laborSavingByKey,
    setLaborSavingByKey,
    laborSavedByKey,
    setLaborSavedByKey,
  };
}
