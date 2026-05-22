-- ============================================================
-- cutting_jobs: сессии раскроя материала
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cutting_jobs (
  id          BIGSERIAL   PRIMARY KEY,
  name        TEXT        NOT NULL DEFAULT 'Новый раскрой',
  settings    JSONB       NOT NULL DEFAULT '{"sheetW":2800,"sheetH":2070,"kerf":4.8,"marginX":20,"marginY":20,"allowRotate":false,"algorithm":"maxrects"}',
  items       JSONB       NOT NULL DEFAULT '[]',
  -- items: [{itemName, w, h, qty, material, week, section}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cutting_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cutting_jobs_select" ON public.cutting_jobs
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "cutting_jobs_insert" ON public.cutting_jobs
  FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "cutting_jobs_update" ON public.cutting_jobs
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "cutting_jobs_delete" ON public.cutting_jobs
  FOR DELETE TO authenticated, anon USING (true);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.trg_cutting_jobs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cutting_jobs_touch_updated_at
  BEFORE UPDATE ON public.cutting_jobs
  FOR EACH ROW EXECUTE FUNCTION public.trg_cutting_jobs_touch_updated_at();

-- RPC: get all cutting jobs (list)
CREATE OR REPLACE FUNCTION public.web_get_cutting_jobs()
RETURNS TABLE(
  id         BIGINT,
  name       TEXT,
  settings   JSONB,
  items      JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, name, settings, items, created_at, updated_at
  FROM public.cutting_jobs
  ORDER BY updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.web_get_cutting_jobs() TO anon, authenticated, service_role;

-- RPC: upsert cutting job (insert or update by id)
CREATE OR REPLACE FUNCTION public.web_upsert_cutting_job(
  p_id       BIGINT,
  p_name     TEXT,
  p_settings JSONB,
  p_items    JSONB
)
RETURNS TABLE(id BIGINT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_id IS NULL OR p_id = 0 THEN
    RETURN QUERY
      INSERT INTO public.cutting_jobs (name, settings, items)
      VALUES (p_name, p_settings, p_items)
      RETURNING cutting_jobs.id, cutting_jobs.updated_at;
  ELSE
    RETURN QUERY
      INSERT INTO public.cutting_jobs (id, name, settings, items)
      VALUES (p_id, p_name, p_settings, p_items)
      ON CONFLICT (id) DO UPDATE
        SET name       = EXCLUDED.name,
            settings   = EXCLUDED.settings,
            items      = EXCLUDED.items,
            updated_at = now()
      RETURNING cutting_jobs.id, cutting_jobs.updated_at;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_upsert_cutting_job(BIGINT, TEXT, JSONB, JSONB) TO anon, authenticated, service_role;

-- RPC: delete cutting job
CREATE OR REPLACE FUNCTION public.web_delete_cutting_job(p_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.cutting_jobs WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_delete_cutting_job(BIGINT) TO anon, authenticated, service_role;
