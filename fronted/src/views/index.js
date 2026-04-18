import { lazy } from 'react';

// Lazy loaded view components
export const ShipmentView = lazy(() => import('./Shipment/ShipmentView'));
export const WorkshopView = lazy(() => import('./Workshop/WorkshopView'));
export const OverviewView = lazy(() => import('./OverviewView'));
export const WarehouseView = lazy(() => import('./WarehouseView'));
export const LaborView = lazy(() => import('./LaborView'));
export const StatsView = lazy(() => import('./StatsView'));
export const FurnitureView = lazy(() => import('./FurnitureView'));
export const AdminView = lazy(() => import('./AdminView'));
