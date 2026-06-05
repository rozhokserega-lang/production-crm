-- Разделение позиции плана отгрузки на две недели

CREATE OR REPLACE FUNCTION public.web_split_shipment_plan_cell(
  p_row         TEXT,
  p_col         TEXT,
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
  src             public.shipment_plan_cells%ROWTYPE;
  tgt             public.shipment_plan_cells%ROWTYPE;
  v_keep          NUMERIC := GREATEST(0, coalesce(p_qty_keep, 0));
  v_move          NUMERIC := GREATEST(0, coalesce(p_qty_move, 0));
  v_target_week   TEXT := public.web_norm_week_key(p_target_week);
  v_target_col    TEXT;
  v_output        NUMERIC;
  v_sheets        NUMERIC;
  v_target_qty    NUMERIC;
BEGIN
  PERFORM public.web_require_roles(ARRAY['manager', 'admin']);

  IF coalesce(trim(p_row), '') = '' OR coalesce(trim(p_col), '') = '' THEN
    RAISE EXCEPTION 'Row/col are required';
  END IF;
  IF v_target_week = '' THEN
    RAISE EXCEPTION 'Target week is required';
  END IF;
  IF v_keep <= 0 OR v_move <= 0 THEN
    RAISE EXCEPTION 'Количество в каждой части должно быть больше 0';
  END IF;

  SELECT *
    INTO src
  FROM public.shipment_plan_cells spc
  WHERE spc.source_row_id = trim(p_row)
    AND spc.source_col_id = trim(p_col)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ячейка плана не найдена: row %, col %', p_row, p_col;
  END IF;

  IF coalesce(src.in_work, FALSE) OR NOT coalesce(src.can_send_to_work, FALSE) THEN
    RAISE EXCEPTION 'Позиция недоступна для разделения (уже в работе или закрыта)';
  END IF;

  IF v_keep + v_move <> coalesce(src.qty, 0) THEN
    RAISE EXCEPTION 'Сумма частей (%) должна равняться количеству в плане (%)',
      v_keep + v_move, coalesce(src.qty, 0);
  END IF;

  IF public.web_norm_week_key(src.week) = v_target_week THEN
    RAISE EXCEPTION 'Целевой план должен отличаться от текущего (%)', src.week;
  END IF;

  v_output := public.web_resolve_output_per_sheet(
    src.section_name, src.item, src.material, NULL, coalesce(src.output_per_sheet, 0)
  );
  v_sheets := CASE WHEN v_output > 0 THEN ceil(v_keep / v_output) ELSE 0 END;

  UPDATE public.shipment_plan_cells
  SET qty = v_keep,
      sheets_needed = v_sheets,
      can_send_to_work = TRUE,
      in_work = FALSE,
      updated_at = now()
  WHERE id = src.id;

  v_target_col := v_target_week;

  SELECT *
    INTO tgt
  FROM public.shipment_plan_cells spc
  WHERE public.web_norm_week_key(spc.week) = v_target_week
    AND public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(src.section_name)
    AND public.web_norm_item_key(spc.item) = public.web_norm_item_key(src.item)
    AND public.web_norm_item_key(coalesce(spc.material, '')) =
        public.web_norm_item_key(coalesce(src.material, ''))
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
      src.section_name, src.item, src.material, v_target_week, v_target_qty,
      src.source_row_id, v_target_col, src.source_row_id, v_target_col,
      coalesce(nullif(trim(src.bg), ''), '#ffffff'), TRUE, FALSE,
      v_sheets, coalesce(src.available_sheets, 0), v_output, 'split from plan ' || src.week
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'source_week', src.week,
    'source_qty', v_keep,
    'target_week', v_target_week,
    'target_qty', v_target_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_split_shipment_plan_cell(TEXT, TEXT, NUMERIC, TEXT, NUMERIC)
  TO anon, authenticated, service_role;
