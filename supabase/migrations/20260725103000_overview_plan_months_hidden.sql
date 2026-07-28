-- Скрытие архивных месяцев в «Обзор → Планы по месяцам».

alter table public.overview_plan_months
  add column if not exists is_hidden boolean not null default false;

drop function if exists public.web_get_overview_plan_months();
drop function if exists public.web_upsert_overview_plan_month(bigint, text, text[]);

create or replace function public.web_get_overview_plan_months()
returns table(
  id bigint,
  name text,
  weeks text[],
  sort_order integer,
  is_hidden boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select id, name, weeks, sort_order, is_hidden, created_at, updated_at
  from public.overview_plan_months
  order by sort_order asc, id asc;
$$;

create or replace function public.web_set_overview_plan_month_hidden(
  p_id bigint,
  p_hidden boolean
)
returns table(
  id bigint,
  name text,
  weeks text[],
  sort_order integer,
  is_hidden boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  update public.overview_plan_months as m
  set is_hidden = coalesce(p_hidden, false),
      updated_at = now()
  where m.id = p_id;

  if not found then
    raise exception 'Plan month % not found', p_id;
  end if;

  return query
    select m.id, m.name, m.weeks, m.sort_order, m.is_hidden, m.created_at, m.updated_at
    from public.overview_plan_months as m
    where m.id = p_id;
end;
$$;

grant execute on function public.web_set_overview_plan_month_hidden(bigint, boolean)
  to anon, authenticated, service_role;

create or replace function public.web_upsert_overview_plan_month(
  p_id bigint,
  p_name text,
  p_weeks text[]
)
returns table(
  id bigint,
  name text,
  weeks text[],
  sort_order integer,
  is_hidden boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_weeks text[] := coalesce(p_weeks, '{}');
  v_sort int;
begin
  if v_name = '' then
    raise exception 'Month name is required';
  end if;

  v_weeks := array(
    select distinct w
    from unnest(v_weeks) as w
    where btrim(coalesce(w, '')) <> ''
    order by w
  );

  if p_id is null or p_id = 0 then
    select coalesce(max(m.sort_order), 0) + 1
    into v_sort
    from public.overview_plan_months as m;

    return query
      insert into public.overview_plan_months as ins (name, weeks, sort_order)
      values (v_name, v_weeks, v_sort)
      returning
        ins.id,
        ins.name,
        ins.weeks,
        ins.sort_order,
        ins.is_hidden,
        ins.created_at,
        ins.updated_at;
  else
    update public.overview_plan_months as m
    set name = v_name,
        weeks = v_weeks,
        updated_at = now()
    where m.id = p_id;

    if not found then
      raise exception 'Plan month % not found', p_id;
    end if;

    return query
      select m.id, m.name, m.weeks, m.sort_order, m.is_hidden, m.created_at, m.updated_at
      from public.overview_plan_months as m
      where m.id = p_id;
  end if;
end;
$$;

update public.overview_plan_months
set is_hidden = true,
    updated_at = now()
where lower(trim(name)) in ('апрель', 'май');
