import { lazy } from 'react';

// Lazy loaded view components
// React.lazy() requires a default export, but our views use named exports.
// We wrap each import to provide the expected default export shape.
export const ShipmentView = lazy(() => import('./Shipment/ShipmentView').then(m => ({ default: m.ShipmentView })));
export const WorkshopView = lazy(() => import('./Workshop/WorkshopView').then(m => ({ default: m.WorkshopView })));
export const OverviewView = lazy(() => import('./OverviewView.jsx').then(m => ({ default: m.OverviewView })));
export const WarehouseView = lazy(() => import('./WarehouseView.jsx').then(m => ({ default: m.WarehouseView })));
export const LaborView = lazy(() => import('./LaborView.jsx').then(m => ({ default: m.LaborView })));
export const StatsView = lazy(() => import('./StatsView.jsx').then(m => ({ default: m.StatsView })));
export const FurnitureView = lazy(() => import('./FurnitureView.jsx').then(m => ({ default: m.FurnitureView })));
export const AdminView = lazy(() => import('./AdminView.jsx').then(m => ({ default: m.AdminView })));
