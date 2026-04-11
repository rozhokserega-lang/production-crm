-- RPC: web_set_stage_in_work / pause / done — в одной миграции для наката вручную или через Supabase SQL Editor.
-- Идемпотентно: CREATE OR REPLACE + IF NOT EXISTS для колонки.
-- Смысл: «Готово» на пиле/кромке не ставит следующий этап в «В работе»; optional p_executor; assembly + shipping.

alter table public.orders add column if not exists shipped boolean not null default false;

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
  v_work_status := case
    when v_executor is null then '🔨 В работе'
    else '🔨 В работе (' || v_executor || ')'
  end;

  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status = v_work_status,
      pilka_started_at = coalesce(pilka_started_at, v_now),
      pilka_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status = v_work_status,
      kromka_started_at = coalesce(kromka_started_at, v_now),
      kromka_pause_started_at = null,
      updated_at = v_now
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status = v_work_status,
      pras_started_at = coalesce(pras_started_at, v_now),
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

create or replace function public.web_set_stage_done(p_order_id text, p_stage text)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_row public.orders;
begin
  if p_stage = 'pilka' then
    update public.orders
    set
      pilka_status='✅ Готово',
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='✅ Готово',
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='✅ Готово',
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
  return v_row;
end;
$$;

grant execute on function public.web_set_stage_in_work(text, text, text) to authenticated, anon, service_role;
grant execute on function public.web_set_stage_pause(text, text) to authenticated, anon, service_role;
grant execute on function public.web_set_stage_done(text, text) to authenticated, anon, service_role;
