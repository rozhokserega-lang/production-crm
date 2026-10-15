-- Разделение позиции плана на доске «Отгрузка», когда она УЖЕ в работе.
--
-- Было: web_split_shipment_plan_cell отказывал для любой ячейки с in_work = true
-- ('Позиция недоступна для разделения'), поэтому на доске нельзя было разделить
-- позицию, отправленную в работу, — приходилось идти в цех.
--
-- Стало: если ячейка в работе, находим связанный заказ и делегируем в
-- web_split_workshop_order. Учёт заказа и ячейки идёт вместе, поэтому
-- разделение обязано менять их согласованно; иначе план и заказ разъедутся.
-- Ветка «ожидания» (ячейка не в работе) не меняется.
--
-- Предикат поиска заказа — тот же, что уже используют
-- web_send_shipment_to_work_by_source (20260626140000) и
-- web_revert_shipment_to_awaiting (20260811120000): source_row_id + неделя +
-- нормализованный материал, из неужели отгруженных берём самый свежий.
--
-- Тело функции снято с живой БД (pg_get_functiondef) — в проекте осознанный
-- дрейф истории миграций (см. supabase/migrations/README.md).

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
  v_order_id TEXT;
BEGIN
  PERFORM public.web_require_roles(ARRAY['manager', 'admin']);
  IF coalesce(trim(p_row), '') = '' OR coalesce(trim(p_col), '') = '' THEN RAISE EXCEPTION 'Row/col are required'; END IF;
  -- Проверяем исходный параметр: web_norm_week_key('') вернула бы '0'.
  IF coalesce(trim(coalesce(p_target_week, '')), '') = '' THEN RAISE EXCEPTION 'Target week is required'; END IF;
  IF v_keep <= 0 OR v_move <= 0 THEN RAISE EXCEPTION 'Количество в каждой части должно быть больше 0'; END IF;
  SELECT * INTO src FROM public.shipment_plan_cells spc WHERE spc.source_row_id = trim(p_row) AND spc.source_col_id = trim(p_col) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ячейка плана не найдена'; END IF;

  -- Ячейка в работе: делим связанный заказ — он и есть производство этой позиции,
  -- а разделение ячейки без заказа развело бы план и заказ.
  IF coalesce(src.in_work, FALSE) THEN
    SELECT o.order_id INTO v_order_id
    FROM public.orders o
    WHERE trim(coalesce(o.source_row_id, '')) = trim(coalesce(src.source_row_id, ''))
      AND public.web_norm_week_key(coalesce(o.week, '')) = public.web_norm_week_key(coalesce(src.week, ''))
      AND public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(src.material, ''))
      AND coalesce(o.shipped, FALSE) = FALSE
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF v_order_id IS NULL THEN
      RAISE EXCEPTION 'Позиция в работе, но связанный заказ не найден — разделить нельзя';
    END IF;

    -- web_split_workshop_order сам проверит роли, сумму частей, целевую неделю
    -- (и откажет для уже отгруженного заказа).
    RETURN public.web_split_workshop_order(v_order_id, p_qty_keep, p_target_week, p_qty_move);
  END IF;

  IF NOT coalesce(src.can_send_to_work, FALSE) THEN RAISE EXCEPTION 'Позиция недоступна для разделения'; END IF;
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
