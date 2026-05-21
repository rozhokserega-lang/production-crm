const STAGE_LABELS = {
  pilka_status: "Пила",
  kromka_status: "Кромка",
  pras_status: "Присадка",
  assembly_status: "Сборка",
  overall_status: "Отгрузка",
};

function detailsOf(row) {
  return row?.details && typeof row.details === "object" ? row.details : {};
}

function actorLabel(row) {
  const crmRole = String(row?.actor_crm_role || "").trim();
  const userId = String(row?.actor_user_id || "").trim();
  if (crmRole && userId) return `${crmRole} · ${userId.slice(0, 8)}`;
  return crmRole || (userId ? userId.slice(0, 8) : "Система");
}

function normalizeStatus(value) {
  const raw = String(value || "").trim();
  return raw || "-";
}

function stageChanges(details) {
  const before = details?.before && typeof details.before === "object" ? details.before : {};
  const after = details?.after && typeof details.after === "object" ? details.after : {};
  return Object.keys(STAGE_LABELS)
    .map((key) => ({
      key,
      label: STAGE_LABELS[key],
      before: normalizeStatus(before[key]),
      after: normalizeStatus(after[key]),
    }))
    .filter((x) => x.before !== x.after);
}

function orderIdFromAuditRow(row) {
  const details = detailsOf(row);
  return String(row?.entity_id || details?.order_id || details?.orderId || "").trim();
}

function rowMatchesOrder(row, orderId) {
  const id = String(orderId || "").trim();
  if (!id) return false;
  return orderIdFromAuditRow(row) === id;
}

function describeAuditRow(row) {
  const details = detailsOf(row);
  const action = String(row?.action || "").trim();
  if (action === "set_stage") {
    const changes = stageChanges(details);
    return {
      title: "Этап изменен",
      tone: "stage",
      lines: changes.length
        ? changes.map((x) => `${x.label}: ${x.before} -> ${x.after}`)
        : ["Статус заказа обновлен"],
    };
  }
  if (action === "consume_sheets") {
    return {
      title: "Списан материал",
      tone: "stock",
      lines: [
        `${String(details.material || "Материал").trim()}: ${Number(details.qty_sheets || 0)} лист.`,
      ],
    };
  }
  if (action === "consume_sheets_failed") {
    return {
      title: "Ошибка списания материала",
      tone: "error",
      lines: [
        String(details.material || "").trim()
          ? `${String(details.material).trim()}: ${String(details.error || "ошибка").trim()}`
          : String(details.error || "Списание не выполнено").trim(),
      ],
    };
  }
  if (action === "set_order_admin_comment") {
    const next = String(details?.after?.admin_comment ?? details?.comment ?? "").trim();
    return {
      title: "Комментарий обновлен",
      tone: "comment",
      lines: [next ? `Комментарий: ${next}` : "Комментарий очищен"],
    };
  }
  if (action === "delete_order") {
    return {
      title: "Заказ удален",
      tone: "error",
      lines: [String(details.item || "").trim()].filter(Boolean),
    };
  }
  return {
    title: action || "Событие",
    tone: "default",
    lines: [],
  };
}

export function buildOrderTimeline({ orderId, auditRows, orderRows }) {
  const rows = Array.isArray(orderRows) ? orderRows : [];
  const first = rows[0] || {};
  const timeline = [];
  const createdAt = String(first.createdAt || first.created_at || "").trim();
  if (createdAt) {
    timeline.push({
      id: `created-${orderId}`,
      createdAt,
      title: "Заказ создан",
      actor: "Система",
      tone: "created",
      lines: [String(first.week || "").trim() ? `План: ${String(first.week).trim()}` : ""].filter(Boolean),
    });
  }

  (Array.isArray(auditRows) ? auditRows : [])
    .filter((row) => rowMatchesOrder(row, orderId))
    .forEach((row) => {
      const description = describeAuditRow(row);
      timeline.push({
        id: row?.id ?? `${row?.created_at || ""}-${row?.action || "event"}`,
        createdAt: String(row?.created_at || "").trim(),
        actor: actorLabel(row),
        ...description,
      });
    });

  return timeline.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}
