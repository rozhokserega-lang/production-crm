-- ============================================================
-- Склад фурнитуры: приход с примечанием + полная история движений
-- ============================================================

-- Приход/корректировка с опциональным примечанием
CREATE OR REPLACE FUNCTION public.web_add_hardware_stock(
  p_item_id BIGINT,
  p_delta   NUMERIC,
  p_note    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_delta NUMERIC := coalesce(p_delta, 0);
  v_note  TEXT := nullif(trim(coalesce(p_note, '')), '');
  v_type  TEXT;
BEGIN
  IF p_item_id IS NULL OR v_delta = 0 THEN
    RETURN;
  END IF;

  IF v_delta > 0 THEN
    v_type := 'income';
    v_note := coalesce(v_note, 'приход');
  ELSE
    v_type := 'adjust';
    v_note := coalesce(v_note, 'корректировка');
  END IF;

  INSERT INTO public.hardware_stock (hardware_item_id, qty)
  VALUES (p_item_id, GREATEST(0, v_delta))
  ON CONFLICT (hardware_item_id) DO UPDATE
    SET qty = GREATEST(0, public.hardware_stock.qty + v_delta),
        updated_at = now();

  INSERT INTO public.hardware_moves (hardware_item_id, qty, move_type, note)
  VALUES (p_item_id, v_delta, v_type, v_note);
END;
$$;

-- Инвентаризация: явная пометка в журнале
CREATE OR REPLACE FUNCTION public.web_set_hardware_stock(
  p_item_id BIGINT,
  p_qty     NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_qty NUMERIC := GREATEST(0, coalesce(p_qty, 0));
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'hardware item id is required';
  END IF;
  INSERT INTO public.hardware_stock (hardware_item_id, qty)
  VALUES (p_item_id, v_qty)
  ON CONFLICT (hardware_item_id) DO UPDATE
    SET qty = v_qty,
        updated_at = now();
  INSERT INTO public.hardware_moves (hardware_item_id, qty, move_type, note)
  VALUES (p_item_id, v_qty, 'adjust', 'инвентаризация');
END;
$$;

-- Вся история движений (приход, списание, инвентаризация)
CREATE OR REPLACE FUNCTION public.web_get_hardware_consume_history(
  p_limit INTEGER DEFAULT 300
)
RETURNS TABLE(
  move_id     BIGINT,
  created_at  TIMESTAMPTZ,
  order_id    TEXT,
  name        TEXT,
  size        TEXT,
  qty         NUMERIC,
  move_type   TEXT,
  note        TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT
    m.id AS move_id,
    m.created_at,
    trim(coalesce(m.order_id, '')) AS order_id,
    i.name,
    i.size,
    m.qty,
    m.move_type,
    m.note
  FROM public.hardware_moves m
  JOIN public.hardware_items i ON i.id = m.hardware_item_id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 300), 2000));
$$;

GRANT EXECUTE ON FUNCTION public.web_add_hardware_stock(BIGINT, NUMERIC, TEXT) TO anon, authenticated, service_role;
