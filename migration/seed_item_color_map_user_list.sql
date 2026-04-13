-- Seed user-provided item -> color mappings and normalize lookup behavior.

create or replace function public.normalize_item_key(p_text text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      replace(lower(coalesce(p_text, '')), 'х', 'x'),
      '[^0-9a-zа-яё]+',
      ' ',
      'g'
    )
  );
$$;

create index if not exists idx_item_color_map_norm_key
  on public.item_color_map (public.normalize_item_key(item_name));

create or replace function public.resolve_color_name(p_item text)
returns text
language plpgsql
stable
as $$
declare
  v_norm text := public.normalize_item_key(p_item);
  v_color text;
begin
  -- 1) Exact normalized match.
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

  -- 2) Fallback: mapped name is contained inside incoming item text.
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

with raw as (
  select $data$
Stabile. 1350х650. Интра.	Интра
Stabile. 1350х650. Дуб Кальяри.	Дуб кальяри
Stabile. 1350х650. Дуб Вотан.	Дуб вотан
Stabile. 1350х650. Бетон Чикаго светло-серый.	Бетон чикаго
Solito2. Серия 1156. Солнечный	Солнечный
Solito2. Серия 1156. Муза	Муза
Solito2. Серия 1156. Маренго	Маренго
Solito. Серия 1150. Бетон Чикаго светло-серый.	Бетон чикаго
Solito. Серия 1350 Бетон Чикаго светло-серый.	Бетон чикаго
Solito. Серия 1350. Трансильвания.	Трансильвания
Solito. Серия 1150. Дуб Чарльстон тёмно-коричневый.	Дуб чарльзтон
Solito. Серия 1350. Дуб Чарльстон тёмно-коричневый.	Дуб чарльзтон
Solito. Серия 1150. Трансильвания.	Трансильвания
Solito, белый. Серия 1150. Сосна Касцина.	Сосна касцина
Solito, белый. Серия 1350 Сосна Касцина.	Сосна касцина
Solito, белый. Серия 1350 Дуб Бардолино натуральный.	Бардолино
Solito, белый. Серия 1150. Дуб Бардолино натуральный.	Бардолино
Cremona. 1350х700. Юта	Юта
Cremona. 1350х700. Дуб Хантон темный	Дуб хантон
Cremona. 1350х700. Дуб Бардолино натуральный.	Бардолино
Cremona. 1350х700. Бетон Чикаго светло-серый.	Бетон чикаго
Avella. Сланец Скиваро	Сланец Скиваро
Avella. Дуб Хантон темный	Дуб хантон
Avella. Дуб Бардолино натуральный.	Бардолино
Avella lite. Ясень Тронхейм	Ясень тронхейм
Avella lite. Сланец Скиваро	Сланец Скиваро
Avella lite. Дуб Хантон темный	Дуб хантон
Avella lite. Дуб Галифакс олово.	Дуб галифакс олово
Avella lite. Дуб Бардолино натуральный.	Бардолино
Avella lite. Бетон Чикаго светло-серый.	Бетон чикаго
Премьер. Черный. Дуб Хантон тёмный 25	Дуб хантон 25
Премьер. Черный. Бетон Чикаго светло-серый 25	Бетон чикаго 25
Премьер. Черный. Дуб Канзас коричневый 25	дуб канзас 25
Премьер. Черный. Сланец Скиваро 25	Сланец Скиваро 25
Классико. Цемент	Цемент
Классико. Дуб Чарльстон тёмно-коричневый	Дуб чарльзтон
Donini Grande  750 мм. Бетон	Бетон
Donini Grande 806 мм. Дуб Вотан	Дуб вотан
Donini Grande 750 мм. Дуб Вотан	Дуб вотан
Donini 806 мм. Мрамор Кристалл	Мрамор кристал
Donini 806 мм. Кейптаун	Кейптаун
Donini 806 мм. Камень Пьетра Гриджиа чёрный.	Камень пьетра гриджиа
Donini 806 мм. Дуб Марсала	Дуб марсала
Donini 806 мм. Дуб Вотан	Дуб вотан
Donini 806 мм. Белые ноги. Мрамор Кристалл	Мрамор кристал
Donini 806 мм. Дуб Хантон темный	Дуб хантон
Donini 806 мм. Интра	Интра
Donini 806 мм. Белые ноги. Дуб Вотан	Дуб вотан
Donini 750 мм. Белые ноги. Дуб Вотан	Дуб вотан
Donini 750 мм. Дуб Хантон темный	Дуб хантон
Donini 750 мм. Кейптаун	Кейптаун
Donini 750 мм. Камень Пьетра Гриджиа чёрный.	Камень пьетра гриджиа
Donini 750 мм. Дуб Вотан	Дуб вотан
Тумба под ТВ Лофт. Ясень Анкор темный	Ясень анкор
Тумба под ТВ Лофт. Дуб Вотан	Дуб вотан
Тумба под ТВ Лофт. Дуб Сонома	Бардолино
Тумба под ТВ Лофт. Бетон	Бетон
Cremona. 1350х700. Дуб Вотан	Дуб вотан
Avella. Дуб Вотан	Дуб вотан
Donini Grande  750 мм. Герион	Герион
Avella lite. Дуб Вотан	Дуб вотан
Donini R 750 мм. Дуб Вотан	Дуб вотан
Классико. Дуб Бардолино натуральный.	Бардолино
Donini R 750 мм. Бетон	Бетон
Donini Grande  806 мм. Бетон	Бетон
Donini 806 мм. Бетон Чикаго светло-серый.	Бетон чикаго
Donini 750 мм. Мрамор Кристалл	Мрамор кристал
Donini 750 мм. Бетон Чикаго светло-серый.	Бетон чикаго
Donini 806 мм. Трансильвания	Трансильвания
Donini R 750 мм. Дуб Сонома	Бардолино
Solito Серия 1350 Дуб Бардолино натуральный.	Бардолино
Avella. Бетон Чикаго светло-серый.	Бетон чикаго
Donini Grande  806 мм. Герион	Герион
Donini Grande 750 мм. Дуб Коми	Дуб коми
Donini Grande  806 мм. Юта	Юта
Donini 750 мм. Интра	Интра
Donini 750 мм. Трансильвания	Трансильвания
Donini 806 мм. Выбеленное дерево	Выбеленное дерево
Классико. Белый. Сосна Касцина	Сосна касцина
Премьер. Черный. Ясень Тронхейм 25	Ясень тронхейм 25
Тумба под ТВ Лофт. Юта	Юта
Тумба под ТВ Лофт. Дуб Коми	Дуб коми
Тумба под ТВ Лофт 150. Дуб Вотан	Дуб вотан
Donini R 806 мм. Бетон	Бетон
Donini R 806 мм. Дуб Вотан	Дуб вотан
Donini R 806 мм. Дуб Сонома	Бардолино
Donini R 806 мм. Юта	Юта
Donini R 806 мм. Ясень Анкор темный	Ясень анкор
Siena 1. Интра - Эра	Интра
Siena 1.Слоновая кость - Эра	Слоновья кость
Siena 1. Подвесная. Слоновая кость - Эра	Слоновья кость
Donini Grande 806 мм. Дуб Коми	Дуб коми
Donini 806 мм. Белые ноги. Юта	Юта
Donini 806 мм. Дуб Бардолино натуральный.	Бардолино
Donini 750 мм. Белые ноги. Дуб Сонома	Бардолино
Donini R 750 мм. Юта	Юта
Donini R 750 мм. Ясень Анкор темный	Ясень анкор
Donini 750 мм. Белые ноги. Мрамор Кристалл	Мрамор кристал
Donini 750 мм. Дуб Бардолино натуральный.	Бардолино
Классико. Ясень Анкор Темный	Ясень анкор
Solito, белый.  1350. Дуб Чарльстон	Дуб чарльзтон
Siena 2. Интра - Серый	Интра
Siena 2. Подвесная. Интра - Серый	Интра
Siena 3. Ночное небо - Геометрия белая	Темное небо
Siena 3. Юта - Геометрия белая	Юта
Donini 806 мм. Белые ноги. Дуб Сонома	Бардолино
Donini 750 мм. Белые ноги. Юта	Юта
Donini 750 мм. Дуб Марсала	Дуб марсала
Тумба под ТВ Лофт. Дуб Марсала	Дуб марсала
Тумба под ТВ Лофт. Интра	Интра
Тумба под ТВ Лофт. Трансильвания	Трансильвания
Тумба под ТВ Лофт 150. Дуб Марсала	Дуб марсала
Тумба под ТВ Лофт 150. Дуб Сонома	Бардолино
Тумба под ТВ Лофт 150. Интра	Интра
Тумба под ТВ Лофт 150. Трансильвания	Трансильвания
Классико+. Дуб вотан	Дуб вотан
Avella. Дуб Галифакс олово.	Дуб галифакс олово
Solito, белый. Серия 1150. Кейптаун.	Кейптаун
Тумба под ТВ Лофт 150. Юта	Юта
Donini Grande  750 мм. Дуб Делано темный	Дуб делано
Siena 1. Подвесная. Интра - Эра	Интра
Siena 3. Интра - Геометрия белая	Интра
Siena 3. Подвесная. Ночное небо - Геометрия белая	Темное небо
Siena 2. Юта - Серый	Юта
Siena 1. Юта - Графит	Юта
Классико. Гамбия	Гамбия
Siena 3. Подвесная. Интра - Геометрия белая	Интра
Siena 2. Дуб Вотан - Коричневый	Дуб вотан
Siena 2. Подвесная. Дуб Вотан - Коричневый	Дуб вотан
Avella lite. Камень Пьетра Гриджиа чёрный.	Камень пьетра гриджиа
Avella lite. Дуб Коми	Дуб коми
Avella lite. Мрамор Каррара	Мрамор каррара
Donini R 806 мм. Дуб Коми	Дуб коми
Donini R 750 мм. Дуб Коми	Дуб коми
Donini Grande  750 мм. Дуб Сонома	Бардолино
Siena 1. Подвесная. Юта - Графит	Юта
Donini Grande 806 мм. Дуб Сонома	Бардолино
Donini Grande  750 мм. Ясень Анкор Темный	Ясень анкор
Donini Grande  750 мм. Юта	Юта
Премьер. Белый. Ясень Тронхейм 25	Ясень тронхейм 25
Премьер. Белый. Дуб Хантон тёмный 25	Дуб хантон 25
Donini Grande 806 мм. Дуб Делано темный	Дуб делано
Donini Grande 806 мм. Ясень Анкор Темный	Ясень анкор
Премьер. Белый. Бетон Чикаго светло-серый 25	Бетон чикаго 25
Премьер. Белый. Дуб Канзас коричневый 25	дуб канзас 25
Siena 3. Подвесная. Юта - Геометрия белая	Юта
$data$::text as blob
),
parsed as (
  select
    trim(split_part(line, E'\t', 1)) as item_name,
    trim(split_part(line, E'\t', 2)) as color_name
  from regexp_split_to_table((select blob from raw), E'\r?\n') as t(line)
  where trim(line) <> ''
),
prepared as (
  select
    item_name,
    color_name
  from parsed
  where item_name <> '' and color_name <> ''
)
insert into public.item_color_map(item_name, color_name, source)
select p.item_name, p.color_name, 'manual'
from prepared p
on conflict (item_name)
do update set
  color_name = excluded.color_name,
  source = 'manual',
  updated_at = now();
