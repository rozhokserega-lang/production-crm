import { lazy } from 'react';

// Lazy loaded view components
export const ShipmentView = lazy(() => import('./Shipment/ShipmentView'));
export const WorkshopView = lazy(() => import('./Workshop/WorkshopView'));
export const OverviewView = lazy(() => import('./OverviewView.jsx'));
export const WarehouseView = lazy(() => import('./WarehouseView.jsx'));
export const LaborView = lazy(() => import('./LaborView.jsx'));
export const StatsView = lazy(() => import('./StatsView.jsx'));
export const FurnitureView = lazy(() => import('./FurnitureView.jsx'));
export const AdminView = lazy(() => import('./AdminView.jsx'));
