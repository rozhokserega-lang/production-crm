-- ============================================================
-- Склад фурнитуры: расчёт по плану + списание по заказу.
-- ============================================================

-- ------------------------------------------------------------
-- RPC: достаточно ли фурнитуры на план
--   p_scope: 'shipment' (номер плана = неделя) | 'overview' (месяц по id)
--   p_plan_key: номер плана (shipment) или id месяца (overview)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_get_hardware_plan_requirement(
  p_scope    TEXT DEFAULT 'shipment',
  p_plan_key TEXT DEFAULT ''
)
RETURNS TABLE(
  hardware_item_id BIGINT,
  name             TEXT,
  size             TEXT,
  unit             TEXT,
  required         NUMERIC,
  available        NUMERIC,
  deficit          NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH weeks AS (
    SELECT CASE
      WHEN lower(coalesce(p_scope, '')) = 'overview' THEN (
        SELECT coalesce(m.weeks, '{}')
        FROM public.overview_plan_months m
        WHERE m.id = nullif(regexp_replace(coalesce(p_plan_key, ''), '\D', '', 'g'), '')::bigint
      )
      ELSE ARRAY[trim(coalesce(p_plan_key, ''))]
    END AS week_arr
  ),
  week_list AS (
    SELECT DISTINCT trim(x) AS week
    FROM weeks w, unnest(w.week_arr) AS x
    WHERE trim(coalesce(x, '')) <> ''
  ),
  demand AS (
    SELECT c.section_name, c.item, sum(coalesce(c.qty, 0)) AS qty
    FROM public.shipment_plan_cells c
    WHERE trim(coalesce(c.week, '')) IN (SELECT week FROM week_list)
    GROUP BY c.section_name, c.item
  ),
  demand_products AS (
    SELECT DISTINCT d.section_name, d.item, d.qty, m.bom_product
    FROM demand d
    JOIN public.hardware_product_map m
      ON m.is_active = TRUE
     AND (
       (nullif(trim(m.section_name), '') IS NOT NULL
         AND lower(trim(m.section_name)) = lower(trim(d.section_name)))
       OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL
         AND d.item ILIKE m.item_name_pattern)
     )
  ),
  matched AS (
    SELECT b.hardware_item_id, sum(dp.qty * b.qty_per_unit) AS required
    FROM demand_products dp
    JOIN public.hardware_bom b
      ON lower(trim(b.bom_product)) = lower(trim(dp.bom_product))
    GROUP BY b.hardware_item_id
  )
  SELECT
    i.id AS hardware_item_id,
    i.name,
    i.size,
    i.unit,
    coalesce(mt.required, 0) AS required,
    coalesce(s.qty, 0) AS available,
    GREATEST(0, coalesce(mt.required, 0) - coalesce(s.qty, 0)) AS deficit
  FROM matched mt
  JOIN public.hardware_items i ON i.id = mt.hardware_item_id
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE coalesce(mt.required, 0) > 0
  ORDER BY deficit DESC, i.sort_order ASC, i.name ASC;
$$;

-- ------------------------------------------------------------
-- RPC: предлагаемые строки списания фурнитуры для одного заказа
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_get_hardware_consume_options(
  p_order_id TEXT
)
RETURNS TABLE(
  hardware_item_id BIGINT,
  name             TEXT,
  size             TEXT,
  unit             TEXT,
  qty_per_unit     NUMERIC,
  suggested_qty    NUMERIC,
  available        NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH ord AS (
    SELECT o.order_id, o.item, o.material, o.week, coalesce(o.qty, 0) AS qty
    FROM public.orders o
    WHERE trim(o.order_id) = trim(coalesce(p_order_id, ''))
    LIMIT 1
  ),
  sect AS (
    SELECT c.section_name
    FROM public.shipment_plan_cells c, ord
    WHERE lower(trim(c.item)) = lower(trim(ord.item))
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1
  ),
  products AS (
    SELECT DISTINCT m.bom_product
    FROM public.hardware_product_map m, ord
    WHERE m.is_active = TRUE
      AND (
        (nullif(trim(m.section_name), '') IS NOT NULL
          AND lower(trim(m.section_name)) = lower(trim((SELECT section_name FROM sect))))
        OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL
          AND ord.item ILIKE m.item_name_pattern)
      )
  ),
  agg AS (
    SELECT b.hardware_item_id, sum(b.qty_per_unit) AS qty_per_unit
    FROM products p
    JOIN public.hardware_bom b
      ON lower(trim(b.bom_product)) = lower(trim(p.bom_product))
    GROUP BY b.hardware_item_id
  )
  SELECT
    i.id AS hardware_item_id,
    i.name,
    i.size,
    i.unit,
    a.qty_per_unit,
    a.qty_per_unit * coalesce((SELECT qty FROM ord), 0) AS suggested_qty,
    coalesce(s.qty, 0) AS available
  FROM agg a
  JOIN public.hardware_items i ON i.id = a.hardware_item_id
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE a.qty_per_unit > 0
  ORDER BY i.sort_order ASC, i.name ASC;
$$;

-- ------------------------------------------------------------
-- RPC: списать фурнитуру по заказу (idempotent на заказ+позицию)
--   p_lines: [{ "hardware_item_id": 1, "qty": 4 }, ...]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_consume_hardware_by_order_id(
  p_order_id TEXT,
  p_lines    JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_order_id TEXT := trim(coalesce(p_order_id, ''));
  v_lines    JSONB := coalesce(p_lines, '[]'::jsonb);
  v_row      JSONB;
  v_item_id  BIGINT;
  v_qty      NUMERIC;
  v_count    INTEGER := 0;
  v_results  JSONB := '[]'::jsonb;
  v_move_id  BIGINT;
BEGIN
  IF v_order_id = '' THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;
  IF jsonb_typeof(v_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines must be a json array';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_item_id := nullif(v_row->>'hardware_item_id', '')::bigint;
    v_qty := coalesce((v_row->>'qty')::numeric, 0);
    IF v_item_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_move_id := NULL;
    INSERT INTO public.hardware_moves (hardware_item_id, order_id, qty, move_type, note)
    VALUES (v_item_id, v_order_id, -v_qty, 'consume', 'consume after order closed')
    ON CONFLICT (lower(trim(coalesce(order_id, ''))), hardware_item_id) WHERE move_type = 'consume'
    DO NOTHING
    RETURNING id INTO v_move_id;

    IF v_move_id IS NULL THEN
      CONTINUE; -- already consumed for this order+item
    END IF;

    INSERT INTO public.hardware_stock (hardware_item_id, qty)
    VALUES (v_item_id, -v_qty)
    ON CONFLICT (hardware_item_id) DO UPDATE
      SET qty = public.hardware_stock.qty - v_qty,
          updated_at = now();

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('hardware_item_id', v_item_id, 'qty', v_qty, 'move_id', v_move_id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'lines_consumed', v_count, 'results', v_results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_get_hardware_plan_requirement(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_get_hardware_consume_options(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_consume_hardware_by_order_id(TEXT, JSONB) TO anon, authenticated, service_role;
