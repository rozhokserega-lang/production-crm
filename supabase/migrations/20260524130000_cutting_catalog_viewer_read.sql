-- Чтение каталога раскроя доступно всем (как cutting_jobs и furniture templates).
-- Редактирование по-прежнему только operator / manager / admin.

CREATE OR REPLACE FUNCTION public.web_get_cutting_catalog_kits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
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
