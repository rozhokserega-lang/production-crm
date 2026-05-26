-- TB Siena 1: тумбы под ТВ «Герион» (Дуб Делано / Ночное небо).

INSERT INTO public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
VALUES
  (
    'GXtvsS1OdGe',
    'Тумба под ТВ Siena 1. Дуб Делано темный-Герион',
    'manual',
    'TB Siena 1',
    'Дуб делано',
    10
  ),
  (
    'GXtvsS1BSkyGe',
    'Тумба под ТВ Siena 1. Ночное небо-Герион',
    'manual',
    'TB Siena 1',
    'Ночное небо',
    20
  )
ON CONFLICT DO NOTHING;

UPDATE public.item_article_map
SET
  item_name = 'Тумба под ТВ Siena 1. Дуб Делано темный-Герион',
  source = coalesce(nullif(trim(source), ''), 'manual'),
  section_name = 'TB Siena 1',
  table_color = 'Дуб делано',
  sort_order = 10
WHERE upper(trim(article)) = upper('GXtvsS1OdGe');

UPDATE public.item_article_map
SET
  item_name = 'Тумба под ТВ Siena 1. Ночное небо-Герион',
  source = coalesce(nullif(trim(source), ''), 'manual'),
  section_name = 'TB Siena 1',
  table_color = 'Ночное небо',
  sort_order = 20
WHERE upper(trim(article)) = upper('GXtvsS1BSkyGe');

-- Тумба «Интра - Эра» тоже привязать к секции (была без section_name).
UPDATE public.item_article_map
SET
  section_name = 'TB Siena 1',
  table_color = coalesce(nullif(trim(table_color), ''), 'Интра'),
  sort_order = 15
WHERE upper(trim(article)) = upper('GXtvsS1IntEr');

INSERT INTO public.section_catalog (section_name, sort_order, is_active)
VALUES ('TB Siena 1', 75, true)
ON CONFLICT DO NOTHING;
