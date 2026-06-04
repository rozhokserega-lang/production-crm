-- ============================================================
-- Склад фурнитуры (hardware warehouse)
--   hardware_items        — справочник фурнитуры (наименование + размер)
--   hardware_bom          — нормы расхода: фурнитура x изделие = кол-во на 1 шт.
--   hardware_product_map  — соответствие изделия из BOM -> секция/изделие плана
--   hardware_stock        — остатки на складе
--   hardware_moves        — журнал движений (приход/списание/корректировка)
-- Зеркалит подход strap_stock / materials_stock.
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hardware_items (
  id          BIGSERIAL   PRIMARY KEY,
  name        TEXT        NOT NULL,
  size        TEXT        NOT NULL DEFAULT '',
  unit        TEXT        NOT NULL DEFAULT 'шт',
  sort_order  INTEGER     NOT NULL DEFAULT 100,
  photo_url   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hardware_items_name_size
  ON public.hardware_items (lower(trim(name)), lower(trim(coalesce(size, ''))));

CREATE TABLE IF NOT EXISTS public.hardware_bom (
  id               BIGSERIAL     PRIMARY KEY,
  hardware_item_id BIGINT        NOT NULL REFERENCES public.hardware_items(id) ON DELETE CASCADE,
  bom_product      TEXT          NOT NULL,
  qty_per_unit     NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hardware_bom_item_product
  ON public.hardware_bom (hardware_item_id, lower(trim(bom_product)));
CREATE INDEX IF NOT EXISTS idx_hardware_bom_product
  ON public.hardware_bom (lower(trim(bom_product)));

CREATE TABLE IF NOT EXISTS public.hardware_product_map (
  id                BIGSERIAL   PRIMARY KEY,
  bom_product       TEXT        NOT NULL,
  section_name      TEXT,
  item_name_pattern TEXT,
  sort_order        INTEGER     NOT NULL DEFAULT 100,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hardware_product_map_target_check
    CHECK (
      coalesce(nullif(trim(section_name), ''), nullif(trim(item_name_pattern), '')) IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hardware_product_map_key
  ON public.hardware_product_map (
    lower(trim(bom_product)),
    coalesce(lower(trim(section_name)), ''),
    coalesce(lower(trim(item_name_pattern)), '')
  );

CREATE TABLE IF NOT EXISTS public.hardware_stock (
  hardware_item_id BIGINT        PRIMARY KEY REFERENCES public.hardware_items(id) ON DELETE CASCADE,
  qty              NUMERIC(12,3) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hardware_moves (
  id               BIGSERIAL     PRIMARY KEY,
  hardware_item_id BIGINT        NOT NULL REFERENCES public.hardware_items(id) ON DELETE CASCADE,
  order_id         TEXT,
  qty              NUMERIC(12,3) NOT NULL DEFAULT 0,
  move_type        TEXT          NOT NULL DEFAULT 'consume',
  note             TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hardware_moves_created_at
  ON public.hardware_moves (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hardware_moves_order
  ON public.hardware_moves (lower(trim(coalesce(order_id, ''))));

-- Idempotency: one consume move per (order, item).
CREATE UNIQUE INDEX IF NOT EXISTS ux_hardware_moves_consume_once_per_order
  ON public.hardware_moves (lower(trim(coalesce(order_id, ''))), hardware_item_id)
  WHERE move_type = 'consume';

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.hardware_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_product_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_moves ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hardware_items','hardware_bom','hardware_product_map','hardware_stock','hardware_moves']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated, anon USING (true);', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated, anon WITH CHECK (true);', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated, anon USING (true);', t || '_delete', t);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_hardware_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hardware_items_touch ON public.hardware_items;
CREATE TRIGGER trg_hardware_items_touch
  BEFORE UPDATE ON public.hardware_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_hardware_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hardware_bom_touch ON public.hardware_bom;
CREATE TRIGGER trg_hardware_bom_touch
  BEFORE UPDATE ON public.hardware_bom
  FOR EACH ROW EXECUTE FUNCTION public.trg_hardware_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hardware_product_map_touch ON public.hardware_product_map;
CREATE TRIGGER trg_hardware_product_map_touch
  BEFORE UPDATE ON public.hardware_product_map
  FOR EACH ROW EXECUTE FUNCTION public.trg_hardware_touch_updated_at();

-- ------------------------------------------------------------
-- RPC: stock list (items joined with on-hand qty)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_get_hardware_stock()
RETURNS TABLE(
  id          BIGINT,
  name        TEXT,
  size        TEXT,
  unit        TEXT,
  sort_order  INTEGER,
  photo_url   TEXT,
  qty         NUMERIC,
  updated_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT
    i.id,
    i.name,
    i.size,
    i.unit,
    i.sort_order,
    i.photo_url,
    coalesce(s.qty, 0) AS qty,
    coalesce(s.updated_at, i.updated_at) AS updated_at
  FROM public.hardware_items i
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE i.is_active = TRUE
  ORDER BY i.sort_order ASC, i.name ASC, i.size ASC;
$$;

-- ------------------------------------------------------------
-- RPC: set stock (absolute)
-- ------------------------------------------------------------
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
  VALUES (p_item_id, v_qty, 'adjust', 'set stock');
END;
$$;

-- ------------------------------------------------------------
-- RPC: add stock (increment, приход)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_add_hardware_stock(
  p_item_id BIGINT,
  p_delta   NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_delta NUMERIC := coalesce(p_delta, 0);
BEGIN
  IF p_item_id IS NULL OR v_delta = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.hardware_stock (hardware_item_id, qty)
  VALUES (p_item_id, GREATEST(0, v_delta))
  ON CONFLICT (hardware_item_id) DO UPDATE
    SET qty = GREATEST(0, public.hardware_stock.qty + v_delta),
        updated_at = now();
  INSERT INTO public.hardware_moves (hardware_item_id, qty, move_type, note)
  VALUES (p_item_id, v_delta, 'receipt', 'add stock');
END;
$$;

-- ------------------------------------------------------------
-- RPC: upsert hardware item (admin)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_upsert_hardware_item(
  p_id         BIGINT,
  p_name       TEXT,
  p_size       TEXT DEFAULT '',
  p_unit       TEXT DEFAULT 'шт',
  p_sort_order INTEGER DEFAULT 100,
  p_photo_url  TEXT DEFAULT NULL,
  p_is_active  BOOLEAN DEFAULT TRUE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_name TEXT := trim(coalesce(p_name, ''));
  v_size TEXT := trim(coalesce(p_size, ''));
  v_id   BIGINT;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'hardware name is required';
  END IF;

  IF p_id IS NOT NULL AND p_id > 0 THEN
    UPDATE public.hardware_items
      SET name = v_name,
          size = v_size,
          unit = coalesce(nullif(trim(p_unit), ''), 'шт'),
          sort_order = coalesce(p_sort_order, 100),
          photo_url = p_photo_url,
          is_active = coalesce(p_is_active, TRUE)
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'hardware item % not found', p_id;
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.hardware_items (name, size, unit, sort_order, photo_url, is_active)
  VALUES (
    v_name, v_size, coalesce(nullif(trim(p_unit), ''), 'шт'),
    coalesce(p_sort_order, 100), p_photo_url, coalesce(p_is_active, TRUE)
  )
  ON CONFLICT (lower(trim(name)), lower(trim(coalesce(size, '')))) DO UPDATE
    SET unit = EXCLUDED.unit,
        sort_order = EXCLUDED.sort_order,
        photo_url = EXCLUDED.photo_url,
        is_active = EXCLUDED.is_active
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- RPC: get BOM matrix (flat)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_get_hardware_bom()
RETURNS TABLE(
  id               BIGINT,
  hardware_item_id BIGINT,
  name             TEXT,
  size             TEXT,
  bom_product      TEXT,
  qty_per_unit     NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT
    b.id,
    b.hardware_item_id,
    i.name,
    i.size,
    b.bom_product,
    b.qty_per_unit
  FROM public.hardware_bom b
  JOIN public.hardware_items i ON i.id = b.hardware_item_id
  WHERE b.qty_per_unit > 0
  ORDER BY b.bom_product, i.sort_order, i.name;
$$;

-- ------------------------------------------------------------
-- RPC: product map CRUD
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.web_get_hardware_product_map()
RETURNS TABLE(
  id                BIGINT,
  bom_product       TEXT,
  section_name      TEXT,
  item_name_pattern TEXT,
  sort_order        INTEGER,
  is_active         BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT id, bom_product, section_name, item_name_pattern, sort_order, is_active
  FROM public.hardware_product_map
  ORDER BY bom_product, sort_order, id;
$$;

CREATE OR REPLACE FUNCTION public.web_upsert_hardware_product_map_row(
  p_id                BIGINT,
  p_bom_product       TEXT,
  p_section_name      TEXT DEFAULT NULL,
  p_item_name_pattern TEXT DEFAULT NULL,
  p_sort_order        INTEGER DEFAULT 100,
  p_is_active         BOOLEAN DEFAULT TRUE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_product TEXT := trim(coalesce(p_bom_product, ''));
  v_section TEXT := nullif(trim(coalesce(p_section_name, '')), '');
  v_pattern TEXT := nullif(trim(coalesce(p_item_name_pattern, '')), '');
  v_id      BIGINT;
BEGIN
  IF v_product = '' THEN
    RAISE EXCEPTION 'bom_product is required';
  END IF;
  IF v_section IS NULL AND v_pattern IS NULL THEN
    RAISE EXCEPTION 'either section_name or item_name_pattern is required';
  END IF;

  IF p_id IS NOT NULL AND p_id > 0 THEN
    UPDATE public.hardware_product_map
      SET bom_product = v_product,
          section_name = v_section,
          item_name_pattern = v_pattern,
          sort_order = coalesce(p_sort_order, 100),
          is_active = coalesce(p_is_active, TRUE)
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'hardware_product_map row % not found', p_id;
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.hardware_product_map (bom_product, section_name, item_name_pattern, sort_order, is_active)
  VALUES (v_product, v_section, v_pattern, coalesce(p_sort_order, 100), coalesce(p_is_active, TRUE))
  ON CONFLICT (
    lower(trim(bom_product)),
    coalesce(lower(trim(section_name)), ''),
    coalesce(lower(trim(item_name_pattern)), '')
  ) DO UPDATE
    SET sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.web_delete_hardware_product_map_row(p_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.hardware_product_map WHERE id = p_id;
END;
$$;

-- ------------------------------------------------------------
-- RPC: consume history
-- ------------------------------------------------------------
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
  WHERE m.move_type = 'consume'
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 300), 2000));
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
GRANT SELECT ON public.hardware_items, public.hardware_bom, public.hardware_product_map,
  public.hardware_stock, public.hardware_moves TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.web_get_hardware_stock() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_set_hardware_stock(BIGINT, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_add_hardware_stock(BIGINT, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_upsert_hardware_item(BIGINT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_get_hardware_bom() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_get_hardware_product_map() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_upsert_hardware_product_map_row(BIGINT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_delete_hardware_product_map_row(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_get_hardware_consume_history(INTEGER) TO anon, authenticated, service_role;
