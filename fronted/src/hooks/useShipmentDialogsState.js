import { useState } from "react";

export function useShipmentDialogsState(defaultStrapOptions) {
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [consumeEditMode, setConsumeEditMode] = useState(false);
  const [consumeDialogData, setConsumeDialogData] = useState(null);
  const [consumeMaterial, setConsumeMaterial] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [consumeSaving, setConsumeSaving] = useState(false);
  const [consumeError, setConsumeError] = useState("");
  const [consumeLoading, setConsumeLoading] = useState(false);

  const [strapDialogOpen, setStrapDialogOpen] = useState(false);
  const [strapTargetProduct, setStrapTargetProduct] = useState("");
  const [strapPlanWeek, setStrapPlanWeek] = useState("");
  const [strapDraft, setStrapDraft] = useState(() =>
    defaultStrapOptions.reduce((acc, name) => ({ ...acc, [name]: "" }), {}),
  );
  const [strapItems, setStrapItems] = useState([]);

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
