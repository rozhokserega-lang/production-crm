-- Log admin comment changes so the order timeline can show who changed notes.

create or replace function public.web_set_order_admin_comment(
  p_order_id text,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
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

grant execute on function public.web_set_order_admin_comment(text, text) to anon, authenticated, service_role;
