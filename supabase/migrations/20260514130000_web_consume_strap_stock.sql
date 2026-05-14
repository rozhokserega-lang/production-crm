-- Списание планок обвязки со склада (при сборке и т.п.)
CREATE OR REPLACE FUNCTION public.web_consume_strap_stock(
  p_strap_type TEXT,
  p_color      TEXT,
  p_qty        INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type  text := trim(coalesce(p_strap_type, ''));
  v_color text := trim(coalesce(p_color, ''));
  v_delta int := greatest(0, coalesce(p_qty, 0));
BEGIN
  IF v_type = '' OR v_delta = 0 THEN
    RETURN;
  END IF;
  IF v_color = '' THEN
    v_color := 'Черный';
  END IF;

  INSERT INTO public.strap_stock (strap_type, color, qty)
  VALUES (v_type, v_color, 0)
  ON CONFLICT (strap_type, color) DO NOTHING;

  UPDATE public.strap_stock
     SET qty = greatest(0, qty - v_delta),
         updated_at = now()
   WHERE strap_type = v_type AND color = v_color;
END;
$$;

GRANT EXECUTE ON FUNCTION public.web_consume_strap_stock(TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;
