-- Fix ambiguous sort_order in web_upsert_overview_plan_month (PL/pgSQL vs table column).

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
#variable_conflict use_column
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
    SELECT coalesce(max(m.sort_order), 0) + 1
    INTO v_sort
    FROM public.overview_plan_months AS m;

    RETURN QUERY
      INSERT INTO public.overview_plan_months AS ins (name, weeks, sort_order)
      VALUES (v_name, v_weeks, v_sort)
      RETURNING
        ins.id,
        ins.name,
        ins.weeks,
        ins.sort_order,
        ins.created_at,
        ins.updated_at;
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
