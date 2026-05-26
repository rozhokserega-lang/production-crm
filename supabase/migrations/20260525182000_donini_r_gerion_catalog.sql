-- Donini R: столы «Герион» для плана отгрузки.

INSERT INTO public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
VALUES
  (
    'GXktRDoGe',
    'Стол кухонный Donini R 806 мм. Герион',
    'manual',
    'Donini R 806',
    'Герион',
    55
  ),
  (
    'GXktRDoGes',
    'Стол кухонный Donini R 750 мм. Герион',
    'manual',
    'Donini R 750',
    'Герион',
    55
  )
ON CONFLICT DO NOTHING;

UPDATE public.item_article_map
SET
  item_name = 'Стол кухонный Donini R 806 мм. Герион',
  source = coalesce(nullif(trim(source), ''), 'manual'),
  section_name = 'Donini R 806',
  table_color = 'Герион',
  sort_order = 55
WHERE upper(trim(article)) = upper('GXktRDoGe');

UPDATE public.item_article_map
SET
  item_name = 'Стол кухонный Donini R 750 мм. Герион',
  source = coalesce(nullif(trim(source), ''), 'manual'),
  section_name = 'Donini R 750',
  table_color = 'Герион',
  sort_order = 55
WHERE upper(trim(article)) = upper('GXktRDoGes');
