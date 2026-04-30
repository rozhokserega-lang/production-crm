-- Resolve catalog row case-insensitively (UI/stock merge may send GXBarStoolOr001 while PK is mixed case).

create or replace function public.web_delete_metal_catalog_item(
  p_article text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_norm          text := upper(trim(coalesce(p_article, '')));
  v_row_article   text;
  v_active_count  integer;
  v_history_count integer;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_norm = '' then
    raise exception 'article required';
  end if;

  select c.article
    into v_row_article
  from public.metal_product_catalog c
  where upper(trim(c.article)) = v_norm
  limit 1;

  if v_row_article is null then
    raise exception 'Артикул не найден в каталоге';
  end if;

  select count(*) into v_active_count
  from public.metal_work_items mwi
  where mwi.article = v_row_article
    and mwi.status not in ('done', 'cancelled');

  if v_active_count > 0 then
    raise exception 'Нельзя убрать из каталога: есть % активных заданий в производстве', v_active_count;
  end if;

  select count(*) into v_history_count
  from public.metal_work_items mwi
  where mwi.article = v_row_article;

  if v_history_count > 0 then
    update public.metal_product_catalog c
    set is_active = false,
        updated_at = now()
    where c.article = v_row_article;

    insert into public.crm_audit_log (action, entity, entity_id, note)
    values (
      'deactivate',
      'metal_product_catalog',
      v_row_article,
      'catalog item deactivated via web_delete_metal_catalog_item (production history exists)'
    );
    return;
  end if;

  delete from public.metal_product_catalog c where c.article = v_row_article;

  insert into public.crm_audit_log (action, entity, entity_id, note)
  values ('delete', 'metal_product_catalog', v_row_article,
          'catalog item deleted via web_delete_metal_catalog_item');
end;
$$;
