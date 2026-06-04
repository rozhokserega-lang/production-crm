-- ============================================================
-- RPC для редактора BOM фурнитуры (блупринт-граф):
--   web_upsert_hardware_bom_row     — добавить/изменить связь изделие↔фурнитура (кол-во)
--   web_delete_hardware_bom_row     — удалить связь
--   web_rename_hardware_bom_product — переименовать изделие (в bom и в product_map)
-- ============================================================

-- ------------------------------------------------------------
-- Upsert одной строки нормы расхода (hardware_bom)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_upsert_hardware_bom_row(
  p_id               BIGINT,
  p_hardware_item_id BIGINT,
  p_bom_product      TEXT,
  p_qty              NUMERIC DEFAULT 0
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_product TEXT   := trim(coalesce(p_bom_product, ''));
  v_item    BIGINT := p_hardware_item_id;
  v_qty     NUMERIC := coalesce(p_qty, 0);
  v_id      BIGINT;
BEGIN
  IF v_product = '' THEN
    RAISE EXCEPTION 'bom_product is required';
  END IF;
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'hardware_item_id is required';
  END IF;
  IF v_qty < 0 THEN
    RAISE EXCEPTION 'qty must be >= 0';
  END IF;

  IF p_id IS NOT NULL AND p_id > 0 THEN
    UPDATE public.hardware_bom
      SET hardware_item_id = v_item,
          bom_product = v_product,
          qty_per_unit = v_qty
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'hardware_bom row % not found', p_id;
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.hardware_bom (hardware_item_id, bom_product, qty_per_unit)
  VALUES (v_item, v_product, v_qty)
  ON CONFLICT (hardware_item_id, lower(trim(bom_product)))
  DO UPDATE SET qty_per_unit = EXCLUDED.qty_per_unit
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- Удалить строку нормы расхода
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_delete_hardware_bom_row(p_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.hardware_bom WHERE id = p_id;
END;
$$;

-- ------------------------------------------------------------
-- Переименовать изделие BOM (каскадно в bom и product_map)
-- Не сливает с существующим изделием, чтобы не нарушить unique-индексы.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_rename_hardware_bom_product(
  p_old TEXT,
  p_new TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_old   TEXT := trim(coalesce(p_old, ''));
  v_new   TEXT := trim(coalesce(p_new, ''));
  v_count INTEGER := 0;
  v_n     INTEGER;
BEGIN
  IF v_old = '' OR v_new = '' THEN
    RAISE EXCEPTION 'old and new product names are required';
  END IF;

  -- Только нормализация написания (тот же ключ) — обновляем без проверки конфликта.
  IF lower(v_old) = lower(v_new) THEN
    UPDATE public.hardware_bom SET bom_product = v_new
      WHERE lower(trim(bom_product)) = lower(v_old);
    UPDATE public.hardware_product_map SET bom_product = v_new
      WHERE lower(trim(bom_product)) = lower(v_old);
    RETURN 0;
  END IF;

  IF EXISTS (SELECT 1 FROM public.hardware_bom WHERE lower(trim(bom_product)) = lower(v_new))
     OR EXISTS (SELECT 1 FROM public.hardware_product_map WHERE lower(trim(bom_product)) = lower(v_new)) THEN
    RAISE EXCEPTION 'product "%" already exists', v_new;
  END IF;

  UPDATE public.hardware_bom SET bom_product = v_new
    WHERE lower(trim(bom_product)) = lower(v_old);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  UPDATE public.hardware_product_map SET bom_product = v_new
    WHERE lower(trim(bom_product)) = lower(v_old);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.web_upsert_hardware_bom_row(BIGINT, BIGINT, TEXT, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_delete_hardware_bom_row(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_rename_hardware_bom_product(TEXT, TEXT) TO anon, authenticated, service_role;
