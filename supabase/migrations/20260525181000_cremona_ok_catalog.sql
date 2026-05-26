-- Cremona: стол Дуб Коми (GXodCremonaOK) для плана отгрузки.

INSERT INTO public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
VALUES (
  'GXodCremonaOK',
  'Стол письменный Cremona. 1350х700. Дуб Коми',
  'manual',
  'Cremona',
  'Дуб коми',
  45
)
ON CONFLICT DO NOTHING;

-- На случай если артикул уже есть без секции — обновить.
UPDATE public.item_article_map
SET
  item_name = 'Стол письменный Cremona. 1350х700. Дуб Коми',
  source = coalesce(nullif(trim(source), ''), 'manual'),
  section_name = 'Cremona',
  table_color = 'Дуб коми',
  sort_order = 45
WHERE upper(trim(article)) = upper('GXodCremonaOK');

INSERT INTO public.section_catalog (section_name, sort_order, is_active)
VALUES ('Cremona', 60, true)
ON CONFLICT DO NOTHING;
