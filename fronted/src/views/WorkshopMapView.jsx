import { memo } from "react";
import { KROMKA_EXECUTORS, PRAS_EXECUTORS } from "../config";
import { WorkshopFloorMap } from "../components/WorkshopFloorMap";

export const WorkshopMapView = memo(function WorkshopMapView({
  workshop,
  helpers,
  onGoWarehouse,
  onGoWarehouseKit,
}) {
  const {
    workshopRows,
    executorByOrder,
    executorOptions,
  } = workshop;
  const { isDone, isInWork } = helpers;

  const kromkaOptions = Array.isArray(executorOptions?.kromka) && executorOptions.kromka.length > 0
    ? executorOptions.kromka
    : KROMKA_EXECUTORS;
  const prasOptions = Array.isArray(executorOptions?.pras) && executorOptions.pras.length > 0
    ? executorOptions.pras
    : PRAS_EXECUTORS;

  return (
    <WorkshopFloorMap
      orders={workshopRows}
      isDone={isDone}
      isInWork={isInWork}
      executorByOrder={executorByOrder}
      kromkaExecutors={kromkaOptions}
      prasExecutors={prasOptions}
      onGoWarehouse={onGoWarehouse}
      onGoWarehouseKit={onGoWarehouseKit}
    />
  );
});
