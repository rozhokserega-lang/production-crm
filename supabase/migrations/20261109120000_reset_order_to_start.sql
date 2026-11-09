-- «Вернуть заказ в самое начало производства».
--
-- Кнопка «↩ Вернуть в начало» на карточке цеха (видна только admin) вызывает
-- RPC web_reset_order_to_start: она откатывает заказ целиком к состоянию
-- «только создан» — Пила/Кромка/Присадка/Сборка = «Ожидает», общий статус =
-- «Новый заказ», все таймеры этапов (start/done/pause) обнуляются.
--
-- Ограничения:
--   * только роль admin (как у веб_set_stage_wait — принудительный откат);
--   * нельзя откатывать отгруженные заказы и заказы, ушедшие с цеховых этапов
--     дальше чем «Собран» (комплектация/отправка) — там своя логика расхода
--     фурнитуры и отправки;
--   * pipeline_stage пересчитывает триггер tr_orders_pipeline_stage сам.
--
-- Аналог режима «Админ: исправить этап» из карточки заказа, но одним кликом
-- сразу для всех линий. Факты времени (labor_facts) сознательно не трогаем —
-- тем же поведением обладает и web_set_stage_wait.

CREATE OR REPLACE FUNCTION public.web_reset_order_to_start(p_order_id text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_row public.orders;
  v_prev_pipeline_stage text;
BEGIN
  -- Только администратор может полностью откатить заказ к началу производства.
  PERFORM public.web_require_roles(ARRAY['admin']);

  IF coalesce(trim(p_order_id), '') = '' THEN
    RAISE EXCEPTION 'Order id is required';
  END IF;

  SELECT * INTO v_row FROM public.orders WHERE order_id = p_order_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_prev_pipeline_stage := v_row.pipeline_stage;

  IF v_row.shipped
     OR v_row.pipeline_stage IN ('warehouse_kit', 'ready_to_ship', 'shipped') THEN
    RAISE EXCEPTION 'Заказ уже на комплектации/отправке или отгружен — сброс к началу производства запрещен';
  END IF;

  UPDATE public.orders
  SET
    pilka_status = '⏳ Ожидает пилу',
    pilka_started_at = NULL,
    pilka_done_at = NULL,
    pilka_pause_started_at = NULL,
    pilka_pause_acc_min = 0,
    kromka_status = '⏳ Ожидает',
    kromka_started_at = NULL,
    kromka_done_at = NULL,
    kromka_pause_started_at = NULL,
    kromka_pause_acc_min = 0,
    pras_status = '⏳ Ожидает',
    pras_started_at = NULL,
    pras_done_at = NULL,
    pras_pause_started_at = NULL,
    pras_pause_acc_min = 0,
    assembly_status = '⏳ Ожидает',
    overall_status = '🟡 Новый заказ',
    updated_at = now()
  WHERE order_id = p_order_id
  RETURNING * INTO v_row;

  PERFORM public.web_audit_log_event(
    'reset_order_to_start', 'order', p_order_id,
    jsonb_build_object('previous_pipeline_stage', v_prev_pipeline_stage)
  );

  RETURN v_row;
END;
$$;

-- Выдача прав PostgREST. На обычном PostgreSQL роль гарантированно существует
-- (без неё REST не работал бы, см. docker-compose.local-db.yml → PGRST_DB_ANON_ROLE),
-- но подстрахуемся: выдаём только тем ролям, которые реально есть в кластере.
DO $$
DECLARE
  r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['anon', 'authenticated', 'service_role', 'postgres']) LOOP
    IF to_regrole(r) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.web_reset_order_to_start(text) TO %I', r);
    END IF;
  END LOOP;
END
$$;
