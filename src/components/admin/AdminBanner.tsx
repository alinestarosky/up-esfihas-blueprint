import { useMemo, useState } from 'react';
import {
  useBanners,
  useDeleteBanner,
  useStoreClock,
  useToggleBanner,
  type BannerPromocional,
} from '@/hooks/useBannerPromocional';
import {
  DIAS_SEMANA,
  bannerStatus,
  compareByPriority,
  describeNextStart,
  describeSchedule,
  describeTimeWindow,
  formatDateShort,
  matchesDay,
  nextStart,
  pickLiveBanner,
  shiftDate,
  weekdayOf,
  type BannerStatus,
} from '@/lib/bannerSchedule';
import { BannerEditor } from './banner/BannerEditor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { CalendarDays, Copy, Image as ImageIcon, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_META: Record<BannerStatus, { label: string; className: string; order: number }> = {
  no_ar: { label: 'No ar', className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400', order: 0 },
  sobreposto: { label: 'Na fila', className: 'bg-amber-500/12 text-amber-700 dark:text-amber-400', order: 1 },
  agendado: { label: 'Agendado', className: 'bg-sky-500/12 text-sky-700 dark:text-sky-400', order: 2 },
  sem_imagem: { label: 'Sem imagem', className: 'bg-destructive/10 text-destructive', order: 3 },
  desativado: { label: 'Desativado', className: 'bg-muted text-muted-foreground', order: 4 },
  expirado: { label: 'Encerrado', className: 'bg-muted text-muted-foreground', order: 5 },
};

function StatusBadge({ status }: { status: BannerStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', meta.className)}>
      {status === 'no_ar' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
      {meta.label}
    </span>
  );
}

const AdminBanner = () => {
  const { data: banners, isLoading } = useBanners();
  const toggleBanner = useToggleBanner();
  const deleteBanner = useDeleteBanner();
  const now = useStoreClock();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<BannerPromocional> | null>(null);
  const [toDelete, setToDelete] = useState<BannerPromocional | null>(null);

  const live = useMemo(() => (banners ? pickLiveBanner(banners, now) : null), [banners, now]);

  const rows = useMemo(() => {
    if (!banners) return [];
    return banners
      .map((b) => ({ banner: b, status: bannerStatus(b, now, live?.id ?? null), next: nextStart(b, now) }))
      .sort(
        (a, b) =>
          STATUS_META[a.status].order - STATUS_META[b.status].order ||
          b.banner.updated_at.localeCompare(a.banner.updated_at),
      );
  }, [banners, now, live]);

  const proximo = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'agendado' && r.next)
        .sort((a, b) => a.next!.date.localeCompare(b.next!.date) || a.next!.minutes - b.next!.minutes)[0],
    [rows],
  );

  const semana = useMemo(() => {
    const ativos = (banners ?? []).filter((b) => b.ativo && b.imagem_url);
    return Array.from({ length: 7 }, (_, i) => {
      const date = shiftDate(now.date, i);
      const weekday = weekdayOf(date);
      return {
        date,
        weekday,
        banners: ativos.filter((b) => matchesDay(b, date, weekday)).sort(compareByPriority),
      };
    });
  }, [banners, now]);

  const openEditor = (banner: Partial<BannerPromocional> | null) => {
    setEditing(banner);
    setEditorOpen(true);
  };

  const duplicate = (b: BannerPromocional) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = b;
    openEditor({ ...rest, titulo: `${b.titulo ?? 'Banner'} (cópia)`, ativo: false });
  };

  const handleToggle = (b: BannerPromocional, ativo: boolean) => {
    toggleBanner.mutate(
      { id: b.id, ativo },
      {
        onSuccess: () => toast.success(ativo ? 'Banner ativado' : 'Banner desativado'),
        onError: () => toast.error('Não foi possível alterar o banner'),
      },
    );
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteBanner.mutateAsync(toDelete.id);
      toast.success('Banner excluído');
    } catch {
      toast.error('Erro ao excluir banner');
    } finally {
      setToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* No ar agora */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Banners Promocionais
            </CardTitle>
            <CardDescription className="mt-1.5">
              Programe um banner diferente para cada dia e horário. Horário de Brasília.
            </CardDescription>
          </div>
          <Button onClick={() => openEditor(null)} className="shrink-0 active:scale-[0.97] transition-transform">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo banner</span>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">No site agora</span>
              {live && <StatusBadge status="no_ar" />}
            </div>
            {live ? (
              <button
                type="button"
                onClick={() => openEditor(live)}
                className="group w-full text-left"
              >
                <div className="overflow-hidden rounded-lg border bg-background">
                  <img src={live.imagem_url!} alt={live.titulo ?? 'Banner no ar'} className="w-full h-auto max-h-52 object-cover" />
                </div>
                <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-semibold group-hover:underline underline-offset-4">{live.titulo}</span>
                  <span className="text-sm text-muted-foreground">{describeSchedule(live)}</span>
                </div>
              </button>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm font-medium">Nenhum banner aparecendo agora</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {proximo
                    ? `Próximo: ${proximo.banner.titulo} — ${describeNextStart(proximo.next!, now)}`
                    : 'Crie um banner ou ative um existente.'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Todos os banners</CardTitle>
          <CardDescription>
            Se dois banners coincidirem, aparece o mais específico: data específica, depois dias da semana, depois "sempre".
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-6 pb-8 pt-2 text-center">
              <p className="text-sm text-muted-foreground mb-3">Nenhum banner cadastrado.</p>
              <Button variant="outline" onClick={() => openEditor(null)}>
                <Plus className="h-4 w-4 mr-2" /> Criar primeiro banner
              </Button>
            </div>
          ) : (
            <ul className="divide-y border-t">
              {rows.map(({ banner: b, status, next }) => (
                <li key={b.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3">
                  <button
                    type="button"
                    onClick={() => openEditor(b)}
                    className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4 text-left rounded-md -m-1 p-1 transition-colors hover:bg-muted/50"
                  >
                    <div
                      className={cn(
                        'h-12 w-20 sm:h-14 sm:w-28 shrink-0 overflow-hidden rounded-md border bg-muted',
                        !b.ativo && 'opacity-50 grayscale',
                      )}
                    >
                      {b.imagem_url ? (
                        <img src={b.imagem_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-sm">{b.titulo || 'Sem nome'}</span>
                        <StatusBadge status={status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{describeSchedule(b)}</p>
                      {status === 'agendado' && next && (
                        <p className="text-xs text-muted-foreground">Entra {describeNextStart(next, now)}</p>
                      )}
                      {status === 'sobreposto' && live && (
                        <p className="text-xs text-muted-foreground truncate">Coberto por "{live.titulo}"</p>
                      )}
                    </div>
                  </button>

                  <Switch
                    checked={b.ativo}
                    onCheckedChange={(v) => handleToggle(b, v)}
                    aria-label={b.ativo ? 'Desativar banner' : 'Ativar banner'}
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Mais ações">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditor(b)}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicate(b)}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setToDelete(b)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Agenda da semana */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Próximos 7 dias
          </CardTitle>
          <CardDescription>O que está programado para cada dia (só banners ativados).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-7">
            {semana.map((dia, i) => (
              <div
                key={dia.date}
                className={cn(
                  'rounded-lg border p-2.5 min-h-[92px] flex flex-col gap-1.5',
                  i === 0 ? 'border-primary/50 bg-primary/5' : 'bg-muted/20',
                )}
              >
                <div className="flex items-baseline justify-between sm:block">
                  <span className={cn('text-xs font-semibold', i === 0 && 'text-primary')}>
                    {i === 0 ? 'Hoje' : DIAS_SEMANA[dia.weekday].curto}
                  </span>
                  <span className="text-[11px] text-muted-foreground sm:block">{formatDateShort(dia.date)}</span>
                </div>
                {dia.banners.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">—</span>
                ) : (
                  dia.banners.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => openEditor(b)}
                      className="rounded-md bg-background border px-1.5 py-1 text-left transition-colors hover:border-primary/40"
                    >
                      <span className="block truncate text-[11px] font-medium leading-tight">{b.titulo}</span>
                      <span className="block text-[10px] text-muted-foreground leading-tight">{describeTimeWindow(b)}</span>
                    </button>
                  ))
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <BannerEditor open={editorOpen} onOpenChange={setEditorOpen} banner={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{toDelete?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O banner e seu agendamento serão removidos. Para apenas tirar do ar, use o botão de ativar/desativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBanner;
