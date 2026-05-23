-- Месяцы для вкладки «Планы» в обзоре заказов (группировка номеров планов).

CREATE TABLE IF NOT EXISTS public.overview_plan_months (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  weeks       TEXT[]      NOT NULL DEFAULT '{}',
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.overview_plan_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overview_plan_months_select" ON public.overview_plan_months
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "overview_plan_months_insert" ON public.overview_plan_months
  FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "overview_plan_months_update" ON public.overview_plan_months
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "overview_plan_months_delete" ON public.overview_plan_months
  FOR DELETE TO authenticated, anon USING (true);

CREATE OR REPLACE FUNCTION public.trg_overview_plan_months_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_overview_plan_months_touch_updated_at ON public.overview_plan_months;
CREATE TRIGGER trg_overview_plan_months_touch_updated_at
  BEFORE UPDATE ON public.overview_plan_months
  FOR EACH ROW EXECUTE FUNCTION public.trg_overview_plan_months_touch_updated_at();

CREATE OR REPLACE FUNCTION public.web_get_overview_plan_months()
RETURNS TABLE(
  id         BIGINT,
  name       TEXT,
  weeks      TEXT[],
  sort_order INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT id, name, weeks, sort_order, created_at, updated_at
  FROM public.overview_plan_months
  ORDER BY sort_order ASC, id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.web_get_overview_plan_months() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.web_upsert_overview_plan_month(
  p_id    BIGINT,
  p_name  TEXT,
  p_weeks TEXT[]
)
RETURNS TABLE(
  id         BIGINT,
  name       TEXT,
  weeks      TEXT[],
  sort_order INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_name  TEXT := btrim(coalesce(p_name, ''));
  v_weeks TEXT[] := coalesce(p_weeks, '{}');
  v_sort  INT;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'Month name is required';
  END IF;

  v_weeks := array(
    SELECT DISTINCT w
    FROM unnest(v_weeks) AS w
    WHERE btrim(coalesce(w, '')) <> ''
    ORDER BY w
  );

  IF p_id IS NULL OR p_id = 0 THEN
    SELECT coalesce(max(sort_order), 0) + 1 INTO v_sort FROM public.overview_plan_months;
    RETURN QUERY
      INSERT INTO public.overview_plan_months (name, weeks, sort_order)
      VALUES (v_name, v_weeks, v_sort)
      RETURNING
        overview_plan_months.id,
        overview_plan_months.name,
        overview_plan_months.weeks,
        overview_plan_months.sort_order,
        overview_plan_months.created_at,
        overview_plan_months.updated_at;
  ELSE
    UPDATE public.overview_plan_months AS m
    SET name = v_name,
        weeks = v_weeks,
        updated_at = now()
    WHERE m.id = p_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan month % not found', p_id;
    END IF;

    RETURN QUERY
      SELECT m.id, m.name, m.weeks, m.sort_order, m.created_at, m.updated_at
      FROM public.overview_plan_months AS m
      WHERE m.id = p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_upsert_overview_plan_month(BIGINT, TEXT, TEXT[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.web_delete_overview_plan_month(p_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  DELETE FROM public.overview_plan_months WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_delete_overview_plan_month(BIGINT) TO anon, authenticated, service_role;
