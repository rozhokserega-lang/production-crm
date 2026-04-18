import React from 'react';
import { OrderCard } from './OrderCard';

export const OrderCardMemo = React.memo(OrderCard, (prevProps, nextProps) => {
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
