-- Белые столы Solito 1150 должны быть в секции «Solito 1150 белый» (как Solito 1350 белый/черный).

UPDATE public.item_article_map
SET section_name = 'Solito 1150 белый'
WHERE trim(section_name) = 'Solito 1150'
  AND item_name ~* '(^|[,.\s])белый';

UPDATE public.item_article_map
SET item_name = 'Стол письменный Solito, белый. Серия 1150. Дуб Сонома'
WHERE upper(trim(article)) = upper('GXofficedeskSWOB001');
