import { useState, useCallback, useEffect, useRef } from "react";
import { OrderService } from "../services/orderService";
import type { AuditLogRow, AuditAction, AuditEntity, AuditLogParams } from "../types/domain";

const PAGE_SIZE = 100;

export const KNOWN_ACTIONS: AuditAction[] = [
  "set_stage",
  "delete_order",
  "assign_role",
  "remove_role",
  "consume_sheets",
  "toggle_strict_mode",
];

export const KNOWN_ENTITIES: AuditEntity[] = [
  "orders",
  "crm_user_roles",
  "materials_moves",
  "crm_runtime_settings",
];

interface AuditFilters {
  action: AuditAction | "";
  entity: AuditEntity | "";
  search: string;
}

interface UseAuditLogReturn {
  rows: AuditLogRow[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  filters: AuditFilters;
  setFilter: (key: keyof AuditFilters, value: string) => void;
  reload: () => void;
  loadMore: () => void;
}

export function useAuditLog(): UseAuditLogReturn {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<AuditFilters>({
    action: "",
    entity: "",
    search: "",
  });

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const load = useCallback(
    async (reset: boolean = false) => {
      setLoading(true);
      setError(null);

      const currentOffset = reset ? 0 : offset;
      const { action } = filtersRef.current;

      const params: AuditLogParams = {
        limit: PAGE_SIZE,
        offset: currentOffset,
        action: action || null,
      };

      try {
        const data = await OrderService.getAuditLog(params);
        const newRows: AuditLogRow[] = Array.isArray(data) ? data : [];
        if (reset) {
          setRows(newRows);
          setOffset(PAGE_SIZE);
        } else {
          setRows((prev) => [...prev, ...newRows]);
          setOffset((prev) => prev + PAGE_SIZE);
        }
        setHasMore(newRows.length === PAGE_SIZE);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка загрузки журнала";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [offset],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = useCallback((key: keyof AuditFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reload = useCallback(() => {
    setOffset(0);
    setHasMore(true);
    load(true);
  }, [load]);

  const filteredRows = rows.filter((r) => {
    const search = String(filters.search || "").toLowerCase();
    const entity = String(filters.entity || "").toLowerCase();
    const byEntity = !entity || String(r.entity || "").toLowerCase().includes(entity);
    if (!search) return byEntity;
    return (
      byEntity &&
      ((r.entity_id ?? "").toLowerCase().includes(search) ||
        (r.actor_crm_role ?? "").toLowerCase().includes(search) ||
        (r.actor_user_id ?? "").toLowerCase().includes(search) ||
        String(r.action || "").toLowerCase().includes(search))
    );
  });

  return {
    rows: filteredRows,
    loading,
    error,
    hasMore,
    filters,
    setFilter,
    reload,
    loadMore: () => load(false),
  };
}
