-- Agendamento de banners promocionais
-- A tabela passa a suportar vários banners, cada um com sua própria regra de exibição.
-- Mudança apenas aditiva: o banner existente vira "sempre" e continua funcionando igual.

ALTER TABLE public.banner_promocional
  ADD COLUMN IF NOT EXISTS agendamento_tipo text NOT NULL DEFAULT 'sempre',
  ADD COLUMN IF NOT EXISTS dias_semana text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date,
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fim time;

ALTER TABLE public.banner_promocional
  DROP CONSTRAINT IF EXISTS banner_agendamento_tipo_check,
  ADD CONSTRAINT banner_agendamento_tipo_check
    CHECK (agendamento_tipo IN ('sempre', 'semanal', 'data'));

ALTER TABLE public.banner_promocional
  DROP CONSTRAINT IF EXISTS banner_periodo_check,
  ADD CONSTRAINT banner_periodo_check
    CHECK (data_inicio IS NULL OR data_fim IS NULL OR data_fim >= data_inicio);

CREATE INDEX IF NOT EXISTS banner_promocional_ativo_idx
  ON public.banner_promocional (ativo);
