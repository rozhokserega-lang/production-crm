-- web_seed_furniture_strap_template inserted without created_by, relying on the
-- column default auth.uid(). That default is NULL when the RPC runs as anon
-- (Bearer = anon key, no user JWT) — which happens because the frontend auto-seeds
-- on Excel load before login completes. Fix: require auth.uid(), pass it explicitly
-- (same pattern as web_upsert_furniture_custom_template), skip silently when absent.

create or replace function public.web_seed_furniture_strap_template(
  p_product_name text,
  p_details      jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  if v_name = '' then return; end if;
  if jsonb_typeof(coalesce(p_details, 'null'::jsonb)) <> 'array' then return; end if;

  insert into public.furniture_custom_templates (product_name, details, created_by)
  values (v_name, p_details, v_uid)
  on conflict (product_name) do nothing;
end;
$$;

revoke all on function public.web_seed_furniture_strap_template(text, jsonb) from public;
grant execute on function public.web_seed_furniture_strap_template(text, jsonb) to authenticated;
