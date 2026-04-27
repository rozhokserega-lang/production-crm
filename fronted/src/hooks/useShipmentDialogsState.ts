import { useState } from "react";

interface UseShipmentDialogsStateReturn {
  consumeDialogOpen: boolean;
  setConsumeDialogOpen: (v: boolean) => void;
  consumeEditMode: boolean;
  setConsumeEditMode: (v: boolean) => void;
  consumeDialogData: Record<string, unknown> | null;
  setConsumeDialogData: (v: Record<string, unknown> | null) => void;
  consumeMaterial: string;
  setConsumeMaterial: (v: string) => void;
  consumeQty: string;
  setConsumeQty: (v: string) => void;
  consumeSaving: boolean;
  setConsumeSaving: (v: boolean) => void;
  consumeError: string;
  setConsumeError: (v: string) => void;
  consumeLoading: boolean;
  setConsumeLoading: (v: boolean) => void;
  strapDialogOpen: boolean;
  setStrapDialogOpen: (v: boolean) => void;
  strapTargetProduct: string;
  setStrapTargetProduct: (v: string) => void;
  strapPlanWeek: string;
  setStrapPlanWeek: (v: string) => void;
  strapDraft: Record<string, string>;
  setStrapDraft: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  strapItems: unknown[];
  setStrapItems: (v: unknown[]) => void;
  planDialogOpen: boolean;
  setPlanDialogOpen: (v: boolean) => void;
  planSection: string;
  setPlanSection: (v: string) => void;
  planArticle: string;
  setPlanArticle: (v: string) => void;
  planMaterial: string;
  setPlanMaterial: (v: string) => void;
  planWeek: string;
  setPlanWeek: (v: string) => void;
  planQty: string;
  setPlanQty: (v: string) => void;
  planSaving: boolean;
  setPlanSaving: (v: boolean) => void;
}

export function useShipmentDialogsState(
  defaultStrapOptions: string[],
): UseShipmentDialogsStateReturn {
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [consumeEditMode, setConsumeEditMode] = useState(false);
  const [consumeDialogData, setConsumeDialogData] = useState<Record<string, unknown> | null>(null);
  const [consumeMaterial, setConsumeMaterial] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [consumeSaving, setConsumeSaving] = useState(false);
  const [consumeError, setConsumeError] = useState("");
  const [consumeLoading, setConsumeLoading] = useState(false);

  const [strapDialogOpen, setStrapDialogOpen] = useState(false);
  const [strapTargetProduct, setStrapTargetProduct] = useState("");
  const [strapPlanWeek, setStrapPlanWeek] = useState("");
  const [strapDraft, setStrapDraft] = useState<Record<string, string>>(() =>
    defaultStrapOptions.reduce<Record<string, string>>((acc, name) => ({ ...acc, [name]: "" }), {}),
  );
  const [strapItems, setStrapItems] = useState<unknown[]>([]);

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planSection, setPlanSection] = useState("Прочее");
  const [planArticle, setPlanArticle] = useState("");
  const [planMaterial, setPlanMaterial] = useState("");
  const [planWeek, setPlanWeek] = useState("");
  const [planQty, setPlanQty] = useState("");
  const [planSaving, setPlanSaving] = useState(false);

  return {
    consumeDialogOpen,
    setConsumeDialogOpen,
    consumeEditMode,
    setConsumeEditMode,
    consumeDialogData,
    setConsumeDialogData,
    consumeMaterial,
    setConsumeMaterial,
    consumeQty,
    setConsumeQty,
    consumeSaving,
    setConsumeSaving,
    consumeError,
    setConsumeError,
    consumeLoading,
    setConsumeLoading,
    strapDialogOpen,
    setStrapDialogOpen,
    strapTargetProduct,
    setStrapTargetProduct,
    strapPlanWeek,
    setStrapPlanWeek,
    strapDraft,
    setStrapDraft,
    strapItems,
    setStrapItems,
    planDialogOpen,
    setPlanDialogOpen,
    planSection,
    setPlanSection,
    planArticle,
    setPlanArticle,
    planMaterial,
    setPlanMaterial,
    planWeek,
    setPlanWeek,
    planQty,
    setPlanQty,
    planSaving,
    setPlanSaving,
  };
}
