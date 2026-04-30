-- Delete catalog row only when no metal_work_items reference the article (FK).
-- If there are finished/cancelled jobs only → soft-delete (is_active = false).
-- Active jobs still block removal.

create or replace function public.web_delete_metal_catalog_item(
  p_article text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_article       text := upper(trim(coalesce(p_article, '')));
  v_active_count  integer;
  v_history_count integer;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;

  if not exists (select 1 from public.metal_product_catalog c where c.article = v_article) then
    raise exception 'Артикул не найден в каталоге';
  end if;

  select count(*) into v_active_count
  from public.metal_work_items mwi
  where mwi.article = v_article
    and mwi.status not in ('done', 'cancelled');

  if v_active_count > 0 then
    raise exception 'Нельзя убрать из каталога: есть % активных заданий в производстве', v_active_count;
  end if;

  select count(*) into v_history_count
  from public.metal_work_items mwi
  where mwi.article = v_article;

  if v_history_count > 0 then
    update public.metal_product_catalog c
    set is_active = false,
        updated_at = now()
    where c.article = v_article;

    insert into public.crm_audit_log (action, entity, entity_id, note)
    values (
      'deactivate',
      'metal_product_catalog',
      v_article,
      'catalog item deactivated via web_delete_metal_catalog_item (production history exists)'
    );
    return;
  end if;

  delete from public.metal_product_catalog c where c.article = v_article;

  insert into public.crm_audit_log (action, entity, entity_id, note)
  values ('delete', 'metal_product_catalog', v_article,
          'catalog item deleted via web_delete_metal_catalog_item');
end;
$$;
