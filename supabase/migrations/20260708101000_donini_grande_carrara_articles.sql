-- Donini Grande Мрамор Каррара: правильные артикулы и названия «Стол кухонный…».

delete from public.item_article_map
where article in ('GXktDoGMCr', 'GXktDoGMCrs');

insert into public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
values
  ('GXktDoGCARM',  'Стол кухонный Donini Grande 806 мм. Мрамор Каррара', 'manual', 'Donini Grande 806', 'Мрамор Каррара', 85),
  ('GXktDoGCARMs', 'Стол кухонный Donini Grande 750 мм. Мрамор Каррара', 'manual', 'Donini Grande 750', 'Мрамор Каррара', 85)
on conflict (article) do update
set item_name = excluded.item_name,
    source = excluded.source,
    section_name = excluded.section_name,
    table_color = excluded.table_color,
    sort_order = excluded.sort_order,
    updated_at = now();
