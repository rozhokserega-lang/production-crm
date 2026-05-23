-- Пример комплекта для раскроя: Siena 2 150 (из furniture_templates.json)

INSERT INTO public.cutting_catalog_kits (name, items, sort_order)
SELECT
  'Siena 2 150',
  '[
    {"itemName": "Крышки (736_350)", "w": 736, "h": 350, "perUnit": 2, "material": ""},
    {"itemName": "Дно (720_321)", "w": 720, "h": 321, "perUnit": 2, "material": ""},
    {"itemName": "Бока внешние (347_350)", "w": 347, "h": 350, "perUnit": 2, "material": ""},
    {"itemName": "Бока внутренние (322_282)", "w": 322, "h": 282, "perUnit": 2, "material": ""},
    {"itemName": "Стойка (305_266)", "w": 305, "h": 266, "perUnit": 2, "material": ""},
    {"itemName": "Планка крышки (736_40)", "w": 736, "h": 40, "perUnit": 2, "material": ""}
  ]'::jsonb,
  10
WHERE NOT EXISTS (
  SELECT 1 FROM public.cutting_catalog_kits WHERE name = 'Siena 2 150'
);
