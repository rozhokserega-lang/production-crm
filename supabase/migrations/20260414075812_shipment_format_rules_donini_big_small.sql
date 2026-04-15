-- Reconciled safe guard migration.
-- In production this topic is split into many timestamped migrations
-- (20260414081311 ... 20260414100129).
-- Keep this timestamp non-destructive and validate required objects exist.

do $$
begin
  if to_regclass('public.material_size_map') is null then
    raise warning 'Missing table: public.material_size_map';
  end if;
  if to_regprocedure('public.web_resolve_output_per_sheet(text,text,text,numeric)') is null then
    raise warning 'Missing function: public.web_resolve_output_per_sheet(text,text,text,numeric)';
  end if;
  if to_regprocedure('public.web_get_shipment_board()') is null then
    raise warning 'Missing function: public.web_get_shipment_board()';
  end if;
end $$;
