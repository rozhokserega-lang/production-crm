-- Seed TV/Siena templates and extend desk sheet rules for Pino X.

insert into public.furniture_custom_templates (product_name, details, kits_per_sheet, created_by)
values
  (
    'Siena',
    '[
      {"perUnit":2,"detailName":"Крышки (800_350)"},
      {"perUnit":2,"detailName":"Дно (784_321_900)"},
      {"perUnit":2,"detailName":"Бока внешние (364_350)"},
      {"perUnit":2,"detailName":"Бока внутренние (322_298)"},
      {"perUnit":2,"detailName":"Стойка (305_282)"},
      {"perUnit":2,"detailName":"Планка крышки (800_40)"},
      {"perUnit":4,"detailName":"Фасад (396_305)"}
    ]'::jsonb,
    0,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'ТВ тумба',
    '[
      {"perUnit":1,"detailName":"Крышка (1100_356)"},
      {"perUnit":2,"detailName":"Бока (316_167)"},
      {"perUnit":2,"detailName":"Полка (1100_316)"}
    ]'::jsonb,
    0,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'ТВ тумба 1500',
    '[
      {"perUnit":1,"detailName":"Крышка (1500_356)"},
      {"perUnit":2,"detailName":"Бока (316_167)"},
      {"perUnit":2,"detailName":"Полка (1500_316)"}
    ]'::jsonb,
    0,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'Тумба под ТВ Siena 2 150. Интра - Серый',
    '[
      {"perUnit":2,"detailName":"Крышки (736_350)"},
      {"perUnit":2,"detailName":"Дно (720_321)"},
      {"perUnit":2,"detailName":"Бока внешние (347_350)"},
      {"perUnit":2,"detailName":"Бока внутренние (322_282)"},
      {"perUnit":2,"detailName":"Стойка (305_266)"},
      {"perUnit":2,"detailName":"Планка крышки (736_40)"}
    ]'::jsonb,
    0.4,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'Flamingo круглый',
    '[
      {"perUnit":1,"detailName":"Крышка (480_480)"},
      {"perUnit":1,"detailName":"Дно (480_320)"}
    ]'::jsonb,
    0,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'Flamingo прямоугольный',
    '[
      {"perUnit":1,"detailName":"Крышка (600_400)"},
      {"perUnit":1,"detailName":"Дно (600_300)"}
    ]'::jsonb,
    0,
    '00000000-0000-0000-0000-000000000001'::uuid
  )
on conflict (product_name) do update
set
  details = excluded.details,
  kits_per_sheet = excluded.kits_per_sheet,
  updated_at = now();

create or replace function public.web_resolve_output_per_sheet(
  p_section_name text,
  p_item text,
  p_material text,
  p_format_type text default null,
  p_fallback numeric default 0
)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_section text := lower(trim(coalesce(p_section_name, '')));
  v_item text := lower(trim(coalesce(p_item, '')));
  v_material text := lower(trim(coalesce(p_material, '')));
  v_format_type text := lower(trim(coalesce(p_format_type, '')));
  v_material_dims text := regexp_replace(v_material, '[\s*хx×]', '', 'g');
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
  v_is_solito1150 := v_section in ('solito 1150', 'solito 1150 белый')
    or v_item like '%серия 1150%';
  v_is_solito1350 := v_section in ('solito 1350 черный', 'solito 1350 белый')
    or v_item like '%серия 1350%';
  v_is_stabile := v_section = 'stabile' or v_item like '%stabile%';
  v_is_donini_grande := v_section in ('donini grande 750', 'donini grande 806')
    or v_item like '%donini grande 750%'
    or v_item like '%donini grande 806%';
  v_is_klassiko := v_section in ('классико', 'классико +')
    or v_item like '%классико%';
  v_is_premier := v_section in ('премьер', 'премьер белый', 'премьер черный')
    or v_item like '%премьер%';
  v_is_donini_r := v_section in ('donini r 750', 'donini r 806')
    or v_item like '%donini r 750%'
    or v_item like '%donini r 806%';
  v_is_pino_x := v_item like '%pino x%';
  v_is_donini_target :=
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
    or v_is_pino_x
    or
    v_section in ('donini 806', 'donini 750', 'donini 806 белый', 'donini 750 белый')
    or v_item like '%donini 806%'
    or v_item like '%donini 750%';

  if not v_is_donini_target then
    return v_fallback;
  end if;

  if v_is_solito1350 then
    return 4;
  end if;
  if v_is_premier then
    return 5;
  end if;
  if v_is_klassiko then
    return 6;
  end if;
  if v_is_donini_grande then
    return 3;
  end if;
  if v_is_donini_r then
    return 4;
  end if;
  if v_is_solito2 then
    return 6;
  end if;
  if v_is_solito1150 then
    return 6;
  end if;

  if v_format_type in ('small', 'малый') then
    return case when v_is_cremona then 1.5 else 4 end;
  end if;

  if v_format_type in ('large', 'большой') then
    return case when v_is_cremona then 2 else 6 end;
  end if;

  select lower(trim(coalesce(msm.sheet_size, '')))
    into v_mapped_sheet_size
  from public.material_size_map msm
  where public.normalize_item_key(msm.material_name) = public.normalize_item_key(v_material)
  order by msm.updated_at desc
  limit 1;

  v_mapped_dims := regexp_replace(coalesce(v_mapped_sheet_size, ''), '[\s*хx×]', '', 'g');
  if v_is_stabile then
    if v_mapped_dims = '28002070' then
      return 4;
    end if;
    if v_mapped_dims = '27501830' then
      return 3;
    end if;
  end if;
  if v_mapped_dims = '28002070' then
    return case when v_is_cremona then 2 else 6 end;
  end if;
  if v_mapped_dims = '27501830' then
    return case when v_is_cremona then 1.5 else 4 end;
  end if;

  if v_material_dims like '%28002070%' then
    if v_is_stabile then
      return 4;
    end if;
    return case when v_is_cremona then 2 else 6 end;
  end if;
  if v_material_dims like '%27501830%' then
    if v_is_stabile then
      return 3;
    end if;
    return case when v_is_cremona then 1.5 else 4 end;
  end if;

  return v_fallback;
end;
$$;
