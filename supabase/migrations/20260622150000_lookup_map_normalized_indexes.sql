-- Индексы для lookup по нормализованным ключам (убирают seq scan на малых справочниках).

create index if not exists idx_item_article_map_web_norm_key
  on public.item_article_map (public.web_norm_item_key(item_name));

create index if not exists idx_material_size_map_norm_key
  on public.material_size_map (public.normalize_item_key(material_name));
