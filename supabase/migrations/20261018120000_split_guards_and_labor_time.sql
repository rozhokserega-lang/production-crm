-- Три правки по разделению заказов:
--
-- 1. Расчёт обрезков отключён. Триггер trg_register_leftovers_on_order_insert
--    (web_register_leftovers_for_order) автоматически регистрировал обрезки при
--    создании заказа — в том числе повторно, когда разделение создавало второй
--    заказ по тому же source_row_id. Функция остаётся на месте, выключен только
--    триггер. Вернуть: ALTER TABLE public.orders ENABLE TRIGGER trg_register_leftovers_on_order_insert;
--
-- 2. Позиции обвязки делить нельзя (ни из цеха, ни с доски), и нельзя переносить
--    остаток в неделю «X» или «обвязка»: web_norm_week_key срезает нецифры, и
--    ячейка уехала бы в фиктивную неделю «0».
--
-- 3. Время (labor_facts) при разделении. Строка остаётся одна на заказ.
--    Источник: то же время (минуты не меняются), количество = оставшейся части.
--    Второй заказ (переехал в другую неделю): берёт время заказа ДО разделения
--    как основу и дальше считает как обычно. Если остаток дописали к уже
--    существующему заказу (повторное разделение в ту же неделю), его минуты не
--    трогаем — они уже его собственные, — но количество приводим в соответствие.
--
-- Тела функций сняты с живой БД (pg_get_functiondef) — в проекте осознанный
-- дрейф истории миграций (см. supabase/migrations/README.md).

-- 1. Обрезки: расчёт выключен
ALTER TABLE public.orders DISABLE TRIGGER trg_register_leftovers_on_order_insert;


-- 2-3. Разделение заказа
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
  v_order           public.orders%ROWTYPE;
  src               public.shipment_plan_cells%ROWTYPE;
  tgt               public.shipment_plan_cells%ROWTYPE;
  v_keep            NUMERIC := GREATEST(0, coalesce(p_qty_keep, 0));
  v_move            NUMERIC := GREATEST(0, coalesce(p_qty_move, 0));
  v_target_week     TEXT := public.web_norm_week_key(p_target_week);
  v_target_col      TEXT;
  v_section         TEXT;
  v_output          NUMERIC;
  v_sheets          NUMERIC;
  v_target_qty      NUMERIC;
  v_new_order_id    TEXT;
  v_target_order_id TEXT;
BEGIN
  PERFORM public.web_require_roles(ARRAY['manager', 'admin']);

  IF coalesce(trim(p_order_id), '') = '' THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;
  -- Проверяем исходный параметр: web_norm_week_key('') вернула бы '0'.
  IF coalesce(trim(coalesce(p_target_week, '')), '') = '' THEN
    RAISE EXCEPTION 'Target week is required';
  END IF;
  -- «X» и «обвязка» тоже нормализуются в '0' — переносить в них нельзя.
  IF lower(trim(p_target_week)) IN ('x', 'обвязка') THEN
    RAISE EXCEPTION 'В неделю «%» переносить нельзя — выберите обычную неделю', trim(p_target_week);
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

  IF coalesce(v_order.item, '') ILIKE '%обвяз%' THEN
    RAISE EXCEPTION 'Позицию обвязки разделить нельзя';
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

  -- Позиции обвязки живут в отдельном разделе/колонке.
  IF coalesce(src.section_name, '') ILIKE '%обвяз%' OR coalesce(src.week, '') ILIKE '%обвяз%' THEN
    RAISE EXCEPTION 'Позицию обвязки разделить нельзя';
  END IF;

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

  -- Целевая ячейка ищется по СТРОКЕ источника и неделе: остаток — это тот же
  -- заказ в другой неделе, а не новая позиция плана. Поиск по item+material
  -- мог попасть в ячейку чужой строки с тем же изделием.
  SELECT *
    INTO tgt
  FROM public.shipment_plan_cells spc
  WHERE spc.source_row_id = v_order.source_row_id
    AND public.web_norm_week_key(spc.week) = v_target_week
  ORDER BY spc.updated_at DESC NULLS LAST, spc.id DESC
  LIMIT 1;

  IF FOUND THEN
    IF NOT coalesce(tgt.in_work, FALSE) THEN
      RAISE EXCEPTION 'В неделе % уже есть позиция этой строки, ожидающая запуска — выберите другую неделю или отправьте её в работу', v_target_week;
    END IF;

    -- Позиция цели в работе: дописываем количество и её заказу, иначе ячейка
    -- и заказ разойдутся (ячейка 75 при заказе 50).
    SELECT o.order_id
      INTO v_target_order_id
    FROM public.orders o
    WHERE trim(coalesce(o.source_row_id, '')) = trim(coalesce(v_order.source_row_id, ''))
      AND public.web_norm_week_key(coalesce(o.week, '')) = v_target_week
      AND coalesce(o.shipped, FALSE) = FALSE
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF v_target_order_id IS NULL THEN
      RAISE EXCEPTION 'В неделе % позиция в работе, но связанный заказ не найден', v_target_week;
    END IF;

    UPDATE public.orders
    SET qty = coalesce(qty, 0) + v_move,
        updated_at = now()
    WHERE order_id = v_target_order_id;

    -- Минуты у этого заказа свои — не трогаем. Количество держим в соответствии
    -- с orders.qty, как и у источника.
    UPDATE public.labor_facts
    SET qty = coalesce(qty, 0) + v_move,
        updated_at = now()
    WHERE order_id = v_target_order_id;

    v_new_order_id := v_target_order_id;
    v_target_qty := coalesce(tgt.qty, 0) + v_move;
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_target_qty / v_output) ELSE 0 END;
    UPDATE public.shipment_plan_cells
    SET qty = v_target_qty,
        sheets_needed = v_sheets,
        updated_at = now()
    WHERE id = tgt.id;
  ELSE
    -- Позиции в целевой неделе нет: отделённая часть — второй заказ с теми же
    -- статусами стадий, сразу в работе.
    v_new_order_id := 'SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    INSERT INTO public.orders (
      order_id, source, source_row_id, item, material, week, qty,
      pilka_status, kromka_status, pras_status, assembly_status, overall_status,
      consume_sheets, product_article
    ) VALUES (
      v_new_order_id, v_order.source, v_order.source_row_id, v_order.item, v_order.material,
      v_target_week, v_move,
      v_order.pilka_status, v_order.kromka_status, v_order.pras_status,
      v_order.assembly_status, v_order.overall_status,
      coalesce(v_order.consume_sheets, FALSE), v_order.product_article
    );

    -- Время до разделения берётся за основу обоими заказами: источник сохраняет
    -- свои минуты, второй заказ получает их копию и дальше считает сам.
    -- total_min не переносим — это генерируемая колонка (сумма минут по стадиям).
    INSERT INTO public.labor_facts (
      order_id, item, week, qty,
      pilka_min, kromka_min, pras_min, assembly_min, date_finished
    )
    SELECT v_new_order_id, lf.item, v_target_week, v_move,
           lf.pilka_min, lf.kromka_min, lf.pras_min, lf.assembly_min, lf.date_finished
    FROM public.labor_facts lf
    WHERE lf.order_id = v_order.order_id;

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
      '#ffff00', FALSE, TRUE,
      v_sheets, coalesce(src.available_sheets, 0), v_output, 'split from order ' || v_order.order_id
    );
  END IF;

  UPDATE public.orders
  SET qty = v_keep,
      updated_at = now()
  WHERE order_id = v_order.order_id;

  UPDATE public.labor_facts
  SET qty = v_keep,
      updated_at = now()
  WHERE order_id = v_order.order_id;

  PERFORM public.web_audit_log_event(
    'split_order', 'order', v_order.order_id,
    jsonb_build_object(
      'qty_keep', v_keep,
      'qty_move', v_move,
      'source_week', v_order.week,
      'target_week', v_target_week,
      'new_order_id', v_new_order_id
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'order_id', v_order.order_id,
    'source_week', v_order.week,
    'source_qty', v_keep,
    'target_week', v_target_week,
    'target_qty', v_target_qty,
    'new_order_id', v_new_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_split_workshop_order(TEXT, NUMERIC, TEXT, NUMERIC)
  TO anon, authenticated, service_role;


-- Те же запреты для ветки «ожидания» на доске (ячейка ещё не в работе).
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
  -- «X» и «обвязка» тоже нормализуются в '0' — переносить в них нельзя.
  IF lower(trim(p_target_week)) IN ('x', 'обвязка') THEN
    RAISE EXCEPTION 'В неделю «%» переносить нельзя — выберите обычную неделю', trim(p_target_week);
  END IF;
  IF v_keep <= 0 OR v_move <= 0 THEN RAISE EXCEPTION 'Количество в каждой части должно быть больше 0'; END IF;
  SELECT * INTO src FROM public.shipment_plan_cells spc WHERE spc.source_row_id = trim(p_row) AND spc.source_col_id = trim(p_col) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ячейка плана не найдена'; END IF;

  -- Позицию обвязки делить нельзя ни в работе, ни в ожидании.
  IF coalesce(src.section_name, '') ILIKE '%обвяз%' OR coalesce(src.week, '') ILIKE '%обвяз%' THEN
    RAISE EXCEPTION 'Позицию обвязки разделить нельзя';
  END IF;

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
