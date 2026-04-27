import React, { useState } from 'react';
import { STAGE_SYNC_META } from '../../constants/stages';
import { ALL_EXECUTORS, KROMKA_EXECUTORS, PRAS_EXECUTORS } from '../../config';

interface OrderCardOrder {
  orderId?: string;
  order_id?: string;
  item?: string;
  material?: string;
  qty?: number;
  pilkaStatus?: string;
  kromkaStatus?: string;
  prasStatus?: string;
  assemblyStatus?: string;
  [key: string]: unknown;
}

interface OrderCardProps {
  order: OrderCardOrder;
  currentTab: string;
  actionLoading: string;
  executorByOrder: Record<string, string>;
  onStageAction: (orderId: string, action: string, executor: string) => void;
  onExecutorChange: (key: string, executor: string) => void;
}

export function OrderCard({
  order,
  currentTab,
  actionLoading,
  executorByOrder,
  onStageAction,
  onExecutorChange,
}: OrderCardProps) {
  const [showExecutorSelect, setShowExecutorSelect] = useState(false);

  const orderId = order.orderId || order.order_id || "";
  const isOrderLoading = !!(actionLoading && actionLoading.includes(orderId));

  const getStatusClass = (status: string | undefined): string => {
    const statusStr = String(status || '').toLowerCase();
    if (statusStr.includes('готов') || statusStr.includes('собрано')) return 'done';
    if (statusStr.includes('в работе')) return 'work';
    if (statusStr.includes('пауза')) return 'pause';
    return 'wait';
  };

  interface StageAction {
    key: string;
    label: string;
    action: string;
  }

  const getStageActions = (): StageAction[] => {
    const actions: StageAction[] = [];

    if (currentTab === 'pilka' || currentTab === 'all') {
      actions.push(
        { key: 'pilka_in_work', label: 'В работу', action: 'webSetPilkaInWork' },
        { key: 'pilka_done', label: 'Готово', action: 'webSetPilkaDone' },
        { key: 'pilka_pause', label: 'Пауза', action: 'webSetPilkaPause' }
      );
    }

    if (currentTab === 'kromka' || currentTab === 'all') {
      actions.push(
        { key: 'kromka_in_work', label: 'В работу', action: 'webSetKromkaInWork' },
        { key: 'kromka_done', label: 'Готово', action: 'webSetKromkaDone' },
        { key: 'kromka_pause', label: 'Пауза', action: 'webSetKromkaPause' }
      );
    }

    if (currentTab === 'pras' || currentTab === 'all') {
      actions.push(
        { key: 'pras_in_work', label: 'В работу', action: 'webSetPrasInWork' },
        { key: 'pras_done', label: 'Готово', action: 'webSetPrasDone' },
        { key: 'pras_pause', label: 'Пауза', action: 'webSetPrasPause' }
      );
    }

    if (currentTab === 'assembly' || currentTab === 'done') {
      actions.push(
        { key: 'assembly_done', label: 'Собрано', action: 'webSetAssemblyDone' }
      );
    }

    return actions;
  };

  const handleAction = (action: string): void => {
    const executor = executorByOrder[orderId];
    onStageAction(orderId, action, executor);
  };

  const handleExecutorChange = (stage: string, executor: string): void => {
    onExecutorChange(`${orderId}:${stage}`, executor);
  };

  const currentExecutors: Record<string, string> = {
    kromka: executorByOrder[orderId] || '',
    pras: executorByOrder[`${orderId}:pras`] || ''
  };

  return (
    <div className={`order-card ${getStatusClass(order.pilkaStatus)}`}>
      <div className="order-header">
        <h4 className="order-id">{orderId}</h4>
        <span className="order-item">{order.item}</span>
        {order.material && (
          <span className="order-material">{order.material}</span>
        )}
      </div>

      <div className="order-stages">
        <StageItem
          label="Пила"
          status={order.pilkaStatus}
          statusClass={getStatusClass(order.pilkaStatus)}
        />

        <StageItem
          label="Кромка"
          status={order.kromkaStatus}
          statusClass={getStatusClass(order.kromkaStatus)}
          showExecutor={currentTab === 'kromka' || currentTab === 'all'}
          executor={currentExecutors.kromka}
          executorOptions={KROMKA_EXECUTORS}
          onExecutorChange={(executor: string) => handleExecutorChange('kromka', executor)}
          disabled={isOrderLoading}
        />

        <StageItem
          label="Присадка"
          status={order.prasStatus}
          statusClass={getStatusClass(order.prasStatus)}
          showExecutor={currentTab === 'pras' || currentTab === 'all'}
          executor={currentExecutors.pras}
          executorOptions={PRAS_EXECUTORS}
          onExecutorChange={(executor: string) => handleExecutorChange('pras', executor)}
          disabled={isOrderLoading}
        />

        <StageItem
          label="Сборка"
          status={order.assemblyStatus}
          statusClass={getStatusClass(order.assemblyStatus)}
        />
      </div>

      <div className="order-actions">
        {getStageActions().map(({ key, label, action }) => (
          <button
            key={key}
            className={`action-btn ${actionLoading === action ? 'loading' : ''}`}
            onClick={() => handleAction(action)}
            disabled={isOrderLoading}
            title={STAGE_SYNC_META[action]?.label || label}
          >
            {label}
          </button>
        ))}
      </div>

      {order.qty && (
        <div className="order-qty">
          Кол-во: <strong>{order.qty}</strong>
        </div>
      )}
    </div>
  );
}

interface StageItemProps {
  label: string;
  status?: string;
  statusClass: string;
  showExecutor?: boolean;
  executorOptions?: string[];
  executor?: string;
  onExecutorChange?: (executor: string) => void;
  disabled?: boolean;
}

function StageItem({
  label,
  status,
  statusClass,
  showExecutor = false,
  executorOptions = ALL_EXECUTORS,
  executor = '',
  onExecutorChange,
  disabled = false,
}: StageItemProps) {
  return (
    <div className={`stage-item ${statusClass}`}>
      <div className="stage-label">{label}</div>
      <div className="stage-status">{status || '—'}</div>

      {showExecutor && (
        <ExecutorSelect
          value={executor}
          options={executorOptions}
          onChange={onExecutorChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}

interface ExecutorSelectProps {
  value: string;
  options: string[];
  onChange?: (executor: string) => void;
  disabled?: boolean;
}

function ExecutorSelect({ value, options, onChange, disabled }: ExecutorSelectProps) {
  const executors: string[] = Array.isArray(options) && options.length > 0 ? options : ALL_EXECUTORS;

  return (
    <select
      className="executor-select"
      value={value}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value)}
      disabled={disabled}
    >
      <option value="">Исполнитель...</option>
      {executors.map(exec => (
        <option key={exec} value={exec}>{exec}</option>
      ))}
    </select>
  );
}
