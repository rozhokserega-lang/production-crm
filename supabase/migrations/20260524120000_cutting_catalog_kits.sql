-- Каталог комплектов для раскроя (набор деталей × кол-во комплектов).

CREATE TABLE IF NOT EXISTS public.cutting_catalog_kits (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cutting_catalog_kits_sort_order_idx
  ON public.cutting_catalog_kits (sort_order, name);

ALTER TABLE public.cutting_catalog_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cutting_catalog_kits_select" ON public.cutting_catalog_kits
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "cutting_catalog_kits_insert" ON public.cutting_catalog_kits
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "cutting_catalog_kits_update" ON public.cutting_catalog_kits
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "cutting_catalog_kits_delete" ON public.cutting_catalog_kits
  FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.trg_cutting_catalog_kits_touch_updated_at()
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

DROP TRIGGER IF EXISTS trg_cutting_catalog_kits_touch_updated_at ON public.cutting_catalog_kits;
CREATE TRIGGER trg_cutting_catalog_kits_touch_updated_at
  BEFORE UPDATE ON public.cutting_catalog_kits
  FOR EACH ROW EXECUTE FUNCTION public.trg_cutting_catalog_kits_touch_updated_at();

-- ── web_get_cutting_catalog_kits ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.web_get_cutting_catalog_kits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', k.id,
        'name', k.name,
        'items', k.items,
        'sort_order', k.sort_order,
        'created_at', k.created_at,
        'updated_at', k.updated_at
      )
      ORDER BY k.sort_order, k.name
    )
    FROM public.cutting_catalog_kits k
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_get_cutting_catalog_kits() TO anon, authenticated, service_role;

-- ── web_upsert_cutting_catalog_kit ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.web_upsert_cutting_catalog_kit(
  p_id         BIGINT DEFAULT 0,
  p_name       TEXT DEFAULT '',
  p_items      JSONB DEFAULT '[]'::jsonb,
  p_sort_order INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.cutting_catalog_kits;
  v_name TEXT := nullif(trim(coalesce(p_name, '')), '');
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Название комплекта обязательно';
  END IF;

  IF coalesce(p_id, 0) > 0 THEN
    UPDATE public.cutting_catalog_kits
    SET
      name = v_name,
      items = coalesce(p_items, '[]'::jsonb),
      sort_order = coalesce(p_sort_order, 0)
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Комплект с id % не найден', p_id;
    END IF;
  ELSE
    INSERT INTO public.cutting_catalog_kits (name, items, sort_order)
    VALUES (v_name, coalesce(p_items, '[]'::jsonb), coalesce(p_sort_order, 0))
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'items', v_row.items,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_upsert_cutting_catalog_kit(BIGINT, TEXT, JSONB, INT)
  TO anon, authenticated, service_role;

-- ── web_delete_cutting_catalog_kit ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.web_delete_cutting_catalog_kit(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  DELETE FROM public.cutting_catalog_kits WHERE id = p_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_delete_cutting_catalog_kit(BIGINT)
  TO anon, authenticated, service_role;
