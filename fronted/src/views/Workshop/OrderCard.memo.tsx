import React from 'react';
import { OrderCard } from './OrderCard';

interface OrderCardMemoProps {
  order: Record<string, unknown>;
  currentTab: string;
  actionLoading: string;
  executorByOrder: Record<string, string>;
  onStageAction: (orderId: string, action: string, executor: string) => void;
  onExecutorChange: (key: string, executor: string) => void;
}

export const OrderCardMemo = React.memo(OrderCard as React.ComponentType<OrderCardMemoProps>, (prevProps, nextProps) => {
  // Custom comparison function for optimal re-rendering
  const orderChanged = prevProps.order.orderId !== nextProps.order.orderId;
  const tabChanged = prevProps.currentTab !== nextProps.currentTab;
  const loadingChanged = prevProps.actionLoading !== nextProps.actionLoading;
  const executorChanged = prevProps.executorByOrder !== nextProps.executorByOrder;

  // Only re-render if relevant props changed
  if (orderChanged || tabChanged || loadingChanged || executorChanged) {
    return false; // Re-render
  }

  return true; // Skip re-render
});
