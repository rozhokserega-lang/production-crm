-- Stage-specific workshop operator CRM roles.

alter table public.crm_user_roles
  drop constraint if exists crm_user_roles_role_check;

alter table public.crm_user_roles
  add constraint crm_user_roles_role_check
  check (
    lower(trim(role)) in (
      'admin',
      'manager',
      'operator',
      'operator_pilka',
      'operator_kromka',
      'operator_pras',
      'viewer',
      'warehouse'
    )
  );

create or replace function public.web_is_valid_crm_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(trim(p_role), '')) in (
    'admin',
    'manager',
    'operator',
    'operator_pilka',
    'operator_kromka',
    'operator_pras',
    'viewer',
    'warehouse'
  )
$$;

grant execute on function public.web_is_valid_crm_role(text) to anon, authenticated, service_role;

create or replace function public.web_require_workshop_stage(p_stage text)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_effective text := public.web_effective_crm_role();
  v_stage text := lower(trim(coalesce(p_stage, '')));
begin
  if v_effective in ('admin', 'manager', 'operator') then
    return;
  end if;

  if v_stage = 'pilka' and v_effective = 'operator_pilka' then
    return;
  end if;
  if v_stage = 'kromka' and v_effective = 'operator_kromka' then
    return;
  end if;
  if v_stage = 'pras' and v_effective = 'operator_pras' then
    return;
  end if;

  raise exception using
    errcode = '42501',
    message = format(
      'Недостаточно прав для этапа [%s]: текущая роль [%s]',
      coalesce(p_stage, '?'),
      v_effective
    );
end;
$$;

grant execute on function public.web_require_workshop_stage(text) to anon, authenticated, service_role;

-- Guards on generic stage RPCs (pilka / kromka / pras).
create or replace function public.web_set_stage_in_work(
  p_order_id text,
  p_stage text,
  p_executor text default null
)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_now timestamptz := now();
  v_row public.orders;
  v_executor text := nullif(trim(coalesce(p_executor, '')), '');
  v_work_status text;
begin
  if p_stage in ('pilka', 'kromka', 'pras') then
    perform public.web_require_workshop_stage(p_stage);
  else
    perform public.web_require_roles(array['operator', 'manager', 'admin']);
  end if;

  v_work_status := case
    when v_executor is null then '🔨 В работе'
    else '🔨 В работе (' || v_executor || ')'
  end;

  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status = v_work_status,
      pilka_started_at = coalesce(pilka_started_at, v_now),
      pilka_pause_acc_min = coalesce(pilka_pause_acc_min, 0) + case
        when pilka_pause_started_at is not null
        then greatest(0, extract(epoch from (v_now - pilka_pause_started_at)) / 60)::integer
        else 0
      end,
      pilka_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status = v_work_status,
      kromka_started_at = coalesce(kromka_started_at, v_now),
      kromka_pause_acc_min = coalesce(kromka_pause_acc_min, 0) + case
        when kromka_pause_started_at is not null
        then greatest(0, extract(epoch from (v_now - kromka_pause_started_at)) / 60)::integer
        else 0
      end,
      kromka_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status = v_work_status,
      pras_started_at = coalesce(pras_started_at, v_now),
      pras_pause_acc_min = coalesce(pras_pause_acc_min, 0) + case
        when pras_pause_started_at is not null
        then greatest(0, extract(epoch from (v_now - pras_pause_started_at)) / 60)::integer
        else 0
      end,
      pras_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  else
    raise exception 'Unknown stage: %', p_stage;
  end if;

  if v_row.id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.web_set_stage_pause(p_order_id text, p_stage text)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_now timestamptz := now();
  v_row public.orders;
begin
  if p_stage in ('pilka', 'kromka', 'pras') then
    perform public.web_require_workshop_stage(p_stage);
  else
    perform public.web_require_roles(array['operator', 'manager', 'admin']);
  end if;

  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status='⏸ Пауза',
      pilka_pause_started_at=coalesce(pilka_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='⏸ Пауза',
      kromka_pause_started_at=coalesce(kromka_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='⏸ Пауза',
      pras_pause_started_at=coalesce(pras_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  else
    raise exception 'Unknown stage: %', p_stage;
  end if;
  return v_row;
end;
$$;

-- Re-create done RPC with guards (body from sync_labor migration + auth check).
create or replace function public.web_set_stage_done(p_order_id text, p_stage text)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_row public.orders;
begin
  if p_stage in ('pilka', 'kromka', 'pras') then
    perform public.web_require_workshop_stage(p_stage);
  else
    perform public.web_require_roles(array['operator', 'manager', 'admin']);
  end if;

  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status='✅ Готово',
      pilka_done_at=now(),
      pilka_pause_acc_min = coalesce(pilka_pause_acc_min, 0) + case
        when pilka_pause_started_at is not null
        then greatest(0, extract(epoch from (now() - pilka_pause_started_at)) / 60)::integer
        else 0
      end,
      pilka_pause_started_at = null,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='✅ Готово',
      kromka_done_at=now(),
      kromka_pause_acc_min = coalesce(kromka_pause_acc_min, 0) + case
        when kromka_pause_started_at is not null
        then greatest(0, extract(epoch from (now() - kromka_pause_started_at)) / 60)::integer
        else 0
      end,
      kromka_pause_started_at = null,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='✅ Готово',
      pras_done_at=now(),
      pras_pause_acc_min = coalesce(pras_pause_acc_min, 0) + case
        when pras_pause_started_at is not null
        then greatest(0, extract(epoch from (now() - pras_pause_started_at)) / 60)::integer
        else 0
      end,
      pras_pause_started_at = null,
      overall_status=case
        when coalesce(overall_status, '') like '%отправ%' then overall_status
        else '✅ Готово к сборке'
      end,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'assembly' then
    update public.orders
    set
      assembly_status='✅ СОБРАНО',
      overall_status=case
        when coalesce(overall_status, '') like '%отправ%' then overall_status
        else '✅ Готово к отправке'
      end,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'warehouse_kit' then
    update public.orders
    set
      overall_status='📦 На комплектации',
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'shipping' then
    update public.orders
    set
      overall_status='📦 На упаковке',
      shipped=true,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  else
    raise exception 'Unknown stage: %', p_stage;
  end if;

  if v_row.order_id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if p_stage in ('pilka', 'kromka', 'pras') then
    perform public.sync_labor_fact_from_order(v_row.order_id);
  end if;

  return v_row;
end;
$$;
