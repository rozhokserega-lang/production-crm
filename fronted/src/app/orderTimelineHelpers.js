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

/**
 * Человекочитаемая длительность между двумя ISO-таймстемпами.
 * "4 дня", "12 часов", "45 минут", "только что". Большие значения округляем до дней.
 */
function formatDuration(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "";
  const min = Math.round((end - start) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин`;
  const hours = Math.floor(min / 60);
  const remMin = min % 60;
  if (hours < 24) return remMin ? `${hours} ч ${remMin} мин` : `${hours} ч`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days} дн ${remHours} ч` : `${days} дн`;
}

/**
 * Сводка этапов с длительностью: «Пила: старт 10.07 12:41 → финиш 14.07 05:54 (4 дня)».
 * Строится из *_started_at / *_done_at в данных заказа (точные машинные timestamps).
 * Возвращает массив событий-этапов для вставки в начало timeline.
 */
function buildStageSummaryEvents(order, orderId) {
  if (!order) return [];
  const stages = [
    { key: "pilka", label: "Пила", startedAt: order.pilkaStartedAt, doneAt: order.pilkaDoneAt },
    { key: "kromka", label: "Кромка", startedAt: order.kromkaStartedAt, doneAt: order.kromkaDoneAt },
    { key: "pras", label: "Присадка", startedAt: order.prasStartedAt, doneAt: order.prasDoneAt },
  ];
  const events = [];
  for (const s of stages) {
    const started = String(s.startedAt || "").trim();
    const done = String(s.doneAt || "").trim();
    if (!started && !done) continue; // этап не начался — пропускаем
    let title;
    let lines = [];
    if (started && done) {
      const dur = formatDuration(started, done);
      title = `${s.label}: готово`;
      lines = [`старт → ${formatShort(started)} · финиш → ${formatShort(done)}${dur ? ` (${dur})` : ""}`];
    } else if (started) {
      title = `${s.label}: в работе`;
      const dur = formatDuration(started, new Date().toISOString());
      lines = [`старт → ${formatShort(started)}${dur ? ` · длится ${dur}` : ""}`];
    } else {
      // done без started — редкий случай (данные импортированы). Показываем финиш.
      title = `${s.label}: готово`;
      lines = [`финиш → ${formatShort(done)}`];
    }
    events.push({
      id: `stage-${s.key}-${orderId}`,
      // createdAt задаём как момент финиша (или старта, если ещё в работе) —
      // чтобы событие встало в хронологию timeline рядом с реальным моментом.
      createdAt: done || started,
      title,
      actor: "Система",
      tone: "stage",
      lines,
    });
  }
  return events;
}

/** Краткая дата «14.07 05:54» из ISO в UTC (детерминированно, не зависит от часового пояса машины). */
function formatShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function buildOrderTimeline({ orderId, auditRows, orderRows }) {
  const rows = Array.isArray(orderRows) ? orderRows : [];
  const first = rows[0] || {};
  const timeline = [];

  // 1. Заказ создан — самое раннее событие.
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

  // 2. Наглядная сводка этапов с длительностью (главное, чего не хватало).
  //    Строится из точных *_started_at / *_done_at заказа, а не из текстовых статусов.
  for (const evt of buildStageSummaryEvents(first, orderId)) {
    timeline.push(evt);
  }

  // 3. Сырая история из audit log: смены статусов, списания, комментарии.
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
