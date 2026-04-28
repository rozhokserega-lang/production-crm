import { ErrorProvider } from "../contexts/ErrorContext";
import { ShipmentDataProvider } from "../contexts/ShipmentDataContext";
import { WarehouseDataProvider } from "../contexts/WarehouseDataContext";
import { FurnitureDataProvider } from "../contexts/FurnitureDataContext";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Обёртка всех контекст-провайдеров приложения.
 * Порядок важен: ErrorProvider должен быть самым внешним,
 * чтобы ошибки из дочерних контекстов корректно обрабатывались.
 */
export function AppProviders({ children }) {
  return (
    <ErrorProvider>
      <ErrorBoundary>
        <FurnitureDataProvider>
          <WarehouseDataProvider>
            <ShipmentDataProvider>
              {children}
            </ShipmentDataProvider>
          </WarehouseDataProvider>
        </FurnitureDataProvider>
      </ErrorBoundary>
    </ErrorProvider>
  );
}
