import type { ReactNode } from "react";
import { ErrorProvider } from "../contexts/ErrorContext";
import { FurnitureDataProvider } from "../contexts/FurnitureDataContext";
import { WarehouseDataProvider } from "../contexts/WarehouseDataContext";
import { ShipmentDataProvider } from "../contexts/ShipmentDataContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorProvider>
      <FurnitureDataProvider>
        <WarehouseDataProvider>
          <ShipmentDataProvider>{children}</ShipmentDataProvider>
        </WarehouseDataProvider>
      </FurnitureDataProvider>
    </ErrorProvider>
  );
}
