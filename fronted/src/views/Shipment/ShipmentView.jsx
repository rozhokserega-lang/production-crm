import React, { useState, useCallback } from 'react';
import { OrderService } from '../../services/orderService';
import { ShipmentBoard } from './ShipmentBoard';
import { ShipmentSummary } from './ShipmentSummary';
import { useShipmentFilters } from '../../hooks/useFilters';

export function ShipmentView() {
  const [loading, setLoading] = useState(false);
  const [shipmentBoard, setShipmentBoard] = useState({ sections: [] });
  const [selectedShipments, setSelectedShipments] = useState([]);
  const [error, setError] = useState(null);

  const { shipmentViewMode, hiddenShipmentGroups, toggleGroupVisibility } = useShipmentFilters();

  const loadShipmentData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await OrderService.getShipmentBoard();
      setShipmentBoard(data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load shipment data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleShipmentSelect = useCallback((shipment) => {
    setSelectedShipments(prev => {
      const isSelected = prev.some(s => s.id === shipment.id);
      if (isSelected) {
        return prev.filter(s => s.id !== shipment.id);
      } else {
        return [...prev, shipment];
      }
    });
  }, []);

  const handleSendToWork = useCallback(async () => {
    if (selectedShipments.length === 0) return;

    setLoading(true);
    try {
      for (const shipment of selectedShipments) {
        await OrderService.sendShipmentToWork(shipment.row, shipment.col);
      }
      await loadShipmentData();
      setSelectedShipments([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedShipments, loadShipmentData]);

  React.useEffect(() => {
    loadShipmentData();
  }, [loadShipmentData]);

  if (loading && !shipmentBoard.sections.length) {
    return <div className="loading">Загрузка данных отгрузки...</div>;
  }

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }

  return (
    <div className="shipment-view">
      <div className="shipment-controls">
        <button 
          className="send-to-work-btn"
          onClick={handleSendToWork}
          disabled={selectedShipments.length === 0 || loading}
        >
          Отправить в работу ({selectedShipments.length})
        </button>
        <button 
          className="refresh-btn"
          onClick={loadShipmentData}
          disabled={loading}
        >
          Обновить
        </button>
      </div>

      <div className="shipment-content">
        <ShipmentBoard
          board={shipmentBoard}
          viewMode={shipmentViewMode}
          hiddenGroups={hiddenShipmentGroups}
          onToggleGroup={toggleGroupVisibility}
          onSelect={handleShipmentSelect}
          selected={selectedShipments}
        />
        
        {selectedShipments.length > 0 && (
          <ShipmentSummary 
            shipments={selectedShipments}
          />
        )}
      </div>
    </div>
  );
}
