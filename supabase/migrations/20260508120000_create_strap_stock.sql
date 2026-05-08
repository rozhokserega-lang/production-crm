-- ============================================================
-- strap_stock: склад планок обвязки
-- ============================================================
CREATE TABLE IF NOT EXISTS public.strap_stock (
  strap_type  TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '',
  qty         INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (strap_type, color)
);

ALTER TABLE public.strap_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strap_stock_select" ON public.strap_stock
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "strap_stock_insert" ON public.strap_stock
  FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE POLICY "strap_stock_update" ON public.strap_stock
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

CREATE POLICY "strap_stock_delete" ON public.strap_stock
  FOR DELETE TO authenticated, anon USING (true);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.trg_strap_stock_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_strap_stock_touch_updated_at
  BEFORE UPDATE ON public.strap_stock
  FOR EACH ROW EXECUTE FUNCTION public.trg_strap_stock_touch_updated_at();

-- RPC: get all strap stock rows
CREATE OR REPLACE FUNCTION public.web_get_strap_stock()
RETURNS TABLE(strap_type TEXT, color TEXT, qty INTEGER, updated_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT strap_type, color, qty, updated_at
  FROM public.strap_stock
  ORDER BY strap_type, color;
$$;

-- RPC: add qty to strap stock (upsert, increments)
CREATE OR REPLACE FUNCTION public.web_add_strap_stock(
  p_strap_type TEXT,
  p_color      TEXT,
  p_qty        INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.strap_stock (strap_type, color, qty)
  VALUES (p_strap_type, p_color, GREATEST(0, p_qty))
  ON CONFLICT (strap_type, color) DO UPDATE
    SET qty = public.strap_stock.qty + GREATEST(0, EXCLUDED.qty),
        updated_at = now();
END;
$$;

-- RPC: set strap stock qty manually (absolute value)
CREATE OR REPLACE FUNCTION public.web_set_strap_stock(
  p_strap_type TEXT,
  p_color      TEXT,
  p_qty        INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.strap_stock (strap_type, color, qty)
  VALUES (p_strap_type, p_color, GREATEST(0, p_qty))
  ON CONFLICT (strap_type, color) DO UPDATE
    SET qty = GREATEST(0, EXCLUDED.qty),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_get_strap_stock() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_add_strap_stock(TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.web_set_strap_stock(TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;
