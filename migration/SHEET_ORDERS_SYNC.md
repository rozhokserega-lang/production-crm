# Google Sheet -> Supabase orders mirror

This flow mirrors production rows from Google Sheet tab into `public.sheet_orders_mirror`.

## 1) Apply DB migration

Apply:

- `supabase/migrations/20260415143000_sheet_orders_mirror_from_gsheet.sql`

## 2) Generate SQL from sheet

```bash
python migration/sync_sheet_orders_from_gsheet.py \
  --sheet-id 1gRMs2AVxIXwmQLLnB2WIoRW7mPkGc9usyaUrXZAHuIs \
  --gid 1772676601 \
  --mapping-gid <GID_ЛИСТА_СООТВЕТСТВИЙ> \
  --no-apply
```

This creates:

- `migration/sheet_orders_sync_from_gsheet.sql`

## 3) Apply generated upsert

Option A (recommended automation):

```bash
set SUPABASE_DB_URL=postgresql://...
python migration/sync_sheet_orders_from_gsheet.py \
  --sheet-id 1gRMs2AVxIXwmQLLnB2WIoRW7mPkGc9usyaUrXZAHuIs \
  --gid 1772676601 \
  --mapping-gid <GID_ЛИСТА_СООТВЕТСТВИЙ>
```

Option B (manual):

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f migration/sheet_orders_sync_from_gsheet.sql
```

## 4) Read data from frontend

Use RPC:

- `public.web_get_sheet_orders_mirror(p_sheet_gid text default null)`

or view:

- `public.v_sheet_orders_mirror`

## Notes

- This mirror is intentionally one-way (`Google Sheet -> Supabase`) for safe transition.
- Source time/date cells are stored as raw text (`*_raw`) to avoid data loss during first rollout.
- If mapping sheet is provided, `article_code` is prioritized from mapping (`изделие + цвет -> артикул`).
