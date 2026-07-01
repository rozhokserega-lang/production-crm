-- Ручной порядок очереди на пиле (общий для всех пользователей CRM).

insert into public.crm_runtime_settings (key, value_text, updated_at)
values ('workshop_pilka_queue_order', '[]', now())
on conflict (key) do nothing;

create or replace function public.web_get_pilka_queue_order()
returns table(order_ids jsonb, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_raw text;
  v_at timestamptz;
  v_json jsonb;
begin
  select s.value_text, s.updated_at
  into v_raw, v_at
  from public.crm_runtime_settings s
  where s.key = 'workshop_pilka_queue_order'
  limit 1;

  begin
    v_json := coalesce(nullif(btrim(coalesce(v_raw, '')), ''), '[]')::jsonb;
  exception when others then
    v_json := '[]'::jsonb;
  end;

  if jsonb_typeof(v_json) is distinct from 'array' then
    v_json := '[]'::jsonb;
  end if;

  order_ids := v_json;
  updated_at := coalesce(v_at, now());
  return next;
end;
$$;

create or replace function public.web_set_pilka_queue_order(p_order_ids jsonb)
returns table(order_ids jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_json jsonb := coalesce(p_order_ids, '[]'::jsonb);
begin
  perform public.web_require_roles(array[
    'operator_pilka', 'operator', 'planner', 'manager', 'admin'
  ]);

  if jsonb_typeof(v_json) is distinct from 'array' then
    raise exception 'order_ids must be a JSON array';
  end if;

  if jsonb_array_length(v_json) > 500 then
    raise exception 'Too many order ids (max 500)';
  end if;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('workshop_pilka_queue_order', v_json::text, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select r.order_ids, r.updated_at
  from public.web_get_pilka_queue_order() r;
end;
$$;

grant execute on function public.web_get_pilka_queue_order() to anon, authenticated, service_role;
grant execute on function public.web_set_pilka_queue_order(jsonb) to anon, authenticated, service_role;
