-- ============================================================
-- Фурнитура: план по заказам (как отгрузка) + детализация по ячейке
-- ============================================================

CREATE OR REPLACE FUNCTION public.web_get_hardware_item_requirement(
  p_section_name TEXT,
  p_item         TEXT,
  p_qty          NUMERIC DEFAULT 0
)
RETURNS TABLE(
  hardware_item_id BIGINT,
  name             TEXT,
  size             TEXT,
  unit             TEXT,
  qty_per_unit     NUMERIC,
  required         NUMERIC,
  available        NUMERIC,
  deficit          NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH inp AS (
    SELECT
      trim(coalesce(p_section_name, '')) AS section_name,
      trim(coalesce(p_item, '')) AS item,
      GREATEST(0, coalesce(p_qty, 0)) AS qty
  ),
  products AS (
    SELECT DISTINCT m.bom_product
    FROM public.hardware_product_map m, inp
    WHERE m.is_active = TRUE
      AND inp.item <> ''
      AND (
        (nullif(trim(m.section_name), '') IS NOT NULL
          AND lower(trim(m.section_name)) = lower(inp.section_name))
        OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL
          AND inp.item ILIKE m.item_name_pattern)
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
    a.qty_per_unit * (SELECT qty FROM inp) AS required,
    coalesce(s.qty, 0) AS available,
    GREATEST(0, a.qty_per_unit * (SELECT qty FROM inp) - coalesce(s.qty, 0)) AS deficit
  FROM agg a
  JOIN public.hardware_items i ON i.id = a.hardware_item_id
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE a.qty_per_unit > 0
  ORDER BY deficit DESC, i.sort_order ASC, i.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.web_get_hardware_plan_board(
  p_plan_key TEXT DEFAULT ''
)
RETURNS TABLE(
  section_name            TEXT,
  item                    TEXT,
  material                TEXT,
  week                    TEXT,
  qty                     NUMERIC,
  source_row_id           TEXT,
  source_col_id           TEXT,
  order_id                TEXT,
  hardware_mapped         BOOLEAN,
  hardware_ok             BOOLEAN,
  hardware_deficit_items  INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH cells AS (
    SELECT
      coalesce(nullif(trim(c.section_name), ''), 'Прочее') AS section_name,
      trim(coalesce(c.item, '')) AS item,
      coalesce(trim(c.material), '') AS material,
      trim(coalesce(c.week, '')) AS week,
      coalesce(c.qty, 0) AS qty,
      trim(coalesce(c.source_row_id, '')) AS source_row_id,
      trim(coalesce(c.source_col_id, '')) AS source_col_id
    FROM public.shipment_plan_cells c
    WHERE trim(coalesce(c.week, '')) = trim(coalesce(p_plan_key, ''))
      AND coalesce(c.qty, 0) > 0
      AND trim(coalesce(c.item, '')) <> ''
  ),
  cell_products AS (
    SELECT DISTINCT
      cl.section_name,
      cl.item,
      cl.material,
      cl.week,
      cl.qty,
      cl.source_row_id,
      cl.source_col_id,
      m.bom_product
    FROM cells cl
    JOIN public.hardware_product_map m
      ON m.is_active = TRUE
     AND (
       (nullif(trim(m.section_name), '') IS NOT NULL
         AND lower(trim(m.section_name)) = lower(cl.section_name))
       OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL
         AND cl.item ILIKE m.item_name_pattern)
     )
  ),
  cell_req AS (
    SELECT
      cp.source_row_id,
      cp.source_col_id,
      cp.section_name,
      cp.item,
      cp.material,
      cp.week,
      cp.qty,
      b.hardware_item_id,
      sum(cp.qty * b.qty_per_unit) AS required
    FROM cell_products cp
    JOIN public.hardware_bom b
      ON lower(trim(b.bom_product)) = lower(trim(cp.bom_product))
    GROUP BY
      cp.source_row_id, cp.source_col_id, cp.section_name, cp.item,
      cp.material, cp.week, cp.qty, b.hardware_item_id
  ),
  cell_status AS (
    SELECT
      cr.source_row_id,
      cr.source_col_id,
      cr.section_name,
      cr.item,
      cr.material,
      cr.week,
      cr.qty,
      count(*)::int AS hardware_item_count,
      count(*) FILTER (WHERE cr.required > coalesce(s.qty, 0))::int AS hardware_deficit_items,
      bool_and(cr.required <= coalesce(s.qty, 0)) AS hardware_ok
    FROM cell_req cr
    LEFT JOIN public.hardware_stock s ON s.hardware_item_id = cr.hardware_item_id
    GROUP BY
      cr.source_row_id, cr.source_col_id, cr.section_name, cr.item,
      cr.material, cr.week, cr.qty
  ),
  orders_link AS (
    SELECT DISTINCT ON (trim(o.source_row_id), trim(o.week))
      trim(o.source_row_id) AS source_row_id,
      trim(o.week) AS week,
      trim(o.order_id) AS order_id
    FROM public.orders o
    WHERE trim(coalesce(o.week, '')) = trim(coalesce(p_plan_key, ''))
      AND trim(coalesce(o.source_row_id, '')) <> ''
    ORDER BY trim(o.source_row_id), trim(o.week), o.updated_at DESC NULLS LAST
  )
  SELECT
    cl.section_name,
    cl.item,
    cl.material,
    cl.week,
    cl.qty,
    cl.source_row_id,
    cl.source_col_id,
    coalesce(ol.order_id, '') AS order_id,
    coalesce(cs.hardware_item_count, 0) > 0 AS hardware_mapped,
    CASE
      WHEN coalesce(cs.hardware_item_count, 0) = 0 THEN NULL
      ELSE coalesce(cs.hardware_ok, TRUE)
    END AS hardware_ok,
    coalesce(cs.hardware_deficit_items, 0) AS hardware_deficit_items
  FROM cells cl
  LEFT JOIN cell_status cs
    ON cs.source_row_id = cl.source_row_id
   AND cs.source_col_id = cl.source_col_id
  LEFT JOIN orders_link ol
    ON ol.source_row_id = cl.source_row_id
   AND ol.week = cl.week
  ORDER BY cl.section_name, cl.item, cl.source_row_id, cl.source_col_id;
$$;

GRANT EXECUTE ON FUNCTION public.web_get_hardware_item_requirement(TEXT, TEXT, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_get_hardware_plan_board(TEXT) TO anon, authenticated, service_role;
