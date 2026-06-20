--
-- PostgreSQL database dump
--

\restrict f71oabBqc4Q3SDE1fiJ2XIhLcRmVW6fVEtsHIApgJEFdLc1k4X8LZAxFMnqI19M

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: _test_board_cells(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._test_board_cells() RETURNS integer
    LANGUAGE sql
    AS $$
  select count(*)::int from (
    select case
      when length(regexp_replace(coalesce(source_col_id, ''), '\D', '', 'g')) between 1 and 9
        then regexp_replace(coalesce(source_col_id, ''), '\D', '', 'g')::int
      else null
    end as source_col_num
    from shipment_plan_cells where coalesce(qty,0) > 0
  ) t;
$$;


--
-- Name: _test_board_exact(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._test_board_exact() RETURNS integer
    LANGUAGE sql
    AS $$
  with cells as (
    select
      coalesce(source_col_id, '0') as source_col_id,
      case
        when length(regexp_replace(coalesce(source_col_id, ''), '\D', '', 'g')) between 1 and 9
          then regexp_replace(coalesce(source_col_id, ''), '\D', '', 'g')::int
        else null
      end as source_col_num
    from public.shipment_plan_cells
    where coalesce(qty, 0) > 0
  )
  select count(*)::int from cells;
$$;


--
-- Name: _test_regex_d(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._test_regex_d(p text) RETURNS text
    LANGUAGE sql
    AS $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;


--
-- Name: business_minutes(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.business_minutes(p_start timestamp with time zone, p_end timestamp with time zone) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with bounds as (
    select least(p_start, p_end) as start_ts, greatest(p_start, p_end) as end_ts
    where p_start is not null
      and p_end is not null
      and p_start < p_end
  ),
  schedule as (
    select
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_work_start' limit 1),
        '08:00'
      )::time as work_start,
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_work_end' limit 1),
        '18:00'
      )::time as work_end,
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_lunch_start' limit 1),
        '12:00'
      )::time as lunch_start,
      coalesce(
        (select value_text from public.crm_runtime_settings where key = 'crm_lunch_end' limit 1),
        '13:00'
      )::time as lunch_end
  ),
  msk_days as (
    select gs::date as msk_date
    from bounds b
    cross join lateral generate_series(
      date_trunc('day', b.start_ts at time zone 'Europe/Moscow')::date,
      date_trunc('day', b.end_ts at time zone 'Europe/Moscow')::date,
      interval '1 day'
    ) as g(gs)
  ),
  day_windows as (
    select
      d.msk_date,
      ((d.msk_date + s.work_start) at time zone 'Europe/Moscow') as work_start_ts,
      ((d.msk_date + s.work_end) at time zone 'Europe/Moscow') as work_end_ts,
      ((d.msk_date + s.lunch_start) at time zone 'Europe/Moscow') as lunch_start_ts,
      ((d.msk_date + s.lunch_end) at time zone 'Europe/Moscow') as lunch_end_ts,
      extract(dow from d.msk_date)::int as dow_msk
    from msk_days d
    cross join schedule s
  ),
  work_overlaps as (
    select
      greatest(
        0,
        extract(epoch from least(b.end_ts, w.work_end_ts) - greatest(b.start_ts, w.work_start_ts)) / 60.0
        - greatest(
            0,
            extract(
              epoch from
              least(least(b.end_ts, w.work_end_ts), w.lunch_end_ts)
              - greatest(greatest(b.start_ts, w.work_start_ts), w.lunch_start_ts)
            ) / 60.0
          )
      ) as work_min
    from bounds b
    cross join day_windows w
    where w.dow_msk <> 0
      and greatest(b.start_ts, w.work_start_ts) < least(b.end_ts, w.work_end_ts)
  )
  select coalesce((select round(sum(wo.work_min))::integer from work_overlaps wo), 0);
$$;


--
-- Name: calc_per_sheet(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calc_per_sheet(length_mm integer, width_mm integer) RETURNS integer
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select case
    when length_mm > 0 and width_mm > 0
      then floor(2070.0 / width_mm)::int * floor(2800.0 / length_mm)::int
    else 0
  end
$$;


--
-- Name: compute_order_pipeline_stage(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_order_pipeline_stage(p_overall text, p_assembly text, p_pilka text, p_kromka text, p_pras text) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
declare
  o text := lower(coalesce(p_overall, ''));
  a text := lower(coalesce(p_assembly, ''));
  pk text := lower(coalesce(p_pilka, ''));
  kr text := lower(coalesce(p_kromka, ''));
  pr text := lower(coalesce(p_pras, ''));
  pk_d boolean;
  kr_d boolean;
  pr_d boolean;
begin
  if o like '%╨║╨╛╨╝╨┐╨╗╨╡╨║╤В╨░╤Ж%' then
    return 'warehouse_kit';
  end if;

  if o like '%╨│╨╛╤В╨╛╨▓╨╛ ╨║ ╨╛╤В╨┐╤А╨░╨▓╨║╨╡%' then
    return 'ready_to_ship';
  end if;

  if o not like '%╨╜╨░ ╨┐╨╕╨╗╤Г%'
     and (o like '%╨╛╤В╨│╤А╤Г╨╢%' or o like '%╤Г╨┐╨░╨║╨╛╨▓%' or o like '%╨╛╤В╨┐╤А╨░╨▓%') then
    return 'shipped';
  end if;

  if a like '%╤Б╨╛╨▒╤А╨░╨╜╨╛%' then
    return 'assembled';
  end if;

  pk_d := (pk like '%╨│╨╛╤В╨╛╨▓%' or pk like '%╤Б╨╛╨▒╤А╨░╨╜╨╛%');
  kr_d := (kr like '%╨│╨╛╤В╨╛╨▓%' or kr like '%╤Б╨╛╨▒╤А╨░╨╜╨╛%');
  pr_d := (pr like '%╨│╨╛╤В╨╛╨▓%' or pr like '%╤Б╨╛╨▒╤А╨░╨╜╨╛%');

  if pk_d and kr_d and pr_d then
    return 'workshop_complete';
  end if;

  if pr like '%╨▓ ╤А╨░╨▒╨╛╤В╨╡%' or pr like '%╨┐╨░╤Г╨╖╨░%' or (pk_d and kr_d and not pr_d) then
    return 'pras';
  end if;

  if kr like '%╨▓ ╤А╨░╨▒╨╛╤В╨╡%' or kr like '%╨┐╨░╤Г╨╖╨░%' or (pk_d and not kr_d) then
    return 'kromka';
  end if;

  return 'pilka';
end;
$$;


--
-- Name: compute_order_stage_labor_minutes(timestamp with time zone, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_order_stage_labor_minutes(p_started_at timestamp with time zone, p_done_at timestamp with time zone, p_pause_acc_min integer) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select case
    when p_started_at is null or p_done_at is null then 0::numeric
    else greatest(
      0::numeric,
      public.business_minutes(p_started_at, p_done_at)::numeric
        - coalesce(p_pause_acc_min, 0)::numeric
    )
  end;
$$;


--
-- Name: crm_user_roles_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_user_roles_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: metal_extract_fork_plan(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_extract_fork_plan(p_graph jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_starts text[];
  v_start_id text;
  v_branch jsonb;
  v_branches jsonb := '[]'::jsonb;
  v_merge_stage text;
  v_merge_stages text[] := array[]::text[];
  v_route text[];
  v_i integer;
  v_merge_route text[];
begin
  if p_graph is null or jsonb_typeof(p_graph) <> 'object' then
    return jsonb_build_object('mode', 'linear', 'route', to_jsonb(array['laser', 'bending', 'welding', 'painting']));
  end if;

  v_starts := public.metal_graph_start_stage_nodes(p_graph);
  if coalesce(array_length(v_starts, 1), 0) <= 1 then
    return jsonb_build_object(
      'mode', 'linear',
      'route', to_jsonb(public.metal_graph_linear_route(p_graph))
    );
  end if;

  for v_i in 1..coalesce(array_length(v_starts, 1), 0) loop
    v_start_id := v_starts[v_i];
    v_branch := public.metal_graph_walk_branch(p_graph, v_start_id);
    v_branches := v_branches || jsonb_build_array(
      jsonb_build_object(
        'branch_key', coalesce((v_branch->'route'->>0), public.metal_graph_node_stage(p_graph, v_start_id)),
        'route', coalesce(v_branch->'route', '[]'::jsonb),
        'merge_stage', v_branch->>'merge_stage'
      )
    );
    if nullif(trim(coalesce(v_branch->>'merge_stage', '')), '') is not null then
      v_merge_stages := array_append(v_merge_stages, v_branch->>'merge_stage');
    end if;
  end loop;

  select m.stage into v_merge_stage
  from (select distinct unnest(v_merge_stages) as stage) m
  limit 1;

  if (select count(distinct stage) from unnest(v_merge_stages) stage) <> 1 or v_merge_stage is null then
    return jsonb_build_object('mode', 'linear', 'route', to_jsonb(array['laser', 'bending', 'welding', 'painting']));
  end if;

  v_merge_route := public.metal_graph_after_merge_route(p_graph, v_merge_stage);
  if coalesce(array_length(v_merge_route, 1), 0) < 1 then
    return jsonb_build_object('mode', 'linear', 'route', to_jsonb(array['laser', 'bending', 'welding', 'painting']));
  end if;

  return jsonb_build_object(
    'mode', 'parallel',
    'branches', v_branches,
    'merge_stage', v_merge_stage,
    'merge_route', to_jsonb(v_merge_route)
  );
end;
$$;


--
-- Name: metal_fork_planned_item(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_fork_planned_item(p_item_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_item public.metal_work_items%rowtype;
  v_graph jsonb;
  v_plan jsonb;
  v_fork_group uuid := gen_random_uuid();
  v_branch jsonb;
  v_route text[];
  v_i integer;
begin
  select * into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'work item not found';
  end if;
  if v_item.status <> 'planned' then
    raise exception 'only planned items can be forked';
  end if;

  v_graph := v_item.process_graph;
  if v_graph is null then
    select coalesce(c.process_graph, public.metal_linear_route_to_graph(c.stage_route))
    into v_graph
    from public.metal_product_catalog c
    where c.article = v_item.article;
  end if;

  v_plan := public.metal_extract_fork_plan(v_graph);
  if coalesce(v_plan->>'mode', '') <> 'parallel' then
    raise exception 'item graph is not parallel';
  end if;

  update public.metal_work_items mwi
  set
    status = 'split',
    fork_group_id = v_fork_group,
    fork_meta = jsonb_build_object(
      'merge_stage', v_plan->>'merge_stage',
      'merge_route', coalesce(v_plan->'merge_route', '[]'::jsonb)
    ),
    process_graph = v_graph,
    updated_at = now()
  where mwi.id = v_item.id;

  for v_i in 0..(jsonb_array_length(v_plan->'branches') - 1) loop
    v_branch := v_plan->'branches'->v_i;
    select array_agg(x order by ord)
    into v_route
    from (
      select value::text as x, ordinality as ord
      from jsonb_array_elements_text(coalesce(v_branch->'route', '[]'::jsonb)) with ordinality
    ) t;

    if coalesce(array_length(v_route, 1), 0) < 1 then
      continue;
    end if;

    insert into public.metal_work_items(
      article, name, week, qty,
      stage_route, route_idx, stage_done_qty,
      current_stage, stage_status, status,
      process_graph, fork_group_id, fork_role, parent_id, fork_meta,
      operator_comment
    )
    values (
      v_item.article,
      v_item.name,
      v_item.week,
      v_item.qty,
      v_route,
      0,
      0,
      v_route[1],
      'queued',
      'active',
      v_graph,
      v_fork_group,
      'branch',
      v_item.id,
      jsonb_build_object(
        'branch_key', coalesce(v_branch->>'branch_key', v_route[1]),
        'merge_stage', v_plan->>'merge_stage'
      ),
      v_item.operator_comment
    );
  end loop;
end;
$$;


--
-- Name: metal_graph_after_merge_route(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_graph_after_merge_route(p_graph jsonb, p_merge_stage text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_nodes jsonb := coalesce(p_graph->'nodes', '[]'::jsonb);
  v_cur text := null;
  v_next text;
  v_route text[] := array[]::text[];
  v_rec record;
  v_outs text[];
  v_guard integer := 0;
begin
  for v_rec in select n.value as node from jsonb_array_elements(v_nodes) n(value) loop
    if lower(coalesce(v_rec.node->>'kind', '')) = 'stage'
       and lower(trim(coalesce(v_rec.node->>'stage', ''))) = lower(trim(p_merge_stage)) then
      v_cur := v_rec.node->>'id';
      exit;
    end if;
  end loop;

  if v_cur is null then
    return array[]::text[];
  end if;

  v_route := array_append(v_route, lower(trim(p_merge_stage)));

  while v_cur is not null and v_guard < 32 loop
    v_guard := v_guard + 1;
    v_outs := array[]::text[];
    for v_rec in
      select e.value->>'to' as node_id
      from jsonb_array_elements(v_edges) e(value)
      where e.value->>'from' = v_cur
    loop
      if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
        v_outs := array_append(v_outs, v_rec.node_id);
      end if;
    end loop;

    if coalesce(array_length(v_outs, 1), 0) <> 1 then
      exit;
    end if;

    v_next := v_outs[1];
    v_route := array_append(v_route, public.metal_graph_node_stage(p_graph, v_next));
    v_cur := v_next;
  end loop;

  return v_route;
end;
$$;


--
-- Name: metal_graph_is_merge_node(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_graph_is_merge_node(p_graph jsonb, p_node_id text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  with stage_nodes as (
    select n.value->>'id' as id
    from jsonb_array_elements(coalesce(p_graph->'nodes', '[]'::jsonb)) n(value)
    where lower(coalesce(n.value->>'kind', '')) = 'stage'
  )
  select count(*) >= 2
  from jsonb_array_elements(coalesce(p_graph->'edges', '[]'::jsonb)) e(value)
  join stage_nodes s on s.id = e.value->>'from'
  where e.value->>'to' = p_node_id;
$$;


--
-- Name: metal_graph_linear_route(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_graph_linear_route(p_graph jsonb) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_starts text[];
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_cur text;
  v_next text;
  v_route text[] := array[]::text[];
  v_outs text[];
  v_rec record;
  v_guard integer := 0;
begin
  v_starts := public.metal_graph_start_stage_nodes(p_graph);
  if coalesce(array_length(v_starts, 1), 0) < 1 then
    return array['laser', 'bending', 'welding', 'painting'];
  end if;

  v_cur := v_starts[1];
  while v_cur is not null and v_guard < 32 loop
    v_guard := v_guard + 1;
    if public.metal_graph_node_stage(p_graph, v_cur) = '' then
      exit;
    end if;
    v_route := array_append(v_route, public.metal_graph_node_stage(p_graph, v_cur));

    v_outs := array[]::text[];
    for v_rec in
      select e.value->>'to' as node_id
      from jsonb_array_elements(v_edges) e(value)
      where e.value->>'from' = v_cur
    loop
      if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
        v_outs := array_append(v_outs, v_rec.node_id);
      end if;
    end loop;

    if coalesce(array_length(v_outs, 1), 0) <> 1 then
      exit;
    end if;
    v_next := v_outs[1];
    v_cur := v_next;
  end loop;

  if coalesce(array_length(v_route, 1), 0) < 1 then
    return array['laser', 'bending', 'welding', 'painting'];
  end if;
  return v_route;
end;
$$;


--
-- Name: metal_graph_node_stage(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_graph_node_stage(p_graph jsonb, p_node_id text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select lower(trim(coalesce(n.value->>'stage', '')))
  from jsonb_array_elements(coalesce(p_graph->'nodes', '[]'::jsonb)) n(value)
  where n.value->>'id' = p_node_id
    and lower(coalesce(n.value->>'kind', '')) = 'stage'
  limit 1;
$$;


--
-- Name: metal_graph_start_stage_nodes(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_graph_start_stage_nodes(p_graph jsonb) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_start_id text := 'start';
  v_nodes jsonb := coalesce(p_graph->'nodes', '[]'::jsonb);
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_rec record;
  v_out text[] := array[]::text[];
begin
  for v_rec in select n.value as node from jsonb_array_elements(v_nodes) n(value) loop
    if lower(coalesce(v_rec.node->>'kind', '')) = 'start' then
      v_start_id := coalesce(v_rec.node->>'id', 'start');
      exit;
    end if;
  end loop;

  for v_rec in
    select e.value->>'to' as node_id
    from jsonb_array_elements(v_edges) e(value)
    where e.value->>'from' = v_start_id
  loop
    if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
      v_out := array_append(v_out, v_rec.node_id);
    end if;
  end loop;

  return v_out;
end;
$$;


--
-- Name: metal_graph_walk_branch(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_graph_walk_branch(p_graph jsonb, p_start_node_id text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_edges jsonb := coalesce(p_graph->'edges', '[]'::jsonb);
  v_cur text := p_start_node_id;
  v_next text;
  v_route text[] := array[]::text[];
  v_stage text;
  v_merge_stage text := null;
  v_outs text[];
  v_rec record;
  v_guard integer := 0;
begin
  while v_cur is not null and v_guard < 32 loop
    v_guard := v_guard + 1;
    v_stage := public.metal_graph_node_stage(p_graph, v_cur);
    if v_stage = '' then
      exit;
    end if;

    if public.metal_graph_is_merge_node(p_graph, v_cur) and array_length(v_route, 1) is not null then
      v_merge_stage := v_stage;
      exit;
    end if;

    v_route := array_append(v_route, v_stage);

    if public.metal_graph_is_merge_node(p_graph, v_cur) then
      v_route := v_route[1:array_length(v_route, 1) - 1];
      v_merge_stage := v_stage;
      exit;
    end if;

    v_outs := array[]::text[];
    for v_rec in
      select e.value->>'to' as node_id
      from jsonb_array_elements(v_edges) e(value)
      where e.value->>'from' = v_cur
    loop
      if public.metal_graph_node_stage(p_graph, v_rec.node_id) <> '' then
        v_outs := array_append(v_outs, v_rec.node_id);
      end if;
    end loop;

    if coalesce(array_length(v_outs, 1), 0) = 0 then
      exit;
    end if;

    v_next := v_outs[1];
    if coalesce(array_length(v_outs, 1), 0) > 1 then
      select min(x) into v_next from unnest(v_outs) x;
    end if;

    if public.metal_graph_is_merge_node(p_graph, v_next) then
      v_merge_stage := public.metal_graph_node_stage(p_graph, v_next);
      exit;
    end if;

    v_cur := v_next;
  end loop;

  return jsonb_build_object(
    'route', to_jsonb(coalesce(v_route, array[]::text[])),
    'merge_stage', v_merge_stage
  );
end;
$$;


--
-- Name: metal_linear_route_to_graph(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_linear_route_to_graph(p_route text[]) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  v_nodes jsonb := '[]'::jsonb;
  v_edges jsonb := '[]'::jsonb;
  v_prev text := 'start';
  v_stage text;
  v_i integer := 0;
  v_id text;
  v_route text[] := coalesce(p_route, array['laser', 'bending', 'welding', 'painting']);
begin
  v_nodes := v_nodes || jsonb_build_object('id', 'start', 'kind', 'start', 'x', 40, 'y', 140);

  if array_length(v_route, 1) is null or array_length(v_route, 1) < 1 then
    v_route := array['laser', 'bending', 'welding', 'painting'];
  end if;

  foreach v_stage in array v_route loop
    v_id := 's' || v_i::text;
    v_nodes := v_nodes || jsonb_build_object(
      'id', v_id,
      'kind', 'stage',
      'stage', lower(trim(v_stage)),
      'x', 200 + v_i * 180,
      'y', 140
    );
    v_edges := v_edges || jsonb_build_object(
      'id', 'e-' || v_prev || '-' || v_id,
      'from', v_prev,
      'to', v_id
    );
    v_prev := v_id;
    v_i := v_i + 1;
  end loop;

  return jsonb_build_object('nodes', v_nodes, 'edges', v_edges);
end;
$$;


--
-- Name: metal_propagate_fork_qty(bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_propagate_fork_qty(p_item_id bigint, p_new_qty numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_item public.metal_work_items%rowtype;
  v_qty numeric := greatest(0, coalesce(p_new_qty, 0));
begin
  if v_qty <= 0 then
    return;
  end if;

  select mwi.* into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id;

  if v_item.id is null or v_item.fork_group_id is null then
    return;
  end if;

  update public.metal_work_items mwi
  set
    qty = v_qty,
    stage_done_qty = least(mwi.stage_done_qty, v_qty),
    updated_at = now()
  where mwi.fork_group_id = v_item.fork_group_id
    and mwi.status = 'split';

  update public.metal_work_items mwi
  set
    qty = v_qty,
    stage_done_qty = least(mwi.stage_done_qty, v_qty),
    updated_at = now()
  where mwi.fork_group_id = v_item.fork_group_id
    and mwi.fork_role = 'branch'
    and mwi.status <> 'done'
    and mwi.id <> v_item.id;

  update public.metal_work_items mwi
  set
    qty = v_qty,
    stage_done_qty = least(mwi.stage_done_qty, v_qty),
    updated_at = now()
  where mwi.fork_group_id = v_item.fork_group_id
    and mwi.fork_role = 'merge'
    and mwi.status <> 'done';
end;
$$;


--
-- Name: metal_try_spawn_merge_item(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.metal_try_spawn_merge_item(p_fork_group_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_parent public.metal_work_items%rowtype;
  v_open_branches integer;
  v_existing_merge integer;
  v_merge_route text[];
  v_merge_qty numeric;
  v_new_id bigint;
begin
  if p_fork_group_id is null then
    return null;
  end if;

  select count(*) into v_existing_merge
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.fork_role = 'merge';

  if v_existing_merge > 0 then
    return null;
  end if;

  select count(*) into v_open_branches
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.fork_role = 'branch'
    and mwi.status <> 'done';

  if v_open_branches > 0 then
    return null;
  end if;

  select * into v_parent
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.status = 'split'
  order by mwi.id
  limit 1;

  if v_parent.id is null then
    return null;
  end if;

  select min(mwi.qty) into v_merge_qty
  from public.metal_work_items mwi
  where mwi.fork_group_id = p_fork_group_id
    and mwi.fork_role = 'branch';

  v_merge_qty := coalesce(v_merge_qty, v_parent.qty);

  select array_agg(x order by ord)
  into v_merge_route
  from (
    select value::text as x, ordinality as ord
    from jsonb_array_elements_text(coalesce(v_parent.fork_meta->'merge_route', '[]'::jsonb)) with ordinality
  ) t;

  if coalesce(array_length(v_merge_route, 1), 0) < 1 then
    return null;
  end if;

  insert into public.metal_work_items(
    article, name, week, qty,
    stage_route, route_idx, stage_done_qty,
    current_stage, stage_status, status,
    process_graph, fork_group_id, fork_role, parent_id, fork_meta,
    operator_comment, shortfall_qty
  )
  values (
    v_parent.article,
    v_parent.name,
    v_parent.week,
    v_merge_qty,
    v_merge_route,
    0,
    0,
    v_merge_route[1],
    'queued',
    'active',
    v_parent.process_graph,
    p_fork_group_id,
    'merge',
    v_parent.id,
    v_parent.fork_meta,
    v_parent.operator_comment,
    v_parent.shortfall_qty
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;


--
-- Name: normalize_item_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_item_key(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select trim(
    regexp_replace(
      replace(lower(coalesce(p_text, '')), '╤Е', 'x'),
      '[^0-9a-z╨░-╤П╤С]+',
      ' ',
      'g'
    )
  );
$$;


--
-- Name: normalize_item_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_item_text(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select trim(regexp_replace(replace(lower(coalesce(p_text,'')), '╤С', '╨╡'), '\\s+', ' ', 'g'));
$$;


--
-- Name: orders_set_pipeline_stage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.orders_set_pipeline_stage() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.pipeline_stage := public.compute_order_pipeline_stage(
    new.overall_status,
    new.assembly_status,
    new.pilka_status,
    new.kromka_status,
    new.pras_status
  );
  return new;
end;
$$;


--
-- Name: resolve_color_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_color_name(p_item text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_norm text := public.normalize_item_key(p_item);
  v_color text;
begin
  select m.color_name::text
    into v_color
  from public.item_color_map m
  where public.normalize_item_key(m.item_name) = v_norm
  order by
    case when m.source = 'manual' then 0 else 1 end,
    m.updated_at desc nulls last
  limit 1;

  if v_color is not null then
    return v_color;
  end if;

  select m.color_name::text
    into v_color
  from public.item_color_map m
  where v_norm like ('%' || public.normalize_item_key(m.item_name) || '%')
  order by
    length(public.normalize_item_key(m.item_name)) desc,
    case when m.source = 'manual' then 0 else 1 end,
    m.updated_at desc nulls last
  limit 1;

  return v_color;
end
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: labor_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labor_facts (
    id bigint NOT NULL,
    order_id text NOT NULL,
    item text,
    week text,
    qty numeric(12,2) DEFAULT 0 NOT NULL,
    pilka_min numeric(12,2) DEFAULT 0 NOT NULL,
    kromka_min numeric(12,2) DEFAULT 0 NOT NULL,
    pras_min numeric(12,2) DEFAULT 0 NOT NULL,
    assembly_min numeric(12,2) DEFAULT 0 NOT NULL,
    total_min numeric(12,2) GENERATED ALWAYS AS ((((pilka_min + kromka_min) + pras_min) + assembly_min)) STORED,
    date_finished date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sync_labor_fact_from_order(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_labor_fact_from_order(p_order_id text) RETURNS public.labor_facts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order public.orders%rowtype;
  v_existing public.labor_facts%rowtype;
  v_pilka numeric := 0;
  v_kromka numeric := 0;
  v_pras numeric := 0;
  v_assembly numeric := 0;
  v_date date;
  v_row public.labor_facts%rowtype;
begin
  select * into v_order from public.orders where order_id = trim(coalesce(p_order_id, '')) limit 1;
  if v_order.order_id is null then return null; end if;
  select * into v_existing from public.labor_facts where order_id = v_order.order_id;
  if v_order.pilka_done_at is not null then
    v_pilka := public.compute_order_stage_labor_minutes(v_order.pilka_started_at, v_order.pilka_done_at, v_order.pilka_pause_acc_min);
  elsif v_existing.order_id is not null then v_pilka := coalesce(v_existing.pilka_min, 0); end if;
  if v_order.kromka_done_at is not null then
    v_kromka := public.compute_order_stage_labor_minutes(v_order.kromka_started_at, v_order.kromka_done_at, v_order.kromka_pause_acc_min);
  elsif v_existing.order_id is not null then v_kromka := coalesce(v_existing.kromka_min, 0); end if;
  if v_order.pras_done_at is not null then
    v_pras := public.compute_order_stage_labor_minutes(v_order.pras_started_at, v_order.pras_done_at, v_order.pras_pause_acc_min);
  elsif v_existing.order_id is not null then v_pras := coalesce(v_existing.pras_min, 0); end if;
  v_assembly := coalesce(v_existing.assembly_min, 0);
  if v_pilka <= 0 and v_kromka <= 0 and v_pras <= 0 and v_assembly <= 0 then return v_existing; end if;
  v_date := greatest(
    case when v_order.pilka_done_at is not null then v_order.pilka_done_at::date end,
    case when v_order.kromka_done_at is not null then v_order.kromka_done_at::date end,
    case when v_order.pras_done_at is not null then v_order.pras_done_at::date end
  );
  insert into public.labor_facts (order_id, item, week, qty, pilka_min, kromka_min, pras_min, assembly_min, date_finished)
  values (v_order.order_id, nullif(trim(coalesce(v_order.item, '')), ''), nullif(trim(coalesce(v_order.week, '')), ''), greatest(0, coalesce(v_order.qty, 0)), v_pilka, v_kromka, v_pras, v_assembly, v_date)
  on conflict (order_id) do update set item=excluded.item, week=excluded.week, qty=excluded.qty, pilka_min=excluded.pilka_min, kromka_min=excluded.kromka_min, pras_min=excluded.pras_min, assembly_min=excluded.assembly_min, date_finished=excluded.date_finished, updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;


--
-- Name: tg_labor_kit_plan_qty_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_labor_kit_plan_qty_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: tg_labor_kits_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_labor_kits_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: tg_labor_norms_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_labor_norms_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ begin new.updated_at = now(); return new; end; $$;


--
-- Name: trg_crm_audit_materials_moves(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_crm_audit_materials_moves() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if tg_op = 'INSERT'
     and new.move_type = 'expense'
     and lower(coalesce(new.source_type, '')) = 'order' then
    perform public.web_audit_log_event(
      'consume_sheets',
      'materials_moves',
      new.id::text,
      jsonb_build_object(
        'order_id', new.source_ref,
        'material', new.material,
        'qty_sheets', new.qty_sheets
      )
    );
  end if;
  return new;
end;
$$;


--
-- Name: trg_crm_audit_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_crm_audit_orders() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if tg_op = 'DELETE' then
    perform public.web_audit_log_event(
      'delete_order',
      'orders',
      old.order_id,
      jsonb_build_object(
        'source', old.source,
        'source_row_id', old.source_row_id,
        'item', old.item
      )
    );
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.pilka_status, '') is distinct from coalesce(new.pilka_status, '')
       or coalesce(old.kromka_status, '') is distinct from coalesce(new.kromka_status, '')
       or coalesce(old.pras_status, '') is distinct from coalesce(new.pras_status, '')
       or coalesce(old.assembly_status, '') is distinct from coalesce(new.assembly_status, '')
       or coalesce(old.overall_status, '') is distinct from coalesce(new.overall_status, '') then
      perform public.web_audit_log_event(
        'set_stage',
        'orders',
        coalesce(new.order_id, old.order_id),
        jsonb_build_object(
          'before', jsonb_build_object(
            'pilka_status', old.pilka_status,
            'kromka_status', old.kromka_status,
            'pras_status', old.pras_status,
            'assembly_status', old.assembly_status,
            'overall_status', old.overall_status
          ),
          'after', jsonb_build_object(
            'pilka_status', new.pilka_status,
            'kromka_status', new.kromka_status,
            'pras_status', new.pras_status,
            'assembly_status', new.assembly_status,
            'overall_status', new.overall_status
          )
        )
      );
    end if;
    return new;
  end if;

  return null;
end;
$$;


--
-- Name: trg_crm_audit_runtime_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_crm_audit_runtime_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if lower(coalesce(new.key, '')) = 'crm_auth_strict' then
    perform public.web_audit_log_event(
      'toggle_strict_mode',
      'crm_runtime_settings',
      new.key,
      jsonb_build_object(
        'enabled', lower(trim(coalesce(new.value_text, ''))) = 'true',
        'updated_at', new.updated_at
      )
    );
  end if;
  return new;
end;
$$;


--
-- Name: trg_crm_audit_user_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_crm_audit_user_roles() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.web_audit_log_event(
      'assign_role',
      'crm_user_roles',
      new.user_id::text,
      jsonb_build_object('role', new.role, 'note', new.note)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.role, '') is distinct from coalesce(new.role, '')
       or coalesce(old.note, '') is distinct from coalesce(new.note, '') then
      perform public.web_audit_log_event(
        'assign_role',
        'crm_user_roles',
        new.user_id::text,
        jsonb_build_object(
          'before', jsonb_build_object('role', old.role, 'note', old.note),
          'after', jsonb_build_object('role', new.role, 'note', new.note)
        )
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.web_audit_log_event(
      'remove_role',
      'crm_user_roles',
      old.user_id::text,
      jsonb_build_object('role', old.role, 'note', old.note)
    );
    return old;
  end if;

  return null;
end;
$$;


--
-- Name: trg_cutting_catalog_kits_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cutting_catalog_kits_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_cutting_jobs_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_cutting_jobs_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_furniture_custom_templates_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_furniture_custom_templates_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: trg_furniture_metal_map_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_furniture_metal_map_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: trg_gx_shelf_catalog_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_gx_shelf_catalog_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_hardware_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_hardware_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_metal_catalog_categories_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_metal_catalog_categories_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: trg_metal_components_stock_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_metal_components_stock_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: trg_metal_process_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_metal_process_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: trg_metal_work_queue_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_metal_work_queue_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: trg_normalize_premier_section(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_normalize_premier_section() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.section_name := public.web_normalize_premier_section_name(new.section_name, new.item);
  return new;
end;
$$;


--
-- Name: trg_orders_sync_replacement_on_shipped(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_sync_replacement_on_shipped() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(new.shipped, false) = true and coalesce(old.shipped, false) is distinct from true then
    perform public.web_complete_replacement_for_workshop_order(new.order_id);
  end if;
  return new;
end; $$;


--
-- Name: trg_orders_sync_shipment_plan_cell_on_pipeline(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_sync_shipment_plan_cell_on_pipeline() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if coalesce(new.pipeline_stage, '') is distinct from coalesce(old.pipeline_stage, '') then
    update public.shipment_plan_cells spc
    set
      in_work = case when coalesce(new.pipeline_stage, '') = 'pilka' then spc.in_work else false end,
      can_send_to_work = false,
      updated_at = now()
    where trim(coalesce(spc.week, '')) = trim(coalesce(new.week, ''))
      and (
        trim(coalesce(spc.source_row_id, '')) = trim(coalesce(new.source_row_id, ''))
        or public.web_norm_item_key(spc.item) = public.web_norm_item_key(new.item)
      );
  end if;
  return new;
end;
$$;


--
-- Name: trg_orders_sync_shipment_plan_cell_on_shipped(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_sync_shipment_plan_cell_on_shipped() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  if coalesce(new.pipeline_stage, '') = 'shipped'
     and coalesce(old.pipeline_stage, '') is distinct from 'shipped' then
    update public.shipment_plan_cells spc
    set
      can_send_to_work = false,
      in_work = false,
      updated_at = now()
    where trim(coalesce(spc.week, '')) = trim(coalesce(new.week, ''))
      and (
        trim(coalesce(spc.source_row_id, '')) = trim(coalesce(new.source_row_id, ''))
        or public.web_norm_item_key(spc.item) = public.web_norm_item_key(new.item)
      );
  end if;
  return new;
end;
$$;


--
-- Name: trg_overview_plan_months_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_overview_plan_months_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_production_plan_debts_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_production_plan_debts_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: trg_replacement_orders_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_replacement_orders_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: trg_sheet_orders_mirror_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_sheet_orders_mirror_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: trg_strap_stock_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_strap_stock_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: web_accept_replacement_order_packaging(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_accept_replacement_order_packaging(p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.replacement_orders
  set packaging_accepted = true,
      status = 'ЁЯЯв ╨Я╤А╨╕╨╜╤П╤В ╨▓ ╤А╨░╨▒╨╛╤В╤Г',
      accepted_at = now()
  where id = p_id;
end;
$$;


--
-- Name: web_accept_replacement_order_packaging(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_accept_replacement_order_packaging(p_id text, p_workshop_order_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  update public.replacement_orders set packaging_accepted = true, status = 'ЁЯЯв ╨Я╤А╨╕╨╜╤П╤В ╨▓ ╤А╨░╨▒╨╛╤В╤Г',
    accepted_at = now(), workshop_order_id = nullif(trim(coalesce(p_workshop_order_id, '')), '')
  where id = p_id;
end; $$;


--
-- Name: web_add_hardware_stock(bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_add_hardware_stock(p_item_id bigint, p_delta numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE v_delta NUMERIC := coalesce(p_delta, 0);
BEGIN
  IF p_item_id IS NULL OR v_delta = 0 THEN RETURN; END IF;
  INSERT INTO public.hardware_stock (hardware_item_id, qty) VALUES (p_item_id, GREATEST(0, v_delta))
  ON CONFLICT (hardware_item_id) DO UPDATE SET qty = GREATEST(0, public.hardware_stock.qty + v_delta), updated_at = now();
  INSERT INTO public.hardware_moves (hardware_item_id, qty, move_type, note) VALUES (p_item_id, v_delta, 'receipt', 'add stock');
END;
$$;


--
-- Name: web_add_hardware_stock(bigint, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_add_hardware_stock(p_item_id bigint, p_delta numeric, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_delta NUMERIC := coalesce(p_delta, 0);
  v_note  TEXT := nullif(trim(coalesce(p_note, '')), '');
  v_type  TEXT;
BEGIN
  IF p_item_id IS NULL OR v_delta = 0 THEN
    RETURN;
  END IF;

  IF v_delta > 0 THEN
    v_type := 'income';
    v_note := coalesce(v_note, '╨┐╤А╨╕╤Е╨╛╨┤');
  ELSE
    v_type := 'adjust';
    v_note := coalesce(v_note, '╨║╨╛╤А╤А╨╡╨║╤В╨╕╤А╨╛╨▓╨║╨░');
  END IF;

  INSERT INTO public.hardware_stock (hardware_item_id, qty)
  VALUES (p_item_id, GREATEST(0, v_delta))
  ON CONFLICT (hardware_item_id) DO UPDATE
    SET qty = GREATEST(0, public.hardware_stock.qty + v_delta),
        updated_at = now();

  INSERT INTO public.hardware_moves (hardware_item_id, qty, move_type, note)
  VALUES (p_item_id, v_delta, v_type, v_note);
END;
$$;


--
-- Name: web_add_strap_stock(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_add_strap_stock(p_strap_type text, p_color text, p_qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.strap_stock (strap_type, color, qty)
  VALUES (p_strap_type, p_color, GREATEST(0, p_qty))
  ON CONFLICT (strap_type, color) DO UPDATE
    SET qty = public.strap_stock.qty + GREATEST(0, EXCLUDED.qty),
        updated_at = now();
END;
$$;


--
-- Name: web_admin_delete_item_article_map_row(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_admin_delete_item_article_map_row(p_article text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_art text := trim(coalesce(p_article, ''));
  v_deleted integer := 0;
begin
  perform public.web_require_roles(array['admin']);
  if v_art = '' then
    raise exception 'article is required';
  end if;

  delete from public.item_article_map
  where trim(upper(coalesce(article, ''))) = trim(upper(v_art));
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;


--
-- Name: web_admin_upsert_item_article_map_row(text, text, text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_admin_upsert_item_article_map_row(p_prev_article text DEFAULT NULL::text, p_article text DEFAULT NULL::text, p_item_name text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_section_name text DEFAULT NULL::text, p_table_color text DEFAULT NULL::text, p_sort_order integer DEFAULT 999) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_prev text := nullif(trim(coalesce(p_prev_article, '')), '');
  v_art text := trim(coalesce(p_article, ''));
  v_item text := trim(coalesce(p_item_name, ''));
  v_src text := trim(coalesce(nullif(trim(coalesce(p_source, '')), ''), 'manual'));
  v_section text := trim(coalesce(p_section_name, ''));
  v_color text := trim(coalesce(p_table_color, ''));
  v_sort integer := coalesce(p_sort_order, 999);
begin
  perform public.web_require_roles(array['admin']);

  if v_art = '' then
    raise exception 'article is required';
  end if;
  if v_item = '' then
    raise exception 'item_name is required';
  end if;
  if v_sort < 0 then
    v_sort := 999;
  end if;

  -- Rename article: ensure target code is free (except the row we replace).
  if v_prev is not null and upper(v_prev) <> upper(v_art) then
    if exists (
      select 1
      from public.item_article_map x
      where trim(upper(coalesce(x.article, ''))) = trim(upper(v_art))
        and trim(upper(coalesce(x.article, ''))) <> trim(upper(v_prev))
    ) then
      raise exception 'article % already exists', v_art;
    end if;
    delete from public.item_article_map
    where trim(upper(coalesce(article, ''))) = trim(upper(v_prev));
  end if;

  delete from public.item_article_map
  where trim(upper(coalesce(article, ''))) = trim(upper(v_art));

  insert into public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
  values (v_art, v_item, v_src, nullif(v_section, ''), nullif(v_color, ''), v_sort);

  if v_section <> '' then
    insert into public.section_catalog(section_name, sort_order, is_active)
    values (v_section, v_sort, true)
    on conflict (section_name)
    do update set is_active = true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'article', v_art,
    'item_name', v_item,
    'source', v_src,
    'section_name', v_section,
    'table_color', v_color,
    'sort_order', v_sort
  );
end;
$$;


--
-- Name: web_audit_log_event(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_audit_log_event(p_action text, p_entity text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_entity text := lower(trim(coalesce(p_entity, '')));
begin
  if v_action = '' or v_entity = '' then
    return;
  end if;

  insert into public.crm_audit_log(
    actor_user_id,
    actor_db_role,
    actor_crm_role,
    action,
    entity,
    entity_id,
    details
  )
  values (
    auth.uid(),
    lower(coalesce(current_setting('request.jwt.claim.role', true), '')),
    lower(coalesce(public.web_effective_crm_role(), 'viewer')),
    v_action,
    v_entity,
    nullif(trim(coalesce(p_entity_id, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;


--
-- Name: web_calc_working_seconds_between(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_calc_working_seconds_between(p_start timestamp with time zone, p_end timestamp with time zone) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with bounds as (
    select
      least(p_start, p_end) as start_ts,
      greatest(p_start, p_end) as end_ts
  ),
  schedule as (
    select
      coalesce(ws.working_days, array['mon','tue','wed','thu','fri']::text[]) as working_days,
      ws.work_start::time as work_start,
      ws.work_end::time as work_end,
      ws.lunch_start::time as lunch_start,
      ws.lunch_end::time as lunch_end
    from public.web_get_work_schedule() ws
    limit 1
  ),
  days as (
    select
      gs as day_start,
      case extract(dow from gs)::int
        when 0 then 'sun'
        when 1 then 'mon'
        when 2 then 'tue'
        when 3 then 'wed'
        when 4 then 'thu'
        when 5 then 'fri'
        else 'sat'
      end as day_key
    from bounds b
    cross join lateral generate_series(
      date_trunc('day', b.start_ts),
      date_trunc('day', b.end_ts),
      interval '1 day'
    ) gs
  ),
  per_day as (
    select
      d.day_start,
      (d.day_start + s.work_start) as work_start_ts,
      (d.day_start + s.work_end) as work_end_ts,
      (d.day_start + s.lunch_start) as lunch_start_ts,
      (d.day_start + s.lunch_end) as lunch_end_ts,
      d.day_key = any(s.working_days) as is_work_day
    from days d
    cross join schedule s
  ),
  day_overlaps as (
    select
      case
        when not p.is_work_day then 0::bigint
        else greatest(
          0,
          extract(epoch from least(b.end_ts, p.work_end_ts) - greatest(b.start_ts, p.work_start_ts))
        )::bigint
      end as work_overlap_sec,
      case
        when not p.is_work_day then 0::bigint
        else greatest(
          0,
          extract(epoch from least(b.end_ts, p.lunch_end_ts) - greatest(b.start_ts, p.lunch_start_ts))
        )::bigint
      end as lunch_overlap_sec
    from per_day p
    cross join bounds b
  )
  select greatest(0::bigint, coalesce(sum(work_overlap_sec - lunch_overlap_sec), 0::bigint))
  from day_overlaps;
$$;


--
-- Name: web_complete_replacement_for_workshop_order(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_complete_replacement_for_workshop_order(p_workshop_order_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order_id text := trim(coalesce(p_workshop_order_id, ''));
  v_item_key text;
begin
  if v_order_id = '' then return; end if;
  update public.replacement_orders r
  set status = 'тЬЕ ╨У╨╛╤В╨╛╨▓╨╛', completed_at = coalesce(r.completed_at, now()),
      workshop_order_id = coalesce(r.workshop_order_id, v_order_id)
  where r.workshop_order_id = v_order_id
     or (r.workshop_order_id is null and r.packaging_accepted = true
         and r.status = 'ЁЯЯв ╨Я╤А╨╕╨╜╤П╤В ╨▓ ╤А╨░╨▒╨╛╤В╤Г'
         and exists (select 1 from public.orders o where o.order_id = v_order_id
           and coalesce(o.shipped, false) = true
           and public.web_norm_item_key(coalesce(o.item, '')) = public.web_replacement_item_key(r.product, r.part)));
  select public.web_replacement_item_key(r.product, r.part) into v_item_key
  from public.replacement_orders r where r.workshop_order_id = v_order_id limit 1;
  if v_item_key is not null then
    update public.replacement_orders r
    set status = 'тЬЕ ╨У╨╛╤В╨╛╨▓╨╛', completed_at = coalesce(r.completed_at, now()),
        workshop_order_id = coalesce(r.workshop_order_id, v_order_id)
    where r.workshop_order_id = v_order_id
       or (r.workshop_order_id is null and r.packaging_accepted = true
           and r.status = 'ЁЯЯв ╨Я╤А╨╕╨╜╤П╤В ╨▓ ╤А╨░╨▒╨╛╤В╤Г'
           and public.web_replacement_item_key(r.product, r.part) = v_item_key
           and exists (select 1 from public.orders o where o.order_id = v_order_id));
  end if;
end;
$$;


--
-- Name: web_consume_hardware_by_order_id(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_consume_hardware_by_order_id(p_order_id text, p_lines jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_order_id TEXT := trim(coalesce(p_order_id, ''));
  v_lines JSONB := coalesce(p_lines, '[]'::jsonb);
  v_row JSONB; v_item_id BIGINT; v_qty NUMERIC; v_count INTEGER := 0; v_results JSONB := '[]'::jsonb; v_move_id BIGINT;
BEGIN
  IF v_order_id = '' THEN RAISE EXCEPTION 'Order ID is required'; END IF;
  IF jsonb_typeof(v_lines) <> 'array' THEN RAISE EXCEPTION 'lines must be a json array'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_item_id := nullif(v_row->>'hardware_item_id', '')::bigint;
    v_qty := coalesce((v_row->>'qty')::numeric, 0);
    IF v_item_id IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    v_move_id := NULL;
    INSERT INTO public.hardware_moves (hardware_item_id, order_id, qty, move_type, note)
    VALUES (v_item_id, v_order_id, -v_qty, 'consume', 'consume after order closed')
    ON CONFLICT (lower(trim(coalesce(order_id, ''))), hardware_item_id) WHERE move_type = 'consume'
    DO NOTHING RETURNING id INTO v_move_id;
    IF v_move_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.hardware_stock (hardware_item_id, qty) VALUES (v_item_id, -v_qty)
    ON CONFLICT (hardware_item_id) DO UPDATE SET qty = public.hardware_stock.qty - v_qty, updated_at = now();
    v_results := v_results || jsonb_build_array(jsonb_build_object('hardware_item_id', v_item_id, 'qty', v_qty, 'move_id', v_move_id));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'lines_consumed', v_count, 'results', v_results);
END;
$$;


--
-- Name: materials_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material text NOT NULL,
    qty_sheets numeric(12,2) NOT NULL,
    move_type text NOT NULL,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_ref text,
    comment text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materials_moves_move_type_check CHECK ((move_type = ANY (ARRAY['income'::text, 'expense'::text, 'adjustment'::text])))
);


--
-- Name: web_consume_sheets_by_order_id(text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_consume_sheets_by_order_id(p_order_id text, p_material text, p_qty numeric) RETURNS public.materials_moves
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_move public.materials_moves;
  v_material text := trim(coalesce(p_material, ''));
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_norm_key text := lower(trim(regexp_replace(replace(trim(coalesce(p_material, '')), '╤С', '╨╡'), '\s+', ' ', 'g')));
  v_updated integer := 0;
  v_stage_comment text := 'consume after pilka done';
begin
  perform public.web_require_workshop_stage('pilka');

  if v_order_id = '' then
    raise exception 'Order ID is required';
  end if;
  if v_material = '' then
    raise exception 'Material is required';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  select * into v_move
  from public.materials_moves mm
  where mm.move_type = 'expense'
    and mm.source_type = 'order'
    and trim(coalesce(mm.source_ref, '')) = v_order_id
    and mm.comment = v_stage_comment
    and lower(trim(regexp_replace(replace(trim(mm.material), '╤С', '╨╡'), '\s+', ' ', 'g'))) = v_norm_key
  order by mm.created_at desc
  limit 1;
  if v_move.id is not null then
    return v_move;
  end if;

  insert into public.materials_moves(material, qty_sheets, move_type, source_type, source_ref, comment)
  values (v_material, p_qty, 'expense', 'order', v_order_id, v_stage_comment)
  returning * into v_move;

  update public.materials_stock ms
  set
    qty_sheets = coalesce(ms.qty_sheets, 0) - p_qty,
    updated_at = now()
  where lower(trim(regexp_replace(replace(trim(ms.material), '╤С', '╨╡'), '\s+', ' ', 'g'))) = v_norm_key;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.materials_stock(material, qty_sheets)
    values (v_material, -p_qty)
    on conflict (material) do update
      set
        qty_sheets = coalesce(public.materials_stock.qty_sheets, 0) - p_qty,
        updated_at = now();
  end if;

  return v_move;
end;
$$;


--
-- Name: web_consume_sheets_lines_by_order_id(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_consume_sheets_lines_by_order_id(p_order_id text, p_lines jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_row jsonb;
  v_material text;
  v_qty numeric;
  v_move public.materials_moves;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  perform public.web_require_workshop_stage('pilka');

  if v_order_id = '' then
    raise exception 'Order ID is required';
  end if;
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'lines must be a json array';
  end if;

  for v_row in select value from jsonb_array_elements(v_lines)
  loop
    v_material := trim(coalesce(v_row->>'material', ''));
    v_qty := coalesce((v_row->>'qty')::numeric, (v_row->>'qty_sheets')::numeric, 0);
    if v_material = '' or v_qty <= 0 then
      continue;
    end if;
    v_move := public.web_consume_sheets_by_order_id(v_order_id, v_material, v_qty);
    v_results := v_results || jsonb_build_array(
      jsonb_build_object('material', v_material, 'qty', v_qty, 'move_id', v_move.id)
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'no valid consume lines (need material+qty)';
  end if;

  return jsonb_build_object('ok', true, 'order_id', v_order_id, 'lines_consumed', v_count, 'results', v_results);
end;
$$;


--
-- Name: web_consume_strap_stock(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_consume_strap_stock(p_strap_type text, p_color text, p_qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_type  text := trim(coalesce(p_strap_type, ''));
  v_color text := trim(coalesce(p_color, ''));
  v_delta int := greatest(0, coalesce(p_qty, 0));
BEGIN
  IF v_type = '' OR v_delta = 0 THEN
    RETURN;
  END IF;
  IF v_color = '' THEN
    v_color := '╨з╨╡╤А╨╜╤Л╨╣';
  END IF;

  INSERT INTO public.strap_stock (strap_type, color, qty)
  VALUES (v_type, v_color, 0)
  ON CONFLICT (strap_type, color) DO NOTHING;

  UPDATE public.strap_stock
     SET qty = greatest(0, qty - v_delta),
         updated_at = now()
   WHERE strap_type = v_type AND color = v_color;
END;
$$;


--
-- Name: web_create_metal_work_item(text, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_create_metal_work_item(p_article text, p_name text, p_week text, p_qty numeric) RETURNS TABLE(id bigint, article text, name text, week text, qty numeric, current_stage text, stage_status text, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  v_article text := upper(trim(coalesce(p_article, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_week text := nullif(trim(coalesce(p_week, '')), '');
  v_qty numeric := coalesce(p_qty, 0);
  v_route text[];
  v_graph jsonb;
  v_plan jsonb;
  v_stage text;
  v_new_id bigint;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_article = '' then raise exception 'article required'; end if;
  if v_name = '' then raise exception 'name required'; end if;
  if v_qty <= 0 then raise exception 'qty must be > 0'; end if;

  insert into public.metal_product_catalog(article, name, is_active)
  values (v_article, v_name, true)
  on conflict on constraint metal_product_catalog_pkey
  do update set
    name = excluded.name,
    is_active = true,
    updated_at = now();

  select
    coalesce(c.process_graph, public.metal_linear_route_to_graph(c.stage_route)),
    coalesce(c.stage_route, array['laser', 'bending', 'welding', 'painting'])
  into v_graph, v_route
  from public.metal_product_catalog c
  where c.article = v_article;

  v_plan := public.metal_extract_fork_plan(v_graph);
  if v_plan->>'mode' = 'linear' then
    select array_agg(x order by ord) into v_route
    from (
      select value::text as x, ordinality as ord
      from jsonb_array_elements_text(coalesce(v_plan->'route', to_jsonb(v_route))) with ordinality
    ) t;
  end if;

  if coalesce(array_length(v_route, 1), 0) < 1 then
    v_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  v_stage := lower(trim(coalesce(v_route[1], 'laser')));

  insert into public.metal_work_items(
    article, name, week, qty,
    stage_route, route_idx, stage_done_qty,
    current_stage, stage_status, status,
    process_graph
  )
  values (
    v_article, v_name, v_week, v_qty,
    v_route, 0, 0,
    v_stage, 'queued', 'planned',
    v_graph
  )
  returning metal_work_items.id into v_new_id;

  return query
  select
    mwi.id,
    mwi.article,
    mwi.name,
    mwi.week,
    mwi.qty,
    mwi.current_stage,
    mwi.stage_status,
    mwi.status,
    mwi.created_at,
    mwi.updated_at
  from public.metal_work_items mwi
  where mwi.id = v_new_id;

  perform public.web_audit_log_event(
    'create_metal_work_item',
    'metal_work_items',
    v_new_id::text,
    jsonb_build_object(
      'article', v_article,
      'name', v_name,
      'week', v_week,
      'qty', v_qty,
      'stage_route', v_route,
      'status', 'planned'
    )
  );
end;
$$;


--
-- Name: web_create_replacement_order(text, text, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_create_replacement_order(p_id text, p_product text, p_part text, p_qty integer, p_color text, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.replacement_orders (id, product, part, qty, color, note)
  values (p_id, p_product, p_part, p_qty, p_color, p_note)
  on conflict (id) do nothing;
end;
$$;


--
-- Name: shipment_cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_row_id text,
    source_col_id text,
    section_name text NOT NULL,
    item text NOT NULL,
    material text,
    week text,
    qty numeric(12,2) DEFAULT 0 NOT NULL,
    bg_color text,
    can_send_to_work boolean DEFAULT false NOT NULL,
    in_work boolean DEFAULT false NOT NULL,
    sheets_needed numeric(12,2) DEFAULT 0 NOT NULL,
    available_sheets numeric(12,2) DEFAULT 0 NOT NULL,
    output_per_sheet numeric(12,2) DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_article text
);


--
-- Name: TABLE shipment_cells; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shipment_cells IS 'Mirror of shipment_plan_cells (sync via trg_sync_plan_to_shipment_cells). Application code should not INSERT/UPDATE here directly; use shipment_plan_cells or RPC web_create_shipment_plan_cell.';


--
-- Name: web_create_shipment_plan_cell(text, text, text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_create_shipment_plan_cell(p_section_name text, p_item text, p_material text, p_week text, p_qty numeric, p_format_type text DEFAULT NULL::text) RETURNS public.shipment_cells
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_section text := coalesce(nullif(trim(p_section_name), ''), '╨Я╤А╨╛╤З╨╡╨╡');
  v_item text := coalesce(nullif(trim(p_item), ''), '');
  v_material text := nullif(trim(coalesce(p_material, '')), '');
  v_week text := coalesce(nullif(trim(p_week), ''), '');
  v_qty numeric := coalesce(p_qty, 0);
  v_row_key text;
  v_col_key text;
  v_col_key_in text;
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_existing_row_key text;
  v_existing_col_key text;
  v_cell public.shipment_cells;
  v_force_new boolean := false;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_item = '' then
    raise exception 'Item is required';
  end if;
  if v_week = '' then
    raise exception 'Week is required';
  end if;
  if v_qty <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  v_col_key_in := public.web_norm_week_key(v_week);
  v_week := v_col_key_in;

  select exists (
    select 1
    from public.shipment_plan_cells spc
    where public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(v_section)
      and public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_item)
      and public.web_norm_item_key(coalesce(spc.material, '')) = public.web_norm_item_key(coalesce(v_material, ''))
      and (
        public.web_norm_week_key(spc.week) = v_col_key_in
        or public.web_norm_week_key(spc.source_col_id) = v_col_key_in
      )
      and (
        coalesce(spc.in_work, false) = true
        or public.web_plan_cell_has_active_order(
          spc.source_row_id, spc.item, spc.material, spc.week
        )
      )
  )
  into v_force_new;

  if not v_force_new then
    select spc.source_row_id, spc.source_col_id
      into v_existing_row_key, v_existing_col_key
    from public.shipment_plan_cells spc
    where public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(v_section)
      and public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_item)
      and public.web_norm_item_key(coalesce(spc.material, '')) = public.web_norm_item_key(coalesce(v_material, ''))
      and (
        public.web_norm_week_key(spc.week) = v_col_key_in
        or public.web_norm_week_key(spc.source_col_id) = v_col_key_in
      )
      and coalesce(spc.in_work, false) = false
      and coalesce(spc.can_send_to_work, false) = true
      and not public.web_plan_cell_has_active_order(
        spc.source_row_id, spc.item, spc.material, spc.week
      )
    order by spc.updated_at desc nulls last, spc.id desc
    limit 1;
  end if;

  v_row_key := coalesce(
    nullif(trim(v_existing_row_key), ''),
    'manual:' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
  );
  v_col_key := coalesce(nullif(trim(v_existing_col_key), ''), v_col_key_in);

  v_output_per_sheet := public.web_resolve_output_per_sheet(v_section, v_item, v_material, 0::numeric);
  v_sheets_needed := case when v_output_per_sheet > 0 then ceil(v_qty / v_output_per_sheet) else 0 end;

  insert into public.shipment_plan_cells (
    section_name, item, material, week, qty,
    row_ref, col_ref, source_row_id, source_col_id,
    bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
  )
  values (
    v_section, v_item, v_material, v_week, v_qty,
    v_row_key, v_col_key, v_row_key, v_col_key,
    '#ffffff', true, false, v_sheets_needed, 0, v_output_per_sheet, 'manual plan'
  )
  on conflict (source_row_id, source_col_id)
  do update set
    section_name = excluded.section_name,
    item = excluded.item,
    material = excluded.material,
    week = excluded.week,
    qty = excluded.qty,
    row_ref = excluded.row_ref,
    col_ref = excluded.col_ref,
    bg = '#ffffff',
    can_send_to_work = true,
    in_work = false,
    sheets_needed = excluded.sheets_needed,
    available_sheets = 0,
    output_per_sheet = excluded.output_per_sheet,
    note = 'manual plan',
    updated_at = now();

  insert into public.shipment_cells (
    source_row_id, source_col_id, section_name, item, material, week, qty,
    bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
  )
  values (
    v_row_key, v_col_key, v_section, v_item, v_material, v_week, v_qty,
    '#ffffff', true, false, v_sheets_needed, 0, v_output_per_sheet, 'manual plan'
  )
  on conflict (source_row_id, source_col_id)
  do update set
    section_name = excluded.section_name,
    item = excluded.item,
    material = excluded.material,
    week = excluded.week,
    qty = excluded.qty,
    sheets_needed = excluded.sheets_needed,
    available_sheets = excluded.available_sheets,
    output_per_sheet = excluded.output_per_sheet,
    note = excluded.note,
    updated_at = now();

  select *
    into v_cell
  from public.shipment_cells
  where source_row_id = v_row_key
    and source_col_id = v_col_key
  limit 1;

  return v_cell;
end;
$$;


--
-- Name: web_create_shipment_plan_cell(text, text, text, text, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_create_shipment_plan_cell(p_section_name text, p_item text, p_material text, p_week text, p_qty numeric, p_format_type text DEFAULT NULL::text, p_article text DEFAULT NULL::text) RETURNS public.shipment_cells
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_section text := coalesce(nullif(trim(p_section_name), ''), '╨Я╤А╨╛╤З╨╡╨╡');
  v_item text := coalesce(nullif(trim(p_item), ''), '');
  v_material text := nullif(trim(coalesce(p_material, '')), '');
  v_week text := coalesce(nullif(trim(p_week), ''), '');
  v_qty numeric := coalesce(p_qty, 0);
  v_row_key text;
  v_col_key text;
  v_col_key_in text;
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_existing_row_key text;
  v_existing_col_key text;
  v_cell public.shipment_cells;
  v_product_article text := nullif(trim(coalesce(p_article, '')), '');
begin
  if v_item = '' then
    raise exception 'Item is required';
  end if;
  if v_week = '' then
    raise exception 'Week is required';
  end if;
  if v_qty <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  if v_product_article is null then
    v_product_article := public.web_extract_article_from_item(v_item);
  end if;

  v_col_key_in := public.web_norm_week_key(v_week);
  v_week := v_col_key_in;

  select spc.source_row_id, spc.source_col_id
    into v_existing_row_key, v_existing_col_key
  from public.shipment_plan_cells spc
  where public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(v_section)
    and public.web_norm_item_key(spc.item) = public.web_norm_item_key(v_item)
    and (
      public.web_norm_week_key(spc.week) = v_col_key_in
      or public.web_norm_week_key(spc.source_col_id) = v_col_key_in
    )
  order by spc.updated_at desc nulls last, spc.id desc
  limit 1;

  v_row_key := coalesce(nullif(trim(v_existing_row_key), ''), 'manual:' || substr(md5(lower(v_section || '|' || v_item || '|' || coalesce(v_material, ''))), 1, 16));
  v_col_key := coalesce(nullif(trim(v_existing_col_key), ''), v_col_key_in);

  v_output_per_sheet := public.web_resolve_output_per_sheet(v_section, v_item, v_material, 0::numeric);
  v_sheets_needed := case when v_output_per_sheet > 0 then ceil(v_qty / v_output_per_sheet) else 0 end;

  insert into public.shipment_plan_cells (
    section_name, item, material, week, qty,
    row_ref, col_ref, source_row_id, source_col_id,
    bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note, product_article
  )
  values (
    v_section, v_item, v_material, v_week, v_qty,
    v_row_key, v_col_key, v_row_key, v_col_key,
    '#ffffff', true, false, v_sheets_needed, 0, v_output_per_sheet, 'manual plan', v_product_article
  )
  on conflict (source_row_id, source_col_id)
  do update set
    section_name = excluded.section_name,
    item = excluded.item,
    material = excluded.material,
    week = excluded.week,
    qty = excluded.qty,
    row_ref = excluded.row_ref,
    col_ref = excluded.col_ref,
    bg = '#ffffff',
    can_send_to_work = true,
    in_work = false,
    sheets_needed = excluded.sheets_needed,
    available_sheets = 0,
    output_per_sheet = excluded.output_per_sheet,
    note = 'manual plan',
    product_article = coalesce(excluded.product_article, public.shipment_plan_cells.product_article),
    updated_at = now();

  select * into v_cell
  from public.shipment_cells
  where source_row_id = v_row_key and source_col_id = v_col_key
  limit 1;

  return v_cell;
end;
$$;


--
-- Name: web_debug_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_debug_auth() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_uid uuid := auth.uid();
  v_role text := public.web_effective_crm_role();
begin
  return jsonb_build_object(
    'uid', v_uid,
    'effective_role', v_role,
    'jwt_claims', coalesce(nullif(v_claims, ''), null),
    'db_role', current_setting('request.jwt.claim.role', true)
  );
end;
$$;


--
-- Name: web_delete_cutting_catalog_kit(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_cutting_catalog_kit(p_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  DELETE FROM public.cutting_catalog_kits WHERE id = p_id;
  RETURN FOUND;
END;
$$;


--
-- Name: web_delete_cutting_job(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_cutting_job(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.cutting_jobs WHERE id = p_id;
END;
$$;


--
-- Name: web_delete_furniture_custom_template(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_furniture_custom_template(p_product_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
  v_tpl_deleted integer := 0;
  v_map_deleted integer := 0;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_name = '' then
    raise exception 'product_name is required';
  end if;

  delete from public.furniture_custom_templates t
  where t.product_name = v_name;

  get diagnostics v_tpl_deleted = row_count;

  delete from public.item_article_map iam
  where iam.source = 'manual'
    and lower(trim(iam.item_name)) = lower(v_name);

  get diagnostics v_map_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'product_name', v_name,
    'templates_deleted', v_tpl_deleted,
    'manual_item_article_map_deleted', v_map_deleted
  );
end;
$$;


--
-- Name: web_delete_gx_shelf_catalog_item(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_gx_shelf_catalog_item(p_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  DELETE FROM public.gx_shelf_catalog WHERE id = p_id;
  RETURN FOUND;
END;
$$;


--
-- Name: web_delete_hardware_bom_row(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_hardware_bom_row(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM public.hardware_bom WHERE id = p_id;
END;
$$;


--
-- Name: web_delete_hardware_product_map_row(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_hardware_product_map_row(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN DELETE FROM public.hardware_product_map WHERE id = p_id; END;
$$;


--
-- Name: web_delete_labor_kit(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_labor_kit(p_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  delete from public.labor_kits where id = p_id;

  if not found then
    return false;
  end if;

  return true;
end;
$$;


--
-- Name: web_delete_labor_norm(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_labor_norm(p_id integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ begin perform public.web_require_roles(array['operator', 'manager', 'admin']); delete from public.labor_norms where id = p_id; if not found then return false; end if; return true; end; $$;


--
-- Name: web_delete_metal_catalog_item(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_metal_catalog_item(p_article text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
    raise exception '╨Р╤А╤В╨╕╨║╤Г╨╗ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜ ╨▓ ╨║╨░╤В╨░╨╗╨╛╨│╨╡';
  end if;

  select count(*) into v_active_count
  from public.metal_work_items mwi
  where mwi.article = v_row_article
    and mwi.status not in ('done', 'cancelled');

  if v_active_count > 0 then
    raise exception '╨Э╨╡╨╗╤М╨╖╤П ╤Г╨▒╤А╨░╤В╤М ╨╕╨╖ ╨║╨░╤В╨░╨╗╨╛╨│╨░: ╨╡╤Б╤В╤М % ╨░╨║╤В╨╕╨▓╨╜╤Л╤Е ╨╖╨░╨┤╨░╨╜╨╕╨╣ ╨▓ ╨┐╤А╨╛╨╕╨╖╨▓╨╛╨┤╤Б╤В╨▓╨╡', v_active_count;
  end if;

  select count(*) into v_history_count
  from public.metal_work_items mwi
  where mwi.article = v_row_article;

  if v_history_count > 0 then
    update public.metal_product_catalog c
    set is_active = false,
        updated_at = now()
    where c.article = v_row_article;

    perform public.web_audit_log_event(
      'deactivate',
      'metal_product_catalog',
      v_row_article,
      jsonb_build_object(
        'source', 'web_delete_metal_catalog_item',
        'reason', 'production history exists'
      )
    );
    return;
  end if;

  delete from public.metal_product_catalog c where c.article = v_row_article;

  perform public.web_audit_log_event(
    'delete',
    'metal_product_catalog',
    v_row_article,
    jsonb_build_object('source', 'web_delete_metal_catalog_item')
  );
end;
$$;


--
-- Name: web_delete_metal_work_item(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_metal_work_item(p_item_id bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_deleted_id bigint;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if coalesce(p_item_id, 0) <= 0 then
    raise exception 'invalid item id';
  end if;

  delete from public.metal_work_items mwi
  where mwi.id = p_item_id
  returning mwi.id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'work item not found';
  end if;

  perform public.web_audit_log_event(
    'delete_metal_work_item',
    'metal_work_items',
    v_deleted_id::text,
    jsonb_build_object('deleted', true)
  );

  return true;
end;
$$;


--
-- Name: web_delete_order_by_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_order_by_id(p_order_id text) RETURNS TABLE(deleted_orders integer, deleted_labor_facts integer, deleted_leftovers integer, deleted_plank_batches integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_deleted_orders integer := 0;
  v_deleted_labor integer := 0;
  v_deleted_leftovers integer := 0;
  v_deleted_plank integer := 0;
begin
  perform public.web_require_roles(array['manager', 'admin']);

  if v_order_id = '' then
    raise exception 'order_id is required';
  end if;

  delete from public.shipment_plan_cells sp
  where trim(coalesce(sp.source_row_id, '')) in (
    select trim(coalesce(o.source_row_id, ''))
    from public.orders o
    where o.order_id = v_order_id
      and trim(coalesce(o.source_row_id, '')) <> ''
  );

  delete from public.shipment_cells sc
  where trim(coalesce(sc.source_row_id, '')) in (
    select trim(coalesce(o.source_row_id, ''))
    from public.orders o
    where o.order_id = v_order_id
      and trim(coalesce(o.source_row_id, '')) <> ''
  );

  delete from public.labor_facts where order_id = v_order_id;
  get diagnostics v_deleted_labor = row_count;

  delete from public.materials_leftovers where order_id = v_order_id;
  get diagnostics v_deleted_leftovers = row_count;

  delete from public.plank_batches where order_id = v_order_id;
  get diagnostics v_deleted_plank = row_count;

  delete from public.orders where order_id = v_order_id;
  get diagnostics v_deleted_orders = row_count;

  return query select v_deleted_orders, v_deleted_labor, v_deleted_leftovers, v_deleted_plank;
end;
$$;


--
-- Name: web_delete_overview_plan_month(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_overview_plan_month(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.overview_plan_months WHERE id = p_id;
END;
$$;


--
-- Name: web_delete_replacement_order(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_replacement_order(p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.replacement_orders where id = p_id;
end;
$$;


--
-- Name: web_delete_shipment_plan_cell_by_source(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_delete_shipment_plan_cell_by_source(p_row text, p_col text) RETURNS TABLE(deleted_plan integer, deleted_shipment integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_deleted_plan integer := 0;
  v_deleted_shipment integer := 0;
  v_in_work boolean := false;
begin
  if coalesce(trim(p_row), '') = '' or coalesce(trim(p_col), '') = '' then
    raise exception 'Row/col are required';
  end if;

  select coalesce(sc.in_work, false)
    into v_in_work
  from public.shipment_cells sc
  where sc.source_row_id = trim(p_row)
    and sc.source_col_id = trim(p_col)
  limit 1;

  if v_in_work then
    raise exception '╨Э╨╡╨╗╤М╨╖╤П ╤Г╨┤╨░╨╗╨╕╤В╤М: ╨┐╨╛╨╖╨╕╤Ж╨╕╤П ╤Г╨╢╨╡ ╨╛╤В╨┐╤А╨░╨▓╨╗╨╡╨╜╨░ ╨▓ ╤А╨░╨▒╨╛╤В╤Г';
  end if;

  delete from public.shipment_plan_cells sp
  where sp.source_row_id = trim(p_row)
    and sp.source_col_id = trim(p_col);
  get diagnostics v_deleted_plan = row_count;

  delete from public.shipment_cells sc
  where sc.source_row_id = trim(p_row)
    and sc.source_col_id = trim(p_col)
    and coalesce(sc.in_work, false) = false;
  get diagnostics v_deleted_shipment = row_count;

  if v_deleted_plan = 0 and v_deleted_shipment = 0 then
    raise exception 'Shipment cell not found: row %, col %', p_row, p_col;
  end if;

  return query select v_deleted_plan, v_deleted_shipment;
end;
$$;


--
-- Name: web_effective_crm_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_effective_crm_role() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_db_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
  v_claim_role text := lower(trim(coalesce(v_claims -> 'app_metadata' ->> 'crm_role', v_claims ->> 'crm_role', '')));
  v_user_role text := null;
  v_uid uuid := auth.uid();
begin
  if v_db_role = 'service_role' then
    return 'admin';
  end if;

  if v_uid is not null then
    select lower(trim(r.role))
      into v_user_role
    from public.crm_user_roles r
    where r.user_id = v_uid
    limit 1;

    if public.web_is_valid_crm_role(v_user_role) then
      return v_user_role;
    end if;
  end if;

  if public.web_is_valid_crm_role(v_claim_role) then
    return v_claim_role;
  end if;

  if v_uid is null then
    if public.web_is_crm_auth_strict() then
      return 'viewer';
    end if;
    return 'admin';
  end if;

  return 'viewer';
end;
$$;


--
-- Name: web_enqueue_metal_work_order(text, text, text, text, numeric, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_enqueue_metal_work_order(p_source_row text, p_source_col text, p_item text, p_week text, p_qty numeric, p_reason text DEFAULT NULL::text, p_shortage jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_row text := trim(coalesce(p_source_row, ''));
  v_col text := trim(coalesce(p_source_col, ''));
  v_item text := trim(coalesce(p_item, ''));
begin
  perform public.web_require_roles(array['admin', 'manager', 'operator']);
  if v_row = '' or v_col = '' then
    raise exception 'source row/col required';
  end if;
  if v_item = '' then
    raise exception 'item required';
  end if;

  insert into public.metal_work_queue (
    source_row,
    source_col,
    item,
    week,
    qty,
    reason,
    shortage,
    status
  )
  values (
    v_row,
    v_col,
    v_item,
    nullif(trim(coalesce(p_week, '')), ''),
    greatest(coalesce(p_qty, 0), 0),
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_shortage, '[]'::jsonb),
    'queued'
  )
  on conflict (source_row, source_col) where status in ('queued', 'in_progress')
  do update
  set
    item = excluded.item,
    week = excluded.week,
    qty = excluded.qty,
    reason = excluded.reason,
    shortage = excluded.shortage,
    status = 'queued',
    updated_at = now();
end;
$$;


--
-- Name: web_extract_article_from_item(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_extract_article_from_item(p_item text) RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  v text;
begin
  select (regexp_match(coalesce(p_item, ''), '\{\{ART:([A-Za-z0-9._-]+)\}\}'))[1] into v;
  if coalesce(v, '') <> '' then return v; end if;

  select (regexp_match(coalesce(p_item, ''), '^\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\s*::'))[1] into v;
  if coalesce(v, '') <> '' then return v; end if;

  return null;
end;
$$;


--
-- Name: web_finalize_assembly_order(text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_finalize_assembly_order(p_order_id text, p_qty_ready numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order public.orders%rowtype;
  v_total numeric;
  v_ready numeric;
  v_debt numeric;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  select * into v_order
  from public.orders
  where trim(coalesce(order_id, '')) = trim(coalesce(p_order_id, ''))
  for update;

  if v_order.order_id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if coalesce(v_order.shipped, false) = true then
    raise exception 'Order already shipped: %', p_order_id;
  end if;

  v_total := greatest(0, coalesce(v_order.qty, 0));
  v_ready := greatest(0, least(coalesce(p_qty_ready, v_total), v_total));
  v_debt := v_total - v_ready;

  if v_ready <= 0 then
    raise exception 'Qty ready must be > 0';
  end if;

  if v_debt > 0 then
    insert into public.production_plan_debts (
      order_id, item, material, week, qty, product_article, note
    )
    values (
      v_order.order_id,
      coalesce(v_order.item, ''),
      coalesce(v_order.material, ''),
      coalesce(v_order.week, ''),
      v_debt::integer,
      coalesce(v_order.product_article, ''),
      '╨╜╨╡╨┤╨╛╨▓╤Л╨┐╤Г╤Б╨║ ╨┐╤А╨╕ ╤Б╨▒╨╛╤А╨║╨╡'
    );
  end if;

  update public.orders
  set qty = v_ready,
      updated_at = now()
  where order_id = v_order.order_id
  returning * into v_order;

  perform public.web_set_stage_done(v_order.order_id, 'assembly');

  return jsonb_build_object(
    'orderId', v_order.order_id,
    'qtyReady', v_ready,
    'qtyDebt', v_debt,
    'week', coalesce(v_order.week, ''),
    'item', coalesce(v_order.item, '')
  );
end;
$$;


--
-- Name: web_finalize_workshop_order(text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_finalize_workshop_order(p_order_id text, p_qty_ready numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_order public.orders%rowtype;
  v_total numeric;
  v_ready numeric;
  v_debt numeric;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  select * into v_order
  from public.orders
  where trim(coalesce(order_id, '')) = trim(coalesce(p_order_id, ''))
  for update;

  if v_order.order_id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  if coalesce(v_order.shipped, false) = true then
    raise exception 'Order already shipped: %', p_order_id;
  end if;

  v_total := greatest(0, coalesce(v_order.qty, 0));
  v_ready := greatest(0, least(coalesce(p_qty_ready, v_total), v_total));
  v_debt := v_total - v_ready;

  if v_ready <= 0 then
    raise exception 'Qty ready must be > 0';
  end if;

  if v_debt > 0 then
    insert into public.production_plan_debts (
      order_id, item, material, week, qty, product_article, note
    )
    values (
      v_order.order_id,
      coalesce(v_order.item, ''),
      coalesce(v_order.material, ''),
      coalesce(v_order.week, ''),
      v_debt::integer,
      coalesce(v_order.product_article, ''),
      '╨╜╨╡╨┤╨╛╨▓╤Л╨┐╤Г╤Б╨║ ╨┐╤А╨╕ ╤Д╨╕╨╜╨░╨╗╨╡'
    );
  end if;

  update public.orders
  set qty = v_ready,
      updated_at = now()
  where order_id = v_order.order_id
  returning * into v_order;

  perform public.web_set_stage_done(v_order.order_id, 'warehouse_kit');

  return jsonb_build_object(
    'orderId', v_order.order_id,
    'qtyReady', v_ready,
    'qtyDebt', v_debt,
    'week', coalesce(v_order.week, ''),
    'item', coalesce(v_order.item, '')
  );
end;
$$;


--
-- Name: web_get_articles_for_import(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_articles_for_import() RETURNS TABLE(section_name text, article text, item_name text, material text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select distinct on (trim(iam.article))
    trim(iam.section_name)::text as section_name,
    trim(iam.article)::text as article,
    trim(iam.item_name)::text as item_name,
    trim(coalesce(iam.table_color, ''))::text as material
  from public.item_article_map iam
  where trim(coalesce(iam.article, '')) <> ''
    and trim(coalesce(iam.item_name, '')) <> ''
    and trim(coalesce(iam.section_name, '')) <> ''
  order by trim(iam.article), coalesce(iam.sort_order, 999), iam.updated_at desc nulls last;
$$;


--
-- Name: web_get_audit_log(integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_audit_log(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0, p_action text DEFAULT NULL::text, p_entity text DEFAULT NULL::text) RETURNS TABLE(id bigint, created_at timestamp with time zone, actor_user_id uuid, actor_db_role text, actor_crm_role text, action text, entity text, entity_id text, details jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_action text := nullif(lower(trim(coalesce(p_action, ''))), '');
  v_entity text := nullif(lower(trim(coalesce(p_entity, ''))), '');
begin
  perform public.web_require_roles(array['admin', 'manager']);

  return query
  select
    l.id,
    l.created_at,
    l.actor_user_id,
    l.actor_db_role,
    l.actor_crm_role,
    l.action,
    l.entity,
    l.entity_id,
    l.details
  from public.crm_audit_log l
  where (v_action is null or l.action = v_action)
    and (v_entity is null or l.entity = v_entity)
  order by l.created_at desc, l.id desc
  limit v_limit
  offset v_offset;
end;
$$;


--
-- Name: web_get_consume_history(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_consume_history(p_limit integer DEFAULT 300) RETURNS TABLE(move_id uuid, created_at timestamp with time zone, order_id text, material text, qty_sheets numeric, comment text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    mm.id as move_id,
    mm.created_at,
    trim(coalesce(mm.source_ref, '')) as order_id,
    trim(coalesce(mm.material, '')) as material,
    coalesce(mm.qty_sheets, 0) as qty_sheets,
    mm.comment
  from public.materials_moves mm
  where lower(coalesce(mm.move_type, '')) = 'expense'
    and lower(coalesce(mm.source_type, '')) = 'order'
  order by mm.created_at desc, mm.id desc
  limit greatest(1, least(coalesce(p_limit, 300), 2000));
$$;


--
-- Name: web_get_consume_log_sheet_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_consume_log_sheet_name() RETURNS TABLE(sheet_name text, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_default constant text := '╤А╨░╤Б╤Е╨╛╨┤ ╨╝╨░╨╣ 2026';
  v_raw text;
  v_at timestamptz;
begin
  select s.value_text, s.updated_at
  into v_raw, v_at
  from public.crm_runtime_settings s
  where s.key = 'crm_consume_log_sheet_name'
  limit 1;

  sheet_name := coalesce(nullif(btrim(coalesce(v_raw, '')), ''), v_default);
  updated_at := coalesce(v_at, now());
  return next;
end;
$$;


--
-- Name: web_get_consume_options(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_consume_options(p_order_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_order public.orders;
  v_materials text[];
  v_suggested_sheets numeric := 0;
begin
  select * into v_order
  from public.orders
  where order_id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  select coalesce(sc.sheets_needed, 0)
    into v_suggested_sheets
  from public.shipment_cells sc
  where (
      coalesce(trim(v_order.source_row_id), '') <> ''
      and sc.source_row_id = trim(v_order.source_row_id)
    )
    or (
      trim(coalesce(sc.item, '')) = trim(coalesce(v_order.item, ''))
      and trim(coalesce(sc.week, '')) = trim(coalesce(v_order.week, ''))
    )
  order by
    case when coalesce(trim(v_order.source_row_id), '') <> '' and sc.source_row_id = trim(v_order.source_row_id) then 0 else 1 end,
    sc.updated_at desc nulls last
  limit 1;

  select coalesce(array_agg(material order by material), '{}')
    into v_materials
  from (
    select distinct material
    from public.materials_stock
    where coalesce(trim(material), '') <> ''
    union
    select distinct material
    from public.orders
    where coalesce(trim(material), '') <> ''
  ) src;

  return jsonb_build_object(
    'orderId', v_order.order_id,
    'item', v_order.item,
    'week', coalesce(v_order.week, ''),
    'suggestedMaterial', coalesce(v_order.material, ''),
    'suggestedSheets', coalesce(v_suggested_sheets, 0),
    'materials', to_jsonb(v_materials)
  );
end;
$$;


--
-- Name: web_get_crm_executors(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_crm_executors() RETURNS TABLE(kromka_executors text[], pras_executors text[], updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_kromka_raw text := '';
  v_pras_raw text := '';
  v_kromka_json jsonb := '[]'::jsonb;
  v_pras_json jsonb := '[]'::jsonb;
  v_updated_at timestamptz := now();
begin
  select coalesce(s.value_text, ''), coalesce(s.updated_at, now())
  into v_kromka_raw, v_updated_at
  from public.crm_runtime_settings s
  where s.key = 'crm_kromka_executors'
  limit 1;

  select coalesce(s.value_text, '')
  into v_pras_raw
  from public.crm_runtime_settings s
  where s.key = 'crm_pras_executors'
  limit 1;

  begin
    if btrim(v_kromka_raw) <> '' then
      v_kromka_json := v_kromka_raw::jsonb;
    end if;
  exception when others then
    v_kromka_json := '[]'::jsonb;
  end;

  begin
    if btrim(v_pras_raw) <> '' then
      v_pras_json := v_pras_raw::jsonb;
    end if;
  exception when others then
    v_pras_json := '[]'::jsonb;
  end;

  kromka_executors := array(
    select nullif(btrim(value), '')
    from jsonb_array_elements_text(v_kromka_json)
  );
  pras_executors := array(
    select nullif(btrim(value), '')
    from jsonb_array_elements_text(v_pras_json)
  );

  if coalesce(array_length(kromka_executors, 1), 0) = 0 then
    kromka_executors := array['╨б╨╗╨░╨▓╨░', '╨б╨╡╤А╨╡╨╢╨░'];
  end if;
  if coalesce(array_length(pras_executors, 1), 0) = 0 then
    pras_executors := array['╨Ы╨╡╤Е╨░', '╨Т╨╕╤В╨░╨╗╨╕╨║'];
  end if;

  updated_at := v_updated_at;
  return next;
end;
$$;


--
-- Name: web_get_cutting_catalog_kits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_cutting_catalog_kits() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', k.id,
        'name', k.name,
        'items', k.items,
        'sort_order', k.sort_order,
        'created_at', k.created_at,
        'updated_at', k.updated_at
      )
      ORDER BY k.sort_order, k.name
    )
    FROM public.cutting_catalog_kits k
  ), '[]'::jsonb);
END;
$$;


--
-- Name: web_get_cutting_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_cutting_jobs() RETURNS TABLE(id bigint, name text, settings jsonb, items jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT id, name, settings, items, created_at, updated_at
  FROM public.cutting_jobs
  ORDER BY updated_at DESC;
$$;


--
-- Name: web_get_furniture_custom_templates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_furniture_custom_templates() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_name', t.product_name,
      'details', t.details,
      'kits_per_sheet', t.kits_per_sheet,
      'material_yields', coalesce(t.material_yields, '[]'::jsonb),
      'updated_at', t.updated_at
    ) order by t.product_name
  ), '[]'::jsonb)
  from public.furniture_custom_templates t;
$$;


--
-- Name: web_get_furniture_detail_articles(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_furniture_detail_articles(p_product_name text DEFAULT NULL::text) RETURNS TABLE(product_name text, detail_name_pattern text, section_name text, article text, item_name text, table_color text, map_sort integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with active_detail_map as (
    select
      trim(m.product_name) as product_name,
      trim(m.detail_name_pattern) as detail_name_pattern,
      trim(m.item_name_exact) as item_name_exact,
      m.sort_order
    from public.furniture_detail_item_map m
    where m.is_active = true
      and (p_product_name is null or trim(p_product_name) = '' or lower(trim(m.product_name)) = lower(trim(p_product_name)))
  ),
  active_product_sections as (
    select
      trim(pm.product_name) as product_name,
      trim(pm.section_name) as section_name
    from public.furniture_product_map pm
    where pm.is_active = true
      and coalesce(trim(pm.section_name), '') <> ''
  ),
  base_product_articles as (
    select
      ps.product_name,
      ps.section_name,
      iam.article,
      iam.item_name,
      iam.table_color
    from active_product_sections ps
    join public.item_article_map iam
      on iam.section_name = ps.section_name
  )
  select
    dm.product_name,
    dm.detail_name_pattern,
    bpa.section_name,
    bpa.article,
    bpa.item_name,
    bpa.table_color,
    dm.sort_order as map_sort
  from active_detail_map dm
  join base_product_articles bpa
    on lower(bpa.product_name) = lower(dm.product_name)
  order by dm.product_name, dm.sort_order, bpa.section_name, bpa.item_name, bpa.article;
$$;


--
-- Name: web_get_furniture_product_articles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_furniture_product_articles() RETURNS TABLE(product_name text, section_name text, article text, item_name text, table_color text, map_sort integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with active_map as (
    select
      trim(product_name) as product_name,
      nullif(trim(section_name), '') as section_name,
      nullif(trim(item_name_pattern), '') as item_name_pattern,
      sort_order
    from public.furniture_product_map
    where is_active = true
  ),
  by_section as (
    select
      m.product_name,
      m.section_name,
      iam.article,
      iam.item_name,
      iam.table_color,
      m.sort_order
    from active_map m
    join public.item_article_map iam
      on m.section_name is not null
     and iam.section_name = m.section_name
  ),
  by_pattern as (
    select
      m.product_name,
      coalesce(iam.section_name, '') as section_name,
      iam.article,
      iam.item_name,
      iam.table_color,
      m.sort_order
    from active_map m
    join public.item_article_map iam
      on m.item_name_pattern is not null
     and iam.item_name ilike m.item_name_pattern
  )
  select
    src.product_name,
    src.section_name,
    src.article,
    src.item_name,
    src.table_color,
    src.sort_order as map_sort
  from (
    select * from by_section
    union all
    select * from by_pattern
  ) src
  order by src.product_name, src.sort_order, src.item_name;
$$;


--
-- Name: web_get_gx_shelf_catalog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_gx_shelf_catalog() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'name', c.name,
        'color', c.color,
        'pairs', c.pairs,
        'sort_order', c.sort_order,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      )
      ORDER BY c.sort_order, c.code
    )
    FROM public.gx_shelf_catalog c
  ), '[]'::jsonb);
END;
$$;


--
-- Name: web_get_hardware_bom(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_bom() RETURNS TABLE(id bigint, hardware_item_id bigint, name text, size text, bom_product text, qty_per_unit numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT b.id, b.hardware_item_id, i.name, i.size, b.bom_product, b.qty_per_unit
  FROM public.hardware_bom b JOIN public.hardware_items i ON i.id = b.hardware_item_id
  WHERE b.qty_per_unit > 0 ORDER BY b.bom_product, i.sort_order, i.name;
$$;


--
-- Name: web_get_hardware_consume_history(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_consume_history(p_limit integer DEFAULT 300) RETURNS TABLE(move_id bigint, created_at timestamp with time zone, order_id text, name text, size text, qty numeric, move_type text, note text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT
    m.id AS move_id,
    m.created_at,
    trim(coalesce(m.order_id, '')) AS order_id,
    i.name,
    i.size,
    m.qty,
    m.move_type,
    m.note
  FROM public.hardware_moves m
  JOIN public.hardware_items i ON i.id = m.hardware_item_id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 300), 2000));
$$;


--
-- Name: web_get_hardware_consume_options(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_consume_options(p_order_id text) RETURNS TABLE(hardware_item_id bigint, name text, size text, unit text, qty_per_unit numeric, suggested_qty numeric, available numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  WITH ord AS (
    SELECT o.order_id, o.item, o.material, o.week, coalesce(o.qty, 0) AS qty
    FROM public.orders o WHERE trim(o.order_id) = trim(coalesce(p_order_id, '')) LIMIT 1
  ),
  sect AS (
    SELECT c.section_name FROM public.shipment_plan_cells c, ord
    WHERE lower(trim(c.item)) = lower(trim(ord.item)) ORDER BY c.updated_at DESC NULLS LAST LIMIT 1
  ),
  products AS (
    SELECT DISTINCT m.bom_product FROM public.hardware_product_map m, ord
    WHERE m.is_active = TRUE AND (
        (nullif(trim(m.section_name), '') IS NOT NULL AND lower(trim(m.section_name)) = lower(trim((SELECT section_name FROM sect))))
        OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL AND ord.item ILIKE m.item_name_pattern)
    )
  ),
  agg AS (
    SELECT b.hardware_item_id, sum(b.qty_per_unit) AS qty_per_unit
    FROM products p JOIN public.hardware_bom b ON lower(trim(b.bom_product)) = lower(trim(p.bom_product))
    GROUP BY b.hardware_item_id
  )
  SELECT i.id AS hardware_item_id, i.name, i.size, i.unit, a.qty_per_unit,
    a.qty_per_unit * coalesce((SELECT qty FROM ord), 0) AS suggested_qty, coalesce(s.qty, 0) AS available
  FROM agg a JOIN public.hardware_items i ON i.id = a.hardware_item_id
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE a.qty_per_unit > 0 ORDER BY i.sort_order ASC, i.name ASC;
$$;


--
-- Name: web_get_hardware_item_requirement(text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_item_requirement(p_section_name text, p_item text, p_qty numeric DEFAULT 0) RETURNS TABLE(hardware_item_id bigint, name text, size text, unit text, qty_per_unit numeric, required numeric, available numeric, deficit numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  WITH inp AS (
    SELECT
      trim(coalesce(p_section_name, '')) AS section_name,
      trim(coalesce(p_item, '')) AS item,
      GREATEST(0, coalesce(p_qty, 0)) AS qty
  ),
  products AS (
    SELECT DISTINCT m.bom_product
    FROM public.hardware_product_map m, inp
    WHERE m.is_active = TRUE
      AND inp.item <> ''
      AND (
        (nullif(trim(m.section_name), '') IS NOT NULL
          AND lower(trim(m.section_name)) = lower(inp.section_name))
        OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL
          AND inp.item ILIKE m.item_name_pattern)
      )
  ),
  agg AS (
    SELECT b.hardware_item_id, sum(b.qty_per_unit) AS qty_per_unit
    FROM products p
    JOIN public.hardware_bom b
      ON lower(trim(b.bom_product)) = lower(trim(p.bom_product))
    GROUP BY b.hardware_item_id
  )
  SELECT
    i.id AS hardware_item_id,
    i.name,
    i.size,
    i.unit,
    a.qty_per_unit,
    a.qty_per_unit * (SELECT qty FROM inp) AS required,
    coalesce(s.qty, 0) AS available,
    GREATEST(0, a.qty_per_unit * (SELECT qty FROM inp) - coalesce(s.qty, 0)) AS deficit
  FROM agg a
  JOIN public.hardware_items i ON i.id = a.hardware_item_id
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE a.qty_per_unit > 0
  ORDER BY deficit DESC, i.sort_order ASC, i.name ASC;
$$;


--
-- Name: web_get_hardware_plan_board(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_plan_board(p_scope text DEFAULT 'shipment'::text, p_plan_key text DEFAULT ''::text) RETURNS TABLE(section_name text, item text, material text, week text, qty numeric, source_row_id text, source_col_id text, order_id text, hardware_mapped boolean, hardware_ok boolean, hardware_deficit_items integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  WITH weeks AS (
    SELECT CASE
      WHEN lower(coalesce(p_scope, '')) = 'overview' THEN (
        SELECT coalesce(m.weeks, '{}')
        FROM public.overview_plan_months m
        WHERE m.id = nullif(regexp_replace(coalesce(p_plan_key, ''), '\D', '', 'g'), '')::bigint
      )
      ELSE ARRAY[trim(coalesce(p_plan_key, ''))]
    END AS week_arr
  ),
  week_list AS (
    SELECT DISTINCT trim(x) AS week
    FROM weeks w, unnest(w.week_arr) AS x
    WHERE trim(coalesce(x, '')) <> ''
  ),
  cells AS (
    SELECT
      coalesce(nullif(trim(c.section_name), ''), '╨Я╤А╨╛╤З╨╡╨╡') AS section_name,
      trim(coalesce(c.item, '')) AS item,
      coalesce(trim(c.material), '') AS material,
      trim(coalesce(c.week, '')) AS week,
      coalesce(c.qty, 0) AS qty,
      trim(coalesce(c.source_row_id, '')) AS source_row_id,
      trim(coalesce(c.source_col_id, '')) AS source_col_id
    FROM public.shipment_plan_cells c
    WHERE trim(coalesce(c.week, '')) IN (SELECT week FROM week_list)
      AND coalesce(c.qty, 0) > 0
      AND trim(coalesce(c.item, '')) <> ''
  ),
  cell_products AS (
    SELECT DISTINCT
      cl.section_name, cl.item, cl.material, cl.week, cl.qty,
      cl.source_row_id, cl.source_col_id, m.bom_product
    FROM cells cl
    JOIN public.hardware_product_map m
      ON m.is_active = TRUE
     AND (
       (nullif(trim(m.section_name), '') IS NOT NULL
         AND lower(trim(m.section_name)) = lower(cl.section_name))
       OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL
         AND cl.item ILIKE m.item_name_pattern)
     )
  ),
  cell_req AS (
    SELECT
      cp.source_row_id, cp.source_col_id, cp.section_name, cp.item,
      cp.material, cp.week, cp.qty, b.hardware_item_id,
      sum(cp.qty * b.qty_per_unit) AS required
    FROM cell_products cp
    JOIN public.hardware_bom b
      ON lower(trim(b.bom_product)) = lower(trim(cp.bom_product))
    GROUP BY
      cp.source_row_id, cp.source_col_id, cp.section_name, cp.item,
      cp.material, cp.week, cp.qty, b.hardware_item_id
  ),
  cell_status AS (
    SELECT
      cr.source_row_id, cr.source_col_id, cr.section_name, cr.item,
      cr.material, cr.week, cr.qty,
      count(*)::int AS hardware_item_count,
      count(*) FILTER (WHERE cr.required > coalesce(s.qty, 0))::int AS hardware_deficit_items,
      bool_and(cr.required <= coalesce(s.qty, 0)) AS hardware_ok
    FROM cell_req cr
    LEFT JOIN public.hardware_stock s ON s.hardware_item_id = cr.hardware_item_id
    GROUP BY
      cr.source_row_id, cr.source_col_id, cr.section_name, cr.item,
      cr.material, cr.week, cr.qty
  ),
  orders_link AS (
    SELECT DISTINCT ON (trim(o.source_row_id), trim(o.week))
      trim(o.source_row_id) AS source_row_id,
      trim(o.week) AS week,
      trim(o.order_id) AS order_id
    FROM public.orders o
    WHERE trim(coalesce(o.week, '')) IN (SELECT week FROM week_list)
      AND trim(coalesce(o.source_row_id, '')) <> ''
    ORDER BY trim(o.source_row_id), trim(o.week), o.updated_at DESC NULLS LAST
  )
  SELECT
    cl.section_name, cl.item, cl.material, cl.week, cl.qty,
    cl.source_row_id, cl.source_col_id,
    coalesce(ol.order_id, '') AS order_id,
    coalesce(cs.hardware_item_count, 0) > 0 AS hardware_mapped,
    CASE
      WHEN coalesce(cs.hardware_item_count, 0) = 0 THEN NULL
      ELSE coalesce(cs.hardware_ok, TRUE)
    END AS hardware_ok,
    coalesce(cs.hardware_deficit_items, 0) AS hardware_deficit_items
  FROM cells cl
  LEFT JOIN cell_status cs
    ON cs.source_row_id = cl.source_row_id AND cs.source_col_id = cl.source_col_id
  LEFT JOIN orders_link ol
    ON ol.source_row_id = cl.source_row_id AND ol.week = cl.week
  ORDER BY cl.week, cl.section_name, cl.item, cl.source_row_id, cl.source_col_id;
$$;


--
-- Name: web_get_hardware_plan_requirement(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_plan_requirement(p_scope text DEFAULT 'shipment'::text, p_plan_key text DEFAULT ''::text) RETURNS TABLE(hardware_item_id bigint, name text, size text, unit text, required numeric, available numeric, deficit numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  WITH weeks AS (
    SELECT CASE
      WHEN lower(coalesce(p_scope, '')) = 'overview' THEN (
        SELECT coalesce(m.weeks, '{}') FROM public.overview_plan_months m
        WHERE m.id = nullif(regexp_replace(coalesce(p_plan_key, ''), '\D', '', 'g'), '')::bigint
      )
      ELSE ARRAY[trim(coalesce(p_plan_key, ''))]
    END AS week_arr
  ),
  week_list AS (
    SELECT DISTINCT trim(x) AS week FROM weeks w, unnest(w.week_arr) AS x WHERE trim(coalesce(x, '')) <> ''
  ),
  demand AS (
    SELECT c.section_name, c.item, sum(coalesce(c.qty, 0)) AS qty
    FROM public.shipment_plan_cells c
    WHERE trim(coalesce(c.week, '')) IN (SELECT week FROM week_list)
    GROUP BY c.section_name, c.item
  ),
  demand_products AS (
    SELECT DISTINCT d.section_name, d.item, d.qty, m.bom_product
    FROM demand d
    JOIN public.hardware_product_map m ON m.is_active = TRUE AND (
       (nullif(trim(m.section_name), '') IS NOT NULL AND lower(trim(m.section_name)) = lower(trim(d.section_name)))
       OR (nullif(trim(m.item_name_pattern), '') IS NOT NULL AND d.item ILIKE m.item_name_pattern)
    )
  ),
  matched AS (
    SELECT b.hardware_item_id, sum(dp.qty * b.qty_per_unit) AS required
    FROM demand_products dp
    JOIN public.hardware_bom b ON lower(trim(b.bom_product)) = lower(trim(dp.bom_product))
    GROUP BY b.hardware_item_id
  )
  SELECT i.id AS hardware_item_id, i.name, i.size, i.unit,
    coalesce(mt.required, 0) AS required, coalesce(s.qty, 0) AS available,
    GREATEST(0, coalesce(mt.required, 0) - coalesce(s.qty, 0)) AS deficit
  FROM matched mt
  JOIN public.hardware_items i ON i.id = mt.hardware_item_id
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE coalesce(mt.required, 0) > 0
  ORDER BY deficit DESC, i.sort_order ASC, i.name ASC;
$$;


--
-- Name: web_get_hardware_product_map(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_product_map() RETURNS TABLE(id bigint, bom_product text, section_name text, item_name_pattern text, sort_order integer, is_active boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT id, bom_product, section_name, item_name_pattern, sort_order, is_active
  FROM public.hardware_product_map ORDER BY bom_product, sort_order, id;
$$;


--
-- Name: web_get_hardware_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_hardware_stock() RETURNS TABLE(id bigint, name text, size text, unit text, sort_order integer, photo_url text, qty numeric, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT i.id, i.name, i.size, i.unit, i.sort_order, i.photo_url,
    coalesce(s.qty, 0) AS qty, coalesce(s.updated_at, i.updated_at) AS updated_at
  FROM public.hardware_items i
  LEFT JOIN public.hardware_stock s ON s.hardware_item_id = i.id
  WHERE i.is_active = TRUE
  ORDER BY i.sort_order ASC, i.name ASC, i.size ASC;
$$;


--
-- Name: web_get_item_article_map_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_item_article_map_admin() RETURNS TABLE(article text, item_name text, source text, section_name text, table_color text, sort_order integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform public.web_require_roles(array['admin']);
  return query
  select
    trim(iam.article)::text as article,
    trim(coalesce(iam.item_name, ''))::text as item_name,
    trim(coalesce(iam.source, ''))::text as source,
    trim(coalesce(iam.section_name, ''))::text as section_name,
    trim(coalesce(iam.table_color, ''))::text as table_color,
    coalesce(iam.sort_order, 999)::integer as sort_order
  from public.item_article_map iam
  order by
    lower(trim(coalesce(iam.section_name, ''))),
    coalesce(iam.sort_order, 999),
    lower(trim(coalesce(iam.item_name, ''))),
    lower(trim(coalesce(iam.table_color, ''))),
    lower(trim(coalesce(iam.article, '')));
end;
$$;


--
-- Name: web_get_item_article_map_by_article(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_item_article_map_by_article(p_article text) RETURNS TABLE(article text, item_name text, section_name text, material text, source text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    trim(iam.article)::text as article,
    trim(iam.item_name)::text as item_name,
    trim(coalesce(iam.section_name, ''))::text as section_name,
    trim(coalesce(iam.table_color, ''))::text as material,
    coalesce(iam.source, '')::text as source
  from public.item_article_map iam
  where trim(coalesce(iam.article, '')) <> ''
    and upper(trim(iam.article)) = upper(trim(coalesce(p_article, '')))
  limit 10;
$$;


--
-- Name: web_get_labor_kit_plan_qty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_labor_kit_plan_qty() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'kit_id', q.kit_id,
      'planned_qty', q.planned_qty,
      'updated_at', q.updated_at
    ) order by q.kit_id
  ), '[]'::jsonb)
  into v_result
  from public.labor_kit_plan_qty q;

  return v_result;
end;
$$;


--
-- Name: web_get_labor_kits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_labor_kits() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',        lk.id,
      'kit_name',  lk.kit_name,
      'name',      lk.kit_name,
      'items',     lk.items,
      'created_at', lk.created_at,
      'updated_at', lk.updated_at
    ) order by lk.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.labor_kits lk;

  return v_result;
end;
$$;


--
-- Name: web_get_labor_norms(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_labor_norms() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', ln.id,
      'group_name', ln.group_name,
      'groupName', ln.group_name,
      'pilka_min', ln.pilka_min,
      'pilkaMin', ln.pilka_min,
      'kromka_min', ln.kromka_min,
      'kromkaMin', ln.kromka_min,
      'pras_min', ln.pras_min,
      'prasMin', ln.pras_min,
      'assembly_min', ln.assembly_min,
      'assemblyMin', ln.assembly_min,
      'qty_unit', ln.qty_unit,
      'qtyUnit', ln.qty_unit,
      'note', ln.note,
      'created_at', ln.created_at,
      'updated_at', ln.updated_at
    ) order by ln.group_name
  ), '[]'::jsonb)
  into v_result
  from public.labor_norms ln;

  return v_result;
end;
$$;


--
-- Name: web_get_labor_table(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_labor_table() RETURNS TABLE(order_id text, item text, week text, qty numeric, pilka_min numeric, kromka_min numeric, pras_min numeric, assembly_min numeric, total_min numeric, date_finished date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lf.order_id, lf.item, lf.week, lf.qty, lf.pilka_min, lf.kromka_min, lf.pras_min, lf.assembly_min, lf.total_min, lf.date_finished
  from public.labor_facts lf
  order by lf.date_finished desc nulls last, lf.total_min desc nulls last, lf.order_id;
$$;


--
-- Name: web_get_leftovers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_leftovers() RETURNS TABLE(order_id text, item text, material text, sheets_needed numeric, leftover_format text, leftovers_qty numeric, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with agg as (
    select
      lower(trim(regexp_replace(replace(coalesce(ml.material, ''), '╤С', '╨╡'), '\s+', ' ', 'g'))) as material_norm,
      lower(trim(regexp_replace(coalesce(ml.leftover_format, ''), '\s+', ' ', 'g'))) as format_norm,
      max(ml.material) filter (where coalesce(ml.material, '') <> '') as material_any,
      max(ml.leftover_format) filter (where coalesce(ml.leftover_format, '') <> '') as format_any,
      sum(coalesce(ml.leftovers_qty, 0))::numeric as leftovers_qty_sum,
      max(ml.created_at) as last_created_at
    from public.materials_leftovers ml
    where coalesce(ml.order_id, '') not like 'sync-leftovers:%'
    group by 1, 2
  )
  select
    null::text as order_id,
    null::text as item,
    coalesce(agg.material_any, agg.material_norm) as material,
    null::numeric as sheets_needed,
    coalesce(agg.format_any, agg.format_norm) as leftover_format,
    agg.leftovers_qty_sum as leftovers_qty,
    agg.last_created_at as created_at
  from agg
  where coalesce(agg.material_norm, '') <> ''
    and coalesce(agg.format_norm, '') <> ''
    and coalesce(agg.leftovers_qty_sum, 0) <> 0
  order by material, leftover_format;
$$;


--
-- Name: web_get_leftovers_history(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_leftovers_history(p_limit integer DEFAULT 500) RETURNS TABLE(id uuid, created_at timestamp with time zone, order_id text, item text, material text, leftover_format text, leftovers_qty numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    ml.id,
    ml.created_at,
    trim(coalesce(ml.order_id, '')) as order_id,
    trim(coalesce(ml.item, '')) as item,
    trim(coalesce(ml.material, '')) as material,
    trim(coalesce(ml.leftover_format, '')) as leftover_format,
    coalesce(ml.leftovers_qty, 0) as leftovers_qty
  from public.materials_leftovers ml
  where coalesce(ml.leftovers_qty, 0) <> 0
  order by ml.created_at desc, ml.id desc
  limit greatest(1, least(coalesce(p_limit, 500), 5000));
$$;


--
-- Name: web_get_manual_item_article_variants(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_manual_item_article_variants(p_item_name text) RETURNS TABLE(section_name text, item_name text, article text, material text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    trim(iam.section_name)::text as section_name,
    trim(iam.item_name)::text as item_name,
    trim(iam.article)::text as article,
    trim(iam.table_color)::text as material
  from public.item_article_map iam
  where iam.source = 'manual'
    and lower(trim(iam.item_name)) = lower(trim(coalesce(p_item_name, '')))
    and trim(coalesce(iam.section_name, '')) <> ''
    and trim(coalesce(iam.article, '')) <> ''
    and trim(coalesce(iam.table_color, '')) <> ''
  order by trim(iam.section_name), trim(iam.article), trim(iam.table_color);
$$;


--
-- Name: web_get_materials_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_materials_stock() RETURNS TABLE(material text, qty_sheets numeric, size_label text, sheet_width_mm integer, sheet_height_mm integer, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    ms.material,
    coalesce(ms.qty_sheets, 0)::numeric as qty_sheets,
    ms.size_label,
    ms.sheet_width_mm,
    ms.sheet_height_mm,
    ms.updated_at
  from public.materials_stock ms
  order by lower(coalesce(ms.material, ''));
$$;


--
-- Name: web_get_metal_for_furniture(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_metal_for_furniture(p_furniture_article text) RETURNS TABLE(furniture_article text, metal_article text, metal_name text, qty_per_unit integer, qty_available integer, qty_reserved integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    trim(m.furniture_article)::text as furniture_article,
    trim(m.metal_article)::text as metal_article,
    trim(coalesce(m.metal_name, s.metal_name, ''))::text as metal_name,
    m.qty_per_unit,
    coalesce(s.qty_available, 0)::integer as qty_available,
    coalesce(s.qty_reserved, 0)::integer as qty_reserved
  from public.furniture_metal_map m
  left join public.metal_components_stock s
    on s.metal_article = m.metal_article
  where m.is_active = true
    and trim(coalesce(m.furniture_article, '')) = trim(coalesce(p_furniture_article, ''))
  order by m.metal_article;
$$;


--
-- Name: web_get_metal_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_metal_stock() RETURNS TABLE(metal_article text, metal_name text, qty_available integer, qty_reserved integer, used_in_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with usage_counts as (
    select
      m.metal_article,
      count(*)::bigint as used_in_count
    from public.furniture_metal_map m
    where m.is_active = true
    group by m.metal_article
  )
  select
    s.metal_article,
    s.metal_name,
    s.qty_available,
    s.qty_reserved,
    coalesce(u.used_in_count, 0)::bigint as used_in_count
  from public.metal_components_stock s
  left join usage_counts u on u.metal_article = s.metal_article
  order by s.metal_article;
$$;


--
-- Name: web_get_metal_work_queue(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_metal_work_queue(p_status text DEFAULT NULL::text) RETURNS TABLE(id bigint, source_row text, source_col text, item text, week text, qty numeric, reason text, shortage jsonb, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    q.id,
    q.source_row,
    q.source_col,
    q.item,
    q.week,
    q.qty,
    q.reason,
    q.shortage,
    q.status,
    q.created_at,
    q.updated_at
  from public.metal_work_queue q
  where p_status is null or q.status = p_status
  order by
    case q.status when 'queued' then 0 when 'in_progress' then 1 when 'done' then 2 else 3 end,
    q.created_at desc;
$$;


--
-- Name: web_get_order_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_order_stats() RETURNS TABLE(order_id text, item text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    o.order_id,
    o.item,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    o.updated_at
  from public.orders o
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: web_get_orders_all(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_orders_all() RETURNS TABLE(order_id text, source_row_id text, product_article text, item text, material text, week text, qty numeric, pilka_status text, pilka_started_at timestamp with time zone, pilka_done_at timestamp with time zone, pilka_pause_started_at timestamp with time zone, pilka_pause_acc_min integer, kromka_status text, kromka_started_at timestamp with time zone, kromka_done_at timestamp with time zone, kromka_pause_started_at timestamp with time zone, kromka_pause_acc_min integer, pras_status text, pras_started_at timestamp with time zone, pras_done_at timestamp with time zone, pras_pause_started_at timestamp with time zone, pras_pause_acc_min integer, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  with mirror_latest as (
    select distinct on (trim(coalesce(m.order_code, '')))
      trim(coalesce(m.order_code, '')) as order_code,
      nullif(trim(coalesce(m.mapped_article_code, '')), '') as mapped_article_code,
      nullif(trim(coalesce(m.article_code, '')), '') as article_code,
      nullif(trim(coalesce(m.source_order_id_raw, '')), '') as source_order_id_raw,
      m.source_synced_at,
      m.updated_at
    from public.sheet_orders_mirror m
    where trim(coalesce(m.order_code, '')) <> ''
    order by trim(coalesce(m.order_code, '')), m.source_synced_at desc nulls last, m.updated_at desc nulls last, m.id desc
  )
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    coalesce(
      ml.mapped_article_code,
      ml.article_code,
      ml.source_order_id_raw,
      iam_match.article,
      ''
    ) as product_article,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.pilka_started_at,
    o.pilka_done_at,
    o.pilka_pause_started_at,
    o.pilka_pause_acc_min,
    o.kromka_status,
    o.kromka_started_at,
    o.kromka_done_at,
    o.kromka_pause_started_at,
    o.kromka_pause_acc_min,
    o.pras_status,
    o.pras_started_at,
    o.pras_done_at,
    o.pras_pause_started_at,
    o.pras_pause_acc_min,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  left join mirror_latest ml on ml.order_code = trim(coalesce(o.order_id, ''))
  left join lateral (
    select nullif(trim(coalesce(iam.article, '')), '') as article
    from public.item_article_map iam
    where nullif(trim(coalesce(iam.article, '')), '') is not null
      and (
        public.web_norm_item_key(iam.item_name) = public.web_norm_item_key(o.item)
        or public.web_norm_item_key(o.item) like ('%' || public.web_norm_item_key(iam.item_name) || '%')
      )
    order by
      case when public.web_norm_item_key(iam.item_name) = public.web_norm_item_key(o.item) then 0 else 1 end,
      case
        when nullif(trim(coalesce(iam.table_color, '')), '') is null then 1
        when public.web_norm_item_key(iam.table_color) = public.web_norm_item_key(o.material) then 0
        when public.web_norm_item_key(o.item) like ('%' || public.web_norm_item_key(iam.table_color) || '%') then 1
        else 2
      end,
      coalesce(iam.sort_order, 999),
      iam.article
    limit 1
  ) iam_match on true
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id text NOT NULL,
    source text DEFAULT 'gas'::text NOT NULL,
    source_row_id text,
    item text NOT NULL,
    material text,
    week text,
    qty numeric(12,2) DEFAULT 0 NOT NULL,
    pilka_status text DEFAULT 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В'::text NOT NULL,
    kromka_status text DEFAULT 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В'::text NOT NULL,
    pras_status text DEFAULT 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В'::text NOT NULL,
    assembly_status text DEFAULT 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В'::text NOT NULL,
    overall_status text DEFAULT 'ЁЯЯб ╨Э╨╛╨▓╤Л╨╣ ╨╖╨░╨║╨░╨╖'::text NOT NULL,
    consume_sheets boolean DEFAULT false NOT NULL,
    shipped boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pilka_started_at timestamp with time zone,
    pilka_done_at timestamp with time zone,
    pilka_pause_started_at timestamp with time zone,
    pilka_pause_acc_min integer DEFAULT 0 NOT NULL,
    kromka_started_at timestamp with time zone,
    kromka_done_at timestamp with time zone,
    kromka_pause_started_at timestamp with time zone,
    kromka_pause_acc_min integer DEFAULT 0 NOT NULL,
    pras_started_at timestamp with time zone,
    pras_done_at timestamp with time zone,
    pras_pause_started_at timestamp with time zone,
    pras_pause_acc_min integer DEFAULT 0 NOT NULL,
    pipeline_stage text DEFAULT 'pilka'::text NOT NULL,
    admin_comment text DEFAULT ''::text NOT NULL,
    product_article text
);


--
-- Name: COLUMN orders.pipeline_stage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.pipeline_stage IS '╨Ь╨░╤И╨╕╨╜╨╜╤Л╨╣ ╤Н╤В╨░╨┐: pilka|kromka|pras|workshop_complete|assembled|warehouse_kit|ready_to_ship|shipped';


--
-- Name: COLUMN orders.admin_comment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.admin_comment IS '╨Ъ╨╛╨╝╨╝╨╡╨╜╤В╨░╤А╨╕╨╣ ╨░╨┤╨╝╨╕╨╜╨╕╤Б╤В╤А╨░╤В╨╛╤А╨░ CRM; ╤Е╤А╨░╨╜╨╕╤В╤Б╤П ╨╜╨░ ╨╖╨░╨║╨░╨╖╨╡, ╨▓╨╕╨┤╨╡╨╜ ╨┐╤А╨╕ ╤Б╨╝╨╡╨╜╨╡ ╤Н╤В╨░╨┐╨╛╨▓.';


--
-- Name: web_get_orders_by_tab(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_orders_by_tab(tab text) RETURNS SETOF public.orders
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with src as (
    select *
    from public.orders o
    where coalesce(o.shipped, false) = false
  )
  select *
  from src o
  where
    case
      when tab = 'pilka' then coalesce(lower(o.pilka_status), '') not like '%╨│╨╛╤В╨╛╨▓%'
      when tab = 'kromka' then coalesce(lower(o.pilka_status), '') like '%╨│╨╛╤В╨╛╨▓%'
                         and coalesce(lower(o.kromka_status), '') not like '%╨│╨╛╤В╨╛╨▓%'
      when tab = 'pras' then coalesce(lower(o.pilka_status), '') like '%╨│╨╛╤В╨╛╨▓%'
                       and coalesce(lower(o.kromka_status), '') like '%╨│╨╛╤В╨╛╨▓%'
                       and coalesce(lower(o.pras_status), '') not like '%╨│╨╛╤В╨╛╨▓%'
      else true
    end
  order by o.updated_at desc, o.created_at desc;
$$;


--
-- Name: web_get_orders_kromka(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_orders_kromka() RETURNS TABLE(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'kromka'
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: web_get_orders_pilka(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_orders_pilka() RETURNS TABLE(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'pilka'
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: web_get_orders_post_workshop(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_orders_post_workshop() RETURNS TABLE(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage in ('workshop_complete', 'assembled', 'ready_to_ship')
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: web_get_orders_pras(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_orders_pras() RETURNS TABLE(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'pras'
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: web_get_orders_shipped(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_orders_shipped() RETURNS TABLE(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'shipped'
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: web_get_overview_plan_months(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_overview_plan_months() RETURNS TABLE(id bigint, name text, weeks text[], sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id, name, weeks, sort_order, created_at, updated_at
  FROM public.overview_plan_months
  ORDER BY sort_order ASC, id ASC;
$$;


--
-- Name: web_get_plan_catalog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_plan_catalog() RETURNS TABLE(section_name text, item_name text, material text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
with src as (
  select distinct
    iam.item_name,
    coalesce(
      nullif(trim(iam.table_color), ''),
      nullif(trim(icm.color_name), ''),
      nullif(trim(split_part(iam.item_name, '.', 2)), '')
    ) as material
  from public.item_article_map iam
  left join public.item_color_map icm on icm.item_name = iam.item_name
  where nullif(trim(iam.item_name), '') is not null
  union
  select distinct
    icm.item_name,
    nullif(trim(icm.color_name), '') as material
  from public.item_color_map icm
  where nullif(trim(icm.item_name), '') is not null
)
select
  case
    when lower(item_name) like '%avella lite%' then 'Avella lite'
    when lower(item_name) like '%avella%' then 'Avella'
    when lower(item_name) like '%donini r 750%' then 'Donini R 750'
    when lower(item_name) like '%donini r 806%' then 'Donini R 806'
    when lower(item_name) like '%donini 750%' then 'Donini 750'
    when lower(item_name) like '%donini 806%' then 'Donini 806'
    when lower(item_name) like '%╨║╨╗╨░╤Б╤Б╨╕╨║╨╛%' then '╨Ъ╨╗╨░╤Б╤Б╨╕╨║╨╛'
    when lower(item_name) like '%╨┐╤А╨╡╨╝╤М╨╡╤А%' then '╨Я╤А╨╡╨╝╤М╨╡╤А'
    when lower(item_name) like '%╤В╨▓ ╨╗╨╛╤Д╤В 1500%' then '╨в╨Т ╨Ы╨╛╤Д╤В 1500'
    else '╨Я╤А╨╛╤З╨╡╨╡'
  end as section_name,
  trim(item_name) as item_name,
  coalesce(nullif(trim(material), ''), nullif(trim(split_part(item_name, '.', 2)), ''), '╨Ь╨░╤В╨╡╤А╨╕╨░╨╗ ╨╜╨╡ ╤Г╨║╨░╨╖╨░╨╜') as material
from src
where nullif(trim(item_name), '') is not null
  and lower(coalesce(item_name, '')) not like '%╤Б╨╗╤Н╨╣╤В%';
$$;


--
-- Name: web_get_product_color_map(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_product_color_map() RETURNS TABLE(product_name text, color_name text, source text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    pcm.product_name,
    pcm.color_name,
    pcm.source
  from public.product_color_map pcm
  order by pcm.product_name, pcm.color_name;
$$;


--
-- Name: web_get_production_plan_debts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_production_plan_debts() RETURNS TABLE(id uuid, order_id text, item text, material text, week text, qty integer, product_article text, note text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id, order_id, item, material, week, qty, product_article, note, created_at
  from public.production_plan_debts
  order by week desc nulls last, item asc, created_at desc;
$$;


--
-- Name: web_get_replacement_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_replacement_orders() RETURNS TABLE(id text, product text, part text, qty integer, color text, note text, status text, sent_to_work boolean, packaging_accepted boolean, accepted_at timestamp with time zone, workshop_order_id text, completed_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id, product, part, qty, color, note, status, sent_to_work, packaging_accepted, accepted_at,
    workshop_order_id, completed_at, created_at
  from public.replacement_orders order by created_at desc;
$$;


--
-- Name: web_get_section_articles(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_section_articles(p_section_name text DEFAULT NULL::text) RETURNS TABLE(section_name text, article text, item_name text, material text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
  with params as (
    select
      trim(coalesce(p_section_name, ''))::text as req_section,
      regexp_replace(trim(coalesce(p_section_name, '')), '\s+╨▒╨╡╨╗╤Л╨╣\s*$', '', 'i')::text as base_section,
      (trim(coalesce(p_section_name, '')) ~* '\s+╨▒╨╡╨╗╤Л╨╣\s*$') as is_white_alias
  ),
  catalog as (
    select
      trim(iam.section_name)::text as section_name,
      trim(iam.article)::text as article,
      regexp_replace(trim(iam.item_name), '\.+\s*$', '')::text as item_name,
      trim(iam.table_color)::text as material,
      lower(regexp_replace(trim(iam.item_name), '\.+\s*$', ''))::text as norm_item_name,
      coalesce(iam.sort_order, 999)::integer as sort_order
    from public.item_article_map iam
    where trim(coalesce(iam.section_name, '')) <> ''
      and trim(coalesce(iam.table_color, '')) <> ''
      and trim(coalesce(iam.item_name, '')) <> ''
  ),
  src as (
    select distinct
      trim(pc.section_name)::text as section_name,
      regexp_replace(trim(pc.item_name), '\.+\s*$', '')::text as item_name,
      trim(pc.material)::text as material,
      lower(regexp_replace(trim(pc.item_name), '\.+\s*$', ''))::text as norm_item_name
    from public.web_get_plan_catalog() pc
    where trim(coalesce(pc.section_name, '')) <> ''
      and trim(coalesce(pc.item_name, '')) <> ''
      and trim(coalesce(pc.material, '')) <> ''
  ),
  common_src as (
    select
      s.section_name,
      coalesce(iam.article, 'ITEM-' || substr(md5(s.item_name || '|' || s.material), 1, 10))::text as article,
      s.item_name,
      s.material,
      s.norm_item_name,
      999::integer as sort_order
    from src s
    left join public.item_article_map iam
      on lower(regexp_replace(trim(coalesce(iam.item_name, '')), '\.+\s*$', '')) = s.norm_item_name
  ),
  merged as (
    select c.section_name, c.article, c.item_name, c.material, c.norm_item_name, c.sort_order
    from catalog c
    union all
    select x.section_name, x.article, x.item_name, x.material, x.norm_item_name, x.sort_order
    from common_src x
    where not exists (
      select 1
      from catalog c2
      where c2.norm_item_name = x.norm_item_name
    )
  ),
  result_regular as (
    select m.section_name, m.article, m.item_name, m.material, m.sort_order
    from merged m
    cross join params p
    where p.req_section = '' or m.section_name = p.req_section
  ),
  white_alias_sections as (
    select
      trim(sc.section_name)::text as alias_section,
      regexp_replace(trim(sc.section_name), '\s+╨▒╨╡╨╗╤Л╨╣\s*$', '', 'i')::text as base_section
    from public.section_catalog sc
    where coalesce(sc.is_active, true)
      and trim(coalesce(sc.section_name, '')) ~* '\s+╨▒╨╡╨╗╤Л╨╣\s*$'
  ),
  result_white_alias_full as (
    select
      was.alias_section as section_name,
      c.article,
      c.item_name,
      c.material,
      c.sort_order
    from white_alias_sections was
    join catalog c
      on c.section_name = was.base_section
    where lower(c.item_name) like ('%' || lower('╨▒╨╡╨╗╤Л╨╡ ╨╜╨╛╨│╨╕') || '%')
  ),
  result_white_alias_single as (
    select
      p.req_section as section_name,
      c.article,
      c.item_name,
      c.material,
      c.sort_order
    from params p
    join catalog c
      on c.section_name = p.base_section
    where p.is_white_alias
      and lower(c.item_name) like ('%' || lower('╨▒╨╡╨╗╤Л╨╡ ╨╜╨╛╨│╨╕') || '%')
  ),
  final_rows as (
    select section_name, article, item_name, material, sort_order from result_white_alias_single
    union all
    select rwf.section_name, rwf.article, rwf.item_name, rwf.material, rwf.sort_order
    from result_white_alias_full rwf
    cross join params p
    where p.req_section = ''
    union all
    select r.section_name, r.article, r.item_name, r.material, r.sort_order
    from result_regular r
    cross join params p
    where not p.is_white_alias
  )
  select distinct
    f.section_name,
    f.article,
    f.item_name,
    f.material
  from final_rows f
  order by f.section_name, f.item_name, f.material;
$_$;


--
-- Name: web_get_section_catalog(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_section_catalog() RETURNS TABLE(section_name text, sort_order integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    sc.section_name,
    sc.sort_order
  from public.section_catalog sc
  where sc.is_active = true
  order by sc.sort_order, sc.section_name;
$$;


--
-- Name: web_get_sheet_orders_mirror(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_sheet_orders_mirror(p_sheet_gid text DEFAULT NULL::text) RETURNS TABLE(sheet_row integer, source_created_at_raw text, material_raw text, article_code text, mapped_article_code text, order_code text, source_order_id_raw text, item_label text, plan_value integer, qty_value numeric, pilka_status text, kromka_status text, prisadka_status text, assembly_status text, overall_status text, shipped_raw text, source_synced_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    v.sheet_row,
    v.source_created_at_raw,
    v.material_raw,
    v.article_code,
    v.mapped_article_code,
    v.order_code,
    v.source_order_id_raw,
    v.item_label,
    v.plan_value,
    v.qty_value,
    v.pilka_status,
    v.kromka_status,
    v.prisadka_status,
    v.assembly_status,
    v.overall_status,
    v.shipped_raw,
    v.source_synced_at
  from public.v_sheet_orders_mirror v
  where p_sheet_gid is null or trim(p_sheet_gid) = '' or v.sheet_gid = trim(p_sheet_gid)
  order by v.sheet_row;
$$;


--
-- Name: web_get_shipment_board(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_shipment_board() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with cells as (
    select
      coalesce(nullif(section_name, ''), '╨Я╤А╨╛╤З╨╡╨╡') as section_name,
      coalesce(nullif(item, ''), '╨С╨╡╨╖ ╨╜╨░╨╖╨▓╨░╨╜╨╕╤П') as item,
      coalesce(nullif(material, ''), '') as material,
      coalesce(source_row_id, '0') as source_row_id,
      coalesce(source_col_id, '0') as source_col_id,
      public.web_shipment_col_num(source_col_id) as source_col_num,
      (mod(abs(hashtextextended(coalesce(source_row_id, '0'), 0)), 1000000000))::int as source_row_num,
      coalesce(week, '') as week,
      coalesce(qty, 0) as qty,
      public.web_resolve_output_per_sheet(section_name, item, material, coalesce(output_per_sheet, 0)) as output_per_sheet,
      case
        when coalesce(sheets_needed, 0) > 0 then coalesce(sheets_needed, 0)
        when public.web_resolve_output_per_sheet(section_name, item, material, coalesce(output_per_sheet, 0)) > 0
          and coalesce(qty, 0) > 0
          then ceil(coalesce(qty, 0) / public.web_resolve_output_per_sheet(section_name, item, material, coalesce(output_per_sheet, 0)))
        else 0
      end as sheets_needed,
      coalesce(available_sheets, 0) as available_sheets,
      (coalesce(sheets_needed, 0) <= coalesce(available_sheets, 0)) as material_enough_for_order,
      coalesce(bg, '#ffffff') as bg,
      coalesce(note, '') as note,
      coalesce(in_work, false) as in_work,
      coalesce(can_send_to_work, false) as can_send_to_work
    from public.shipment_plan_cells
    where coalesce(qty, 0) > 0
  ),
  grouped_items as (
    select
      section_name,
      item,
      material,
      source_row_id,
      coalesce(source_row_num, 0) as source_row_num,
      jsonb_agg(
        jsonb_build_object(
          'col', coalesce(source_col_num, 0),
          'sourceColId', source_col_id,
          'week', week,
          'qty', qty,
          'outputPerSheet', output_per_sheet,
          'sheetsNeeded', sheets_needed,
          'availableSheets', available_sheets,
          'materialEnoughForOrder', material_enough_for_order,
          'bg', bg,
          'note', note,
          'inWork', in_work,
          'canSendToWork', can_send_to_work
        )
        order by coalesce(source_col_num, 0), week
      ) as cells
    from cells
    group by section_name, item, material, source_row_id, source_row_num
  ),
  grouped_sections as (
    select
      section_name as name,
      jsonb_agg(
        jsonb_build_object(
          'row', coalesce(source_row_num, 0),
          'sourceRowId', source_row_id,
          'item', item,
          'material', material,
          'cells', cells
        )
        order by item, coalesce(source_row_num, 0)
      ) as items
    from grouped_items
    group by section_name
  )
  select jsonb_build_object(
    'weeks', (
      select coalesce(
        jsonb_agg(jsonb_build_object('col', w.col, 'week', w.week) order by w.col, w.week),
        '[]'::jsonb
      )
      from (
        select distinct coalesce(source_col_num, 0) as col, week
        from cells
      ) w
    ),
    'sections',
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('name', name, 'items', items) order by name)
        from grouped_sections
      ),
      '[]'::jsonb
    )
  );
$$;


--
-- Name: FUNCTION web_get_shipment_board(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.web_get_shipment_board() IS 'Shipment board JSON: built from shipment_plan_cells.';


--
-- Name: web_get_shipment_table(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_shipment_table() RETURNS TABLE(section_name text, row_ref text, item text, material text, week text, qty numeric, bg text, can_send_to_work boolean, in_work boolean, sheets_needed numeric, available_sheets numeric, material_enough_for_order boolean, source_row_id text, source_col_id text, note text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with src as (
    select
      coalesce(spc.section_name, '╨Я╤А╨╛╤З╨╡╨╡') as section_name,
      coalesce(spc.row_ref, spc.id::text) as row_ref,
      spc.item,
      coalesce(nullif(spc.material, ''), icm.color_name, '') as material,
      spc.week,
      spc.qty,
      coalesce(spc.bg, '#ffffff') as bg,
      spc.can_send_to_work,
      spc.in_work,
      coalesce(spc.sheets_needed, 0) as sheets_needed_raw,
      coalesce(spc.available_sheets, 0) as available_sheets_raw,
      spc.source_row_id,
      spc.source_col_id,
      spc.note,
      ms.qty_sheets as stock_qty,
      fsc.output_per_sheet as capacity_output_per_sheet,
      spc.updated_at,
      spc.id as plan_id
    from public.shipment_plan_cells spc
    left join public.item_color_map icm
      on lower(trim(icm.item_name)) = lower(trim(spc.item))
    left join lateral (
      select ms1.qty_sheets, ms1.size_label
      from public.materials_stock ms1
      where public.web_normalize_material_name(ms1.material)
        = public.web_normalize_material_name(coalesce(nullif(spc.material, ''), icm.color_name, ''))
      order by
        case
          when lower(trim(coalesce(ms1.material, ''))) = lower(trim(coalesce(nullif(spc.material, ''), icm.color_name, ''))) then 0
          else 1
        end,
        coalesce(ms1.qty_sheets, 0) desc,
        ms1.updated_at desc nulls last
      limit 1
    ) ms on true
    left join public.furniture_sheet_capacity fsc
      on lower(trim(fsc.furniture_model)) = lower(trim(public.web_normalize_furniture_model(spc.section_name)))
     and fsc.sheet_size = ms.size_label
    where coalesce(spc.qty, 0) > 0
  ),
  ranked as (
    select
      src.*,
      row_number() over (
        partition by
          public.web_norm_week_key(src.week),
          public.web_norm_item_key(src.section_name),
          public.web_norm_item_key(src.item),
          public.web_norm_item_key(src.material)
        order by src.updated_at desc nulls last, src.plan_id desc
      ) as rn
    from src
  )
  select
    section_name,
    row_ref,
    item,
    material,
    week,
    qty,
    bg,
    can_send_to_work,
    in_work,
    case
      when sheets_needed_raw > 0 then sheets_needed_raw
      when qty > 0 and coalesce(capacity_output_per_sheet, 0) > 0 then ceil(qty / capacity_output_per_sheet)
      else 0
    end as sheets_needed,
    coalesce(nullif(available_sheets_raw, 0), stock_qty, 0) as available_sheets,
    (
      case
        when sheets_needed_raw > 0 then sheets_needed_raw
        when qty > 0 and coalesce(capacity_output_per_sheet, 0) > 0 then ceil(qty / capacity_output_per_sheet)
        else 0
      end
      <=
      coalesce(nullif(available_sheets_raw, 0), stock_qty, 0)
    ) as material_enough_for_order,
    source_row_id,
    source_col_id,
    note
  from ranked
  where rn = 1
  order by section_name, item, week;
$$;


--
-- Name: web_get_strap_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_strap_stock() RETURNS TABLE(strap_type text, color text, qty integer, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT strap_type, color, qty, updated_at
  FROM public.strap_stock
  ORDER BY strap_type, color;
$$;


--
-- Name: web_get_warehouse_kit_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_warehouse_kit_orders() RETURNS TABLE(order_id text, source_row_id text, item text, material text, week text, qty numeric, pilka_status text, kromka_status text, pras_status text, assembly_status text, overall_status text, pipeline_stage text, color_name text, sheets_needed numeric, admin_comment text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    o.order_id,
    trim(coalesce(o.source_row_id, '')) as source_row_id,
    o.item,
    o.material,
    o.week,
    o.qty,
    o.pilka_status,
    o.kromka_status,
    o.pras_status,
    o.assembly_status,
    o.overall_status,
    o.pipeline_stage,
    public.resolve_color_name(o.item) as color_name,
    0::numeric(12, 2) as sheets_needed,
    trim(coalesce(o.admin_comment, '')) as admin_comment,
    o.created_at,
    o.updated_at
  from public.orders o
  where o.pipeline_stage = 'warehouse_kit'
  order by o.updated_at desc nulls last, o.order_id;
$$;


--
-- Name: web_get_work_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_get_work_schedule() RETURNS TABLE(hours_per_day numeric, working_days text[], weekend_days text[], work_start text, work_end text, lunch_start text, lunch_end text, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_hours_raw text := '8';
  v_days_raw text := '["mon","tue","wed","thu","fri"]';
  v_days_json jsonb := '["mon","tue","wed","thu","fri"]'::jsonb;
  v_work_start text := '08:00';
  v_work_end text := '18:00';
  v_lunch_start text := '12:00';
  v_lunch_end text := '13:00';
  v_updated_at timestamptz := now();
begin
  select coalesce(s.value_text, '8'), coalesce(s.updated_at, now())
    into v_hours_raw, v_updated_at
  from public.crm_runtime_settings s
  where s.key = 'crm_work_hours_per_day'
  limit 1;

  select coalesce(value_text, '["mon","tue","wed","thu","fri"]')
    into v_days_raw
  from public.crm_runtime_settings
  where key = 'crm_working_days'
  limit 1;

  select coalesce(value_text, '08:00') into v_work_start
  from public.crm_runtime_settings where key = 'crm_work_start' limit 1;

  select coalesce(value_text, '18:00') into v_work_end
  from public.crm_runtime_settings where key = 'crm_work_end' limit 1;

  select coalesce(value_text, '12:00') into v_lunch_start
  from public.crm_runtime_settings where key = 'crm_lunch_start' limit 1;

  select coalesce(value_text, '13:00') into v_lunch_end
  from public.crm_runtime_settings where key = 'crm_lunch_end' limit 1;

  begin
    if btrim(v_days_raw) <> '' then
      v_days_json := v_days_raw::jsonb;
    end if;
  exception when others then
    v_days_json := '["mon","tue","wed","thu","fri"]'::jsonb;
  end;

  hours_per_day := least(greatest(coalesce(nullif(btrim(v_hours_raw), '')::numeric, 8), 1), 24);
  working_days := array(
    select d
    from (
      select distinct lower(nullif(btrim(value), '')) as d
      from jsonb_array_elements_text(v_days_json)
    ) x
    where d in ('mon','tue','wed','thu','fri','sat','sun')
    order by array_position(array['mon','tue','wed','thu','fri','sat','sun']::text[], d)
  );

  if coalesce(array_length(working_days, 1), 0) = 0 then
    working_days := array['mon','tue','wed','thu','fri'];
  end if;

  weekend_days := array(
    select d
    from unnest(array['mon','tue','wed','thu','fri','sat','sun']::text[]) d
    where d <> all(working_days)
  );

  work_start := coalesce(nullif(btrim(v_work_start), ''), '08:00');
  work_end := coalesce(nullif(btrim(v_work_end), ''), '18:00');
  lunch_start := coalesce(nullif(btrim(v_lunch_start), ''), '12:00');
  lunch_end := coalesce(nullif(btrim(v_lunch_end), ''), '13:00');
  updated_at := coalesce(v_updated_at, now());

  return next;
end;
$$;


--
-- Name: web_import_metal_catalog(jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_import_metal_catalog(p_items jsonb, p_replace_missing boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_item jsonb;
  v_row record;
  v_article text;
  v_name text;
  v_category text;
  v_seen text[] := array[]::text[];
  v_cat text;
  v_stage_route text[];
  v_process_graph jsonb;
  v_default_route jsonb := public.metal_linear_route_to_graph(array['laser', 'bending', 'welding', 'painting']);
  v_count integer := 0;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    perform public.web_require_roles(array['manager', 'admin']);
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a json array';
  end if;

  for v_row in
    select value, ordinality::integer as ord
    from jsonb_array_elements(p_items) with ordinality
  loop
    v_category := trim(coalesce(v_row.value ->> 'category', ''));
    if v_category = '' then
      continue;
    end if;
    insert into public.metal_catalog_categories(name, sort_order, process_graph)
    values (v_category, v_row.ord, v_default_route)
    on conflict (name) do update
      set sort_order = least(public.metal_catalog_categories.sort_order, excluded.sort_order);
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_article := upper(trim(coalesce(v_item ->> 'article', '')));
    v_name := trim(coalesce(v_item ->> 'name', ''));
    v_category := trim(coalesce(v_item ->> 'category', ''));
    if v_article = '' or v_name = '' then
      continue;
    end if;

    v_stage_route := array['laser', 'bending', 'welding', 'painting'];
    v_process_graph := v_default_route;
    if v_category <> '' then
      select cat.stage_route, cat.process_graph
      into v_stage_route, v_process_graph
      from public.metal_catalog_categories cat
      where cat.name = v_category;
    end if;

    insert into public.metal_product_catalog as c (article, name, category, is_active, stage_route, process_graph)
    values (v_article, v_name, v_category, true, v_stage_route, v_process_graph)
    on conflict on constraint metal_product_catalog_pkey do update
      set name = excluded.name,
          category = excluded.category,
          is_active = true,
          stage_route = excluded.stage_route,
          process_graph = excluded.process_graph,
          updated_at = now();

    v_seen := array_append(v_seen, v_article);
    v_count := v_count + 1;
  end loop;

  if coalesce(p_replace_missing, true) then
    update public.metal_product_catalog c
    set is_active = false,
        updated_at = now()
    where c.is_active = true
      and not (c.article = any (v_seen));
  end if;

  return jsonb_build_object('imported', v_count, 'active_articles', cardinality(v_seen));
end;
$$;


--
-- Name: web_is_crm_auth_strict(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_is_crm_auth_strict() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select coalesce(
    (
      select lower(trim(coalesce(s.value_text, ''))) in ('1', 'true', 'yes', 'on')
      from public.crm_runtime_settings s
      where s.key = 'crm_auth_strict'
      limit 1
    ),
    false
  );
$$;


--
-- Name: web_is_valid_crm_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_is_valid_crm_role(p_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(coalesce(trim(p_role), '')) in (
    'admin',
    'manager',
    'operator',
    'operator_pilka',
    'operator_kromka',
    'operator_pras',
    'planner',
    'viewer',
    'warehouse'
  )
$$;


--
-- Name: web_list_crm_user_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_list_crm_user_roles() RETURNS TABLE(user_id uuid, email text, role text, assigned_by uuid, note text, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
begin
  perform public.web_require_roles(array['admin']);

  return query
  select
    r.user_id,
    coalesce(u.email::text, ''::text) as email,
    r.role,
    r.assigned_by,
    r.note,
    r.updated_at
  from public.crm_user_roles r
  left join auth.users u on u.id = r.user_id
  order by lower(coalesce(u.email::text, ''::text)), r.user_id;
end;
$$;


--
-- Name: web_list_metal_catalog(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_list_metal_catalog(p_active_only boolean DEFAULT true) RETURNS TABLE(article text, name text, category text, is_active boolean, stage_route text[], process_graph jsonb, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    c.article,
    c.name,
    coalesce(nullif(trim(c.category), ''), '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕') as category,
    c.is_active,
    c.stage_route,
    c.process_graph,
    c.updated_at
  from public.metal_product_catalog c
  where not coalesce(p_active_only, true) or c.is_active = true
  order by coalesce(nullif(trim(c.category), ''), '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕'), c.article;
$$;


--
-- Name: web_list_metal_catalog_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_list_metal_catalog_categories() RETURNS TABLE(name text, is_hidden boolean, sort_order integer, stage_route text[], process_graph jsonb, item_count bigint, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select
    cat.name,
    cat.is_hidden,
    cat.sort_order,
    cat.stage_route,
    cat.process_graph,
    coalesce(cnt.item_count, 0) as item_count,
    cat.updated_at
  from public.metal_catalog_categories cat
  left join lateral (
    select count(*)::bigint as item_count
    from public.metal_product_catalog c
    where c.is_active = true
      and coalesce(nullif(trim(c.category), ''), '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕') = cat.name
  ) cnt on true
  order by cat.sort_order, cat.name;
$$;


--
-- Name: web_list_metal_stage_events(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_list_metal_stage_events(p_item_id bigint) RETURNS TABLE(id bigint, work_item_id bigint, fork_role text, stage text, action text, note text, done_qty numeric, qty_before numeric, qty_after numeric, shortfall_added numeric, event_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with seed as (
    select mwi.id, mwi.fork_group_id
    from public.metal_work_items mwi
    where mwi.id = p_item_id
  ),
  targets as (
    select mwi.id, mwi.fork_role
    from public.metal_work_items mwi
    cross join seed s
    where mwi.id = s.id
       or (s.fork_group_id is not null and mwi.fork_group_id = s.fork_group_id)
  )
  select
    e.id,
    e.work_item_id,
    t.fork_role,
    e.stage,
    e.action,
    e.note,
    e.done_qty,
    e.qty_before,
    e.qty_after,
    e.shortfall_added,
    e.event_at
  from public.metal_stage_events e
  join targets t on t.id = e.work_item_id
  order by e.event_at asc;
$$;


--
-- Name: web_list_metal_work_items(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_list_metal_work_items(p_status text DEFAULT NULL::text) RETURNS TABLE(id bigint, article text, name text, week text, qty numeric, current_stage text, stage_status text, status text, operator_comment text, created_at timestamp with time zone, updated_at timestamp with time zone, stage_route text[], route_idx integer, stage_done_qty numeric, shortfall_qty numeric, process_graph jsonb, fork_group_id uuid, fork_role text, parent_id bigint, fork_meta jsonb, laser_seconds bigint, saw_seconds bigint, bending_seconds bigint, welding_seconds bigint, painting_seconds bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  with ev as (
    select
      e.work_item_id,
      e.stage,
      e.action,
      e.event_at,
      lead(e.event_at) over (partition by e.work_item_id order by e.event_at) as next_event_at
    from public.metal_stage_events e
  ),
  agg as (
    select
      e.work_item_id,
      sum(case when e.stage = 'laser' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as laser_seconds,
      sum(case when e.stage = 'saw' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as saw_seconds,
      sum(case when e.stage = 'bending' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as bending_seconds,
      sum(case when e.stage = 'welding' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as welding_seconds,
      sum(case when e.stage = 'painting' and e.action in ('start', 'resume') then public.web_calc_working_seconds_between(e.event_at, coalesce(e.next_event_at, now())) else 0 end) as painting_seconds
    from ev e
    group by e.work_item_id
  )
  select
    i.id, i.article, i.name, i.week, i.qty,
    i.current_stage, i.stage_status, i.status,
    coalesce(i.operator_comment, '') as operator_comment,
    i.created_at, i.updated_at,
    i.stage_route, i.route_idx, i.stage_done_qty,
    coalesce(i.shortfall_qty, 0) as shortfall_qty,
    i.process_graph, i.fork_group_id, i.fork_role, i.parent_id, i.fork_meta,
    coalesce(a.laser_seconds, 0), coalesce(a.saw_seconds, 0), coalesce(a.bending_seconds, 0),
    coalesce(a.welding_seconds, 0), coalesce(a.painting_seconds, 0)
  from public.metal_work_items i
  left join agg a on a.work_item_id = i.id
  where p_status is null or i.status = p_status
  order by case i.status when 'planned' then 0 when 'active' then 1 when 'split' then 2 when 'done' then 3 else 4 end,
           i.created_at desc;
$$;


--
-- Name: web_norm_item_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_norm_item_key(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select trim(regexp_replace(replace(lower(coalesce(p_text, '')), '╤Е', 'x'), '\s+', ' ', 'g'))
$$;


--
-- Name: web_norm_sheet_stage_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_norm_sheet_stage_status(p_raw text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select case
    when lower(coalesce(p_raw, '')) like '%╨│╨╛╤В╨╛╨▓%' then 'done'
    when lower(coalesce(p_raw, '')) like '%╨▓ ╤А╨░╨▒╨╛╤В╨╡%' then 'in_progress'
    when lower(coalesce(p_raw, '')) like '%╨┐╨░╤Г╨╖%' then 'paused'
    when lower(coalesce(p_raw, '')) like '%╨╜╨╛╨▓╤Л╨╣ ╨╖╨░╨║╨░╨╖%' then 'new'
    when lower(coalesce(p_raw, '')) like '%╨╛╨╢╨╕╨┤╨░╨╡╤В%' then 'waiting'
    else 'unknown'
  end
$$;


--
-- Name: web_norm_week_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_norm_week_key(p_week text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    case
      when nullif(regexp_replace(coalesce(p_week, ''), '\D', '', 'g'), '') is not null
        then (nullif(regexp_replace(coalesce(p_week, ''), '\D', '', 'g'), ''))::int::text
      else nullif(trim(coalesce(p_week, '')), '')
    end,
    '0'
  )
$$;


--
-- Name: web_normalize_furniture_model(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_normalize_furniture_model(p_section_name text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select case
    when p_section_name is null then ''
    when lower(trim(p_section_name)) in ('avella lite', '╨░╨▓╨╡╨╗╨╗╨░ ╨╗╨░╨╣╤В') then '╨Р╨▓╨╡╨╗╨╗╨░ ╨╗╨░╨╣╤В'
    when lower(trim(p_section_name)) in ('avella', '╨░╨▓╨╡╨╗╨╗╨░', '╨░╨▓╨╡╨╗╨╗╨░ ╤В╤Г╨╝╨▒╨╛╤З╨║╨░') then '╨Р╨▓╨╡╨╗╨╗╨░ ╤В╤Г╨╝╨▒╨╛╤З╨║╨░'
    when lower(trim(p_section_name)) in ('donini', '╨┤╨╛╨╜╨╕╨╜╨╕') then '╨Ф╨╛╨╜╨╕╨╜╨╕'
    when lower(trim(p_section_name)) in ('donini grande', '╨┤╨╛╨╜╨╕╨╜╨╕ ╨│╤А╨░╨╜╨┤╨╡') then '╨Ф╨╛╨╜╨╕╨╜╨╕ ╨У╤А╨░╨╜╨┤╨╡'
    when lower(trim(p_section_name)) in ('solito', '╤Б╨╛╨╗╨╕╤В╨╛', 'solito 1350', '╤Б╨╛╨╗╨╕╤В╨╛ 1350') then '╨б╨╛╨╗╨╕╤В╨╛ 1350'
    when lower(trim(p_section_name)) in ('solito2', 'solito 2', '╤Б╨╛╨╗╨╕╤В╨╛ 2') then '╨б╨╛╨╗╨╕╤В╨╛ 2'
    when lower(trim(p_section_name)) in ('stabile', '╤Б╤В╨░╨▒╨╕╨╗╨╡', '╤Б╤В╨░╨▒╨╕╨╗╨╡ 1350') then '╨б╤В╨░╨▒╨╕╨╗╨╡ 1350'
    when lower(trim(p_section_name)) in ('╨║╨╗╨░╤Б╤Б╨╕╨║╨╛', 'classico', '╨║╨╗╨░╤Б╤Б╨╕╨║╨╛ +', 'classico +') then '╨Ъ╨╗╨░╤Б╤Б╨╕╨║╨╛'
    when lower(trim(p_section_name)) in ('╨┐╤А╨╡╨╝╤М╨╡╤А', 'premier', '╨┐╤А╨╕╨╝╤М╨╡╤А╨░') then '╨Я╤А╨╕╨╝╤М╨╡╤А╨░'
    when lower(trim(p_section_name)) in ('╨║╤А╨╡╨╝╨╛╨╜╨░', 'cremona') then '╨Ъ╤А╨╡╨╝╨╛╨╜╨░'
    when lower(trim(p_section_name)) in ('╤В╨▓ ╨╗╨╛╤Д╤В', 'tv loft', '╤В╤Г╨╝╨▒╨░ ╨╗╨╛╤Д╤В') then '╨в╤Г╨╝╨▒╨░ ╨╗╨╛╤Д╤В'
    when lower(trim(p_section_name)) in ('╤В╨▓ ╨╗╨╛╤Д╤В 1500', 'tv loft 1500', '╤В╤Г╨╝╨▒╨░ ╨╗╨╛╤Д╤В 1500') then '╨в╤Г╨╝╨▒╨░ ╨╗╨╛╤Д╤В 1500'
    else coalesce(nullif(trim(p_section_name), ''), '')
  end;
$$;


--
-- Name: web_normalize_material_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_normalize_material_name(p_material text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
  select case
    when p_material is null then ''
    when lower(trim(p_material)) in ('╨▒╨░╤А╨┤╨╛╨╗╨╕╨╜╨╛', '╤Б╨╛╨╜╨╛╨╝╨░/╨▒╨░╤А╨┤╨╛╨╗╨╕╨╜╨╛', '╤Б╨╛╨╜╨╛╨╝╨░\╨▒╨░╤А╨┤╨╛╨╗╨╕╨╜╨╛') then '╤Б╨╛╨╜╨╛╨╝╨░ / ╨▒╨░╤А╨┤╨╛╨╗╨╕╨╜╨╛'
    when lower(trim(p_material)) in ('╤Б╨╛╨╜╨╛╨╝╨░\╨▒╨░╤А╨┤╨╛╨╗╨╕╨╜╨╛ ╤В╨╡╨╝╨╜╨░╤П', '╤Б╨╛╨╜╨╛╨╝╨░/╨▒╨░╤А╨┤╨╛╨╗╨╕╨╜╨╛ ╤В╨╡╨╝╨╜╨░╤П') then '╤Б╨╛╨╜╨╛╨╝╨░ / ╨▒╨░╤А╨┤╨╛╨╗╨╕╨╜╨╛ ╤В╨╡╨╝╨╜╨░╤П'
    when lower(trim(p_material)) = '╨╝╤А╨░╨╝╨╛╤А ╨║╤А╨╕╤Б╤В╨░╨╗' then '╨╝╤А╨░╨╝╨╛╤А ╨║╤А╨╕╤Б╤В╨░╨╗╨╗'
    when lower(trim(p_material)) = '╤Б╨╗╨╛╨╜╨╛╨▓╤М╤П ╨║╨╛╤Б╤В╤М' then '╤Б╨╗╨╛╨╜╨╛╨▓╨░╤П ╨║╨╛╤Б╤В╤М'
    else lower(trim(p_material))
  end;
$$;


--
-- Name: web_normalize_premier_section_name(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_normalize_premier_section_name(p_section_name text, p_item text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    case
      when coalesce(p_item, '') ilike '╨Я╤А╨╡╨╝╤М╨╡╤А. ╨С╨╡╨╗╤Л╨╣.%' then '╨Я╤А╨╡╨╝╤М╨╡╤А ╨▒╨╡╨╗╤Л╨╣'
      when coalesce(p_item, '') ilike '╨Я╤А╨╡╨╝╤М╨╡╤А. ╨з╨╡╤А╨╜╤Л╨╣.%' then '╨Я╤А╨╡╨╝╤М╨╡╤А ╤З╨╡╤А╨╜╤Л╨╣'
      else coalesce(p_section_name, '')
    end
$$;


--
-- Name: web_plan_cell_has_active_order(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_plan_cell_has_active_order(p_source_row_id text, p_item text, p_material text, p_week text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.orders o
    where coalesce(o.shipped, false) = false
      and coalesce(o.pipeline_stage, '') <> 'shipped'
      and trim(coalesce(o.week, '')) = trim(coalesce(p_week, ''))
      and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(p_material, ''))
      and (
        (
          coalesce(trim(p_source_row_id), '') <> ''
          and trim(coalesce(o.source_row_id, '')) = trim(p_source_row_id)
        )
        or public.web_norm_item_key(o.item) = public.web_norm_item_key(p_item)
      )
  );
$$;


--
-- Name: web_preview_plan_from_shipment(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_preview_plan_from_shipment(p_row text, p_col text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  c public.shipment_cells%rowtype;
  p public.shipment_plan_cells%rowtype;
begin
  select * into p
  from public.shipment_plan_cells
  where source_row_id = p_row and source_col_id = p_col
  limit 1;

  if p.id is not null then
    return jsonb_build_object(
      'detailedName', p.item,
      'colorName', coalesce(p.material, ''),
      'firstName', p.item,
      'qty', p.qty,
      'planNumber', coalesce(p.week, '-'),
      'rows', jsonb_build_array(jsonb_build_object('part', p.item, 'qty', p.qty)),
      'generatedAt', to_char(now(), 'DD.MM.YYYY HH24:MI')
    );
  end if;

  select * into c
  from public.shipment_cells
  where source_row_id = p_row and source_col_id = p_col
  limit 1;

  if c.id is null then
    raise exception 'Shipment cell not found: row %, col %', p_row, p_col;
  end if;

  return jsonb_build_object(
    'detailedName', c.item,
    'colorName', coalesce(c.material, ''),
    'firstName', c.item,
    'qty', c.qty,
    'planNumber', coalesce(c.week, '-'),
    'rows', jsonb_build_array(jsonb_build_object('part', c.item, 'qty', c.qty)),
    'generatedAt', to_char(now(), 'DD.MM.YYYY HH24:MI')
  );
end;
$$;


--
-- Name: FUNCTION web_preview_plan_from_shipment(p_row text, p_col text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.web_preview_plan_from_shipment(p_row text, p_col text) IS 'Print preview: reads shipment_plan_cells first, then falls back to shipment_cells for legacy rows.';


--
-- Name: web_preview_plans_batch(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_preview_plans_batch(p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  x jsonb;
  p_row text;
  p_col text;
  plans jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items array required';
  end if;

  for x in select * from jsonb_array_elements(p_items)
  loop
    p_row := coalesce(x->>'row', '');
    p_col := coalesce(x->>'col', '');
    if p_row = '' or p_col = '' then
      continue;
    end if;

    plans := plans || jsonb_build_array(
      jsonb_build_object(
        'row', p_row,
        'col', p_col,
        'plan', public.web_preview_plan_from_shipment(p_row, p_col)
      )
    );
  end loop;

  return jsonb_build_object('plans', plans);
end;
$$;


--
-- Name: web_reduce_order_qty(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_reduce_order_qty(p_order_id text, p_qty_done integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.orders
  SET qty = GREATEST(0, qty - GREATEST(0, p_qty_done)),
      updated_at = now()
  WHERE order_id = p_order_id;
END;
$$;


--
-- Name: web_refresh_product_color_map(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_refresh_product_color_map() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count integer := 0;
begin
  delete from public.product_color_map;

  insert into public.product_color_map (product_name, color_name, source)
  select distinct
    trim(iam.item_name) as product_name,
    trim(iam.table_color) as color_name,
    'item_article_map'::text as source
  from public.item_article_map iam
  where trim(coalesce(iam.item_name, '')) <> ''
    and trim(coalesce(iam.table_color, '')) <> '';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


--
-- Name: web_register_leftovers_for_order(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_register_leftovers_for_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_item_lc text := lower(coalesce(new.item, ''));
  v_material_lc text := lower(coalesce(new.material, ''));
  v_material_dims text := regexp_replace(v_material_lc, '[\s*╤Еx├Ч]', '', 'g');
  v_sheets_needed numeric := 0;
  v_map_size text := '';
begin
  if new.order_id is null then
    return new;
  end if;

  if v_item_lc like '%solito%' and v_item_lc like '%1350%' then
    select coalesce(sc.sheets_needed, 0)
      into v_sheets_needed
    from public.shipment_cells sc
    where sc.source_row_id = new.source_row_id
      and lower(coalesce(sc.item, '')) = v_item_lc
    order by sc.updated_at desc nulls last
    limit 1;

    if v_sheets_needed > 0 then
      insert into public.materials_leftovers(order_id,item,material,sheets_needed,leftover_format,leftovers_qty)
      values (new.order_id,new.item,new.material,v_sheets_needed,'2800x624',floor(v_sheets_needed))
      on conflict (order_id, leftover_format) do update
      set item = excluded.item,
          material = excluded.material,
          sheets_needed = excluded.sheets_needed,
          leftovers_qty = excluded.leftovers_qty;
    end if;
  end if;

  if v_item_lc like '%donini grande 750%' or v_item_lc like '%donini grande 806%' then
    select lower(trim(coalesce(msm.sheet_size, '')))
      into v_map_size
    from public.material_size_map msm
    where public.normalize_item_key(msm.material_name) = public.normalize_item_key(v_material_lc)
    order by msm.updated_at desc
    limit 1;

    if regexp_replace(coalesce(v_map_size, ''), '[\s*╤Еx├Ч]', '', 'g') = '28002070'
       or v_material_dims like '%28002070%' then
      select coalesce(sc.sheets_needed, 0)
        into v_sheets_needed
      from public.shipment_cells sc
      where sc.source_row_id = new.source_row_id
        and lower(coalesce(sc.item, '')) = v_item_lc
      order by sc.updated_at desc nulls last
      limit 1;

      if v_sheets_needed > 0 then
        insert into public.materials_leftovers(order_id,item,material,sheets_needed,leftover_format,leftovers_qty)
        values (new.order_id,new.item,new.material,v_sheets_needed,'2800x550',floor(v_sheets_needed))
        on conflict (order_id, leftover_format) do update
        set item = excluded.item,
            material = excluded.material,
            sheets_needed = excluded.sheets_needed,
            leftovers_qty = excluded.leftovers_qty;
      end if;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: web_remove_crm_user_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_remove_crm_user_role(p_user_id uuid) RETURNS TABLE(removed boolean, user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_removed integer := 0;
begin
  perform public.web_require_roles(array['admin']);

  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  delete from public.crm_user_roles r
  where r.user_id = p_user_id;
  get diagnostics v_removed = row_count;

  return query
  select (v_removed > 0), p_user_id;
end;
$$;


--
-- Name: web_rename_hardware_bom_product(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_rename_hardware_bom_product(p_old text, p_new text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_old   TEXT := trim(coalesce(p_old, ''));
  v_new   TEXT := trim(coalesce(p_new, ''));
  v_count INTEGER := 0;
  v_n     INTEGER;
BEGIN
  IF v_old = '' OR v_new = '' THEN
    RAISE EXCEPTION 'old and new product names are required';
  END IF;

  IF lower(v_old) = lower(v_new) THEN
    UPDATE public.hardware_bom SET bom_product = v_new
      WHERE lower(trim(bom_product)) = lower(v_old);
    UPDATE public.hardware_product_map SET bom_product = v_new
      WHERE lower(trim(bom_product)) = lower(v_old);
    RETURN 0;
  END IF;

  IF EXISTS (SELECT 1 FROM public.hardware_bom WHERE lower(trim(bom_product)) = lower(v_new))
     OR EXISTS (SELECT 1 FROM public.hardware_product_map WHERE lower(trim(bom_product)) = lower(v_new)) THEN
    RAISE EXCEPTION 'product "%" already exists', v_new;
  END IF;

  UPDATE public.hardware_bom SET bom_product = v_new
    WHERE lower(trim(bom_product)) = lower(v_old);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  UPDATE public.hardware_product_map SET bom_product = v_new
    WHERE lower(trim(bom_product)) = lower(v_old);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  RETURN v_count;
END;
$$;


--
-- Name: web_replacement_item_key(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_replacement_item_key(p_product text, p_part text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select public.web_norm_item_key(
    case
      when trim(coalesce(p_product, '')) = '╨Я╤А╨╛╤З╨╡╨╡' then trim(coalesce(p_part, ''))
      else trim(coalesce(p_product, '')) || ' тАФ ' || trim(coalesce(p_part, ''))
    end
  );
$$;


--
-- Name: web_require_roles(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_require_roles(p_roles text[]) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_effective text := public.web_effective_crm_role();
begin
  if p_roles is null or array_length(p_roles, 1) is null then
    return;
  end if;
  if v_effective = any (
    array(
      select lower(trim(x))
      from unnest(p_roles) x
      where x is not null and trim(x) <> ''
    )
  ) then
    return;
  end if;
  raise exception using
    errcode = '42501',
    message = format('╨Э╨╡╨┤╨╛╤Б╤В╨░╤В╨╛╤З╨╜╨╛ ╨┐╤А╨░╨▓: ╤В╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╨╛╨┤╨╜╨░ ╨╕╨╖ ╤А╨╛╨╗╨╡╨╣ [%s], ╤В╨╡╨║╤Г╤Й╨░╤П ╤А╨╛╨╗╤М [%s]', array_to_string(p_roles, ', '), v_effective);
end;
$$;


--
-- Name: web_require_workshop_stage(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_require_workshop_stage(p_stage text) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
      '╨Э╨╡╨┤╨╛╤Б╤В╨░╤В╨╛╤З╨╜╨╛ ╨┐╤А╨░╨▓ ╨┤╨╗╤П ╤Н╤В╨░╨┐╨░ [%s]: ╤В╨╡╨║╤Г╤Й╨░╤П ╤А╨╛╨╗╤М [%s]',
      coalesce(p_stage, '?'),
      v_effective
    );
end;
$$;


--
-- Name: web_reset_replacement_order_packaging(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_reset_replacement_order_packaging(p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  update public.replacement_orders set packaging_accepted = false, status = 'ЁЯЯг ╨Т ╤Г╨┐╨░╨║╨╛╨▓╨║╨╡',
    accepted_at = null, workshop_order_id = null, completed_at = null
  where id = p_id and sent_to_work = true;
end; $$;


--
-- Name: web_resolve_output_per_sheet(text, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_resolve_output_per_sheet(p_section_name text, p_item text, p_material text, p_fallback numeric DEFAULT 0) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_section text := lower(trim(coalesce(p_section_name, '')));
  v_item text := lower(trim(coalesce(p_item, '')));
  v_material text := lower(trim(coalesce(p_material, '')));
  v_material_dims text := regexp_replace(v_material, '[\s*╤Еx├Ч]', '', 'g');
  v_mapped_sheet_size text := '';
  v_mapped_dims text := '';
  v_fallback numeric := coalesce(p_fallback, 0);
  v_is_target boolean := false;
  v_is_cremona boolean := false;
  v_is_solito2 boolean := false;
  v_is_solito1150 boolean := false;
  v_is_solito1350 boolean := false;
  v_is_stabile boolean := false;
  v_is_donini_grande boolean := false;
  v_is_klassiko boolean := false;
  v_is_premier boolean := false;
  v_is_donini_r boolean := false;
begin
  v_is_cremona := v_section = 'cremona' or v_item like '%cremona%';
  v_is_solito2 := v_section = 'solito2' or v_item like '%solito2%';
  v_is_solito1150 := v_section in ('solito 1150', 'solito 1150 ╨▒╨╡╨╗╤Л╨╣') or v_item like '%╤Б╨╡╤А╨╕╤П 1150%';
  v_is_solito1350 := v_section in ('solito 1350 ╤З╨╡╤А╨╜╤Л╨╣', 'solito 1350 ╨▒╨╡╨╗╤Л╨╣') or v_item like '%╤Б╨╡╤А╨╕╤П 1350%';
  v_is_stabile := v_section = 'stabile' or v_item like '%stabile%';
  v_is_donini_grande := v_section in ('donini grande 750', 'donini grande 806') or v_item like '%donini grande 750%' or v_item like '%donini grande 806%';
  v_is_klassiko := v_section in ('╨║╨╗╨░╤Б╤Б╨╕╨║╨╛', '╨║╨╗╨░╤Б╤Б╨╕╨║╨╛ +') or v_item like '%╨║╨╗╨░╤Б╤Б╨╕╨║╨╛%';
  v_is_premier := v_section in ('╨┐╤А╨╡╨╝╤М╨╡╤А', '╨┐╤А╨╡╨╝╤М╨╡╤А ╨▒╨╡╨╗╤Л╨╣', '╨┐╤А╨╡╨╝╤М╨╡╤А ╤З╨╡╤А╨╜╤Л╨╣') or v_item like '%╨┐╤А╨╡╨╝╤М╨╡╤А%';
  v_is_donini_r := v_section in ('donini r 750', 'donini r 806') or v_item like '%donini r 750%' or v_item like '%donini r 806%';

  v_is_target :=
    v_section = 'avella'
    or v_item like '%avella%'
    or v_is_cremona
    or v_is_solito2
    or v_is_solito1150
    or v_is_solito1350
    or v_is_stabile
    or v_is_donini_grande
    or v_is_klassiko
    or v_is_premier
    or v_is_donini_r
    or v_section in ('donini 806', 'donini 750', 'donini 806 ╨▒╨╡╨╗╤Л╨╣', 'donini 750 ╨▒╨╡╨╗╤Л╨╣')
    or v_item like '%donini 806%'
    or v_item like '%donini 750%';

  if not v_is_target then
    return v_fallback;
  end if;

  if v_is_solito1350 then return 4; end if;
  if v_is_premier then return 5; end if;
  if v_is_klassiko then return 6; end if;
  if v_is_donini_grande then return 3; end if;
  if v_is_solito2 then return 6; end if;
  if v_is_solito1150 then return 6; end if;

  select lower(trim(coalesce(msm.sheet_size, '')))
    into v_mapped_sheet_size
  from public.material_size_map msm
  where public.normalize_item_key(msm.material_name) = public.normalize_item_key(v_material)
  order by msm.updated_at desc
  limit 1;

  v_mapped_dims := regexp_replace(coalesce(v_mapped_sheet_size, ''), '[\s*╤Еx├Ч]', '', 'g');
  if v_is_stabile then
    if v_mapped_dims = '28002070' then return 4; end if;
    if v_mapped_dims = '27501830' then return 3; end if;
  end if;

  if v_mapped_dims = '28002070' then return case when v_is_cremona then 2 else 6 end; end if;
  if v_mapped_dims = '27501830' then return case when v_is_cremona then 1.5 else 4 end; end if;

  if v_material_dims like '%28002070%' then
    if v_is_stabile then return 4; end if;
    return case when v_is_cremona then 2 else 6 end;
  end if;

  if v_material_dims like '%27501830%' then
    if v_is_stabile then return 3; end if;
    return case when v_is_cremona then 1.5 else 4 end;
  end if;

  return 0;
end;
$$;


--
-- Name: web_resolve_output_per_sheet(text, text, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_resolve_output_per_sheet(p_section_name text, p_item text, p_material text, p_format_type text DEFAULT NULL::text, p_fallback numeric DEFAULT 0) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_section text := lower(trim(coalesce(p_section_name, '')));
  v_item text := lower(trim(coalesce(p_item, '')));
  v_material text := lower(trim(coalesce(p_material, '')));
  v_format_type text := lower(trim(coalesce(p_format_type, '')));
  v_material_dims text := regexp_replace(v_material, '[\s*╤Еx├Ч]', '', 'g');
  v_mapped_sheet_size text := '';
  v_mapped_dims text := '';
  v_fallback numeric := coalesce(p_fallback, 0);
  v_is_donini_target boolean := false;
  v_is_cremona boolean := false;
  v_is_solito2 boolean := false;
  v_is_solito1150 boolean := false;
  v_is_solito1350 boolean := false;
  v_is_stabile boolean := false;
  v_is_donini_grande boolean := false;
  v_is_klassiko boolean := false;
  v_is_premier boolean := false;
  v_is_donini_r boolean := false;
  v_is_pino_x boolean := false;
begin
  v_is_cremona := v_section = 'cremona' or v_item like '%cremona%';
  v_is_solito2 := v_section = 'solito2' or v_item like '%solito2%';
  v_is_solito1150 := v_section in ('solito 1150', 'solito 1150 ╨▒╨╡╨╗╤Л╨╣') or v_item like '%╤Б╨╡╤А╨╕╤П 1150%';
  v_is_solito1350 := v_section in ('solito 1350 ╤З╨╡╤А╨╜╤Л╨╣', 'solito 1350 ╨▒╨╡╨╗╤Л╨╣') or v_item like '%╤Б╨╡╤А╨╕╤П 1350%';
  v_is_stabile := v_section = 'stabile' or v_item like '%stabile%';
  v_is_donini_grande := v_section in ('donini grande 750', 'donini grande 806') or v_item like '%donini grande 750%' or v_item like '%donini grande 806%';
  v_is_klassiko := v_section in ('╨║╨╗╨░╤Б╤Б╨╕╨║╨╛', '╨║╨╗╨░╤Б╤Б╨╕╨║╨╛ +') or v_item like '%╨║╨╗╨░╤Б╤Б╨╕╨║╨╛%';
  v_is_premier := v_section in ('╨┐╤А╨╡╨╝╤М╨╡╤А', '╨┐╤А╨╡╨╝╤М╨╡╤А ╨▒╨╡╨╗╤Л╨╣', '╨┐╤А╨╡╨╝╤М╨╡╤А ╤З╨╡╤А╨╜╤Л╨╣') or v_item like '%╨┐╤А╨╡╨╝╤М╨╡╤А%';
  v_is_donini_r := v_section in ('donini r 750', 'donini r 806') or v_item like '%donini r 750%' or v_item like '%donini r 806%';
  v_is_pino_x := v_item like '%pino x%';
  v_is_donini_target := v_section = 'avella' or v_item like '%avella%' or v_is_cremona or v_is_solito2 or v_is_solito1150 or v_is_solito1350 or v_is_stabile or v_is_donini_grande or v_is_klassiko or v_is_premier or v_is_donini_r or v_is_pino_x or v_section in ('donini 806', 'donini 750', 'donini 806 ╨▒╨╡╨╗╤Л╨╣', 'donini 750 ╨▒╨╡╨╗╤Л╨╣') or v_item like '%donini 806%' or v_item like '%donini 750%';
  if not v_is_donini_target then return v_fallback; end if;
  if v_is_solito1350 then return 4; end if;
  if v_is_premier then return 5; end if;
  if v_is_klassiko then return 6; end if;
  if v_is_donini_grande then return 3; end if;
  if v_is_donini_r then return 4; end if;
  if v_is_solito2 then return 6; end if;
  if v_is_solito1150 then return 6; end if;
  if v_format_type in ('small', '╨╝╨░╨╗╤Л╨╣') then return case when v_is_cremona then 1.5 else 4 end; end if;
  if v_format_type in ('large', '╨▒╨╛╨╗╤М╤И╨╛╨╣') then return case when v_is_cremona then 2 else 6 end; end if;
  select lower(trim(coalesce(msm.sheet_size, ''))) into v_mapped_sheet_size from public.material_size_map msm where public.normalize_item_key(msm.material_name) = public.normalize_item_key(v_material) order by msm.updated_at desc limit 1;
  v_mapped_dims := regexp_replace(coalesce(v_mapped_sheet_size, ''), '[\s*╤Еx├Ч]', '', 'g');
  if v_is_stabile then
    if v_mapped_dims = '28002070' then return 4; end if;
    if v_mapped_dims = '27501830' then return 3; end if;
  end if;
  if v_mapped_dims = '28002070' then return case when v_is_cremona then 2 else 6 end; end if;
  if v_mapped_dims = '27501830' then return case when v_is_cremona then 1.5 else 4 end; end if;
  if v_material_dims like '%28002070%' then return case when v_is_stabile then 4 when v_is_cremona then 2 else 6 end; end if;
  if v_material_dims like '%27501830%' then return case when v_is_stabile then 3 when v_is_cremona then 1.5 else 4 end; end if;
  return v_fallback;
end;
$$;


--
-- Name: web_seed_furniture_strap_template(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_seed_furniture_strap_template(p_product_name text, p_details jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
begin
  if v_name = '' then return; end if;
  if jsonb_typeof(coalesce(p_details, 'null'::jsonb)) <> 'array' then return; end if;

  insert into public.furniture_custom_templates (product_name, details)
  values (v_name, p_details)
  on conflict (product_name) do nothing;
end;
$$;


--
-- Name: web_send_planks_to_work(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_send_planks_to_work(p_items jsonb) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_now timestamptz := now();
  v_batch text := 'OBV-' || to_char(v_now, 'YYMMDD-HH24MISS');
  v_order_id text := 'PL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_week text := to_char(v_now, 'IYYY-IW');
  v_total_qty numeric := 0;
  v_total_sheets numeric := 0;
  v_batch_id uuid;
  v_line int := 0;
  x jsonb;
  v_name text;
  v_qty numeric;
  v_len int;
  v_wid int;
  v_per_sheet int;
  v_sheets int;
  v_row public.orders;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items array required';
  end if;

  insert into public.plank_batches (batch_code, display_name, material, status, week)
  values (v_batch, '╨Я╨╗╨░╨╜╨║╨╕ ╨╛╨▒╨▓╤П╨╖╨║╨╕', '╨з╨╡╤А╨╜╤Л╨╣', 'sent_to_work', v_week)
  returning id into v_batch_id;

  for x in select * from jsonb_array_elements(p_items)
  loop
    v_name := trim(both from coalesce(x->>'name',''));
    v_qty := coalesce((x->>'qty')::numeric, 0);
    if v_name = '' or v_qty <= 0 then
      continue;
    end if;
    v_line := v_line + 1;
    v_len := null;
    v_wid := null;
    v_per_sheet := 0;
    v_sheets := 0;

    if v_name ~ '\((\d+)_(\d+)\)' then
      v_len := substring(v_name from '\((\d+)_(\d+)\)')::int;
      v_wid := substring(v_name from '\(\d+_(\d+)\)')::int;
      v_per_sheet := public.calc_per_sheet(v_len, v_wid);
      if v_per_sheet > 0 then
        v_sheets := ceil(v_qty / v_per_sheet)::int;
      end if;
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_total_sheets := v_total_sheets + v_sheets;

    insert into public.plank_batch_items (
      batch_id, line_no, name, qty, length_mm, width_mm, per_sheet, sheets_needed
    )
    values (
      v_batch_id, v_line, v_name, v_qty, v_len, v_wid, v_per_sheet, v_sheets
    );
  end loop;

  update public.plank_batches
    set total_qty = v_total_qty, total_sheets = v_total_sheets
    where id = v_batch_id;

  insert into public.orders (
    order_id, source, item, material, week, qty,
    pilka_status, kromka_status, pras_status, assembly_status, overall_status,
    notes
  )
  values (
    v_order_id, 'supabase', '╨Я╨╗╨░╨╜╨║╨╕ ╨╛╨▒╨▓╤П╨╖╨║╨╕ [' || v_batch || ']', '╨з╨╡╤А╨╜╤Л╨╣', v_week, v_total_qty,
    'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В', 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В', 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В', 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В', 'ЁЯЯб ╨Э╨╛╨▓╤Л╨╣ ╨╖╨░╨║╨░╨╖',
    'batch_id=' || v_batch_id::text
  )
  returning * into v_row;

  update public.plank_batches set order_id = v_order_id where id = v_batch_id;
  return v_row;
end;
$$;


--
-- Name: web_send_replacement_order_to_work(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_send_replacement_order_to_work(p_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.replacement_orders
  set sent_to_work = true,
      status = 'ЁЯЯг ╨Т ╤Г╨┐╨░╨║╨╛╨▓╨║╨╡'
  where id = p_id;
end;
$$;


--
-- Name: web_send_shipment_to_work(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_send_shipment_to_work(p_cell_id uuid) RETURNS public.orders
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  c public.shipment_cells%rowtype;
begin
  select * into c
  from public.shipment_cells
  where id = p_cell_id;

  if c.id is null then
    raise exception 'Shipment cell not found';
  end if;

  return public.web_send_shipment_to_work_by_source(c.source_row_id, c.source_col_id);
end;
$$;


--
-- Name: FUNCTION web_send_shipment_to_work(p_cell_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.web_send_shipment_to_work(p_cell_id uuid) IS 'Legacy: resolve shipment_cells.id to source_row_id/source_col_id and delegate to web_send_shipment_to_work_by_source. Prefer calling web_send_shipment_to_work_by_source from new clients.';


--
-- Name: web_send_shipment_to_work_by_source(text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_send_shipment_to_work_by_source(p_row text, p_col text, p_skip_workshop boolean DEFAULT false) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare c public.shipment_cells%rowtype; p public.shipment_plan_cells%rowtype; v_order_id text; v_row public.orders; v_week_norm text; v_skip boolean := coalesce(p_skip_workshop, false);
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  select * into c from public.shipment_cells where source_row_id = p_row and source_col_id = p_col for update;
  if c.id is null then
    select * into p from public.shipment_plan_cells where source_row_id = p_row and source_col_id = p_col limit 1;
    if p.id is null then raise exception 'Shipment cell not found: row %, col %', p_row, p_col; end if;
    insert into public.shipment_cells (source_row_id, source_col_id, section_name, item, material, week, qty, bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note)
    values (p.source_row_id, p.source_col_id, p.section_name, p.item, p.material, p.week, p.qty, coalesce(p.bg, '#ffffff'), true, false, coalesce(p.sheets_needed, 0), coalesce(p.available_sheets, 0), 0, coalesce(nullif(p.note, ''), 'copied from shipment_plan_cells'))
    on conflict (source_row_id, source_col_id) do update set section_name=excluded.section_name, item=excluded.item, material=excluded.material, week=excluded.week, qty=excluded.qty, bg_color=excluded.bg_color, can_send_to_work=true, in_work=false, sheets_needed=excluded.sheets_needed, available_sheets=excluded.available_sheets, output_per_sheet=excluded.output_per_sheet, note=excluded.note, updated_at=now();
    select * into c from public.shipment_cells where source_row_id = p_row and source_col_id = p_col for update;
  end if;
  if coalesce(c.qty, 0) <= 0 then raise exception 'Qty is empty'; end if;
  v_week_norm := trim(coalesce(c.week, ''));
  select * into v_row from public.orders o where trim(coalesce(o.source_row_id, '')) = trim(coalesce(c.source_row_id, '')) and trim(coalesce(o.week, '')) = v_week_norm and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(c.material, '')) and coalesce(o.shipped, false) = false order by o.created_at desc limit 1;
  if v_row.id is not null then
    update public.orders set item=c.item, material=coalesce(c.material, material), qty=c.qty, updated_at=now() where order_id=v_row.order_id returning * into v_row;
    if v_skip then v_row := public.web_skip_workshop_to_assembly(v_row.order_id); end if;
    update public.shipment_cells set in_work=true, can_send_to_work=false, bg_color='#ffff00', updated_at=now() where id=c.id;
    update public.shipment_plan_cells set in_work=true, can_send_to_work=false, bg='#ffff00', updated_at=now() where source_row_id=p_row and source_col_id=p_col;
    return v_row;
  end if;
  if c.in_work then
    select * into v_row from public.orders o where trim(coalesce(o.source_row_id, '')) = trim(coalesce(c.source_row_id, '')) and trim(coalesce(o.week, '')) = v_week_norm and public.web_norm_item_key(coalesce(o.material, '')) = public.web_norm_item_key(coalesce(c.material, '')) and coalesce(o.shipped, false) = false order by o.created_at desc limit 1;
    if v_row.id is not null then if v_skip then v_row := public.web_skip_workshop_to_assembly(v_row.order_id); end if; return v_row; end if;
    raise exception 'Cell is already in work';
  end if;
  v_order_id := 'SP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.orders (order_id, source, source_row_id, item, material, week, qty, pilka_status, kromka_status, pras_status, assembly_status, overall_status)
  values (v_order_id, 'supabase', c.source_row_id, c.item, c.material, c.week, c.qty, case when v_skip then '╨У╨╛╤В╨╛╨▓╨╛' else 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В ╨┐╨╕╨╗╤Г' end, case when v_skip then '╨У╨╛╤В╨╛╨▓╨╛' else 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В' end, case when v_skip then '╨У╨╛╤В╨╛╨▓╨╛' else 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В' end, 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В', case when v_skip then 'ЁЯЯб ╨Ъ ╤Б╨▒╨╛╤А╨║╨╡' else 'ЁЯЯб ╨Ю╤В╨┐╤А╨░╨▓╨╗╨╡╨╜ ╨╜╨░ ╨┐╨╕╨╗╤Г' end) returning * into v_row;
  update public.shipment_cells set in_work=true, can_send_to_work=false, bg_color='#ffff00', updated_at=now() where id=c.id;
  update public.shipment_plan_cells set in_work=true, can_send_to_work=false, bg='#ffff00', updated_at=now() where source_row_id=p_row and source_col_id=p_col;
  return v_row;
end; $$;


--
-- Name: web_set_consume_log_sheet_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_consume_log_sheet_name(p_sheet_name text) RETURNS TABLE(sheet_name text, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_default text := '╤А╨░╤Б╤Е╨╛╨┤ ╨╝╨░╨╣ 2026';
  v_name text;
begin
  perform public.web_require_roles(array['admin']);

  v_name := nullif(btrim(coalesce(p_sheet_name, '')), '');
  if v_name is null then
    v_name := v_default;
  end if;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_consume_log_sheet_name', v_name, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select r.sheet_name, r.updated_at
  from public.web_get_consume_log_sheet_name() r;
end;
$$;


--
-- Name: web_set_crm_auth_strict(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_crm_auth_strict(p_enabled boolean) RETURNS TABLE(enabled boolean, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_db_role text := lower(coalesce(current_setting('request.jwt.claim.role', true), ''));
begin
  perform public.web_require_roles(array['admin']);

  if coalesce(p_enabled, false) = true
     and auth.uid() is null
     and v_db_role <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = '╨Э╨╡╨╗╤М╨╖╤П ╨▓╨║╨╗╤О╤З╨╕╤В╤М strict mode ╨▒╨╡╨╖ ╨░╨▓╤В╨╛╤А╨╕╨╖╨╛╨▓╨░╨╜╨╜╨╛╨│╨╛ admin-╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤П';
  end if;

  insert into public.crm_runtime_settings(key, value_text, updated_at)
  values ('crm_auth_strict', case when coalesce(p_enabled, false) then 'true' else 'false' end, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select public.web_is_crm_auth_strict(), s.updated_at
  from public.crm_runtime_settings s
  where s.key = 'crm_auth_strict'
  limit 1;
end;
$$;


--
-- Name: web_set_crm_executors(text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_crm_executors(p_kromka_executors text[], p_pras_executors text[]) RETURNS TABLE(kromka_executors text[], pras_executors text[], updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_kromka text[];
  v_pras text[];
begin
  perform public.web_require_roles(array['admin']);

  v_kromka := array(
    select distinct nullif(btrim(x), '')
    from unnest(coalesce(p_kromka_executors, array[]::text[])) as x
    where nullif(btrim(x), '') is not null
  );
  v_pras := array(
    select distinct nullif(btrim(x), '')
    from unnest(coalesce(p_pras_executors, array[]::text[])) as x
    where nullif(btrim(x), '') is not null
  );

  if coalesce(array_length(v_kromka, 1), 0) = 0 then
    v_kromka := array['╨б╨╗╨░╨▓╨░', '╨б╨╡╤А╨╡╨╢╨░'];
  end if;
  if coalesce(array_length(v_pras, 1), 0) = 0 then
    v_pras := array['╨Ы╨╡╤Е╨░', '╨Т╨╕╤В╨░╨╗╨╕╨║'];
  end if;

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_kromka_executors', to_json(v_kromka)::text, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_pras_executors', to_json(v_pras)::text, now())
  on conflict (key) do update
  set
    value_text = excluded.value_text,
    updated_at = now();

  return query
  select r.kromka_executors, r.pras_executors, r.updated_at
  from public.web_get_crm_executors() r;
end;
$$;


--
-- Name: web_set_crm_user_role(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_crm_user_role(p_user_id uuid, p_role text, p_note text DEFAULT NULL::text) RETURNS TABLE(user_id uuid, role text, assigned_by uuid, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_role text := lower(trim(coalesce(p_role, '')));
  v_assigner uuid := auth.uid();
begin
  perform public.web_require_roles(array['admin']);

  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  if not public.web_is_valid_crm_role(v_role) then
    raise exception 'Invalid CRM role: %', p_role;
  end if;

  insert into public.crm_user_roles(user_id, role, assigned_by, note)
  values (p_user_id, v_role, v_assigner, nullif(trim(coalesce(p_note, '')), ''))
  on conflict on constraint crm_user_roles_pkey do update
  set
    role = excluded.role,
    assigned_by = excluded.assigned_by,
    note = excluded.note,
    updated_at = now();

  return query
  select r.user_id, r.role, r.assigned_by, r.updated_at
  from public.crm_user_roles r
  where r.user_id = p_user_id
  limit 1;
end;
$$;


--
-- Name: web_set_hardware_stock(bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_hardware_stock(p_item_id bigint, p_qty numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_qty NUMERIC := GREATEST(0, coalesce(p_qty, 0));
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'hardware item id is required';
  END IF;
  INSERT INTO public.hardware_stock (hardware_item_id, qty)
  VALUES (p_item_id, v_qty)
  ON CONFLICT (hardware_item_id) DO UPDATE
    SET qty = v_qty,
        updated_at = now();
  INSERT INTO public.hardware_moves (hardware_item_id, qty, move_type, note)
  VALUES (p_item_id, v_qty, 'adjust', '╨╕╨╜╨▓╨╡╨╜╤В╨░╤А╨╕╨╖╨░╤Ж╨╕╤П');
END;
$$;


--
-- Name: web_set_metal_stock(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_metal_stock(p_metal_article text, p_metal_name text, p_qty_available integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_article text := trim(coalesce(p_metal_article, ''));
  v_name text := trim(coalesce(p_metal_name, ''));
  v_qty integer := greatest(coalesce(p_qty_available, 0), 0);
begin
  perform public.web_require_roles(array['admin', 'manager']);

  if v_article = '' then
    raise exception 'metal_article required';
  end if;

  insert into public.metal_components_stock (metal_article, metal_name, qty_available)
  values (v_article, coalesce(nullif(v_name, ''), v_article), v_qty)
  on conflict (metal_article) do update
  set metal_name = coalesce(nullif(excluded.metal_name, ''), public.metal_components_stock.metal_name),
      qty_available = excluded.qty_available,
      updated_at = now();
end;
$$;


--
-- Name: web_set_metal_work_item_comment(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_metal_work_item_comment(p_item_id bigint, p_comment text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_id bigint;
  v_comment text := left(trim(coalesce(p_comment, '')), 2000);
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if coalesce(p_item_id, 0) <= 0 then
    raise exception 'invalid item id';
  end if;

  update public.metal_work_items mwi
  set operator_comment = v_comment, updated_at = now()
  where mwi.id = p_item_id
  returning mwi.id into v_id;

  if v_id is null then
    raise exception 'work item not found';
  end if;

  perform public.web_audit_log_event(
    'set_metal_work_item_comment',
    'metal_work_items',
    v_id::text,
    jsonb_build_object('comment_length', char_length(v_comment))
  );

  return true;
end;
$$;


--
-- Name: web_set_metal_work_queue_status(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_metal_work_queue_status(p_id bigint, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_status text := trim(coalesce(p_status, ''));
begin
  perform public.web_require_roles(array['admin', 'manager', 'operator']);
  if v_status not in ('queued', 'in_progress', 'done', 'cancelled') then
    raise exception 'unsupported status';
  end if;
  update public.metal_work_queue
  set status = v_status,
      updated_at = now()
  where id = p_id;
end;
$$;


--
-- Name: web_set_order_admin_comment(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_order_admin_comment(p_order_id text, p_comment text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_id text := trim(coalesce(p_order_id, ''));
  v_comment text := trim(coalesce(p_comment, ''));
  v_before text := '';
begin
  perform public.web_require_roles(array['admin']);

  if v_id = '' then
    raise exception 'order_id required';
  end if;

  if length(v_comment) > 4000 then
    raise exception 'comment too long';
  end if;

  select trim(coalesce(o.admin_comment, ''))
    into v_before
  from public.orders o
  where o.order_id = v_id
  order by o.updated_at desc nulls last
  limit 1;

  if not found then
    raise exception 'order not found';
  end if;

  update public.orders
  set admin_comment = v_comment,
      updated_at = now()
  where order_id = v_id;

  if coalesce(v_before, '') is distinct from v_comment then
    perform public.web_audit_log_event(
      'set_order_admin_comment',
      'orders',
      v_id,
      jsonb_build_object(
        'before', jsonb_build_object('admin_comment', coalesce(v_before, '')),
        'after', jsonb_build_object('admin_comment', v_comment)
      )
    );
  end if;
end;
$$;


--
-- Name: web_set_stage_done(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_stage_done(p_order_id text, p_stage text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
      pilka_status='тЬЕ ╨У╨╛╤В╨╛╨▓╨╛',
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
      kromka_status='тЬЕ ╨У╨╛╤В╨╛╨▓╨╛',
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
      pras_status='тЬЕ ╨У╨╛╤В╨╛╨▓╨╛',
      pras_done_at=now(),
      pras_pause_acc_min = coalesce(pras_pause_acc_min, 0) + case
        when pras_pause_started_at is not null
        then greatest(0, extract(epoch from (now() - pras_pause_started_at)) / 60)::integer
        else 0
      end,
      pras_pause_started_at = null,
      overall_status=case
        when coalesce(overall_status, '') like '%╨╛╤В╨┐╤А╨░╨▓%' then overall_status
        else 'тЬЕ ╨У╨╛╤В╨╛╨▓╨╛ ╨║ ╤Б╨▒╨╛╤А╨║╨╡'
      end,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'assembly' then
    update public.orders
    set
      assembly_status='тЬЕ ╨б╨Ю╨С╨а╨Р╨Э╨Ю',
      overall_status=case
        when coalesce(overall_status, '') like '%╨╛╤В╨┐╤А╨░╨▓%' then overall_status
        else 'тЬЕ ╨У╨╛╤В╨╛╨▓╨╛ ╨║ ╨╛╤В╨┐╤А╨░╨▓╨║╨╡'
      end,
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'warehouse_kit' then
    update public.orders
    set
      overall_status='ЁЯУж ╨Э╨░ ╨║╨╛╨╝╨┐╨╗╨╡╨║╤В╨░╤Ж╨╕╨╕',
      updated_at=now()
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'shipping' then
    update public.orders
    set
      overall_status='ЁЯУж ╨Э╨░ ╤Г╨┐╨░╨║╨╛╨▓╨║╨╡',
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


--
-- Name: web_set_stage_in_work(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_stage_in_work(p_order_id text, p_stage text, p_executor text DEFAULT NULL::text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
    when v_executor is null then 'ЁЯФи ╨Т ╤А╨░╨▒╨╛╤В╨╡'
    else 'ЁЯФи ╨Т ╤А╨░╨▒╨╛╤В╨╡ (' || v_executor || ')'
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


--
-- Name: web_set_stage_pause(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_stage_pause(p_order_id text, p_stage text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
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
      pilka_status='тП╕ ╨Я╨░╤Г╨╖╨░',
      pilka_pause_started_at=coalesce(pilka_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set
      kromka_status='тП╕ ╨Я╨░╤Г╨╖╨░',
      kromka_pause_started_at=coalesce(kromka_pause_started_at, v_now),
      updated_at=v_now
    where order_id=p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set
      pras_status='тП╕ ╨Я╨░╤Г╨╖╨░',
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


--
-- Name: web_set_stage_wait(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_stage_wait(p_order_id text, p_stage text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_row public.orders;
begin
  -- Only admin can force status rollback to "waiting".
  perform public.web_require_roles(array['admin']);

  if p_stage = 'pilka' then
    update public.orders
    set pilka_status = 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В ╨┐╨╕╨╗╤Г',
        pilka_done_at = null,
        pilka_started_at = null,
        pilka_pause_started_at = null,
        pilka_pause_acc_min = 0,
        updated_at = now()
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'kromka' then
    update public.orders
    set kromka_status = 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В',
        kromka_done_at = null,
        kromka_started_at = null,
        kromka_pause_started_at = null,
        kromka_pause_acc_min = 0,
        updated_at = now()
    where order_id = p_order_id
    returning * into v_row;
  elsif p_stage = 'pras' then
    update public.orders
    set pras_status = 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В',
        pras_done_at = null,
        pras_started_at = null,
        pras_pause_started_at = null,
        pras_pause_acc_min = 0,
        updated_at = now()
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


--
-- Name: web_set_strap_stock(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_strap_stock(p_strap_type text, p_color text, p_qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.strap_stock (strap_type, color, qty)
  VALUES (p_strap_type, p_color, GREATEST(0, p_qty))
  ON CONFLICT (strap_type, color) DO UPDATE
    SET qty = GREATEST(0, EXCLUDED.qty),
        updated_at = now();
END;
$$;


--
-- Name: web_set_warehouse_kit_done(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_warehouse_kit_done(p_order_id text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.orders;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin', 'warehouse']);

  update public.orders
  set overall_status = 'тЬЕ ╨Ъ╨╛╨╝╨┐╨╗╨╡╨║╤В╨░╤Ж╨╕╤П ╨│╨╛╤В╨╛╨▓╨░',
      updated_at = now()
  where order_id = trim(coalesce(p_order_id, ''))
    and pipeline_stage = 'warehouse_kit'
    and lower(coalesce(overall_status, '')) like '%╨▓ ╨║╨╛╨╝╨┐╨╗╨╡╨║╤В╨░╤Ж╨╕╨╕%'
  returning * into v_row;

  if v_row.order_id is null then
    raise exception 'Order not found or not in work: %', p_order_id;
  end if;

  return v_row;
end;
$$;


--
-- Name: web_set_warehouse_kit_in_work(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_warehouse_kit_in_work(p_order_id text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row public.orders;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin', 'warehouse']);

  update public.orders
  set overall_status = 'ЁЯФи ╨Т ╨║╨╛╨╝╨┐╨╗╨╡╨║╤В╨░╤Ж╨╕╨╕',
      updated_at = now()
  where order_id = trim(coalesce(p_order_id, ''))
    and pipeline_stage = 'warehouse_kit'
    and lower(coalesce(overall_status, '')) like '%╨╜╨░ ╨║╨╛╨╝╨┐╨╗╨╡╨║╤В╨░╤Ж╨╕╨╕%'
  returning * into v_row;

  if v_row.order_id is null then
    raise exception 'Order not found or not in queue: %', p_order_id;
  end if;

  return v_row;
end;
$$;


--
-- Name: web_set_work_schedule(numeric, text[], text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_set_work_schedule(p_hours_per_day numeric, p_working_days text[], p_work_start text, p_work_end text, p_lunch_start text, p_lunch_end text) RETURNS TABLE(hours_per_day numeric, working_days text[], weekend_days text[], work_start text, work_end text, lunch_start text, lunch_end text, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_hours numeric;
  v_days text[];
  v_work_start text;
  v_work_end text;
  v_lunch_start text;
  v_lunch_end text;
begin
  perform public.web_require_roles(array['admin']);

  v_hours := least(greatest(coalesce(p_hours_per_day, 8), 1), 24);
  v_days := array(
    select d
    from (
      select distinct lower(nullif(btrim(x), '')) as d
      from unnest(coalesce(p_working_days, array[]::text[])) as x
    ) y
    where d in ('mon','tue','wed','thu','fri','sat','sun')
    order by array_position(array['mon','tue','wed','thu','fri','sat','sun']::text[], d)
  );

  if coalesce(array_length(v_days, 1), 0) = 0 then
    v_days := array['mon','tue','wed','thu','fri'];
  end if;

  v_work_start := coalesce(nullif(btrim(p_work_start), ''), '08:00');
  v_work_end := coalesce(nullif(btrim(p_work_end), ''), '18:00');
  v_lunch_start := coalesce(nullif(btrim(p_lunch_start), ''), '12:00');
  v_lunch_end := coalesce(nullif(btrim(p_lunch_end), ''), '13:00');

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_work_hours_per_day', trim(to_char(v_hours, 'FM999999999.##')), now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_working_days', to_json(v_days)::text, now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_work_start', v_work_start, now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_work_end', v_work_end, now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_lunch_start', v_lunch_start, now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  insert into public.crm_runtime_settings (key, value_text, updated_at)
  values ('crm_lunch_end', v_lunch_end, now())
  on conflict (key) do update
  set value_text = excluded.value_text, updated_at = now();

  return query
  select r.hours_per_day, r.working_days, r.weekend_days, r.work_start, r.work_end, r.lunch_start, r.lunch_end, r.updated_at
  from public.web_get_work_schedule() r;
end;
$$;


--
-- Name: web_shipment_col_num(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_shipment_col_num(p_col text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when nullif(regexp_replace(coalesce(p_col, ''), '[^0-9]', '', 'g'), '') is not null
      and length(regexp_replace(coalesce(p_col, ''), '[^0-9]', '', 'g')) between 1 and 9
      then nullif(regexp_replace(coalesce(p_col, ''), '[^0-9]', '', 'g'), '')::integer
    else null
  end;
$$;


--
-- Name: web_skip_workshop_to_assembly(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_skip_workshop_to_assembly(p_order_id text) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_row public.orders;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  update public.orders
  set
    pilka_status = '╨У╨╛╤В╨╛╨▓╨╛',
    kromka_status = '╨У╨╛╤В╨╛╨▓╨╛',
    pras_status = '╨У╨╛╤В╨╛╨▓╨╛',
    assembly_status = 'тП│ ╨Ю╨╢╨╕╨┤╨░╨╡╤В',
    overall_status = 'ЁЯЯб ╨Ъ ╤Б╨▒╨╛╤А╨║╨╡',
    updated_at = now()
  where trim(coalesce(order_id, '')) = trim(coalesce(p_order_id, ''))
  returning * into v_row;

  if v_row.order_id is null then
    raise exception 'Order not found: %', p_order_id;
  end if;

  return v_row;
end;
$$;


--
-- Name: web_split_shipment_plan_cell(text, text, numeric, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_split_shipment_plan_cell(p_row text, p_col text, p_qty_keep numeric, p_target_week text, p_qty_move numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  src public.shipment_plan_cells%ROWTYPE;
  tgt public.shipment_plan_cells%ROWTYPE;
  v_keep NUMERIC := GREATEST(0, coalesce(p_qty_keep, 0));
  v_move NUMERIC := GREATEST(0, coalesce(p_qty_move, 0));
  v_target_week TEXT := public.web_norm_week_key(p_target_week);
  v_target_col TEXT;
  v_output NUMERIC;
  v_sheets NUMERIC;
  v_target_qty NUMERIC;
BEGIN
  PERFORM public.web_require_roles(ARRAY['manager', 'admin']);
  IF coalesce(trim(p_row), '') = '' OR coalesce(trim(p_col), '') = '' THEN RAISE EXCEPTION 'Row/col are required'; END IF;
  IF v_target_week = '' THEN RAISE EXCEPTION 'Target week is required'; END IF;
  IF v_keep <= 0 OR v_move <= 0 THEN RAISE EXCEPTION '╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛ ╨▓ ╨║╨░╨╢╨┤╨╛╨╣ ╤З╨░╤Б╤В╨╕ ╨┤╨╛╨╗╨╢╨╜╨╛ ╨▒╤Л╤В╤М ╨▒╨╛╨╗╤М╤И╨╡ 0'; END IF;
  SELECT * INTO src FROM public.shipment_plan_cells spc WHERE spc.source_row_id = trim(p_row) AND spc.source_col_id = trim(p_col) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION '╨п╤З╨╡╨╣╨║╨░ ╨┐╨╗╨░╨╜╨░ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜╨░'; END IF;
  IF coalesce(src.in_work, FALSE) OR NOT coalesce(src.can_send_to_work, FALSE) THEN RAISE EXCEPTION '╨Я╨╛╨╖╨╕╤Ж╨╕╤П ╨╜╨╡╨┤╨╛╤Б╤В╤Г╨┐╨╜╨░ ╨┤╨╗╤П ╤А╨░╨╖╨┤╨╡╨╗╨╡╨╜╨╕╤П'; END IF;
  IF v_keep + v_move <> coalesce(src.qty, 0) THEN RAISE EXCEPTION '╨б╤Г╨╝╨╝╨░ ╤З╨░╤Б╤В╨╡╨╣ ╨┤╨╛╨╗╨╢╨╜╨░ ╤А╨░╨▓╨╜╤П╤В╤М╤Б╤П ╨║╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╤Г ╨▓ ╨┐╨╗╨░╨╜╨╡'; END IF;
  IF public.web_norm_week_key(src.week) = v_target_week THEN RAISE EXCEPTION '╨ж╨╡╨╗╨╡╨▓╨╛╨╣ ╨┐╨╗╨░╨╜ ╨┤╨╛╨╗╨╢╨╡╨╜ ╨╛╤В╨╗╨╕╤З╨░╤В╤М╤Б╤П ╨╛╤В ╤В╨╡╨║╤Г╤Й╨╡╨│╨╛'; END IF;
  v_output := public.web_resolve_output_per_sheet(src.section_name, src.item, src.material, NULL, coalesce(src.output_per_sheet, 0));
  v_sheets := CASE WHEN v_output > 0 THEN ceil(v_keep / v_output) ELSE 0 END;
  UPDATE public.shipment_plan_cells SET qty = v_keep, sheets_needed = v_sheets, can_send_to_work = TRUE, in_work = FALSE, updated_at = now() WHERE id = src.id;
  v_target_col := v_target_week;
  SELECT * INTO tgt FROM public.shipment_plan_cells spc WHERE public.web_norm_week_key(spc.week) = v_target_week AND public.web_norm_item_key(spc.section_name) = public.web_norm_item_key(src.section_name) AND public.web_norm_item_key(spc.item) = public.web_norm_item_key(src.item) AND public.web_norm_item_key(coalesce(spc.material, '')) = public.web_norm_item_key(coalesce(src.material, '')) ORDER BY spc.updated_at DESC NULLS LAST, spc.id DESC LIMIT 1;
  IF FOUND THEN
    IF coalesce(tgt.in_work, FALSE) OR NOT coalesce(tgt.can_send_to_work, FALSE) THEN RAISE EXCEPTION '╨Т ╤Ж╨╡╨╗╨╡╨▓╨╛╨╝ ╨┐╨╗╨░╨╜╨╡ ╤Г╨╢╨╡ ╨╡╤Б╤В╤М ╤Н╤В╨░ ╨┐╨╛╨╖╨╕╤Ж╨╕╤П, ╨╜╨╛ ╨╛╨╜╨░ ╨╜╨╡╨┤╨╛╤Б╤В╤Г╨┐╨╜╨░'; END IF;
    v_target_qty := coalesce(tgt.qty, 0) + v_move;
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_target_qty / v_output) ELSE 0 END;
    UPDATE public.shipment_plan_cells SET qty = v_target_qty, sheets_needed = v_sheets, updated_at = now() WHERE id = tgt.id;
  ELSE
    v_target_qty := v_move;
    v_sheets := CASE WHEN v_output > 0 THEN ceil(v_target_qty / v_output) ELSE 0 END;
    INSERT INTO public.shipment_plan_cells (section_name, item, material, week, qty, row_ref, col_ref, source_row_id, source_col_id, bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note) VALUES (src.section_name, src.item, src.material, v_target_week, v_target_qty, src.source_row_id, v_target_col, src.source_row_id, v_target_col, coalesce(nullif(trim(src.bg), ''), '#ffffff'), TRUE, FALSE, v_sheets, coalesce(src.available_sheets, 0), v_output, 'split from plan ' || src.week);
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'source_week', src.week, 'source_qty', v_keep, 'target_week', v_target_week, 'target_qty', v_target_qty);
END;
$$;


--
-- Name: web_sync_labor_fact_from_order(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_sync_labor_fact_from_order(p_order_id text) RETURNS public.labor_facts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  return public.sync_labor_fact_from_order(p_order_id);
end;
$$;


--
-- Name: web_sync_plan_cell_to_shipment_cells(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_sync_plan_cell_to_shipment_cells() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_product_article text := nullif(trim(coalesce(new.product_article, '')), '');
begin
  if tg_op = 'DELETE' then
    delete from public.shipment_cells
    where source_row_id = old.source_row_id
      and source_col_id = old.source_col_id;
    return old;
  end if;

  if v_product_article is null then
    v_product_article := public.web_extract_article_from_item(new.item);
  end if;

  v_output_per_sheet := public.web_resolve_output_per_sheet(
    new.section_name,
    new.item,
    new.material,
    coalesce(new.output_per_sheet, 0)
  );

  v_sheets_needed := case
    when coalesce(new.sheets_needed, 0) > 0 then coalesce(new.sheets_needed, 0)
    when v_output_per_sheet > 0 and coalesce(new.qty, 0) > 0 then ceil(new.qty / v_output_per_sheet)
    else 0
  end;

  insert into public.shipment_cells (
    source_row_id, source_col_id, section_name, item, material, week, qty,
    bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note, product_article
  )
  values (
    new.source_row_id, new.source_col_id, new.section_name, new.item, new.material, new.week, new.qty,
    coalesce(new.bg, '#ffffff'), coalesce(new.can_send_to_work, true), coalesce(new.in_work, false),
    v_sheets_needed, coalesce(new.available_sheets, 0), v_output_per_sheet,
    coalesce(new.note, ''), v_product_article
  )
  on conflict (source_row_id, source_col_id)
  do update set
    section_name = excluded.section_name,
    item = excluded.item,
    material = excluded.material,
    week = excluded.week,
    qty = excluded.qty,
    bg_color = excluded.bg_color,
    can_send_to_work = excluded.can_send_to_work,
    in_work = excluded.in_work,
    sheets_needed = excluded.sheets_needed,
    available_sheets = excluded.available_sheets,
    output_per_sheet = excluded.output_per_sheet,
    note = excluded.note,
    product_article = excluded.product_article,
    updated_at = now();

  return new;
end;
$$;


--
-- Name: web_transition_metal_stage(bigint, text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_transition_metal_stage(p_item_id bigint, p_action text, p_start_stage text DEFAULT NULL::text, p_done_qty numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text) RETURNS TABLE(id bigint, article text, name text, week text, qty numeric, current_stage text, stage_status text, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_item public.metal_work_items%rowtype;
  v_start_stage text := lower(trim(coalesce(p_start_stage, '')));
  v_emit_event boolean := true;
  v_route text[];
  v_idx integer;
  v_next_stage text;
  v_remaining numeric;
  v_done numeric;
  v_note text;
  v_event_note text;
  v_shortfall numeric := 0;
  v_new_qty numeric;
  v_stage_complete boolean := false;
  v_event_stage text;
  v_qty_before_order numeric;
  v_event_done_qty numeric;
  v_event_qty_before numeric;
  v_event_qty_after numeric;
  v_graph jsonb;
  v_plan jsonb;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_action not in ('start', 'pause', 'resume', 'done') then
    raise exception 'unsupported action';
  end if;

  v_event_note := nullif(trim(coalesce(p_note, '')), '');

  select mwi.* into v_item
  from public.metal_work_items mwi
  where mwi.id = p_item_id
  for update;

  if v_item.id is null then raise exception 'work item not found'; end if;
  if v_item.status in ('done', 'cancelled', 'split') then
    raise exception 'work item already completed or split';
  end if;

  v_route := coalesce(v_item.stage_route, array['laser', 'bending', 'welding', 'painting']);
  if array_length(v_route, 1) is null or array_length(v_route, 1) < 1 then
    v_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  v_idx := greatest(0, coalesce(v_item.route_idx, 0));

  if v_action = 'start' then
    if v_item.stage_status <> 'queued' then
      raise exception 'stage must be queued for start';
    end if;

    if v_item.status = 'planned' then
      v_graph := v_item.process_graph;
      if v_graph is null then
        select coalesce(c.process_graph, public.metal_linear_route_to_graph(c.stage_route))
        into v_graph
        from public.metal_product_catalog c
        where c.article = v_item.article;
      end if;
      v_plan := public.metal_extract_fork_plan(v_graph);

      if coalesce(v_plan->>'mode', '') = 'parallel' then
        perform public.metal_fork_planned_item(v_item.id);
        v_emit_event := false;
        return query
        select mwi.id, mwi.article, mwi.name, mwi.week, mwi.qty,
               mwi.current_stage, mwi.stage_status, mwi.status,
               mwi.created_at, mwi.updated_at
        from public.metal_work_items mwi
        where mwi.id = v_item.id;
        return;
      end if;

      if v_start_stage = '' then
        v_start_stage := lower(trim(coalesce(v_route[v_idx + 1], v_item.current_stage)));
      end if;

      select coalesce(
        (select min(i) - 1 from generate_subscripts(v_route, 1) as i where lower(v_route[i]) = v_start_stage and i - 1 >= v_idx),
        (select min(i) - 1 from generate_subscripts(v_route, 1) as i where lower(v_route[i]) = v_start_stage),
        0
      ) into v_idx;

      update public.metal_work_items mwi
      set status = 'active', route_idx = v_idx,
          current_stage = lower(trim(coalesce(v_route[v_idx + 1], v_start_stage))),
          stage_status = 'queued', stage_done_qty = 0,
          current_stage_started_at = null, updated_at = now()
      where mwi.id = v_item.id;
      v_emit_event := false;
    else
      update public.metal_work_items mwi
      set status = 'active', stage_status = 'in_progress',
          current_stage_started_at = now(), updated_at = now()
      where mwi.id = v_item.id;
    end if;

  elsif v_action = 'pause' then
    if v_item.stage_status <> 'in_progress' then raise exception 'stage must be in_progress for pause'; end if;
    update public.metal_work_items mwi set stage_status = 'paused', updated_at = now() where mwi.id = v_item.id;

  elsif v_action = 'resume' then
    if v_item.stage_status <> 'paused' then raise exception 'stage must be paused for resume'; end if;
    update public.metal_work_items mwi set stage_status = 'in_progress', updated_at = now() where mwi.id = v_item.id;

  else
    if v_item.stage_status not in ('in_progress', 'paused') then
      raise exception 'stage must be in_progress or paused for done';
    end if;

    v_event_stage := v_item.current_stage;
    v_qty_before_order := v_item.qty;
    v_remaining := greatest(0, v_item.qty - coalesce(v_item.stage_done_qty, 0));
    v_done := coalesce(p_done_qty, v_remaining);
    v_note := v_event_note;

    if v_done < 0 or v_done > v_remaining then
      raise exception 'done_qty must be between 0 and remaining qty';
    end if;

    if v_done < v_remaining and v_note is not null then
      v_new_qty := coalesce(v_item.stage_done_qty, 0) + v_done;
      v_shortfall := v_item.qty - v_new_qty;

      update public.metal_work_items mwi
      set
        qty = v_new_qty,
        stage_done_qty = v_new_qty,
        shortfall_qty = mwi.shortfall_qty + v_shortfall,
        updated_at = now()
      where mwi.id = v_item.id;

      perform public.metal_propagate_fork_qty(p_item_id, v_new_qty);

      select mwi.* into v_item from public.metal_work_items mwi where mwi.id = p_item_id;
      v_stage_complete := true;
    else
      update public.metal_work_items mwi
      set stage_done_qty = least(mwi.qty, mwi.stage_done_qty + v_done), updated_at = now()
      where mwi.id = v_item.id;

      select mwi.* into v_item from public.metal_work_items mwi where mwi.id = p_item_id;

      if v_item.stage_done_qty < v_item.qty then
        update public.metal_work_items mwi
        set stage_status = 'paused', current_stage_started_at = null, updated_at = now()
        where mwi.id = v_item.id;
        v_stage_complete := false;
      else
        v_stage_complete := true;
      end if;
    end if;

    v_event_done_qty := v_done;
    if v_shortfall > 0 then
      v_event_qty_after := v_item.qty;
      v_event_qty_before := v_item.qty + v_shortfall;
    else
      v_event_qty_before := v_qty_before_order;
      v_event_qty_after := v_item.qty;
    end if;

    if v_stage_complete then
      v_idx := coalesce(v_item.route_idx, v_idx);
      if v_idx >= array_length(v_route, 1) - 1 then
        v_next_stage := null;
      else
        v_next_stage := lower(trim(coalesce(v_route[v_idx + 2], '')));
      end if;

      if v_next_stage is null or v_next_stage = '' then
        update public.metal_work_items mwi
        set stage_status = 'done', status = 'done', current_stage_started_at = null, updated_at = now()
        where mwi.id = v_item.id;
      else
        update public.metal_work_items mwi
        set route_idx = v_idx + 1, current_stage = v_next_stage,
            stage_status = 'queued', stage_done_qty = 0,
            current_stage_started_at = null, updated_at = now()
        where mwi.id = v_item.id;
      end if;

      select mwi.* into v_item from public.metal_work_items mwi where mwi.id = p_item_id;

      if v_item.fork_role = 'branch' and v_item.status = 'done' then
        perform public.metal_try_spawn_merge_item(v_item.fork_group_id);
      end if;

      if v_item.fork_role = 'merge' and v_item.status = 'done' and v_item.parent_id is not null then
        update public.metal_work_items mwi
        set status = 'done', stage_status = 'done', updated_at = now()
        where mwi.id = v_item.parent_id and mwi.status = 'split';
      end if;
    end if;
  end if;

  if v_emit_event then
    insert into public.metal_stage_events(
      work_item_id, stage, action, note,
      shortfall_added, done_qty, qty_before, qty_after
    )
    values (
      v_item.id,
      coalesce(v_event_stage, v_item.current_stage),
      v_action,
      v_event_note,
      case when v_action = 'done' and v_shortfall > 0 then v_shortfall else null end,
      case when v_action = 'done' then v_event_done_qty else null end,
      case when v_action = 'done' then v_event_qty_before else null end,
      case when v_action = 'done' then v_event_qty_after else null end
    );
  end if;

  return query
  select mwi.id, mwi.article, mwi.name, mwi.week, mwi.qty,
         mwi.current_stage, mwi.stage_status, mwi.status,
         mwi.created_at, mwi.updated_at
  from public.metal_work_items mwi
  where mwi.id = v_item.id;
end;
$$;


--
-- Name: web_update_materials_stock_sheet_size(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_update_materials_stock_sheet_size(p_material text, p_size_label text) RETURNS TABLE(material text, qty_sheets numeric, size_label text, sheet_width_mm integer, sheet_height_mm integer, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $_$
declare
  v_material text := trim(coalesce(p_material, ''));
  v_norm_key text;
  v_size_label text := lower(trim(coalesce(p_size_label, '')));
  v_width integer;
  v_height integer;
  v_material_row text;
  v_match text[];
begin
  perform public.web_require_roles(array['warehouse', 'manager', 'admin']);

  if v_material = '' then
    raise exception 'Material is required';
  end if;

  v_norm_key := lower(trim(regexp_replace(replace(v_material, '╤С', '╨╡'), '\s+', ' ', 'g')));

  if v_size_label = '' or v_size_label = '-' then
    v_width := null;
    v_height := null;
    v_size_label := null;
  else
    v_match := regexp_match(replace(replace(v_size_label, '├Ч', 'x'), ' ', ''), '^(\d+)x(\d+)$');
    if v_match is null then
      raise exception 'Invalid size format. Use 2800x2070';
    end if;
    v_width := v_match[1]::integer;
    v_height := v_match[2]::integer;
    if v_width <= 0 or v_height <= 0 then
      raise exception 'Invalid size format. Use 2800x2070';
    end if;
    v_size_label := v_width::text || 'x' || v_height::text;
  end if;

  select ms.material
  into v_material_row
  from public.materials_stock ms
  where lower(trim(regexp_replace(replace(trim(ms.material), '╤С', '╨╡'), '\s+', ' ', 'g'))) = v_norm_key
  limit 1;

  if v_material_row is null then
    raise exception 'Material not found in stock';
  end if;

  update public.materials_stock ms
  set
    size_label = v_size_label,
    sheet_width_mm = v_width,
    sheet_height_mm = v_height,
    updated_at = now()
  where lower(trim(regexp_replace(replace(trim(ms.material), '╤С', '╨╡'), '\s+', ' ', 'g'))) = v_norm_key;

  if v_size_label is not null then
    insert into public.material_size_map(material_name, sheet_size, source, updated_at)
    values (v_material_row, v_size_label, 'warehouse:ui', now())
    on conflict (material_name) do update
      set
        sheet_size = excluded.sheet_size,
        source = excluded.source,
        updated_at = now();
  else
    delete from public.material_size_map msm
    where lower(trim(regexp_replace(replace(trim(msm.material_name), '╤С', '╨╡'), '\s+', ' ', 'g'))) = v_norm_key;
  end if;

  return query
  select
    ms.material,
    coalesce(ms.qty_sheets, 0)::numeric as qty_sheets,
    ms.size_label,
    ms.sheet_width_mm,
    ms.sheet_height_mm,
    ms.updated_at
  from public.materials_stock ms
  where lower(trim(regexp_replace(replace(trim(ms.material), '╤С', '╨╡'), '\s+', ' ', 'g'))) = v_norm_key;
end;
$_$;


--
-- Name: web_update_shipment_plan_cell_by_source(text, text, text, text, text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_update_shipment_plan_cell_by_source(p_row text, p_col text, p_section_name text, p_item text, p_material text, p_week text, p_qty numeric) RETURNS public.shipment_cells
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_src public.shipment_plan_cells%rowtype;
  v_section text := coalesce(nullif(trim(p_section_name), ''), '╨Я╤А╨╛╤З╨╡╨╡');
  v_item text := coalesce(nullif(trim(p_item), ''), '');
  v_material text := nullif(trim(coalesce(p_material, '')), '');
  v_week text := coalesce(nullif(trim(p_week), ''), '');
  v_qty numeric := coalesce(p_qty, 0);
  v_col_key text;
  v_row_key text;
  v_output_per_sheet numeric := 0;
  v_sheets_needed numeric := 0;
  v_cell public.shipment_cells;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if coalesce(trim(p_row), '') = '' or coalesce(trim(p_col), '') = '' then
    raise exception 'Row/col are required';
  end if;
  if v_item = '' then
    raise exception 'Item is required';
  end if;
  if v_week = '' then
    raise exception 'Week is required';
  end if;
  if v_qty <= 0 then
    raise exception 'Qty must be > 0';
  end if;

  select *
    into v_src
  from public.shipment_plan_cells spc
  where spc.source_row_id = trim(p_row)
    and spc.source_col_id = trim(p_col)
  limit 1;

  if not found then
    raise exception '╨п╤З╨╡╨╣╨║╨░ ╨┐╨╗╨░╨╜╨░ ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜╨░: row %, col %', p_row, p_col;
  end if;

  if coalesce(v_src.in_work, false) or not coalesce(v_src.can_send_to_work, false) then
    raise exception '╨Я╨╛╨╖╨╕╤Ж╨╕╤П ╨╜╨╡╨┤╨╛╤Б╤В╤Г╨┐╨╜╨░ ╨┤╨╗╤П ╤А╨╡╨┤╨░╨║╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П (╤Г╨╢╨╡ ╨▓ ╤А╨░╨▒╨╛╤В╨╡ ╨╕╨╗╨╕ ╨╖╨░╨║╤А╤Л╤В╨░)';
  end if;

  if public.web_plan_cell_has_active_order(
    v_src.source_row_id, v_src.item, v_src.material, v_src.week
  ) then
    raise exception '╨Э╨╡╨╗╤М╨╖╤П ╤А╨╡╨┤╨░╨║╤В╨╕╤А╨╛╨▓╨░╤В╤М: ╨╡╤Б╤В╤М ╨░╨║╤В╨╕╨▓╨╜╤Л╨╣ ╨╖╨░╨║╨░╨╖ ╨▓ ╨┐╤А╨╛╨╕╨╖╨▓╨╛╨┤╤Б╤В╨▓╨╡';
  end if;

  v_col_key := public.web_norm_week_key(v_week);
  v_week := v_col_key;
  v_row_key := trim(p_row);
  v_output_per_sheet := public.web_resolve_output_per_sheet(v_section, v_item, v_material, 0::numeric);
  v_sheets_needed := case when v_output_per_sheet > 0 then ceil(v_qty / v_output_per_sheet) else 0 end;

  if v_col_key <> trim(p_col) then
    delete from public.shipment_plan_cells
    where source_row_id = v_row_key
      and source_col_id = trim(p_col);

    delete from public.shipment_cells
    where source_row_id = v_row_key
      and source_col_id = trim(p_col)
      and coalesce(in_work, false) = false;

    insert into public.shipment_plan_cells (
      section_name, item, material, week, qty,
      row_ref, col_ref, source_row_id, source_col_id,
      bg, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
    )
    values (
      v_section, v_item, v_material, v_week, v_qty,
      v_row_key, v_col_key, v_row_key, v_col_key,
      coalesce(nullif(trim(v_src.bg), ''), '#ffffff'), true, false,
      v_sheets_needed, coalesce(v_src.available_sheets, 0), v_output_per_sheet,
      coalesce(nullif(trim(v_src.note), ''), 'manual plan')
    )
    on conflict (source_row_id, source_col_id)
    do update set
      section_name = excluded.section_name,
      item = excluded.item,
      material = excluded.material,
      week = excluded.week,
      qty = excluded.qty,
      sheets_needed = excluded.sheets_needed,
      output_per_sheet = excluded.output_per_sheet,
      can_send_to_work = true,
      in_work = false,
      updated_at = now();

    insert into public.shipment_cells (
      source_row_id, source_col_id, section_name, item, material, week, qty,
      bg_color, can_send_to_work, in_work, sheets_needed, available_sheets, output_per_sheet, note
    )
    values (
      v_row_key, v_col_key, v_section, v_item, v_material, v_week, v_qty,
      coalesce(nullif(trim(v_src.bg), ''), '#ffffff'), true, false,
      v_sheets_needed, coalesce(v_src.available_sheets, 0), v_output_per_sheet,
      coalesce(nullif(trim(v_src.note), ''), 'manual plan')
    )
    on conflict (source_row_id, source_col_id)
    do update set
      section_name = excluded.section_name,
      item = excluded.item,
      material = excluded.material,
      week = excluded.week,
      qty = excluded.qty,
      sheets_needed = excluded.sheets_needed,
      available_sheets = excluded.available_sheets,
      output_per_sheet = excluded.output_per_sheet,
      can_send_to_work = true,
      in_work = false,
      note = excluded.note,
      updated_at = now();
  else
    update public.shipment_plan_cells
    set section_name = v_section,
        item = v_item,
        material = v_material,
        week = v_week,
        qty = v_qty,
        sheets_needed = v_sheets_needed,
        output_per_sheet = v_output_per_sheet,
        can_send_to_work = true,
        in_work = false,
        updated_at = now()
    where source_row_id = v_row_key
      and source_col_id = trim(p_col);

    update public.shipment_cells
    set section_name = v_section,
        item = v_item,
        material = v_material,
        week = v_week,
        qty = v_qty,
        sheets_needed = v_sheets_needed,
        output_per_sheet = v_output_per_sheet,
        can_send_to_work = true,
        in_work = false,
        updated_at = now()
    where source_row_id = v_row_key
      and source_col_id = trim(p_col)
      and coalesce(in_work, false) = false;
  end if;

  select *
    into v_cell
  from public.shipment_cells
  where source_row_id = v_row_key
    and source_col_id = v_col_key
  limit 1;

  return v_cell;
end;
$$;


--
-- Name: web_upsert_cutting_catalog_kit(bigint, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_cutting_catalog_kit(p_id bigint DEFAULT 0, p_name text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb, p_sort_order integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row public.cutting_catalog_kits;
  v_name TEXT := nullif(trim(coalesce(p_name, '')), '');
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  IF v_name IS NULL THEN
    RAISE EXCEPTION '╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡ ╨║╨╛╨╝╨┐╨╗╨╡╨║╤В╨░ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╨╛';
  END IF;

  IF coalesce(p_id, 0) > 0 THEN
    UPDATE public.cutting_catalog_kits
    SET
      name = v_name,
      items = coalesce(p_items, '[]'::jsonb),
      sort_order = coalesce(p_sort_order, 0)
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION '╨Ъ╨╛╨╝╨┐╨╗╨╡╨║╤В ╤Б id % ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜', p_id;
    END IF;
  ELSE
    INSERT INTO public.cutting_catalog_kits (name, items, sort_order)
    VALUES (v_name, coalesce(p_items, '[]'::jsonb), coalesce(p_sort_order, 0))
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'items', v_row.items,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;


--
-- Name: web_upsert_cutting_job(bigint, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_cutting_job(p_id bigint, p_name text, p_settings jsonb, p_items jsonb) RETURNS TABLE(id bigint, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF p_id IS NULL OR p_id = 0 THEN
    RETURN QUERY
      INSERT INTO public.cutting_jobs (name, settings, items)
      VALUES (p_name, p_settings, p_items)
      RETURNING cutting_jobs.id, cutting_jobs.updated_at;
  ELSE
    RETURN QUERY
      INSERT INTO public.cutting_jobs (id, name, settings, items)
      VALUES (p_id, p_name, p_settings, p_items)
      ON CONFLICT ON CONSTRAINT cutting_jobs_pkey DO UPDATE
        SET name       = EXCLUDED.name,
            settings   = EXCLUDED.settings,
            items      = EXCLUDED.items,
            updated_at = now()
      RETURNING cutting_jobs.id, cutting_jobs.updated_at;
  END IF;
END;
$$;


--
-- Name: web_upsert_furniture_custom_template(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_furniture_custom_template(p_product_name text, p_details jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
  v_details jsonb := coalesce(p_details, '[]'::jsonb);
  v_row public.furniture_custom_templates;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_name = '' then
    raise exception 'product_name is required';
  end if;
  if jsonb_typeof(v_details) <> 'array' then
    raise exception 'details must be a json array';
  end if;

  insert into public.furniture_custom_templates (product_name, details, created_by)
  values (v_name, v_details, auth.uid())
  on conflict (product_name)
  do update set details = excluded.details
  returning * into v_row;

  return jsonb_build_object(
    'product_name', v_row.product_name,
    'details', v_row.details,
    'updated_at', v_row.updated_at
  );
end;
$$;


--
-- Name: web_upsert_furniture_custom_template(text, jsonb, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_furniture_custom_template(p_product_name text, p_details jsonb DEFAULT '[]'::jsonb, p_kits_per_sheet numeric DEFAULT 0, p_material_yields jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_name text := trim(coalesce(p_product_name, ''));
  v_details jsonb := coalesce(p_details, '[]'::jsonb);
  v_kits numeric := coalesce(p_kits_per_sheet, 0);
  v_yields jsonb := coalesce(p_material_yields, '[]'::jsonb);
  v_row public.furniture_custom_templates;
  v_elem jsonb;
  v_material text;
  v_yield_kits numeric;
  v_clean jsonb := '[]'::jsonb;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);
  if v_name = '' then
    raise exception 'product_name is required';
  end if;
  if jsonb_typeof(v_details) <> 'array' then
    raise exception 'details must be a json array';
  end if;
  if jsonb_typeof(v_yields) <> 'array' then
    raise exception 'material_yields must be a json array';
  end if;
  if v_kits < 0 then
    v_kits := 0;
  end if;

  for v_elem in select value from jsonb_array_elements(v_yields)
  loop
    v_material := trim(coalesce(v_elem->>'material', ''));
    v_yield_kits := coalesce((v_elem->>'kits_per_sheet')::numeric, 0);
    if v_material = '' or v_yield_kits <= 0 then
      continue;
    end if;
    v_clean := v_clean || jsonb_build_array(
      jsonb_build_object('material', v_material, 'kits_per_sheet', v_yield_kits)
    );
  end loop;

  insert into public.furniture_custom_templates (product_name, details, kits_per_sheet, material_yields, created_by)
  values (v_name, v_details, v_kits, v_clean, auth.uid())
  on conflict (product_name)
  do update set
    details = excluded.details,
    kits_per_sheet = excluded.kits_per_sheet,
    material_yields = excluded.material_yields
  returning * into v_row;

  return jsonb_build_object(
    'product_name', v_row.product_name,
    'details', v_row.details,
    'kits_per_sheet', v_row.kits_per_sheet,
    'material_yields', coalesce(v_row.material_yields, '[]'::jsonb),
    'updated_at', v_row.updated_at
  );
end;
$$;


--
-- Name: web_upsert_gx_shelf_catalog_item(bigint, text, text, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_gx_shelf_catalog_item(p_id bigint DEFAULT 0, p_code text DEFAULT ''::text, p_name text DEFAULT ''::text, p_color text DEFAULT NULL::text, p_pairs jsonb DEFAULT '[]'::jsonb, p_sort_order integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row public.gx_shelf_catalog;
  v_code TEXT := nullif(trim(coalesce(p_code, '')), '');
  v_name TEXT := nullif(trim(coalesce(p_name, '')), '');
  v_color TEXT := nullif(trim(coalesce(p_color, '')), '');
  v_pairs JSONB := coalesce(p_pairs, '[]'::jsonb);
  v_code_norm TEXT;
BEGIN
  PERFORM public.web_require_roles(ARRAY['operator', 'manager', 'admin']);

  IF v_code IS NULL THEN
    RAISE EXCEPTION '╨Р╤А╤В╨╕╨║╤Г╨╗ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╨╡╨╜';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION '╨Э╨░╨╕╨╝╨╡╨╜╨╛╨▓╨░╨╜╨╕╨╡ ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╨╛';
  END IF;
  IF jsonb_typeof(v_pairs) IS DISTINCT FROM 'array' OR jsonb_array_length(v_pairs) = 0 THEN
    RAISE EXCEPTION '╨Ф╨╛╨▒╨░╨▓╤М╤В╨╡ ╤Е╨╛╤В╤П ╨▒╤Л ╨╛╨┤╨╜╤Г ╨┐╨╛╨╗╨║╤Г ╤Б ╨║╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛╨╝';
  END IF;

  v_code_norm := upper(btrim(v_code));

  IF coalesce(p_id, 0) > 0 THEN
    UPDATE public.gx_shelf_catalog
    SET
      code = v_code,
      name = v_name,
      color = v_color,
      pairs = v_pairs,
      sort_order = coalesce(p_sort_order, 0)
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION '╨Я╨╛╨╖╨╕╤Ж╨╕╤П ╤Б id % ╨╜╨╡ ╨╜╨░╨╣╨┤╨╡╨╜╨░', p_id;
    END IF;
  ELSE
    SELECT * INTO v_row
    FROM public.gx_shelf_catalog
    WHERE upper(btrim(code)) = v_code_norm
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.gx_shelf_catalog
      SET
        code = v_code,
        name = v_name,
        color = v_color,
        pairs = v_pairs,
        sort_order = coalesce(p_sort_order, 0)
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.gx_shelf_catalog (code, name, color, pairs, sort_order)
      VALUES (v_code, v_name, v_color, v_pairs, coalesce(p_sort_order, 0))
      RETURNING * INTO v_row;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'name', v_row.name,
    'color', v_row.color,
    'pairs', v_row.pairs,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;


--
-- Name: web_upsert_hardware_bom_row(bigint, bigint, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_hardware_bom_row(p_id bigint, p_hardware_item_id bigint, p_bom_product text, p_qty numeric DEFAULT 0) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_product TEXT   := trim(coalesce(p_bom_product, ''));
  v_item    BIGINT := p_hardware_item_id;
  v_qty     NUMERIC := coalesce(p_qty, 0);
  v_id      BIGINT;
BEGIN
  IF v_product = '' THEN
    RAISE EXCEPTION 'bom_product is required';
  END IF;
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'hardware_item_id is required';
  END IF;
  IF v_qty < 0 THEN
    RAISE EXCEPTION 'qty must be >= 0';
  END IF;

  IF p_id IS NOT NULL AND p_id > 0 THEN
    UPDATE public.hardware_bom
      SET hardware_item_id = v_item,
          bom_product = v_product,
          qty_per_unit = v_qty
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'hardware_bom row % not found', p_id;
    END IF;
    RETURN v_id;
  END IF;

  INSERT INTO public.hardware_bom (hardware_item_id, bom_product, qty_per_unit)
  VALUES (v_item, v_product, v_qty)
  ON CONFLICT (hardware_item_id, lower(trim(bom_product)))
  DO UPDATE SET qty_per_unit = EXCLUDED.qty_per_unit
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: web_upsert_hardware_item(bigint, text, text, text, integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_hardware_item(p_id bigint, p_name text, p_size text DEFAULT ''::text, p_unit text DEFAULT '╤И╤В'::text, p_sort_order integer DEFAULT 100, p_photo_url text DEFAULT NULL::text, p_is_active boolean DEFAULT true) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE v_name TEXT := trim(coalesce(p_name, '')); v_size TEXT := trim(coalesce(p_size, '')); v_id BIGINT;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'hardware name is required'; END IF;
  IF p_id IS NOT NULL AND p_id > 0 THEN
    UPDATE public.hardware_items SET name = v_name, size = v_size, unit = coalesce(nullif(trim(p_unit), ''), '╤И╤В'),
      sort_order = coalesce(p_sort_order, 100), photo_url = p_photo_url, is_active = coalesce(p_is_active, TRUE)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'hardware item % not found', p_id; END IF;
    RETURN v_id;
  END IF;
  INSERT INTO public.hardware_items (name, size, unit, sort_order, photo_url, is_active)
  VALUES (v_name, v_size, coalesce(nullif(trim(p_unit), ''), '╤И╤В'), coalesce(p_sort_order, 100), p_photo_url, coalesce(p_is_active, TRUE))
  ON CONFLICT (lower(trim(name)), lower(trim(coalesce(size, '')))) DO UPDATE
    SET unit = EXCLUDED.unit, sort_order = EXCLUDED.sort_order, photo_url = EXCLUDED.photo_url, is_active = EXCLUDED.is_active
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: web_upsert_hardware_product_map_row(bigint, text, text, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_hardware_product_map_row(p_id bigint, p_bom_product text, p_section_name text DEFAULT NULL::text, p_item_name_pattern text DEFAULT NULL::text, p_sort_order integer DEFAULT 100, p_is_active boolean DEFAULT true) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE v_product TEXT := trim(coalesce(p_bom_product, '')); v_section TEXT := nullif(trim(coalesce(p_section_name, '')), '');
  v_pattern TEXT := nullif(trim(coalesce(p_item_name_pattern, '')), ''); v_id BIGINT;
BEGIN
  IF v_product = '' THEN RAISE EXCEPTION 'bom_product is required'; END IF;
  IF v_section IS NULL AND v_pattern IS NULL THEN RAISE EXCEPTION 'either section_name or item_name_pattern is required'; END IF;
  IF p_id IS NOT NULL AND p_id > 0 THEN
    UPDATE public.hardware_product_map SET bom_product = v_product, section_name = v_section, item_name_pattern = v_pattern,
      sort_order = coalesce(p_sort_order, 100), is_active = coalesce(p_is_active, TRUE) WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'hardware_product_map row % not found', p_id; END IF;
    RETURN v_id;
  END IF;
  INSERT INTO public.hardware_product_map (bom_product, section_name, item_name_pattern, sort_order, is_active)
  VALUES (v_product, v_section, v_pattern, coalesce(p_sort_order, 100), coalesce(p_is_active, TRUE))
  ON CONFLICT (lower(trim(bom_product)), coalesce(lower(trim(section_name)), ''), coalesce(lower(trim(item_name_pattern)), ''))
  DO UPDATE SET sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: web_upsert_item_article_map(text, text, text, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_item_article_map(p_section_name text, p_item_name text, p_article text, p_colors text[] DEFAULT NULL::text[], p_sort_order integer DEFAULT 999) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_section text := trim(coalesce(p_section_name, ''));
  v_item text := trim(coalesce(p_item_name, ''));
  v_article text := trim(coalesce(p_article, ''));
  v_sort integer := coalesce(p_sort_order, 999);
  v_colors text[] := p_colors;
  v_color text;
  v_count integer := 0;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_section = '' then
    raise exception 'section_name is required';
  end if;
  if v_item = '' then
    raise exception 'item_name is required';
  end if;
  if v_article = '' then
    raise exception 'article is required';
  end if;
  if v_sort < 0 then v_sort := 999; end if;

  if v_colors is null or array_length(v_colors, 1) is null then
    v_colors := array['']::text[];
  end if;

  delete from public.item_article_map
  where source = 'manual'
    and trim(coalesce(section_name, '')) = v_section
    and trim(coalesce(item_name, '')) = v_item;

  foreach v_color in array v_colors loop
    v_color := trim(coalesce(v_color, ''));
    insert into public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
    values (v_article, v_item, 'manual', v_section, v_color, v_sort);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'section_name', v_section,
    'item_name', v_item,
    'article', v_article,
    'rows_created', v_count
  );
end;
$$;


--
-- Name: web_upsert_item_article_map_variants(text, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_item_article_map_variants(p_section_name text, p_item_name text, p_variants jsonb DEFAULT '[]'::jsonb, p_sort_order integer DEFAULT 999) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_section text := trim(coalesce(p_section_name, ''));
  v_item text := trim(coalesce(p_item_name, ''));
  v_sort integer := coalesce(p_sort_order, 999);
  v_variants jsonb := coalesce(p_variants, '[]'::jsonb);
  v_count integer := 0;
  v_row jsonb;
  v_article text;
  v_color text;
  v_conflict_source text;
  v_conflict_section text;
  v_can_reassign boolean;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_section = '' then
    raise exception 'section_name is required';
  end if;
  if v_item = '' then
    raise exception 'item_name is required';
  end if;
  if jsonb_typeof(v_variants) <> 'array' then
    raise exception 'variants must be a json array';
  end if;
  if v_sort < 0 then v_sort := 999; end if;

  insert into public.section_catalog(section_name, sort_order, is_active)
  values (v_section, v_sort, true)
  on conflict (section_name)
  do update set is_active = true;

  delete from public.item_article_map
  where source = 'manual'
    and lower(trim(coalesce(item_name, ''))) = lower(v_item);

  for v_row in select * from jsonb_array_elements(v_variants)
  loop
    v_article := trim(coalesce(v_row->>'article', ''));
    v_color := trim(coalesce(v_row->>'color', ''));
    if v_article = '' or v_color = '' then
      continue;
    end if;

    select iam.source, iam.section_name
      into v_conflict_source, v_conflict_section
      from public.item_article_map iam
      where trim(iam.article) = v_article
      limit 1;

    v_can_reassign := trim(coalesce(v_conflict_section, '')) = ''
      or lower(trim(replace(coalesce(v_conflict_section, ''), '╤С', '╨╡'))) = '╨┐╤А╨╛╤З╨╡╨╡';

    if found and coalesce(v_conflict_source, '') <> '' and v_conflict_source <> 'manual' and not v_can_reassign then
      raise exception 'article % already exists in catalog (source=%)', v_article, v_conflict_source;
    end if;

    delete from public.item_article_map
      where trim(article) = v_article
        and (
          source = 'manual'
          or trim(coalesce(section_name, '')) = ''
          or lower(trim(replace(coalesce(section_name, ''), '╤С', '╨╡'))) = '╨┐╤А╨╛╤З╨╡╨╡'
        );

    insert into public.item_article_map (article, item_name, source, section_name, table_color, sort_order)
    values (v_article, v_item, 'manual', v_section, v_color, v_sort);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'no valid variants provided (need article+color)';
  end if;

  return jsonb_build_object(
    'ok', true,
    'section_name', v_section,
    'item_name', v_item,
    'rows_created', v_count
  );
end;
$$;


--
-- Name: web_upsert_item_color_map(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_item_color_map(p_item_name text, p_color_name text) RETURNS TABLE(out_item_name text, out_color_name text, out_source text, out_updated_at timestamp with time zone)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: web_upsert_labor_fact(text, text, text, numeric, numeric, numeric, numeric, numeric, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_labor_fact(p_order_id text, p_item text DEFAULT NULL::text, p_week text DEFAULT NULL::text, p_qty numeric DEFAULT 0, p_pilka_min numeric DEFAULT 0, p_kromka_min numeric DEFAULT 0, p_pras_min numeric DEFAULT 0, p_assembly_min numeric DEFAULT 0, p_date_finished date DEFAULT NULL::date) RETURNS public.labor_facts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_order_id text := trim(coalesce(p_order_id, ''));
  v_row public.labor_facts;
begin
  perform public.web_require_roles(array['operator', 'manager', 'admin']);

  if v_order_id = '' then
    raise exception 'p_order_id is required';
  end if;

  insert into public.labor_facts (
    order_id,
    item,
    week,
    qty,
    pilka_min,
    kromka_min,
    pras_min,
    assembly_min,
    date_finished
  )
  values (
    v_order_id,
    nullif(trim(coalesce(p_item, '')), ''),
    nullif(trim(coalesce(p_week, '')), ''),
    greatest(0, coalesce(p_qty, 0)),
    greatest(0, coalesce(p_pilka_min, 0)),
    greatest(0, coalesce(p_kromka_min, 0)),
    greatest(0, coalesce(p_pras_min, 0)),
    greatest(0, coalesce(p_assembly_min, 0)),
    p_date_finished
  )
  on conflict (order_id)
  do update
    set item = excluded.item,
        week = excluded.week,
        qty = excluded.qty,
        pilka_min = excluded.pilka_min,
        kromka_min = excluded.kromka_min,
        pras_min = excluded.pras_min,
        assembly_min = excluded.assembly_min,
        date_finished = excluded.date_finished,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;


--
-- Name: web_upsert_labor_kit(bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_labor_kit(p_id bigint DEFAULT NULL::bigint, p_kit_name text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.labor_kits;
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  if p_id is not null then
    update public.labor_kits
      set kit_name = nullif(trim(coalesce(p_kit_name, '')), ''),
          items    = coalesce(p_items, '[]'::jsonb)
      where id = p_id
      returning * into v_row;

    if not found then
      raise exception 'labor_kit with id % not found', p_id;
    end if;
  else
    insert into public.labor_kits (kit_name, items)
      values (
        nullif(trim(coalesce(p_kit_name, '')), ''),
        coalesce(p_items, '[]'::jsonb)
      )
      returning * into v_row;
  end if;

  return jsonb_build_object(
    'id',         v_row.id,
    'kit_name',   v_row.kit_name,
    'name',       v_row.kit_name,
    'items',      v_row.items,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;


--
-- Name: web_upsert_labor_kit_plan_qty(bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_labor_kit_plan_qty(p_kit_id bigint, p_qty numeric DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.labor_kit_plan_qty%rowtype;
  v_qty numeric := greatest(0, coalesce(p_qty, 0));
begin
  perform public.web_require_roles(array['planner', 'operator', 'manager', 'admin']);

  if p_kit_id is null or p_kit_id <= 0 then
    raise exception 'kit_id is required';
  end if;

  if not exists (select 1 from public.labor_kits lk where lk.id = p_kit_id) then
    raise exception 'labor_kit with id % not found', p_kit_id;
  end if;

  insert into public.labor_kit_plan_qty (kit_id, planned_qty)
  values (p_kit_id, v_qty)
  on conflict (kit_id)
  do update set planned_qty = excluded.planned_qty
  returning * into v_row;

  return jsonb_build_object(
    'kit_id', v_row.kit_id,
    'planned_qty', v_row.planned_qty,
    'updated_at', v_row.updated_at
  );
end;
$$;


--
-- Name: web_upsert_labor_norm(integer, text, numeric, numeric, numeric, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_labor_norm(p_id integer DEFAULT NULL::integer, p_group_name text DEFAULT ''::text, p_pilka_min numeric DEFAULT 0, p_kromka_min numeric DEFAULT 0, p_pras_min numeric DEFAULT 0, p_assembly_min numeric DEFAULT 0, p_qty_unit numeric DEFAULT 1, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare v_row public.labor_norms; v_group text := nullif(trim(coalesce(p_group_name, '')), ''); begin perform public.web_require_roles(array['operator', 'manager', 'admin']); if v_group is null then raise exception 'group_name is required'; end if; if coalesce(p_qty_unit, 0) <= 0 then raise exception 'qty_unit must be > 0'; end if; if p_id is not null then update public.labor_norms set group_name = v_group, pilka_min = greatest(0, coalesce(p_pilka_min, 0)), kromka_min = greatest(0, coalesce(p_kromka_min, 0)), pras_min = greatest(0, coalesce(p_pras_min, 0)), assembly_min = greatest(0, coalesce(p_assembly_min, 0)), qty_unit = coalesce(p_qty_unit, 1), note = nullif(trim(coalesce(p_note, '')), '') where id = p_id returning * into v_row; if not found then raise exception 'labor_norm with id % not found', p_id; end if; else insert into public.labor_norms (group_name, pilka_min, kromka_min, pras_min, assembly_min, qty_unit, note) values (v_group, greatest(0, coalesce(p_pilka_min, 0)), greatest(0, coalesce(p_kromka_min, 0)), greatest(0, coalesce(p_pras_min, 0)), greatest(0, coalesce(p_assembly_min, 0)), coalesce(p_qty_unit, 1), nullif(trim(coalesce(p_note, '')), '')) on conflict (group_name) do update set pilka_min = excluded.pilka_min, kromka_min = excluded.kromka_min, pras_min = excluded.pras_min, assembly_min = excluded.assembly_min, qty_unit = excluded.qty_unit, note = excluded.note, updated_at = now() returning * into v_row; end if; return jsonb_build_object('id', v_row.id, 'group_name', v_row.group_name, 'groupName', v_row.group_name, 'pilka_min', v_row.pilka_min, 'pilkaMin', v_row.pilka_min, 'kromka_min', v_row.kromka_min, 'kromkaMin', v_row.kromka_min, 'pras_min', v_row.pras_min, 'prasMin', v_row.pras_min, 'assembly_min', v_row.assembly_min, 'assemblyMin', v_row.assembly_min, 'qty_unit', v_row.qty_unit, 'qtyUnit', v_row.qty_unit, 'note', v_row.note, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at); end; $$;


--
-- Name: web_upsert_metal_catalog_category(text, boolean, text[], jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_metal_catalog_category(p_name text, p_is_hidden boolean DEFAULT NULL::boolean, p_stage_route text[] DEFAULT NULL::text[], p_process_graph jsonb DEFAULT NULL::jsonb, p_apply_route_to_items boolean DEFAULT false) RETURNS TABLE(name text, is_hidden boolean, sort_order integer, stage_route text[], process_graph jsonb, item_count bigint, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_stage_route text[];
  v_process_graph jsonb;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_name = '' then
    raise exception 'category name required';
  end if;

  insert into public.metal_catalog_categories as cat (name)
  values (v_name)
  on conflict on constraint metal_catalog_categories_pkey do nothing;

  select cat.stage_route, cat.process_graph
  into v_stage_route, v_process_graph
  from public.metal_catalog_categories cat
  where cat.name = v_name;

  if p_stage_route is not null then
    v_stage_route := p_stage_route;
  end if;

  if p_process_graph is not null and jsonb_typeof(p_process_graph) = 'object' then
    v_process_graph := p_process_graph;
  elsif p_stage_route is not null then
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  if v_stage_route is null or array_length(v_stage_route, 1) is null then
    v_stage_route := array['laser', 'bending', 'welding', 'painting'];
  end if;
  if v_process_graph is null then
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  update public.metal_catalog_categories cat
  set is_hidden = coalesce(p_is_hidden, cat.is_hidden),
      stage_route = v_stage_route,
      process_graph = v_process_graph
  where cat.name = v_name;

  if coalesce(p_apply_route_to_items, false) then
    update public.metal_product_catalog c
    set stage_route = v_stage_route,
        process_graph = v_process_graph,
        updated_at = now()
    where coalesce(nullif(trim(c.category), ''), '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕') = v_name;
  end if;

  return query
  select
    row.name,
    row.is_hidden,
    row.sort_order,
    row.stage_route,
    row.process_graph,
    row.item_count,
    row.updated_at
  from public.web_list_metal_catalog_categories() as row
  where row.name = v_name;
end;
$$;


--
-- Name: web_upsert_metal_catalog_item(text, text, boolean, text[], jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_metal_catalog_item(p_article text, p_name text, p_is_active boolean DEFAULT true, p_stage_route text[] DEFAULT NULL::text[], p_process_graph jsonb DEFAULT NULL::jsonb, p_category text DEFAULT NULL::text) RETURNS TABLE(article text, name text, category text, is_active boolean, stage_route text[], process_graph jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_article       text   := upper(trim(coalesce(p_article, '')));
  v_name          text   := trim(coalesce(p_name, ''));
  v_category      text   := trim(coalesce(p_category, ''));
  v_stage_route   text[] := coalesce(p_stage_route, array['laser', 'bending', 'welding', 'painting']);
  v_process_graph jsonb;
begin
  perform public.web_require_roles(array['manager', 'admin']);
  if v_article = '' then
    raise exception 'article required';
  end if;
  if v_name = '' then
    raise exception 'name required';
  end if;

  if p_process_graph is not null and jsonb_typeof(p_process_graph) = 'object' then
    v_process_graph := p_process_graph;
    if v_process_graph -> 'nodes' is null or jsonb_array_length(v_process_graph -> 'nodes') < 1 then
      raise exception 'process_graph must contain nodes';
    end if;
  else
    v_process_graph := public.metal_linear_route_to_graph(v_stage_route);
  end if;

  if array_length(v_stage_route, 1) is null or array_length(v_stage_route, 1) < 1 then
    raise exception 'stage_route must have at least one stage';
  end if;
  if not (v_stage_route <@ array['laser', 'saw', 'bending', 'welding', 'painting']) then
    raise exception 'stage_route contains invalid stage(s)';
  end if;

  if v_category <> '' then
    insert into public.metal_catalog_categories as cat (name, sort_order)
    values (v_category, 0)
    on conflict on constraint metal_catalog_categories_pkey do nothing;
  end if;

  insert into public.metal_product_catalog as c (article, name, category, is_active, stage_route, process_graph)
  values (v_article, v_name, v_category, coalesce(p_is_active, true), v_stage_route, v_process_graph)
  on conflict on constraint metal_product_catalog_pkey do update
    set name          = excluded.name,
        category      = excluded.category,
        is_active     = excluded.is_active,
        stage_route   = excluded.stage_route,
        process_graph = excluded.process_graph,
        updated_at    = now();

  return query
    select c.article, c.name, coalesce(nullif(trim(c.category), ''), '╨С╨╡╨╖ ╨║╨░╤В╨╡╨│╨╛╤А╨╕╨╕'), c.is_active, c.stage_route, c.process_graph, c.updated_at
    from public.metal_product_catalog c
    where c.article = v_article;
end;
$$;


--
-- Name: web_upsert_overview_plan_month(bigint, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_upsert_overview_plan_month(p_id bigint, p_name text, p_weeks text[]) RETURNS TABLE(id bigint, name text, weeks text[], sort_order integer, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_name  TEXT := btrim(coalesce(p_name, ''));
  v_weeks TEXT[] := coalesce(p_weeks, '{}');
  v_sort  INT;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'Month name is required';
  END IF;

  v_weeks := array(
    SELECT DISTINCT w
    FROM unnest(v_weeks) AS w
    WHERE btrim(coalesce(w, '')) <> ''
    ORDER BY w
  );

  IF p_id IS NULL OR p_id = 0 THEN
    SELECT coalesce(max(m.sort_order), 0) + 1
    INTO v_sort
    FROM public.overview_plan_months AS m;

    RETURN QUERY
      INSERT INTO public.overview_plan_months AS ins (name, weeks, sort_order)
      VALUES (v_name, v_weeks, v_sort)
      RETURNING
        ins.id,
        ins.name,
        ins.weeks,
        ins.sort_order,
        ins.created_at,
        ins.updated_at;
  ELSE
    UPDATE public.overview_plan_months AS m
    SET name = v_name,
        weeks = v_weeks,
        updated_at = now()
    WHERE m.id = p_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan month % not found', p_id;
    END IF;

    RETURN QUERY
      SELECT m.id, m.name, m.weeks, m.sort_order, m.created_at, m.updated_at
      FROM public.overview_plan_months AS m
      WHERE m.id = p_id;
  END IF;
END;
$$;


--
-- Name: color_match_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.color_match_rules (
    id bigint NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    pattern text NOT NULL,
    color_name text NOT NULL,
    is_regex boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: color_match_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.color_match_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: color_match_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.color_match_rules_id_seq OWNED BY public.color_match_rules.id;


--
-- Name: crm_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_audit_log (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_db_role text DEFAULT lower(COALESCE(current_setting('request.jwt.claim.role'::text, true), ''::text)) NOT NULL,
    actor_crm_role text DEFAULT lower(COALESCE(public.web_effective_crm_role(), 'viewer'::text)) NOT NULL,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: crm_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.crm_audit_log ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.crm_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: crm_runtime_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_runtime_settings (
    key text NOT NULL,
    value_text text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_user_roles (
    user_id uuid NOT NULL,
    role text NOT NULL,
    assigned_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_user_roles_role_check CHECK ((lower(TRIM(BOTH FROM role)) = ANY (ARRAY['admin'::text, 'manager'::text, 'operator'::text, 'operator_pilka'::text, 'operator_kromka'::text, 'operator_pras'::text, 'planner'::text, 'viewer'::text, 'warehouse'::text])))
);


--
-- Name: cutting_catalog_kits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cutting_catalog_kits (
    id bigint NOT NULL,
    name text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cutting_catalog_kits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cutting_catalog_kits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cutting_catalog_kits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cutting_catalog_kits_id_seq OWNED BY public.cutting_catalog_kits.id;


--
-- Name: cutting_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cutting_jobs (
    id bigint NOT NULL,
    name text DEFAULT '╨Э╨╛╨▓╤Л╨╣ ╤А╨░╤Б╨║╤А╨╛╨╣'::text NOT NULL,
    settings jsonb DEFAULT '{"kerf": 4.8, "sheetH": 2070, "sheetW": 2800, "marginX": 20, "marginY": 20, "algorithm": "greedy", "allowRotate": false}'::jsonb NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cutting_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cutting_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cutting_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cutting_jobs_id_seq OWNED BY public.cutting_jobs.id;


--
-- Name: furniture_custom_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.furniture_custom_templates (
    product_name text NOT NULL,
    details jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kits_per_sheet numeric(12,3) DEFAULT 0 NOT NULL,
    material_yields jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: COLUMN furniture_custom_templates.material_yields; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.furniture_custom_templates.material_yields IS 'Array of {material, kits_per_sheet} тАФ yield per color/material; kits_per_sheet >= 1 = kits/sheet, (0,1) = sheets/kit';


--
-- Name: furniture_detail_item_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.furniture_detail_item_map (
    id bigint NOT NULL,
    product_name text NOT NULL,
    detail_name_pattern text NOT NULL,
    item_name_exact text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: furniture_detail_item_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.furniture_detail_item_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: furniture_detail_item_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.furniture_detail_item_map_id_seq OWNED BY public.furniture_detail_item_map.id;


--
-- Name: furniture_metal_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.furniture_metal_map (
    id bigint NOT NULL,
    furniture_article text NOT NULL,
    metal_article text NOT NULL,
    metal_name text,
    qty_per_unit integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT furniture_metal_map_qty_per_unit_check CHECK ((qty_per_unit > 0))
);


--
-- Name: TABLE furniture_metal_map; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.furniture_metal_map IS 'BOM mapping: furniture article -> metal component article (+qty per unit).';


--
-- Name: furniture_metal_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.furniture_metal_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: furniture_metal_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.furniture_metal_map_id_seq OWNED BY public.furniture_metal_map.id;


--
-- Name: furniture_product_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.furniture_product_map (
    id bigint NOT NULL,
    product_name text NOT NULL,
    section_name text,
    item_name_pattern text,
    sort_order integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT furniture_product_map_check CHECK ((COALESCE(NULLIF(TRIM(BOTH FROM section_name), ''::text), NULLIF(TRIM(BOTH FROM item_name_pattern), ''::text)) IS NOT NULL))
);


--
-- Name: furniture_product_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.furniture_product_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: furniture_product_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.furniture_product_map_id_seq OWNED BY public.furniture_product_map.id;


--
-- Name: furniture_sheet_capacity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.furniture_sheet_capacity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    furniture_model text NOT NULL,
    sheet_size text NOT NULL,
    output_per_sheet numeric(12,2) NOT NULL,
    cutting_image_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gx_shelf_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gx_shelf_catalog (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    color text,
    pairs jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gx_shelf_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gx_shelf_catalog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gx_shelf_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gx_shelf_catalog_id_seq OWNED BY public.gx_shelf_catalog.id;


--
-- Name: hardware_bom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardware_bom (
    id bigint NOT NULL,
    hardware_item_id bigint NOT NULL,
    bom_product text NOT NULL,
    qty_per_unit numeric(12,3) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hardware_bom_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hardware_bom_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hardware_bom_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hardware_bom_id_seq OWNED BY public.hardware_bom.id;


--
-- Name: hardware_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardware_items (
    id bigint NOT NULL,
    name text NOT NULL,
    size text DEFAULT ''::text NOT NULL,
    unit text DEFAULT '╤И╤В'::text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    photo_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hardware_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hardware_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hardware_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hardware_items_id_seq OWNED BY public.hardware_items.id;


--
-- Name: hardware_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardware_moves (
    id bigint NOT NULL,
    hardware_item_id bigint NOT NULL,
    order_id text,
    qty numeric(12,3) DEFAULT 0 NOT NULL,
    move_type text DEFAULT 'consume'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hardware_moves_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hardware_moves_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hardware_moves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hardware_moves_id_seq OWNED BY public.hardware_moves.id;


--
-- Name: hardware_product_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardware_product_map (
    id bigint NOT NULL,
    bom_product text NOT NULL,
    section_name text,
    item_name_pattern text,
    sort_order integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hardware_product_map_target_check CHECK ((COALESCE(NULLIF(TRIM(BOTH FROM section_name), ''::text), NULLIF(TRIM(BOTH FROM item_name_pattern), ''::text)) IS NOT NULL))
);


--
-- Name: hardware_product_map_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hardware_product_map_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hardware_product_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hardware_product_map_id_seq OWNED BY public.hardware_product_map.id;


--
-- Name: hardware_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hardware_stock (
    hardware_item_id bigint NOT NULL,
    qty numeric(12,3) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: item_article_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_article_map (
    article text NOT NULL,
    item_name text NOT NULL,
    source text DEFAULT 'xlsx'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    section_name text,
    table_color text,
    sort_order integer DEFAULT 999 NOT NULL
);


--
-- Name: COLUMN item_article_map.section_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.item_article_map.section_name IS '╨б╨╡╨║╤Ж╨╕╤П UI (╨║╨░╨║ ╨▓ public.section_catalog / ╨╖╨░╨│╨╛╨╗╨╛╨▓╨║╨╕ ╨▓ Excel).';


--
-- Name: COLUMN item_article_map.table_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.item_article_map.table_color IS '╨ж╨▓╨╡╤В/╨╝╨░╤В╨╡╤А╨╕╨░╨╗ ╨┤╨╗╤П ╤В╨░╨▒╨╗╨╕╤Ж╤Л ╨╕╨╖ ╤Д╨░╨╣╨╗╨░ ╤Б╨╛╨╛╤В╨▓╨╡╤В╤Б╤В╨▓╨╕╨╣ (╨║╨╛╨╗╨╛╨╜╨║╨░ C).';


--
-- Name: COLUMN item_article_map.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.item_article_map.sort_order IS '╨Я╨╛╤А╤П╨┤╨╛╨║ ╤Б╤В╤А╨╛╨║ ╨▓╨╜╤Г╤В╤А╨╕ ╤Б╨╡╨║╤Ж╨╕╨╕ (╨║╨░╨║ ╨▓ Excel, ╤И╨░╨│ 10).';


--
-- Name: item_color_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_color_map (
    item_name text NOT NULL,
    color_name text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: labor_facts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.labor_facts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: labor_facts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.labor_facts_id_seq OWNED BY public.labor_facts.id;


--
-- Name: labor_group_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labor_group_stats (
    id bigint NOT NULL,
    group_name text NOT NULL,
    orders_count integer DEFAULT 0 NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    pilka_min numeric DEFAULT 0 NOT NULL,
    kromka_min numeric DEFAULT 0 NOT NULL,
    pras_min numeric DEFAULT 0 NOT NULL,
    total_min numeric DEFAULT 0 NOT NULL,
    labor_hours_per_order numeric,
    labor_min_per_unit numeric,
    labor_hours_per_unit numeric,
    pilka_share numeric,
    kromka_share numeric,
    pras_share numeric,
    source_updated_at text,
    source_gid text DEFAULT '1995209218'::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: labor_group_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.labor_group_stats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: labor_group_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.labor_group_stats_id_seq OWNED BY public.labor_group_stats.id;


--
-- Name: labor_kit_plan_qty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labor_kit_plan_qty (
    kit_id bigint NOT NULL,
    planned_qty numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT labor_kit_plan_qty_planned_qty_check CHECK ((planned_qty >= (0)::numeric))
);


--
-- Name: labor_kits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labor_kits (
    id bigint NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    kit_name text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: labor_kits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.labor_kits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: labor_kits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.labor_kits_id_seq OWNED BY public.labor_kits.id;


--
-- Name: labor_norms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labor_norms (
    id integer NOT NULL,
    group_name text NOT NULL,
    pilka_min numeric(12,2) DEFAULT 0 NOT NULL,
    kromka_min numeric(12,2) DEFAULT 0 NOT NULL,
    pras_min numeric(12,2) DEFAULT 0 NOT NULL,
    assembly_min numeric(12,2) DEFAULT 0 NOT NULL,
    qty_unit numeric(12,2) DEFAULT 1 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT labor_norms_qty_unit_positive CHECK ((qty_unit > (0)::numeric))
);


--
-- Name: labor_norms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.labor_norms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: labor_norms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.labor_norms_id_seq OWNED BY public.labor_norms.id;


--
-- Name: material_size_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_size_map (
    material_name text NOT NULL,
    sheet_size text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: materials_leftovers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials_leftovers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id text NOT NULL,
    item text,
    material text,
    sheets_needed numeric(12,2) DEFAULT 0 NOT NULL,
    leftover_format text NOT NULL,
    leftovers_qty numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: materials_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material text NOT NULL,
    qty_sheets numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    size_label text,
    sheet_width_mm integer,
    sheet_height_mm integer,
    texture_path text
);


--
-- Name: metal_catalog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metal_catalog_categories (
    name text NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    stage_route text[] DEFAULT ARRAY['laser'::text, 'bending'::text, 'welding'::text, 'painting'::text] NOT NULL,
    process_graph jsonb DEFAULT public.metal_linear_route_to_graph(ARRAY['laser'::text, 'bending'::text, 'welding'::text, 'painting'::text]) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: metal_components_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metal_components_moves (
    id bigint NOT NULL,
    metal_article text NOT NULL,
    delta integer NOT NULL,
    reason text NOT NULL,
    order_id text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE metal_components_moves; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.metal_components_moves IS 'Stock movements for metal components (+in, -out).';


--
-- Name: metal_components_moves_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.metal_components_moves_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: metal_components_moves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.metal_components_moves_id_seq OWNED BY public.metal_components_moves.id;


--
-- Name: metal_components_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metal_components_stock (
    metal_article text NOT NULL,
    metal_name text NOT NULL,
    qty_available integer DEFAULT 0 NOT NULL,
    qty_reserved integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT metal_components_stock_qty_available_check CHECK ((qty_available >= 0)),
    CONSTRAINT metal_components_stock_qty_reserved_check CHECK ((qty_reserved >= 0))
);


--
-- Name: TABLE metal_components_stock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.metal_components_stock IS 'Current stock balances for metal components.';


--
-- Name: metal_product_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metal_product_catalog (
    article text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stage_route text[] DEFAULT ARRAY['laser'::text, 'bending'::text, 'welding'::text, 'painting'::text] NOT NULL,
    process_graph jsonb DEFAULT public.metal_linear_route_to_graph(ARRAY['laser'::text, 'bending'::text, 'welding'::text, 'painting'::text]) NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    CONSTRAINT metal_product_catalog_stage_route_check CHECK (((array_length(stage_route, 1) >= 1) AND (stage_route <@ ARRAY['laser'::text, 'saw'::text, 'bending'::text, 'welding'::text, 'painting'::text])))
);


--
-- Name: metal_stage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metal_stage_events (
    id bigint NOT NULL,
    work_item_id bigint NOT NULL,
    stage text NOT NULL,
    action text NOT NULL,
    actor_user_id uuid DEFAULT auth.uid(),
    note text,
    event_at timestamp with time zone DEFAULT now() NOT NULL,
    done_qty numeric(12,3),
    qty_before numeric(12,3),
    qty_after numeric(12,3),
    shortfall_added numeric(12,3),
    CONSTRAINT metal_stage_events_action_check CHECK ((action = ANY (ARRAY['start'::text, 'pause'::text, 'resume'::text, 'done'::text]))),
    CONSTRAINT metal_stage_events_stage_check CHECK ((stage = ANY (ARRAY['laser'::text, 'saw'::text, 'bending'::text, 'welding'::text, 'painting'::text])))
);


--
-- Name: metal_stage_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.metal_stage_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.metal_stage_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: metal_work_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metal_work_items (
    id bigint NOT NULL,
    article text NOT NULL,
    name text NOT NULL,
    week text,
    qty numeric(12,3) DEFAULT 0 NOT NULL,
    current_stage text DEFAULT 'laser'::text NOT NULL,
    stage_status text DEFAULT 'queued'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_stage_started_at timestamp with time zone,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    operator_comment text DEFAULT ''::text NOT NULL,
    stage_route text[] DEFAULT ARRAY['laser'::text, 'bending'::text, 'welding'::text, 'painting'::text] NOT NULL,
    route_idx integer DEFAULT 0 NOT NULL,
    stage_done_qty numeric(12,3) DEFAULT 0 NOT NULL,
    shortfall_qty numeric(12,3) DEFAULT 0 NOT NULL,
    process_graph jsonb,
    fork_group_id uuid,
    fork_role text,
    parent_id bigint,
    fork_meta jsonb,
    CONSTRAINT metal_work_items_current_stage_check CHECK ((current_stage = ANY (ARRAY['laser'::text, 'saw'::text, 'bending'::text, 'welding'::text, 'painting'::text]))),
    CONSTRAINT metal_work_items_fork_role_check CHECK (((fork_role IS NULL) OR (fork_role = ANY (ARRAY['branch'::text, 'merge'::text])))),
    CONSTRAINT metal_work_items_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT metal_work_items_shortfall_qty_check CHECK ((shortfall_qty >= (0)::numeric)),
    CONSTRAINT metal_work_items_stage_done_qty_check CHECK (((stage_done_qty >= (0)::numeric) AND (stage_done_qty <= qty))),
    CONSTRAINT metal_work_items_stage_status_check CHECK ((stage_status = ANY (ARRAY['queued'::text, 'in_progress'::text, 'paused'::text, 'done'::text]))),
    CONSTRAINT metal_work_items_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'done'::text, 'cancelled'::text, 'split'::text])))
);


--
-- Name: metal_work_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.metal_work_items ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.metal_work_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: metal_work_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metal_work_queue (
    id bigint NOT NULL,
    source_row text NOT NULL,
    source_col text NOT NULL,
    item text NOT NULL,
    week text,
    qty numeric(12,3) DEFAULT 0 NOT NULL,
    reason text,
    shortage jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT metal_work_queue_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text])))
);


--
-- Name: metal_work_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.metal_work_queue ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.metal_work_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: overview_plan_months; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.overview_plan_months (
    id bigint NOT NULL,
    name text NOT NULL,
    weeks text[] DEFAULT '{}'::text[] NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: overview_plan_months_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.overview_plan_months_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: overview_plan_months_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.overview_plan_months_id_seq OWNED BY public.overview_plan_months.id;


--
-- Name: plank_batch_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plank_batch_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    line_no integer NOT NULL,
    name text NOT NULL,
    qty numeric(12,2) DEFAULT 0 NOT NULL,
    length_mm integer,
    width_mm integer,
    per_sheet integer,
    sheets_needed integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plank_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plank_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_code text NOT NULL,
    display_name text DEFAULT '╨Я╨╗╨░╨╜╨║╨╕ ╨╛╨▒╨▓╤П╨╖╨║╨╕'::text NOT NULL,
    material text DEFAULT '╨з╨╡╤А╨╜╤Л╨╣'::text NOT NULL,
    week text,
    total_qty numeric(12,2) DEFAULT 0 NOT NULL,
    total_sheets numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    order_id text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_color_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_color_map (
    product_name text NOT NULL,
    color_name text NOT NULL,
    source text DEFAULT 'item_article_map'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: production_plan_debts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_plan_debts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id text NOT NULL,
    item text NOT NULL,
    material text DEFAULT ''::text NOT NULL,
    week text DEFAULT ''::text NOT NULL,
    qty integer NOT NULL,
    product_article text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_plan_debts_qty_check CHECK ((qty > 0))
);


--
-- Name: replacement_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replacement_orders (
    id text NOT NULL,
    product text NOT NULL,
    part text NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    color text DEFAULT ''::text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'ЁЯЯб ╨Э╨╛╨▓╤Л╨╣'::text NOT NULL,
    sent_to_work boolean DEFAULT false NOT NULL,
    packaging_accepted boolean DEFAULT false NOT NULL,
    accepted_at timestamp with time zone,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workshop_order_id text,
    completed_at timestamp with time zone
);


--
-- Name: section_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section_catalog (
    section_name text NOT NULL,
    sort_order integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: sheet_orders_mirror; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sheet_orders_mirror (
    id bigint NOT NULL,
    sheet_id text NOT NULL,
    sheet_gid text NOT NULL,
    sheet_row integer NOT NULL,
    source_created_at_raw text,
    material_raw text,
    order_code text,
    source_order_id_raw text,
    telegram_message_id_raw text,
    item_label text,
    plan_value integer,
    qty_value numeric(12,2),
    pilka_started_at_raw text,
    pilka_finished_at_raw text,
    pilka_status_raw text,
    kromka_started_at_raw text,
    kromka_finished_at_raw text,
    kromka_executor_raw text,
    kromka_status_raw text,
    prisadka_started_at_raw text,
    prisadka_finished_at_raw text,
    prisadka_executor_raw text,
    prisadka_status_raw text,
    assembly_status_raw text,
    assembly_time_raw text,
    notification_raw text,
    overall_status_raw text,
    shipped_raw text,
    source_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    article_code text,
    mapped_article_code text,
    mapped_item_name text,
    mapped_color_name text
);


--
-- Name: sheet_orders_mirror_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sheet_orders_mirror ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sheet_orders_mirror_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shipment_plan_cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_plan_cells (
    id bigint NOT NULL,
    section_name text DEFAULT '╨Я╤А╨╛╤З╨╡╨╡'::text NOT NULL,
    item text NOT NULL,
    material text,
    week text NOT NULL,
    qty numeric(12,2) DEFAULT 0 NOT NULL,
    row_ref text,
    col_ref text,
    source_row_id text,
    source_col_id text,
    bg text DEFAULT '#ffffff'::text,
    can_send_to_work boolean DEFAULT true NOT NULL,
    in_work boolean DEFAULT false NOT NULL,
    sheets_needed numeric(12,2) DEFAULT 0 NOT NULL,
    available_sheets numeric(12,2) DEFAULT 0 NOT NULL,
    material_enough_for_order boolean,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    output_per_sheet numeric(12,2) DEFAULT 0 NOT NULL,
    product_article text
);


--
-- Name: shipment_plan_cells_backup_20260421; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_plan_cells_backup_20260421 (
    id bigint,
    section_name text,
    item text,
    material text,
    week text,
    qty numeric(12,2),
    row_ref text,
    col_ref text,
    source_row_id text,
    source_col_id text,
    bg text,
    can_send_to_work boolean,
    in_work boolean,
    sheets_needed numeric(12,2),
    available_sheets numeric(12,2),
    material_enough_for_order boolean,
    note text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    output_per_sheet numeric(12,2)
);


--
-- Name: shipment_plan_cells_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shipment_plan_cells_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipment_plan_cells_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shipment_plan_cells_id_seq OWNED BY public.shipment_plan_cells.id;


--
-- Name: strap_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strap_stock (
    strap_type text NOT NULL,
    color text DEFAULT ''::text NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sync_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_system text DEFAULT 'google'::text NOT NULL,
    source_table text NOT NULL,
    source_id text NOT NULL,
    target_table text NOT NULL,
    target_id uuid NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_sheet_orders_mirror; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_sheet_orders_mirror WITH (security_invoker='true') AS
 SELECT sheet_id,
    sheet_gid,
    sheet_row,
    source_created_at_raw,
    material_raw,
    article_code,
    mapped_article_code,
    mapped_item_name,
    mapped_color_name,
    order_code,
    source_order_id_raw,
    item_label,
    plan_value,
    qty_value,
    pilka_status_raw,
    public.web_norm_sheet_stage_status(pilka_status_raw) AS pilka_status,
    kromka_status_raw,
    public.web_norm_sheet_stage_status(kromka_status_raw) AS kromka_status,
    prisadka_status_raw,
    public.web_norm_sheet_stage_status(prisadka_status_raw) AS prisadka_status,
    assembly_status_raw,
    public.web_norm_sheet_stage_status(assembly_status_raw) AS assembly_status,
    overall_status_raw,
    public.web_norm_sheet_stage_status(overall_status_raw) AS overall_status,
    shipped_raw,
    source_synced_at,
    updated_at
   FROM public.sheet_orders_mirror m;


--
-- Name: color_match_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.color_match_rules ALTER COLUMN id SET DEFAULT nextval('public.color_match_rules_id_seq'::regclass);


--
-- Name: cutting_catalog_kits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cutting_catalog_kits ALTER COLUMN id SET DEFAULT nextval('public.cutting_catalog_kits_id_seq'::regclass);


--
-- Name: cutting_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cutting_jobs ALTER COLUMN id SET DEFAULT nextval('public.cutting_jobs_id_seq'::regclass);


--
-- Name: furniture_detail_item_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_detail_item_map ALTER COLUMN id SET DEFAULT nextval('public.furniture_detail_item_map_id_seq'::regclass);


--
-- Name: furniture_metal_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_metal_map ALTER COLUMN id SET DEFAULT nextval('public.furniture_metal_map_id_seq'::regclass);


--
-- Name: furniture_product_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_product_map ALTER COLUMN id SET DEFAULT nextval('public.furniture_product_map_id_seq'::regclass);


--
-- Name: gx_shelf_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gx_shelf_catalog ALTER COLUMN id SET DEFAULT nextval('public.gx_shelf_catalog_id_seq'::regclass);


--
-- Name: hardware_bom id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_bom ALTER COLUMN id SET DEFAULT nextval('public.hardware_bom_id_seq'::regclass);


--
-- Name: hardware_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_items ALTER COLUMN id SET DEFAULT nextval('public.hardware_items_id_seq'::regclass);


--
-- Name: hardware_moves id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_moves ALTER COLUMN id SET DEFAULT nextval('public.hardware_moves_id_seq'::regclass);


--
-- Name: hardware_product_map id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_product_map ALTER COLUMN id SET DEFAULT nextval('public.hardware_product_map_id_seq'::regclass);


--
-- Name: labor_facts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_facts ALTER COLUMN id SET DEFAULT nextval('public.labor_facts_id_seq'::regclass);


--
-- Name: labor_group_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_group_stats ALTER COLUMN id SET DEFAULT nextval('public.labor_group_stats_id_seq'::regclass);


--
-- Name: labor_kits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_kits ALTER COLUMN id SET DEFAULT nextval('public.labor_kits_id_seq'::regclass);


--
-- Name: labor_norms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_norms ALTER COLUMN id SET DEFAULT nextval('public.labor_norms_id_seq'::regclass);


--
-- Name: metal_components_moves id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_components_moves ALTER COLUMN id SET DEFAULT nextval('public.metal_components_moves_id_seq'::regclass);


--
-- Name: overview_plan_months id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overview_plan_months ALTER COLUMN id SET DEFAULT nextval('public.overview_plan_months_id_seq'::regclass);


--
-- Name: shipment_plan_cells id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_plan_cells ALTER COLUMN id SET DEFAULT nextval('public.shipment_plan_cells_id_seq'::regclass);


--
-- Name: color_match_rules color_match_rules_pattern_color_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.color_match_rules
    ADD CONSTRAINT color_match_rules_pattern_color_name_key UNIQUE (pattern, color_name);


--
-- Name: color_match_rules color_match_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.color_match_rules
    ADD CONSTRAINT color_match_rules_pkey PRIMARY KEY (id);


--
-- Name: crm_audit_log crm_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_audit_log
    ADD CONSTRAINT crm_audit_log_pkey PRIMARY KEY (id);


--
-- Name: crm_runtime_settings crm_runtime_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_runtime_settings
    ADD CONSTRAINT crm_runtime_settings_pkey PRIMARY KEY (key);


--
-- Name: crm_user_roles crm_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_user_roles
    ADD CONSTRAINT crm_user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: cutting_catalog_kits cutting_catalog_kits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cutting_catalog_kits
    ADD CONSTRAINT cutting_catalog_kits_pkey PRIMARY KEY (id);


--
-- Name: cutting_jobs cutting_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cutting_jobs
    ADD CONSTRAINT cutting_jobs_pkey PRIMARY KEY (id);


--
-- Name: furniture_custom_templates furniture_custom_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_custom_templates
    ADD CONSTRAINT furniture_custom_templates_pkey PRIMARY KEY (product_name);


--
-- Name: furniture_detail_item_map furniture_detail_item_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_detail_item_map
    ADD CONSTRAINT furniture_detail_item_map_pkey PRIMARY KEY (id);


--
-- Name: furniture_metal_map furniture_metal_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_metal_map
    ADD CONSTRAINT furniture_metal_map_pkey PRIMARY KEY (id);


--
-- Name: furniture_metal_map furniture_metal_map_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_metal_map
    ADD CONSTRAINT furniture_metal_map_uq UNIQUE (furniture_article, metal_article);


--
-- Name: furniture_product_map furniture_product_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_product_map
    ADD CONSTRAINT furniture_product_map_pkey PRIMARY KEY (id);


--
-- Name: furniture_sheet_capacity furniture_sheet_capacity_furniture_model_sheet_size_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_sheet_capacity
    ADD CONSTRAINT furniture_sheet_capacity_furniture_model_sheet_size_key UNIQUE (furniture_model, sheet_size);


--
-- Name: furniture_sheet_capacity furniture_sheet_capacity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.furniture_sheet_capacity
    ADD CONSTRAINT furniture_sheet_capacity_pkey PRIMARY KEY (id);


--
-- Name: gx_shelf_catalog gx_shelf_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gx_shelf_catalog
    ADD CONSTRAINT gx_shelf_catalog_pkey PRIMARY KEY (id);


--
-- Name: hardware_bom hardware_bom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_bom
    ADD CONSTRAINT hardware_bom_pkey PRIMARY KEY (id);


--
-- Name: hardware_items hardware_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_items
    ADD CONSTRAINT hardware_items_pkey PRIMARY KEY (id);


--
-- Name: hardware_moves hardware_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_moves
    ADD CONSTRAINT hardware_moves_pkey PRIMARY KEY (id);


--
-- Name: hardware_product_map hardware_product_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_product_map
    ADD CONSTRAINT hardware_product_map_pkey PRIMARY KEY (id);


--
-- Name: hardware_stock hardware_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_stock
    ADD CONSTRAINT hardware_stock_pkey PRIMARY KEY (hardware_item_id);


--
-- Name: item_article_map item_article_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_article_map
    ADD CONSTRAINT item_article_map_pkey PRIMARY KEY (article);


--
-- Name: item_color_map item_color_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_color_map
    ADD CONSTRAINT item_color_map_pkey PRIMARY KEY (item_name);


--
-- Name: labor_facts labor_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_facts
    ADD CONSTRAINT labor_facts_pkey PRIMARY KEY (id);


--
-- Name: labor_group_stats labor_group_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_group_stats
    ADD CONSTRAINT labor_group_stats_pkey PRIMARY KEY (id);


--
-- Name: labor_kit_plan_qty labor_kit_plan_qty_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_kit_plan_qty
    ADD CONSTRAINT labor_kit_plan_qty_pkey PRIMARY KEY (kit_id);


--
-- Name: labor_kits labor_kits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_kits
    ADD CONSTRAINT labor_kits_pkey PRIMARY KEY (id);


--
-- Name: labor_norms labor_norms_group_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_norms
    ADD CONSTRAINT labor_norms_group_name_unique UNIQUE (group_name);


--
-- Name: labor_norms labor_norms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_norms
    ADD CONSTRAINT labor_norms_pkey PRIMARY KEY (id);


--
-- Name: material_size_map material_size_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_size_map
    ADD CONSTRAINT material_size_map_pkey PRIMARY KEY (material_name);


--
-- Name: materials_leftovers materials_leftovers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_leftovers
    ADD CONSTRAINT materials_leftovers_pkey PRIMARY KEY (id);


--
-- Name: materials_moves materials_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_moves
    ADD CONSTRAINT materials_moves_pkey PRIMARY KEY (id);


--
-- Name: materials_stock materials_stock_material_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_stock
    ADD CONSTRAINT materials_stock_material_key UNIQUE (material);


--
-- Name: materials_stock materials_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials_stock
    ADD CONSTRAINT materials_stock_pkey PRIMARY KEY (id);


--
-- Name: metal_catalog_categories metal_catalog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_catalog_categories
    ADD CONSTRAINT metal_catalog_categories_pkey PRIMARY KEY (name);


--
-- Name: metal_components_moves metal_components_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_components_moves
    ADD CONSTRAINT metal_components_moves_pkey PRIMARY KEY (id);


--
-- Name: metal_components_stock metal_components_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_components_stock
    ADD CONSTRAINT metal_components_stock_pkey PRIMARY KEY (metal_article);


--
-- Name: metal_product_catalog metal_product_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_product_catalog
    ADD CONSTRAINT metal_product_catalog_pkey PRIMARY KEY (article);


--
-- Name: metal_stage_events metal_stage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_stage_events
    ADD CONSTRAINT metal_stage_events_pkey PRIMARY KEY (id);


--
-- Name: metal_work_items metal_work_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_work_items
    ADD CONSTRAINT metal_work_items_pkey PRIMARY KEY (id);


--
-- Name: metal_work_queue metal_work_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_work_queue
    ADD CONSTRAINT metal_work_queue_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_id_key UNIQUE (order_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: overview_plan_months overview_plan_months_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.overview_plan_months
    ADD CONSTRAINT overview_plan_months_pkey PRIMARY KEY (id);


--
-- Name: plank_batch_items plank_batch_items_batch_id_line_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plank_batch_items
    ADD CONSTRAINT plank_batch_items_batch_id_line_no_key UNIQUE (batch_id, line_no);


--
-- Name: plank_batch_items plank_batch_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plank_batch_items
    ADD CONSTRAINT plank_batch_items_pkey PRIMARY KEY (id);


--
-- Name: plank_batches plank_batches_batch_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plank_batches
    ADD CONSTRAINT plank_batches_batch_code_key UNIQUE (batch_code);


--
-- Name: plank_batches plank_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plank_batches
    ADD CONSTRAINT plank_batches_pkey PRIMARY KEY (id);


--
-- Name: product_color_map product_color_map_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_color_map
    ADD CONSTRAINT product_color_map_pk PRIMARY KEY (product_name, color_name);


--
-- Name: production_plan_debts production_plan_debts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_plan_debts
    ADD CONSTRAINT production_plan_debts_pkey PRIMARY KEY (id);


--
-- Name: replacement_orders replacement_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replacement_orders
    ADD CONSTRAINT replacement_orders_pkey PRIMARY KEY (id);


--
-- Name: section_catalog section_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section_catalog
    ADD CONSTRAINT section_catalog_pkey PRIMARY KEY (section_name);


--
-- Name: sheet_orders_mirror sheet_orders_mirror_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_orders_mirror
    ADD CONSTRAINT sheet_orders_mirror_pkey PRIMARY KEY (id);


--
-- Name: sheet_orders_mirror sheet_orders_mirror_sheet_id_sheet_gid_sheet_row_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sheet_orders_mirror
    ADD CONSTRAINT sheet_orders_mirror_sheet_id_sheet_gid_sheet_row_key UNIQUE (sheet_id, sheet_gid, sheet_row);


--
-- Name: shipment_cells shipment_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_cells
    ADD CONSTRAINT shipment_cells_pkey PRIMARY KEY (id);


--
-- Name: shipment_cells shipment_cells_source_row_id_source_col_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_cells
    ADD CONSTRAINT shipment_cells_source_row_id_source_col_id_key UNIQUE (source_row_id, source_col_id);


--
-- Name: shipment_plan_cells shipment_plan_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_plan_cells
    ADD CONSTRAINT shipment_plan_cells_pkey PRIMARY KEY (id);


--
-- Name: strap_stock strap_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strap_stock
    ADD CONSTRAINT strap_stock_pkey PRIMARY KEY (strap_type, color);


--
-- Name: sync_map sync_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_map
    ADD CONSTRAINT sync_map_pkey PRIMARY KEY (id);


--
-- Name: sync_map sync_map_source_system_source_table_source_id_target_table_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_map
    ADD CONSTRAINT sync_map_source_system_source_table_source_id_target_table_key UNIQUE (source_system, source_table, source_id, target_table);


--
-- Name: cutting_catalog_kits_sort_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cutting_catalog_kits_sort_order_idx ON public.cutting_catalog_kits USING btree (sort_order, name);


--
-- Name: gx_shelf_catalog_code_norm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gx_shelf_catalog_code_norm_idx ON public.gx_shelf_catalog USING btree (upper(btrim(code)));


--
-- Name: gx_shelf_catalog_sort_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gx_shelf_catalog_sort_order_idx ON public.gx_shelf_catalog USING btree (sort_order, code);


--
-- Name: idx_crm_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_log_action ON public.crm_audit_log USING btree (action);


--
-- Name: idx_crm_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_log_created_at ON public.crm_audit_log USING btree (created_at DESC);


--
-- Name: idx_crm_audit_log_entity_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_audit_log_entity_entity_id ON public.crm_audit_log USING btree (entity, entity_id);


--
-- Name: idx_furniture_metal_map_furniture_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_furniture_metal_map_furniture_article ON public.furniture_metal_map USING btree (furniture_article);


--
-- Name: idx_furniture_metal_map_metal_article; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_furniture_metal_map_metal_article ON public.furniture_metal_map USING btree (metal_article);


--
-- Name: idx_furniture_sheet_capacity_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_furniture_sheet_capacity_model ON public.furniture_sheet_capacity USING btree (furniture_model);


--
-- Name: idx_furniture_sheet_capacity_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_furniture_sheet_capacity_size ON public.furniture_sheet_capacity USING btree (sheet_size);


--
-- Name: idx_hardware_bom_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hardware_bom_product ON public.hardware_bom USING btree (lower(TRIM(BOTH FROM bom_product)));


--
-- Name: idx_hardware_moves_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hardware_moves_created_at ON public.hardware_moves USING btree (created_at DESC);


--
-- Name: idx_hardware_moves_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hardware_moves_order ON public.hardware_moves USING btree (lower(TRIM(BOTH FROM COALESCE(order_id, ''::text))));


--
-- Name: idx_item_article_map_item_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_article_map_item_name ON public.item_article_map USING btree (item_name);


--
-- Name: idx_item_color_map_norm_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_color_map_norm_key ON public.item_color_map USING btree (public.normalize_item_key(item_name));


--
-- Name: idx_labor_facts_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_labor_facts_order_id ON public.labor_facts USING btree (order_id);


--
-- Name: idx_labor_facts_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_labor_facts_week ON public.labor_facts USING btree (week);


--
-- Name: idx_labor_norms_group_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_labor_norms_group_name ON public.labor_norms USING btree (group_name);


--
-- Name: idx_materials_moves_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_moves_ref ON public.materials_moves USING btree (source_type, source_ref);


--
-- Name: idx_metal_components_moves_metal_article_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metal_components_moves_metal_article_created_at ON public.metal_components_moves USING btree (metal_article, created_at DESC);


--
-- Name: idx_metal_product_catalog_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metal_product_catalog_active ON public.metal_product_catalog USING btree (is_active, article);


--
-- Name: idx_metal_product_catalog_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metal_product_catalog_category ON public.metal_product_catalog USING btree (category, is_active, article);


--
-- Name: idx_metal_stage_events_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metal_stage_events_item ON public.metal_stage_events USING btree (work_item_id, event_at);


--
-- Name: idx_metal_work_items_fork_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metal_work_items_fork_group ON public.metal_work_items USING btree (fork_group_id, fork_role, status);


--
-- Name: idx_metal_work_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metal_work_items_status ON public.metal_work_items USING btree (status, current_stage, stage_status, created_at DESC);


--
-- Name: idx_metal_work_queue_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metal_work_queue_status_created ON public.metal_work_queue USING btree (status, created_at DESC);


--
-- Name: idx_orders_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_item ON public.orders USING btree (item);


--
-- Name: idx_orders_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_pipeline_stage ON public.orders USING btree (pipeline_stage);


--
-- Name: idx_orders_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_stage ON public.orders USING btree (pilka_status, kromka_status, pras_status);


--
-- Name: idx_orders_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_updated_at ON public.orders USING btree (updated_at DESC);


--
-- Name: idx_orders_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_week ON public.orders USING btree (week);


--
-- Name: idx_plank_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plank_batches_status ON public.plank_batches USING btree (status, created_at DESC);


--
-- Name: idx_product_color_map_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_color_map_product ON public.product_color_map USING btree (product_name);


--
-- Name: idx_production_plan_debts_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_plan_debts_order_id ON public.production_plan_debts USING btree (order_id);


--
-- Name: idx_production_plan_debts_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_production_plan_debts_week ON public.production_plan_debts USING btree (week, item);


--
-- Name: idx_replacement_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_replacement_orders_created_at ON public.replacement_orders USING btree (created_at DESC);


--
-- Name: idx_replacement_orders_sent_packaging; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_replacement_orders_sent_packaging ON public.replacement_orders USING btree (sent_to_work, packaging_accepted);


--
-- Name: idx_replacement_orders_workshop_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_replacement_orders_workshop_order_id ON public.replacement_orders USING btree (workshop_order_id) WHERE (workshop_order_id IS NOT NULL);


--
-- Name: idx_sheet_orders_mirror_article_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sheet_orders_mirror_article_code ON public.sheet_orders_mirror USING btree (article_code);


--
-- Name: idx_sheet_orders_mirror_order_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sheet_orders_mirror_order_code ON public.sheet_orders_mirror USING btree (order_code);


--
-- Name: idx_sheet_orders_mirror_overall_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sheet_orders_mirror_overall_status ON public.sheet_orders_mirror USING btree (overall_status_raw);


--
-- Name: idx_shipment_cells_filter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipment_cells_filter ON public.shipment_cells USING btree (section_name, week, can_send_to_work, in_work);


--
-- Name: idx_shipment_plan_cells_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipment_plan_cells_item ON public.shipment_plan_cells USING btree (item);


--
-- Name: idx_shipment_plan_cells_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipment_plan_cells_week ON public.shipment_plan_cells USING btree (week);


--
-- Name: labor_kits_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX labor_kits_created_by_idx ON public.labor_kits USING btree (created_by);


--
-- Name: uq_metal_work_queue_source_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_metal_work_queue_source_active ON public.metal_work_queue USING btree (source_row, source_col) WHERE (status = ANY (ARRAY['queued'::text, 'in_progress'::text]));


--
-- Name: ux_furniture_detail_item_map_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_furniture_detail_item_map_key ON public.furniture_detail_item_map USING btree (lower(TRIM(BOTH FROM product_name)), lower(TRIM(BOTH FROM detail_name_pattern)), lower(TRIM(BOTH FROM item_name_exact)));


--
-- Name: ux_furniture_product_map_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_furniture_product_map_key ON public.furniture_product_map USING btree (lower(TRIM(BOTH FROM product_name)), COALESCE(lower(TRIM(BOTH FROM section_name)), ''::text), COALESCE(lower(TRIM(BOTH FROM item_name_pattern)), ''::text));


--
-- Name: ux_hardware_bom_item_product; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_hardware_bom_item_product ON public.hardware_bom USING btree (hardware_item_id, lower(TRIM(BOTH FROM bom_product)));


--
-- Name: ux_hardware_items_name_size; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_hardware_items_name_size ON public.hardware_items USING btree (lower(TRIM(BOTH FROM name)), lower(TRIM(BOTH FROM COALESCE(size, ''::text))));


--
-- Name: ux_hardware_moves_consume_once_per_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_hardware_moves_consume_once_per_order ON public.hardware_moves USING btree (lower(TRIM(BOTH FROM COALESCE(order_id, ''::text))), hardware_item_id) WHERE (move_type = 'consume'::text);


--
-- Name: ux_hardware_product_map_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_hardware_product_map_key ON public.hardware_product_map USING btree (lower(TRIM(BOTH FROM bom_product)), COALESCE(lower(TRIM(BOTH FROM section_name)), ''::text), COALESCE(lower(TRIM(BOTH FROM item_name_pattern)), ''::text));


--
-- Name: ux_labor_facts_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_labor_facts_order_id ON public.labor_facts USING btree (order_id);


--
-- Name: ux_materials_leftovers_order_format; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_materials_leftovers_order_format ON public.materials_leftovers USING btree (order_id, leftover_format);


--
-- Name: ux_materials_moves_consume_once_per_order_material; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_materials_moves_consume_once_per_order_material ON public.materials_moves USING btree (TRIM(BOTH FROM COALESCE(source_ref, ''::text)), lower(TRIM(BOTH FROM regexp_replace(replace(TRIM(BOTH FROM material), '╤С'::text, '╨╡'::text), '\s+'::text, ' '::text, 'g'::text)))) WHERE ((move_type = 'expense'::text) AND (source_type = 'order'::text) AND (comment = 'consume after pilka done'::text));


--
-- Name: ux_materials_stock_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_materials_stock_norm ON public.materials_stock USING btree (lower(TRIM(BOTH FROM regexp_replace(replace(material, '╤С'::text, '╨╡'::text), '\s+'::text, ' '::text, 'g'::text))));


--
-- Name: ux_shipment_plan_cells_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_shipment_plan_cells_source ON public.shipment_plan_cells USING btree (source_row_id, source_col_id);


--
-- Name: furniture_metal_map tr_furniture_metal_map_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_furniture_metal_map_touch_updated_at BEFORE UPDATE ON public.furniture_metal_map FOR EACH ROW EXECUTE FUNCTION public.trg_furniture_metal_map_touch_updated_at();


--
-- Name: metal_components_stock tr_metal_components_stock_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_metal_components_stock_touch_updated_at BEFORE UPDATE ON public.metal_components_stock FOR EACH ROW EXECUTE FUNCTION public.trg_metal_components_stock_touch_updated_at();


--
-- Name: shipment_cells tr_normalize_premier_section_on_cells; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_normalize_premier_section_on_cells BEFORE INSERT OR UPDATE OF section_name, item ON public.shipment_cells FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_premier_section();


--
-- Name: shipment_plan_cells tr_normalize_premier_section_on_plan; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_normalize_premier_section_on_plan BEFORE INSERT OR UPDATE OF section_name, item ON public.shipment_plan_cells FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_premier_section();


--
-- Name: orders tr_orders_pipeline_stage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_orders_pipeline_stage BEFORE INSERT OR UPDATE OF overall_status, assembly_status, pilka_status, kromka_status, pras_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_set_pipeline_stage();


--
-- Name: sheet_orders_mirror tr_sheet_orders_mirror_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_sheet_orders_mirror_touch_updated_at BEFORE UPDATE ON public.sheet_orders_mirror FOR EACH ROW EXECUTE FUNCTION public.trg_sheet_orders_mirror_touch_updated_at();


--
-- Name: materials_moves trg_crm_audit_materials_moves; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_audit_materials_moves AFTER INSERT ON public.materials_moves FOR EACH ROW EXECUTE FUNCTION public.trg_crm_audit_materials_moves();


--
-- Name: orders trg_crm_audit_orders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_audit_orders AFTER DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_crm_audit_orders();


--
-- Name: crm_runtime_settings trg_crm_audit_runtime_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_audit_runtime_settings AFTER INSERT OR UPDATE ON public.crm_runtime_settings FOR EACH ROW EXECUTE FUNCTION public.trg_crm_audit_runtime_settings();


--
-- Name: crm_user_roles trg_crm_audit_user_roles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_audit_user_roles AFTER INSERT OR DELETE OR UPDATE ON public.crm_user_roles FOR EACH ROW EXECUTE FUNCTION public.trg_crm_audit_user_roles();


--
-- Name: crm_user_roles trg_crm_user_roles_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_crm_user_roles_touch_updated_at BEFORE UPDATE ON public.crm_user_roles FOR EACH ROW EXECUTE FUNCTION public.crm_user_roles_touch_updated_at();


--
-- Name: cutting_catalog_kits trg_cutting_catalog_kits_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cutting_catalog_kits_touch_updated_at BEFORE UPDATE ON public.cutting_catalog_kits FOR EACH ROW EXECUTE FUNCTION public.trg_cutting_catalog_kits_touch_updated_at();


--
-- Name: cutting_jobs trg_cutting_jobs_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cutting_jobs_touch_updated_at BEFORE UPDATE ON public.cutting_jobs FOR EACH ROW EXECUTE FUNCTION public.trg_cutting_jobs_touch_updated_at();


--
-- Name: furniture_custom_templates trg_furniture_custom_templates_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_furniture_custom_templates_touch_updated_at BEFORE UPDATE ON public.furniture_custom_templates FOR EACH ROW EXECUTE FUNCTION public.trg_furniture_custom_templates_touch_updated_at();


--
-- Name: furniture_sheet_capacity trg_furniture_sheet_capacity_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_furniture_sheet_capacity_updated_at BEFORE UPDATE ON public.furniture_sheet_capacity FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gx_shelf_catalog trg_gx_shelf_catalog_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gx_shelf_catalog_touch_updated_at BEFORE UPDATE ON public.gx_shelf_catalog FOR EACH ROW EXECUTE FUNCTION public.trg_gx_shelf_catalog_touch_updated_at();


--
-- Name: hardware_bom trg_hardware_bom_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hardware_bom_touch BEFORE UPDATE ON public.hardware_bom FOR EACH ROW EXECUTE FUNCTION public.trg_hardware_touch_updated_at();


--
-- Name: hardware_items trg_hardware_items_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hardware_items_touch BEFORE UPDATE ON public.hardware_items FOR EACH ROW EXECUTE FUNCTION public.trg_hardware_touch_updated_at();


--
-- Name: hardware_product_map trg_hardware_product_map_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hardware_product_map_touch BEFORE UPDATE ON public.hardware_product_map FOR EACH ROW EXECUTE FUNCTION public.trg_hardware_touch_updated_at();


--
-- Name: labor_kit_plan_qty trg_labor_kit_plan_qty_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_labor_kit_plan_qty_updated_at BEFORE UPDATE ON public.labor_kit_plan_qty FOR EACH ROW EXECUTE FUNCTION public.tg_labor_kit_plan_qty_updated_at();


--
-- Name: labor_kits trg_labor_kits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_labor_kits_updated_at BEFORE UPDATE ON public.labor_kits FOR EACH ROW EXECUTE FUNCTION public.tg_labor_kits_updated_at();


--
-- Name: labor_norms trg_labor_norms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_labor_norms_updated_at BEFORE UPDATE ON public.labor_norms FOR EACH ROW EXECUTE FUNCTION public.tg_labor_norms_updated_at();


--
-- Name: metal_catalog_categories trg_metal_catalog_categories_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_metal_catalog_categories_touch_updated_at BEFORE UPDATE ON public.metal_catalog_categories FOR EACH ROW EXECUTE FUNCTION public.trg_metal_catalog_categories_touch_updated_at();


--
-- Name: metal_product_catalog trg_metal_product_catalog_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_metal_product_catalog_touch_updated_at BEFORE UPDATE ON public.metal_product_catalog FOR EACH ROW EXECUTE FUNCTION public.trg_metal_process_touch_updated_at();


--
-- Name: metal_work_items trg_metal_work_items_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_metal_work_items_touch_updated_at BEFORE UPDATE ON public.metal_work_items FOR EACH ROW EXECUTE FUNCTION public.trg_metal_process_touch_updated_at();


--
-- Name: metal_work_queue trg_metal_work_queue_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_metal_work_queue_touch_updated_at BEFORE UPDATE ON public.metal_work_queue FOR EACH ROW EXECUTE FUNCTION public.trg_metal_work_queue_touch_updated_at();


--
-- Name: orders trg_orders_sync_replacement_on_shipped; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_sync_replacement_on_shipped AFTER UPDATE OF shipped ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sync_replacement_on_shipped();


--
-- Name: orders trg_orders_sync_shipment_plan_cell_on_pipeline; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_sync_shipment_plan_cell_on_pipeline AFTER UPDATE OF pipeline_stage ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sync_shipment_plan_cell_on_pipeline();


--
-- Name: orders trg_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: overview_plan_months trg_overview_plan_months_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_overview_plan_months_touch_updated_at BEFORE UPDATE ON public.overview_plan_months FOR EACH ROW EXECUTE FUNCTION public.trg_overview_plan_months_touch_updated_at();


--
-- Name: plank_batches trg_plank_batches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_plank_batches_updated_at BEFORE UPDATE ON public.plank_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: production_plan_debts trg_production_plan_debts_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_production_plan_debts_touch_updated_at BEFORE UPDATE ON public.production_plan_debts FOR EACH ROW EXECUTE FUNCTION public.trg_production_plan_debts_touch_updated_at();


--
-- Name: orders trg_register_leftovers_on_order_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_register_leftovers_on_order_insert AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.web_register_leftovers_for_order();


--
-- Name: replacement_orders trg_replacement_orders_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_replacement_orders_touch_updated_at BEFORE UPDATE ON public.replacement_orders FOR EACH ROW EXECUTE FUNCTION public.trg_replacement_orders_touch_updated_at();


--
-- Name: shipment_cells trg_shipment_cells_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shipment_cells_updated_at BEFORE UPDATE ON public.shipment_cells FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: strap_stock trg_strap_stock_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_strap_stock_touch_updated_at BEFORE UPDATE ON public.strap_stock FOR EACH ROW EXECUTE FUNCTION public.trg_strap_stock_touch_updated_at();


--
-- Name: shipment_plan_cells trg_sync_plan_to_shipment_cells; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_plan_to_shipment_cells AFTER INSERT OR DELETE OR UPDATE ON public.shipment_plan_cells FOR EACH ROW EXECUTE FUNCTION public.web_sync_plan_cell_to_shipment_cells();


--
-- Name: crm_user_roles crm_user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_user_roles
    ADD CONSTRAINT crm_user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: hardware_bom hardware_bom_hardware_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_bom
    ADD CONSTRAINT hardware_bom_hardware_item_id_fkey FOREIGN KEY (hardware_item_id) REFERENCES public.hardware_items(id) ON DELETE CASCADE;


--
-- Name: hardware_moves hardware_moves_hardware_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_moves
    ADD CONSTRAINT hardware_moves_hardware_item_id_fkey FOREIGN KEY (hardware_item_id) REFERENCES public.hardware_items(id) ON DELETE CASCADE;


--
-- Name: hardware_stock hardware_stock_hardware_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hardware_stock
    ADD CONSTRAINT hardware_stock_hardware_item_id_fkey FOREIGN KEY (hardware_item_id) REFERENCES public.hardware_items(id) ON DELETE CASCADE;


--
-- Name: labor_kit_plan_qty labor_kit_plan_qty_kit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_kit_plan_qty
    ADD CONSTRAINT labor_kit_plan_qty_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES public.labor_kits(id) ON DELETE CASCADE;


--
-- Name: metal_components_moves metal_components_moves_metal_article_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_components_moves
    ADD CONSTRAINT metal_components_moves_metal_article_fkey FOREIGN KEY (metal_article) REFERENCES public.metal_components_stock(metal_article) ON DELETE CASCADE;


--
-- Name: metal_stage_events metal_stage_events_work_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_stage_events
    ADD CONSTRAINT metal_stage_events_work_item_id_fkey FOREIGN KEY (work_item_id) REFERENCES public.metal_work_items(id) ON DELETE CASCADE;


--
-- Name: metal_work_items metal_work_items_article_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_work_items
    ADD CONSTRAINT metal_work_items_article_fkey FOREIGN KEY (article) REFERENCES public.metal_product_catalog(article) ON UPDATE CASCADE;


--
-- Name: metal_work_items metal_work_items_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metal_work_items
    ADD CONSTRAINT metal_work_items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.metal_work_items(id) ON DELETE SET NULL;


--
-- Name: plank_batch_items plank_batch_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plank_batch_items
    ADD CONSTRAINT plank_batch_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.plank_batches(id) ON DELETE CASCADE;


--
-- Name: labor_kits allow_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_authenticated ON public.labor_kits TO authenticated USING (true) WITH CHECK (true);


--
-- Name: labor_norms allow_all_authenticated_labor_norms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_all_authenticated_labor_norms ON public.labor_norms TO authenticated USING (true) WITH CHECK (true);


--
-- Name: color_match_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.color_match_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: color_match_rules color_match_rules_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY color_match_rules_select_public ON public.color_match_rules FOR SELECT TO authenticated, anon USING (true);


--
-- Name: crm_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_audit_log crm_audit_log_insert_service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_audit_log_insert_service_role_only ON public.crm_audit_log FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: crm_audit_log crm_audit_log_select_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_audit_log_select_admin_only ON public.crm_audit_log FOR SELECT TO authenticated USING ((public.web_effective_crm_role() = 'admin'::text));


--
-- Name: crm_runtime_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_runtime_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_runtime_settings crm_runtime_settings_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_runtime_settings_select_public ON public.crm_runtime_settings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: crm_user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_user_roles crm_user_roles_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY crm_user_roles_select_authenticated ON public.crm_user_roles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: cutting_catalog_kits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cutting_catalog_kits ENABLE ROW LEVEL SECURITY;

--
-- Name: cutting_catalog_kits cutting_catalog_kits_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_catalog_kits_delete ON public.cutting_catalog_kits FOR DELETE TO authenticated USING (true);


--
-- Name: cutting_catalog_kits cutting_catalog_kits_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_catalog_kits_insert ON public.cutting_catalog_kits FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: cutting_catalog_kits cutting_catalog_kits_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_catalog_kits_select ON public.cutting_catalog_kits FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cutting_catalog_kits cutting_catalog_kits_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_catalog_kits_update ON public.cutting_catalog_kits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: cutting_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cutting_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: cutting_jobs cutting_jobs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_jobs_delete ON public.cutting_jobs FOR DELETE TO authenticated, anon USING (true);


--
-- Name: cutting_jobs cutting_jobs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_jobs_insert ON public.cutting_jobs FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: cutting_jobs cutting_jobs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_jobs_select ON public.cutting_jobs FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cutting_jobs cutting_jobs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cutting_jobs_update ON public.cutting_jobs FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: furniture_custom_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.furniture_custom_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: furniture_custom_templates furniture_custom_templates_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY furniture_custom_templates_select_public ON public.furniture_custom_templates FOR SELECT TO authenticated, anon USING (true);


--
-- Name: furniture_detail_item_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.furniture_detail_item_map ENABLE ROW LEVEL SECURITY;

--
-- Name: furniture_detail_item_map furniture_detail_item_map_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY furniture_detail_item_map_select_public ON public.furniture_detail_item_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: furniture_metal_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.furniture_metal_map ENABLE ROW LEVEL SECURITY;

--
-- Name: furniture_metal_map furniture_metal_map_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY furniture_metal_map_select_public ON public.furniture_metal_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: furniture_product_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.furniture_product_map ENABLE ROW LEVEL SECURITY;

--
-- Name: furniture_product_map furniture_product_map_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY furniture_product_map_select_public ON public.furniture_product_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: furniture_sheet_capacity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.furniture_sheet_capacity ENABLE ROW LEVEL SECURITY;

--
-- Name: furniture_sheet_capacity furniture_sheet_capacity_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY furniture_sheet_capacity_select_public ON public.furniture_sheet_capacity FOR SELECT TO authenticated, anon USING (true);


--
-- Name: gx_shelf_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gx_shelf_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: gx_shelf_catalog gx_shelf_catalog_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gx_shelf_catalog_delete ON public.gx_shelf_catalog FOR DELETE TO authenticated USING (true);


--
-- Name: gx_shelf_catalog gx_shelf_catalog_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gx_shelf_catalog_insert ON public.gx_shelf_catalog FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: gx_shelf_catalog gx_shelf_catalog_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gx_shelf_catalog_select ON public.gx_shelf_catalog FOR SELECT TO authenticated, anon USING (true);


--
-- Name: gx_shelf_catalog gx_shelf_catalog_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gx_shelf_catalog_update ON public.gx_shelf_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: hardware_bom; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardware_bom ENABLE ROW LEVEL SECURITY;

--
-- Name: hardware_bom hardware_bom_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_bom_delete ON public.hardware_bom FOR DELETE TO authenticated, anon USING (true);


--
-- Name: hardware_bom hardware_bom_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_bom_insert ON public.hardware_bom FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: hardware_bom hardware_bom_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_bom_select ON public.hardware_bom FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hardware_bom hardware_bom_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_bom_update ON public.hardware_bom FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: hardware_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardware_items ENABLE ROW LEVEL SECURITY;

--
-- Name: hardware_items hardware_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_items_delete ON public.hardware_items FOR DELETE TO authenticated, anon USING (true);


--
-- Name: hardware_items hardware_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_items_insert ON public.hardware_items FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: hardware_items hardware_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_items_select ON public.hardware_items FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hardware_items hardware_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_items_update ON public.hardware_items FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: hardware_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardware_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: hardware_moves hardware_moves_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_moves_delete ON public.hardware_moves FOR DELETE TO authenticated, anon USING (true);


--
-- Name: hardware_moves hardware_moves_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_moves_insert ON public.hardware_moves FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: hardware_moves hardware_moves_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_moves_select ON public.hardware_moves FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hardware_moves hardware_moves_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_moves_update ON public.hardware_moves FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: hardware_product_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardware_product_map ENABLE ROW LEVEL SECURITY;

--
-- Name: hardware_product_map hardware_product_map_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_product_map_delete ON public.hardware_product_map FOR DELETE TO authenticated, anon USING (true);


--
-- Name: hardware_product_map hardware_product_map_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_product_map_insert ON public.hardware_product_map FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: hardware_product_map hardware_product_map_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_product_map_select ON public.hardware_product_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hardware_product_map hardware_product_map_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_product_map_update ON public.hardware_product_map FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: hardware_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hardware_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: hardware_stock hardware_stock_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_stock_delete ON public.hardware_stock FOR DELETE TO authenticated, anon USING (true);


--
-- Name: hardware_stock hardware_stock_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_stock_insert ON public.hardware_stock FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: hardware_stock hardware_stock_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_stock_select ON public.hardware_stock FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hardware_stock hardware_stock_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hardware_stock_update ON public.hardware_stock FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: item_article_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_article_map ENABLE ROW LEVEL SECURITY;

--
-- Name: item_article_map item_article_map_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_article_map_select_public ON public.item_article_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: item_color_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_color_map ENABLE ROW LEVEL SECURITY;

--
-- Name: item_color_map item_color_map_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_color_map_select_public ON public.item_color_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: labor_facts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labor_facts ENABLE ROW LEVEL SECURITY;

--
-- Name: labor_facts labor_facts_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY labor_facts_select_public ON public.labor_facts FOR SELECT TO authenticated, anon USING (true);


--
-- Name: labor_group_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labor_group_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: labor_group_stats labor_group_stats_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY labor_group_stats_select_public ON public.labor_group_stats FOR SELECT TO authenticated, anon USING (true);


--
-- Name: labor_kit_plan_qty; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labor_kit_plan_qty ENABLE ROW LEVEL SECURITY;

--
-- Name: labor_kit_plan_qty labor_kit_plan_qty_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY labor_kit_plan_qty_all ON public.labor_kit_plan_qty TO authenticated USING (true) WITH CHECK (true);


--
-- Name: labor_kits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labor_kits ENABLE ROW LEVEL SECURITY;

--
-- Name: labor_norms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labor_norms ENABLE ROW LEVEL SECURITY;

--
-- Name: material_size_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_size_map ENABLE ROW LEVEL SECURITY;

--
-- Name: material_size_map material_size_map_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY material_size_map_select_public ON public.material_size_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: materials_leftovers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials_leftovers ENABLE ROW LEVEL SECURITY;

--
-- Name: materials_leftovers materials_leftovers_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_leftovers_select_public ON public.materials_leftovers FOR SELECT TO authenticated, anon USING (true);


--
-- Name: materials_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: materials_moves materials_moves_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_moves_select_public ON public.materials_moves FOR SELECT TO authenticated, anon USING (true);


--
-- Name: materials_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: materials_stock materials_stock_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materials_stock_select_public ON public.materials_stock FOR SELECT TO authenticated, anon USING (true);


--
-- Name: metal_catalog_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metal_catalog_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: metal_catalog_categories metal_catalog_categories_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_catalog_categories_read_all ON public.metal_catalog_categories FOR SELECT TO authenticated, anon USING (true);


--
-- Name: metal_catalog_categories metal_catalog_categories_write_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_catalog_categories_write_auth ON public.metal_catalog_categories TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: metal_components_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metal_components_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: metal_components_moves metal_components_moves_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_components_moves_select_public ON public.metal_components_moves FOR SELECT TO authenticated, anon USING (true);


--
-- Name: metal_components_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metal_components_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: metal_components_stock metal_components_stock_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_components_stock_select_public ON public.metal_components_stock FOR SELECT TO authenticated, anon USING (true);


--
-- Name: metal_product_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metal_product_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: metal_product_catalog metal_product_catalog_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_product_catalog_read_all ON public.metal_product_catalog FOR SELECT TO authenticated USING (true);


--
-- Name: metal_product_catalog metal_product_catalog_write_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_product_catalog_write_auth ON public.metal_product_catalog TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: metal_stage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metal_stage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: metal_stage_events metal_stage_events_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_stage_events_read_all ON public.metal_stage_events FOR SELECT TO authenticated USING (true);


--
-- Name: metal_stage_events metal_stage_events_write_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_stage_events_write_auth ON public.metal_stage_events TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: metal_work_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metal_work_items ENABLE ROW LEVEL SECURITY;

--
-- Name: metal_work_items metal_work_items_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_work_items_read_all ON public.metal_work_items FOR SELECT TO authenticated USING (true);


--
-- Name: metal_work_items metal_work_items_write_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_work_items_write_auth ON public.metal_work_items TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: metal_work_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metal_work_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: metal_work_queue metal_work_queue_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_work_queue_read_all ON public.metal_work_queue FOR SELECT TO authenticated USING (true);


--
-- Name: metal_work_queue metal_work_queue_write_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY metal_work_queue_write_admin_manager ON public.metal_work_queue TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_select_anon_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_select_anon_authenticated ON public.orders FOR SELECT TO authenticated, anon USING (true);


--
-- Name: overview_plan_months; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.overview_plan_months ENABLE ROW LEVEL SECURITY;

--
-- Name: overview_plan_months overview_plan_months_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY overview_plan_months_delete ON public.overview_plan_months FOR DELETE TO authenticated, anon USING (true);


--
-- Name: overview_plan_months overview_plan_months_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY overview_plan_months_insert ON public.overview_plan_months FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: overview_plan_months overview_plan_months_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY overview_plan_months_select ON public.overview_plan_months FOR SELECT TO authenticated, anon USING (true);


--
-- Name: overview_plan_months overview_plan_months_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY overview_plan_months_update ON public.overview_plan_months FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: plank_batch_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plank_batch_items ENABLE ROW LEVEL SECURITY;

--
-- Name: plank_batch_items plank_batch_items_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plank_batch_items_select_public ON public.plank_batch_items FOR SELECT TO authenticated, anon USING (true);


--
-- Name: plank_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plank_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: plank_batches plank_batches_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plank_batches_select_public ON public.plank_batches FOR SELECT TO authenticated, anon USING (true);


--
-- Name: production_plan_debts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_plan_debts ENABLE ROW LEVEL SECURITY;

--
-- Name: production_plan_debts production_plan_debts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_plan_debts_delete ON public.production_plan_debts FOR DELETE TO authenticated USING (true);


--
-- Name: production_plan_debts production_plan_debts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_plan_debts_insert ON public.production_plan_debts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: production_plan_debts production_plan_debts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_plan_debts_select ON public.production_plan_debts FOR SELECT TO authenticated USING (true);


--
-- Name: production_plan_debts production_plan_debts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_plan_debts_update ON public.production_plan_debts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: replacement_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.replacement_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: replacement_orders replacement_orders_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replacement_orders_delete ON public.replacement_orders FOR DELETE TO authenticated USING (true);


--
-- Name: replacement_orders replacement_orders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replacement_orders_insert ON public.replacement_orders FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: replacement_orders replacement_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replacement_orders_select ON public.replacement_orders FOR SELECT TO authenticated USING (true);


--
-- Name: replacement_orders replacement_orders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY replacement_orders_update ON public.replacement_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: section_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.section_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: section_catalog section_catalog_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY section_catalog_select_public ON public.section_catalog FOR SELECT TO authenticated, anon USING (true);


--
-- Name: sheet_orders_mirror; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sheet_orders_mirror ENABLE ROW LEVEL SECURITY;

--
-- Name: sheet_orders_mirror sheet_orders_mirror_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sheet_orders_mirror_select_public ON public.sheet_orders_mirror FOR SELECT TO authenticated, anon USING (true);


--
-- Name: shipment_cells; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_cells ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_cells shipment_cells_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipment_cells_select_public ON public.shipment_cells FOR SELECT TO authenticated, anon USING (true);


--
-- Name: shipment_plan_cells; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment_plan_cells ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment_plan_cells shipment_plan_cells_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipment_plan_cells_select_public ON public.shipment_plan_cells FOR SELECT TO authenticated, anon USING (true);


--
-- Name: strap_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.strap_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: strap_stock strap_stock_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY strap_stock_delete ON public.strap_stock FOR DELETE TO authenticated, anon USING (true);


--
-- Name: strap_stock strap_stock_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY strap_stock_insert ON public.strap_stock FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: strap_stock strap_stock_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY strap_stock_select ON public.strap_stock FOR SELECT TO authenticated, anon USING (true);


--
-- Name: strap_stock strap_stock_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY strap_stock_update ON public.strap_stock FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: sync_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_map ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_map sync_map_select_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sync_map_select_service_role ON public.sync_map FOR SELECT TO service_role USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict f71oabBqc4Q3SDE1fiJ2XIhLcRmVW6fVEtsHIApgJEFdLc1k4X8LZAxFMnqI19M

