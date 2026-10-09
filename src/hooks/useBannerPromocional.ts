import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { getZonedNow, pickLiveBanner, type AgendamentoTipo, type ZonedNow } from '@/lib/bannerSchedule';

export interface BannerPromocional {
  id: string;
  ativo: boolean;
  imagem_url: string | null;
  produto_id: string | null;
  valor_promocional: number | null;
  titulo: string | null;
  agendamento_tipo: AgendamentoTipo;
  dias_semana: string[];
  data_inicio: string | null;
  data_fim: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  created_at: string;
  updated_at: string;
}

export type BannerInput = Omit<BannerPromocional, 'id' | 'created_at' | 'updated_at'>;

const BANNERS_KEY = ['banners-promocionais'] as const;

// Garante valores padrão mesmo antes da migração de agendamento ser aplicada.
const normalize = (row: Tables<'banner_promocional'>): BannerPromocional => ({
  ...row,
  agendamento_tipo: (row.agendamento_tipo as AgendamentoTipo) ?? 'sempre',
  dias_semana: row.dias_semana ?? [],
  data_inicio: row.data_inicio ?? null,
  data_fim: row.data_fim ?? null,
  hora_inicio: row.hora_inicio ?? null,
  hora_fim: row.hora_fim ?? null,
});

/** Todos os banners (admin). */
export const useBanners = () => {
  return useQuery({
    queryKey: [...BANNERS_KEY, 'todos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banner_promocional')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
  });
};

/** Relógio no fuso da loja que avança sozinho, para reavaliar a agenda sem recarregar. */
export const useStoreClock = (intervalMs = 30000): ZonedNow => {
  const [now, setNow] = useState(() => getZonedNow());
  useEffect(() => {
    const tick = () => setNow(getZonedNow());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
};

/** Banner que deve estar visível no site neste momento. */
export const useBannerAtivo = () => {
  const { data: banners } = useQuery({
    queryKey: [...BANNERS_KEY, 'ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banner_promocional')
        .select('*')
        .eq('ativo', true);
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
    refetchInterval: 60000, // pega alterações feitas no admin
    staleTime: 30000,
  });
  const now = useStoreClock();
  return useMemo(() => (banners ? pickLiveBanner(banners, now) : null), [banners, now]);
};

export const useSaveBanner = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: BannerInput & { id?: string }) => {
      const query = id
        ? supabase.from('banner_promocional').update(input).eq('id', id)
        : supabase.from('banner_promocional').insert(input);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return normalize(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  });
};

export const useToggleBanner = () => {
  const queryClient = useQueryClient();
  const key = [...BANNERS_KEY, 'todos'];
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('banner_promocional')
        .update({ ativo })
        .eq('id', id);
      if (error) throw error;
    },
    // Atualização otimista: o switch responde na hora.
    onMutate: async ({ id, ativo }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BannerPromocional[]>(key);
      queryClient.setQueryData<BannerPromocional[]>(key, (old) =>
        old?.map((b) => (b.id === id ? { ...b, ativo } : b)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  });
};

export const useDeleteBanner = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('banner_promocional').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANNERS_KEY }),
  });
};
