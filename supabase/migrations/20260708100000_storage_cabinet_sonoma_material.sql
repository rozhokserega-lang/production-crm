-- Тумбы системы хранения (сонома): привязка материала к «Сонома / бардолино».

update public.item_article_map
set
  table_color = 'Сонома / бардолино',
  updated_at = now()
where article in (
  'GXssCab34-1-600WOS',
  'GXssCab34-2-600WOS',
  'GXssCab34-3-600WOS'
);
