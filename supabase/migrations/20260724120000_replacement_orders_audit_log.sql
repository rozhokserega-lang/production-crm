-- Audit log for replacement parts orders (warehouse → create missing part flow).

create or replace function public.trg_crm_audit_replacement_orders()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.web_audit_log_event(
      'delete_replacement_order',
      'replacement_orders',
      old.id,
      jsonb_build_object(
        'product', old.product,
        'part', old.part,
        'qty', old.qty,
        'color', old.color,
        'note', old.note,
        'status', old.status,
        'sent_to_work', old.sent_to_work,
        'packaging_accepted', old.packaging_accepted,
        'workshop_order_id', old.workshop_order_id,
        'created_at', old.created_at
      )
    );
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform public.web_audit_log_event(
      'create_replacement_order',
      'replacement_orders',
      new.id,
      jsonb_build_object(
        'product', new.product,
        'part', new.part,
        'qty', new.qty,
        'color', new.color,
        'note', new.note,
        'status', new.status
      )
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.status, '') is distinct from coalesce(new.status, '')
       or old.sent_to_work is distinct from new.sent_to_work
       or old.packaging_accepted is distinct from new.packaging_accepted
       or coalesce(old.workshop_order_id, '') is distinct from coalesce(new.workshop_order_id, '') then
      perform public.web_audit_log_event(
        'update_replacement_order',
        'replacement_orders',
        coalesce(new.id, old.id),
        jsonb_build_object(
          'before', jsonb_build_object(
            'status', old.status,
            'sent_to_work', old.sent_to_work,
            'packaging_accepted', old.packaging_accepted,
            'workshop_order_id', old.workshop_order_id
          ),
          'after', jsonb_build_object(
            'status', new.status,
            'sent_to_work', new.sent_to_work,
            'packaging_accepted', new.packaging_accepted,
            'workshop_order_id', new.workshop_order_id
          ),
          'product', new.product,
          'part', new.part,
          'qty', new.qty,
          'color', new.color,
          'note', new.note
        )
      );
    end if;
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_crm_audit_replacement_orders on public.replacement_orders;
create trigger trg_crm_audit_replacement_orders
after insert or update or delete on public.replacement_orders
for each row
execute function public.trg_crm_audit_replacement_orders();
