import React, { useState, useCallback } from 'react';
import { OrderService } from '../../services/orderService';
import { useOrders } from '../../hooks/useOrders';
import { useWorkshopRows } from '../../hooks/useOrders';
import { TABS } from '../../constants/views';
import { WorkshopTabs } from './WorkshopTabs';
import { OrderCard } from './OrderCard';

export function WorkshopView() {
  const [currentTab, setCurrentTab] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);
  const [executorByOrder, setExecutorByOrder] = useState({});

  const { rows, loading, error, loadOrders, loadOrdersByStage } = useOrders();
  
  const workshopRows = useWorkshopRows({
    filtered: rows,
    view: 'workshop',
    tab: currentTab,
    isDone: (status) => String(status || '').toLowerCase().includes('готов'),
    isInWork: (status) => String(status || '').toLowerCase().includes('в работе'),
    getOverviewLaneId: (order) => {
      // Simplified lane detection logic
      const pilkaDone = String(order.pilkaStatus || '').toLowerCase().includes('готов');
      const kromkaDone = String(order.kromkaStatus || '').toLowerCase().includes('готов');
      const prasDone = String(order.prasStatus || '').toLowerCase().includes('готов');
      
      if (!pilkaDone) return 'pilka';
      if (!kromkaDone) return 'kromka';
      if (!prasDone) return 'pras';
      return 'assembly';
    },
    isOrderCustomerShipped: (order) => 
      String(order.overallStatus || '').toLowerCase().includes('отгруж')
  });

  const handleTabChange = useCallback((tab) => {
    setCurrentTab(tab);
    if (tab !== 'all') {
      loadOrdersByStage(tab);
    } else {
      loadOrders();
    }
  }, [loadOrders, loadOrdersByStage]);

  const handleStageAction = useCallback(async (orderId, action, executor = null) => {
    setActionLoading(action);
    
    try {
      const payload = executor ? { executor } : {};
      await OrderService.updateOrderStage(orderId, action, payload);
      
      // Update executor state if provided
      if (executor) {
        setExecutorByOrder(prev => ({
          ...prev,
          [orderId]: executor
        }));
      }
      
      // Reload data
      if (currentTab !== 'all') {
        await loadOrdersByStage(currentTab);
      } else {
        await loadOrders();
      }
    } catch (err) {
      console.error('Failed to update order stage:', err);
      // Error handling could be enhanced with toast notifications
    } finally {
      setActionLoading(null);
    }
  }, [currentTab, loadOrders, loadOrdersByStage]);

  const handleExecutorChange = useCallback((orderId, executor) => {
    setExecutorByOrder(prev => ({
      ...prev,
      [orderId]: executor
    }));
  }, []);

  if (loading && !workshopRows.length) {
    return <div className="loading">Загрузка данных производства...</div>;
  }

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }

  return (
    <div className="workshop-view">
      <WorkshopTabs
        currentTab={currentTab}
        onTabChange={handleTabChange}
        tabs={TABS}
      />

      <div className="workshop-content">
        {!workshopRows.length && !loading ? (
          <div className="empty">Нет заказов для отображения</div>
        ) : (
          <div className="orders-grid">
            {workshopRows.map(order => (
              <OrderCard
                key={order.orderId || order.order_id}
                order={order}
                currentTab={currentTab}
                actionLoading={actionLoading}
                executorByOrder={executorByOrder}
                onStageAction={handleStageAction}
                onExecutorChange={handleExecutorChange}
              />
            ))}
          </div>
        )}
        
        {loading && <div className="loading-overlay">Обновление данных...</div>}
      </div>
    </div>
  );
}
