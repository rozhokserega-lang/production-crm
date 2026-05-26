-- Справочник артикулов GX (система хранения): пользовательские позиции и переопределения встроенных.

CREATE TABLE IF NOT EXISTS public.gx_shelf_catalog (
  id         BIGSERIAL PRIMARY KEY,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT,
  pairs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gx_shelf_catalog_code_norm_idx
  ON public.gx_shelf_catalog (upper(btrim(code)));

CREATE INDEX IF NOT EXISTS gx_shelf_catalog_sort_order_idx
  ON public.gx_shelf_catalog (sort_order, code);

ALTER TABLE public.gx_shelf_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gx_shelf_catalog_select" ON public.gx_shelf_catalog
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "gx_shelf_catalog_insert" ON public.gx_shelf_catalog
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "gx_shelf_catalog_update" ON public.gx_shelf_catalog
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "gx_shelf_catalog_delete" ON public.gx_shelf_catalog
  FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.trg_gx_shelf_catalog_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gx_shelf_catalog_touch_updated_at ON public.gx_shelf_catalog;
CREATE TRIGGER trg_gx_shelf_catalog_touch_updated_at
  BEFORE UPDATE ON public.gx_shelf_catalog
  FOR EACH ROW EXECUTE FUNCTION public.trg_gx_shelf_catalog_touch_updated_at();

-- ── web_get_gx_shelf_catalog ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.web_get_gx_shelf_catalog()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'name', c.name,
        'color', c.color,
        'pairs', c.pairs,
        'sort_order', c.sort_order,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      )
      ORDER BY c.sort_order, c.code
    )
    FROM public.gx_shelf_catalog c
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_get_gx_shelf_catalog() TO anon, authenticated, service_role;

-- ── web_upsert_gx_shelf_catalog_item ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.web_upsert_gx_shelf_catalog_item(
  p_id         BIGINT DEFAULT 0,
  p_code       TEXT DEFAULT '',
  p_name       TEXT DEFAULT '',
  p_color      TEXT DEFAULT NULL,
  p_pairs      JSONB DEFAULT '[]'::jsonb,
  p_sort_order INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.gx_shelf_catalog;
  v_code TEXT := nullif(trim(coalesce(p_code, '')), '');
  v_name TEXT := nullif(trim(coalesce(p_name, '')), '');
  v_color TEXT := nullif(trim(coalesce(p_color, '')), '');
  v_pairs JSONB := coalesce(p_pairs, '[]'::jsonb);
  v_code_norm TEXT;
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Артикул обязателен';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Наименование обязательно';
  END IF;
  IF jsonb_typeof(v_pairs) IS DISTINCT FROM 'array' OR jsonb_array_length(v_pairs) = 0 THEN
    RAISE EXCEPTION 'Добавьте хотя бы одну полку с количеством';
  END IF;

  v_code_norm := upper(btrim(v_code));

  IF coalesce(p_id, 0) > 0 THEN
    UPDATE public.gx_shelf_catalog
    SET
      code = v_code,
      name = v_name,
      color = v_color,
      pairs = v_pairs,
      sort_order = coalesce(p_sort_order, 0)
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Позиция с id % не найдена', p_id;
    END IF;
  ELSE
    SELECT * INTO v_row
    FROM public.gx_shelf_catalog
    WHERE upper(btrim(code)) = v_code_norm
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.gx_shelf_catalog
      SET
        code = v_code,
        name = v_name,
        color = v_color,
        pairs = v_pairs,
        sort_order = coalesce(p_sort_order, 0)
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.gx_shelf_catalog (code, name, color, pairs, sort_order)
      VALUES (v_code, v_name, v_color, v_pairs, coalesce(p_sort_order, 0))
      RETURNING * INTO v_row;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'name', v_row.name,
    'color', v_row.color,
    'pairs', v_row.pairs,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_upsert_gx_shelf_catalog_item(BIGINT, TEXT, TEXT, TEXT, JSONB, INT)
  TO anon, authenticated, service_role;

-- ── web_delete_gx_shelf_catalog_item ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.web_delete_gx_shelf_catalog_item(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  DELETE FROM public.gx_shelf_catalog WHERE id = p_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_delete_gx_shelf_catalog_item(BIGINT)
  TO anon, authenticated, service_role;
