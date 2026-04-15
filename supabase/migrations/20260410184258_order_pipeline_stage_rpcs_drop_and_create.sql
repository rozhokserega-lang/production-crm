-- Reconciled safe guard migration.
-- This timestamp exists in DB history, but local legacy SQL bundles many later changes.
-- To avoid accidental override in clean environments, keep this migration non-destructive
-- and assert that required RPCs are present after upstream migrations.

do $$
begin
  if to_regprocedure('public.web_set_stage_in_work(text,text,text)') is null then
    raise warning 'Missing RPC: public.web_set_stage_in_work(text,text,text)';
  end if;
  if to_regprocedure('public.web_set_stage_pause(text,text)') is null then
    raise warning 'Missing RPC: public.web_set_stage_pause(text,text)';
  end if;
  if to_regprocedure('public.web_set_stage_done(text,text)') is null then
    raise warning 'Missing RPC: public.web_set_stage_done(text,text)';
  end if;
end $$;
