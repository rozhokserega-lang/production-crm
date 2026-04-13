drop function if exists public.web_upsert_item_color_map(text, text);

create function public.web_upsert_item_color_map(p_item_name text, p_color_name text)
returns table (
  out_item_name text,
  out_color_name text,
  out_source text,
  out_updated_at timestamptz
)
language plpgsql
as $$
begin
  insert into public.item_color_map(item_name, color_name, source)
  values (trim(p_item_name), trim(p_color_name), 'manual')
  on conflict (item_name)
  do update set
    color_name = excluded.color_name,
    source = 'manual',
    updated_at = now();

  return query
  select m.item_name, m.color_name, m.source, m.updated_at
  from public.item_color_map m
  where m.item_name = trim(p_item_name);
end;
$$;
