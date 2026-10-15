-- Фикс проверки целевой недели при разделении.
--
-- Было: v_target_week := web_norm_week_key(p_target_week), затем IF v_target_week = ''.
-- web_norm_week_key() реализована как coalesce(..., '0'), поэтому при пустом или
-- NULL входе она возвращает '0', а не ''. Проверка `= ''` не срабатывала никогда:
-- пустая неделя проходила дальше и создавала ячейку плана в фиктивной неделе '0'.
-- Заодно не работала защита «целевая неделя должна отличаться от текущей».
--
-- Стало: проверяется исходный параметр до нормализации.
--
-- Затронуты обе функции с этим шаблоном:
--   web_split_workshop_order (20261014120000)
--   web_split_shipment_plan_cell (20260604200000)
--
-- Определения ниже сняты с живой БД (pg_get_functiondef), а не из истории
-- миграций — в проекте осознанный дрейф (см. supabase/migrations/README.md).

CREATE OR REPLACE FUNCTION public.web_split_workshop_order(
  p_order_id    TEXT,
  p_qty_keep    NUMERIC,
  p_target_week TEXT,
  p_qty_move    NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_order        public.orders%ROWTYPE;
  src            public.shipment_plan_cells%ROWTYPE;
  tgt            public.shipment_plan_cells%ROWTYPE;
  v_keep         NUMERIC := GREATEST(0, coalesce(p_qty_keep, 0));
  v_move         NUMERIC := GREATEST(0, coalesce(p_qty_move, 0));
  v_target_week  TEXT := public.web_norm_week_key(p_target_week);
  v_target_col   TEXT;
  v_section      TEXT;
  v_output       NUMERIC;
  v_sheets       NUMERIC;
  v_target_qty   NUMERIC;
BEGIN
  PERFORM public.web_require_roles(ARRAY['manager', 'admin']);

  IF coalesce(trim(p_order_id), '') = '' THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;
  -- Проверяем исходный параметр: web_norm_week_key('') вернула бы '0'.
  IF coalesce(trim(coalesce(p_target_week, '')), '') = '' THEN
    RAISE EXCEPTION 'Target week is required';
  END IF;
  IF v_keep <= 0 OR v_move <= 0 THEN
    RAISE EXCEPTION 'Количество в каждой части должно быть больше 0';
  END IF;

  SELECT *
    INTO v_order
  FROM public.orders o
  WHERE o.order_id = trim(p_order_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден: %', p_order_id;
  END IF;

  IF coalesce(v_order.shipped, FALSE) OR coalesce(v_order.pipeline_stage, '') = 'shipped' THEN
    RAISE EXCEPTION 'Нельзя разделить отгруженный заказ %', p_order_id;
  END IF;

  IF v_keep + v_move <> coalesce(v_order.qty, 0) THEN
    RAISE EXCEPTION 'Сумма частей (%) должна равняться количеству в заказе (%)',
      v_keep + v_move, coalesce(v_order.qty, 0);
  END IF;

  IF public.web_norm_week_key(v_order.week) = v_target_week THEN
    RAISE EXCEPTION 'Целевой план должен отличаться от текущего (%)', v_order.week;
  END IF;

  -- Исходная ячейка плана заказа: уменьшаем вместе с заказом, чтобы повторный
  -- «отправить в работу» не откатил orders.qty к полному количеству ячейки.
  SELECT *
    INTO src
  FROM public.shipment_plan_cells spc
  WHERE spc.source_row_id = v_order.source_row_id
    AND public.web_norm_week_key(spc.week) = public.web_norm_week_key(v_order.week)
    AND public.web_norm_item_key(coalesce(spc.material, '')) =
        public.web_norm_item_key(coalesce(v_order.material, ''))
  ORDER BY spc.updated_at DESC NULLS LAST, spc.id DESC
  LIMIT 1;

  v_section := coalesce(nullif(trim(src.section_name), ''), 'Прочее');

  v_output := public.web_resolve_output_per_sheet(
    v_section, v_order.item, v_order.material, NULL, coalesce(src.output_per_sheet, 0)
  );

  IF FOUND THEN
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_keep / v_output) ELSE 0 END;
    UPDATE public.shipment_plan_cells
    SET qty = v_keep,
        sheets_needed = v_sheets,
        updated_at = now()
    WHERE id = src.id;
  ELSE
    -- заказа без ячейки плана (например, упаковка) — секцию берём из любой ячейки с этим изделием
    SELECT spc.section_name
      INTO v_section
    FROM public.shipment_plan_cells spc
    WHERE public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_order.item)
    ORDER BY spc.updated_at DESC NULLS LAST, spc.id DESC
    LIMIT 1;
    v_section := coalesce(nullif(trim(v_section), ''), 'Прочее');
  END IF;

  v_target_col := v_target_week;

  SELECT *
    INTO tgt
  FROM public.shipment_plan_cells spc
  WHERE public.web_norm_week_key(spc.week) = v_target_week
    AND public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(v_section)
    AND public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_order.item)
    AND public.web_norm_item_key(coalesce(spc.material, '')) =
        public.web_norm_item_key(coalesce(v_order.material, ''))
  ORDER BY spc.updated_at DESC NULLS LAST, spc.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF coalesce(tgt.in_work, FALSE) OR NOT coalesce(tgt.can_send_to_work, FALSE) THEN
      RAISE EXCEPTION 'В целевом плане % уже есть эта позиция, но она недоступна для дополнения', v_target_week;
    END IF;
    v_target_qty := coalesce(tgt.qty, 0) + v_move;
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_target_qty / v_output) ELSE 0 END;
    UPDATE public.shipment_plan_cells
    SET qty = v_target_qty,
        sheets_needed = v_sheets,
        updated_at = now()
    WHERE id = tgt.id;
  ELSE
    v_target_qty := v_move;
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_target_qty / v_output) ELSE 0 END;

    INSERT INTO public.shipment_plan_cells (
      section_name, item, material, week, qty,
      row_ref, col_ref, source_row_id, source_col_id,
      bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
    )
    VALUES (
      v_section, v_order.item, v_order.material, v_target_week, v_target_qty,
      coalesce(nullif(trim(src.source_row_id), ''), 'order-' || v_order.order_id), v_target_col,
      coalesce(nullif(trim(src.source_row_id), ''), 'order-' || v_order.order_id), v_target_col,
      coalesce(nullif(trim(src.bg), ''), '#ffffff'), TRUE, FALSE,
      v_sheets, coalesce(src.available_sheets, 0), v_output, 'split from order ' || v_order.order_id
    );
  END IF;

  UPDATE public.orders
  SET qty = v_keep,
      updated_at = now()
  WHERE order_id = v_order.order_id;

  UPDATE public.labor_facts
  SET qty = v_keep
  WHERE order_id = v_order.order_id;

  PERFORM public.web_audit_log_event(
    'split_order', 'order', v_order.order_id,
    jsonb_build_object(
      'qty_keep', v_keep,
      'qty_move', v_move,
      'source_week', v_order.week,
      'target_week', v_target_week
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'order_id', v_order.order_id,
    'source_week', v_order.week,
    'source_qty', v_keep,
    'target_week', v_target_week,
    'target_qty', v_target_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_split_workshop_order(TEXT, NUMERIC, TEXT, NUMERIC)
  TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.web_split_shipment_plan_cell(
  p_row text, p_col text, p_qty_keep numeric, p_target_week text, p_qty_move numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  src public.shipment_plan_cells%ROWTYPE;
  tgt public.shipment_plan_cells%ROWTYPE;
  v_keep NUMERIC := GREATEST(0, coalesce(p_qty_keep, 0));
  v_move NUMERIC := GREATEST(0, coalesce(p_qty_move, 0));
  v_target_week TEXT := public.web_norm_week_key(p_target_week);
  v_target_col TEXT;
  v_output NUMERIC;
  v_sheets NUMERIC;
  v_target_qty NUMERIC;
BEGIN
  PERFORM public.web_require_roles(ARRAY['manager', 'admin']);
  IF coalesce(trim(p_row), '') = '' OR coalesce(trim(p_col), '') = '' THEN RAISE EXCEPTION 'Row/col are required'; END IF;
  -- Проверяем исходный параметр: web_norm_week_key('') вернула бы '0'.
  IF coalesce(trim(coalesce(p_target_week, '')), '') = '' THEN RAISE EXCEPTION 'Target week is required'; END IF;
  IF v_keep <= 0 OR v_move <= 0 THEN RAISE EXCEPTION 'Количество в каждой части должно быть больше 0'; END IF;
  SELECT * INTO src FROM public.shipment_plan_cells spc WHERE spc.source_row_id = trim(p_row) AND spc.source_col_id = trim(p_col) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ячейка плана не найдена'; END IF;
  IF coalesce(src.in_work, FALSE) OR NOT coalesce(src.can_send_to_work, FALSE) THEN RAISE EXCEPTION 'Позиция недоступна для разделения'; END IF;
  IF v_keep + v_move <> coalesce(src.qty, 0) THEN RAISE EXCEPTION 'Сумма частей должна равняться количеству в плане'; END IF;
  IF public.web_norm_week_key(src.week) = v_target_week THEN RAISE EXCEPTION 'Целевой план должен отличаться от текущего'; END IF;
  v_output := public.web_resolve_output_per_sheet(src.section_name, src.item, src.material, NULL, coalesce(src.output_per_sheet, 0));
  v_sheets := CASE WHEN v_output > 0 THEN ceil(v_keep / v_output) ELSE 0 END;
  UPDATE public.shipment_plan_cells SET qty = v_keep, sheets_needed = v_sheets, can_send_to_work = TRUE, in_work = FALSE, updated_at = now() WHERE id = src.id;
  v_target_col := v_target_week;
  SELECT * INTO tgt FROM public.shipment_plan_cells spc WHERE public.web_norm_week_key(spc.week) = v_target_week AND public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(src.section_name) AND public.web_norm_item_key(spc.item) = public.web_norm_item_key(src.item) AND public.web_norm_item_key(coalesce(spc.material, '')) = public.web_norm_item_key(coalesce(src.material, '')) ORDER BY spc.updated_at DESC NULLS LAST, spc.id DESC LIMIT 1;
  IF FOUND THEN
    IF coalesce(tgt.in_work, FALSE) OR NOT coalesce(tgt.can_send_to_work, FALSE) THEN RAISE EXCEPTION 'В целевом плане уже есть эта позиция, но она недоступна'; END IF;
    v_target_qty := coalesce(tgt.qty, 0) + v_move;
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_target_qty / v_output) ELSE 0 END;
    UPDATE public.shipment_plan_cells SET qty = v_target_qty, sheets_needed = v_sheets, updated_at = now() WHERE id = tgt.id;
  ELSE
    v_target_qty := v_move;
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_target_qty / v_output) ELSE 0 END;
    INSERT INTO public.shipment_plan_cells (section_name, item, material, week, qty, row_ref, col_ref, source_row_id, source_col_id, bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note) VALUES (src.section_name, src.item, src.material, v_target_week, v_target_qty, src.source_row_id, v_target_col, src.source_row_id, v_target_col, coalesce(nullif(trim(src.bg), ''), '#ffffff'), TRUE, FALSE, v_sheets, coalesce(src.available_sheets, 0), v_output, 'split from plan ' || src.week);
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'source_week', src.week, 'source_qty', v_keep, 'target_week', v_target_week, 'target_qty', v_target_qty);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.web_split_shipment_plan_cell(text, text, numeric, text, numeric)
  TO anon, authenticated, service_role;
