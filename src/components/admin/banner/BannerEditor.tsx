import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProdutos } from '@/hooks/useProdutos';
import { useSaveBanner, type BannerInput, type BannerPromocional } from '@/hooks/useBannerPromocional';
import {
  DIAS_SEMANA,
  describeSchedule,
  getZonedNow,
  timeToMinutes,
  type AgendamentoTipo,
} from '@/lib/bannerSchedule';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { toast } from 'sonner';
import { CalendarClock, Loader2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPTED_FORMATS = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SEM_PRODUTO = '__none__';

const TIPOS: { value: AgendamentoTipo; label: string; hint: string }[] = [
  { value: 'sempre', label: 'Sempre', hint: 'Fica no ar enquanto estiver ativado' },
  { value: 'semanal', label: 'Dias da semana', hint: 'Repete toda semana nos dias escolhidos' },
  { value: 'data', label: 'Data específica', hint: 'Um dia ou um período definido' },
];

type FormState = {
  ativo: boolean;
  titulo: string;
  imagem_url: string;
  produto_id: string;
  valor_promocional: string;
  agendamento_tipo: AgendamentoTipo;
  dias_semana: string[];
  data_inicio: string;
  data_fim: string;
  dia_todo: boolean;
  hora_inicio: string;
  hora_fim: string;
};

const fromBanner = (b: Partial<BannerPromocional> | null): FormState => ({
  ativo: b?.ativo ?? true,
  titulo: b?.titulo ?? '',
  imagem_url: b?.imagem_url ?? '',
  produto_id: b?.produto_id ?? '',
  valor_promocional: b?.valor_promocional != null ? String(b.valor_promocional).replace('.', ',') : '',
  agendamento_tipo: b?.agendamento_tipo ?? 'sempre',
  dias_semana: b?.dias_semana ?? [],
  data_inicio: b?.data_inicio ?? '',
  data_fim: b?.data_fim ?? '',
  dia_todo: !(b?.hora_inicio && b?.hora_fim),
  hora_inicio: b?.hora_inicio?.slice(0, 5) ?? '18:00',
  hora_fim: b?.hora_fim?.slice(0, 5) ?? '23:00',
});

const parseValor = (v: string): number | null => {
  // Aceita "39,99", "1.299,90" e "39.99".
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
};

interface BannerEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Banner existente (editar), rascunho sem id (duplicar) ou null (novo). */
  banner: Partial<BannerPromocional> | null;
}

export function BannerEditor({ open, onOpenChange, banner }: BannerEditorProps) {
  const { data: produtos } = useProdutos(true);
  const saveBanner = useSaveBanner();
  const [form, setForm] = useState<FormState>(() => fromBanner(banner));
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(fromBanner(banner));
      setShowErrors(false);
    }
  }, [open, banner]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isEditing = !!banner?.id;
  const today = getZonedNow().date;

  const uploadImage = useCallback(async (file: File) => {
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      toast.error('Formato não aceito. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `banners/banner-${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setForm((f) => ({ ...f, imagem_url: data.publicUrl }));
    } catch {
      toast.error('Erro ao fazer upload da imagem');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file);
  };

  const errors = useMemo(() => {
    const e: Partial<Record<'imagem' | 'dias' | 'data' | 'hora', string>> = {};
    if (!form.imagem_url) e.imagem = 'Envie a imagem do banner.';
    if (form.agendamento_tipo === 'semanal' && form.dias_semana.length === 0) e.dias = 'Escolha pelo menos um dia.';
    if (form.agendamento_tipo === 'data') {
      if (!form.data_inicio) e.data = 'Informe a data.';
      else if (form.data_fim && form.data_fim < form.data_inicio) e.data = 'A data final deve ser depois da inicial.';
    }
    if (!form.dia_todo) {
      if (!form.hora_inicio || !form.hora_fim) e.hora = 'Informe o horário de início e fim.';
      else if (form.hora_inicio === form.hora_fim) e.hora = 'Início e fim não podem ser iguais.';
    }
    return e;
  }, [form]);

  const toInput = (): BannerInput => ({
    ativo: form.ativo,
    titulo: form.titulo.trim() || 'Promoção',
    imagem_url: form.imagem_url || null,
    produto_id: form.produto_id || null,
    valor_promocional: form.produto_id ? parseValor(form.valor_promocional) : null,
    agendamento_tipo: form.agendamento_tipo,
    dias_semana: form.agendamento_tipo === 'semanal' ? form.dias_semana : [],
    data_inicio: form.agendamento_tipo === 'data' ? form.data_inicio || null : null,
    data_fim:
      form.agendamento_tipo === 'data' && form.data_fim && form.data_fim !== form.data_inicio ? form.data_fim : null,
    hora_inicio: form.dia_todo ? null : form.hora_inicio,
    hora_fim: form.dia_todo ? null : form.hora_fim,
  });

  const resumo = describeSchedule({
    ...toInput(),
    id: '',
    updated_at: '',
  });

  const handleSave = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    try {
      await saveBanner.mutateAsync({ ...toInput(), id: banner?.id });
      toast.success(isEditing ? 'Banner atualizado!' : 'Banner criado!');
      onOpenChange(false);
    } catch {
      toast.error('Erro ao salvar o banner. Verifique se a migração de agendamento foi aplicada.');
    }
  };

  const overnight =
    !form.dia_todo &&
    (timeToMinutes(form.hora_fim) ?? 0) < (timeToMinutes(form.hora_inicio) ?? 0);

  const errorText = (key: keyof typeof errors) =>
    showErrors && errors[key] ? <p className="text-xs font-medium text-destructive mt-1.5">{errors[key]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{isEditing ? 'Editar banner' : 'Novo banner'}</DialogTitle>
          <DialogDescription>Defina a imagem, o produto e quando o banner aparece no site.</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6">
          {/* Imagem */}
          <section className="space-y-2">
            <Label>Imagem</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
                e.target.value = '';
              }}
            />
            {form.imagem_url ? (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
                  <img src={form.imagem_url} alt="Prévia do banner" className="w-full h-auto max-h-56 object-cover" />
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-7 w-7 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                    <Upload className="h-4 w-4 mr-2" /> Substituir
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set('imagem_url', '')} disabled={isUploading}>
                    <X className="h-4 w-4 mr-2" /> Remover
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                onDrop={handleDrop}
                disabled={isUploading}
                className={cn(
                  'w-full rounded-lg border-2 border-dashed p-6 flex flex-col items-center gap-2 min-h-[132px] justify-center transition-colors',
                  isDragOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50',
                  showErrors && errors.imagem && 'border-destructive/60',
                )}
              >
                {isUploading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                ) : (
                  <>
                    <Upload className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Arraste a imagem ou clique para selecionar</span>
                    <span className="text-xs text-muted-foreground">PNG, JPG ou WebP · até 5MB</span>
                  </>
                )}
              </button>
            )}
            {errorText('imagem')}
          </section>

          {/* Conteúdo */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="banner-titulo">Nome do banner</Label>
              <Input
                id="banner-titulo"
                className="mt-1.5"
                value={form.titulo}
                onChange={(e) => set('titulo', e.target.value)}
                placeholder="Ex: Quarta da Esfiha"
              />
            </div>
            <div>
              <Label>Produto vinculado</Label>
              <Select
                value={form.produto_id || SEM_PRODUTO}
                onValueChange={(v) => set('produto_id', v === SEM_PRODUTO ? '' : v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione um produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PRODUTO}>Nenhum (só imagem)</SelectItem>
                  {produtos?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} — R$ {p.preco.toFixed(2).replace('.', ',')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {form.produto_id ? 'Ao tocar no banner, o produto vai para o carrinho.' : 'O banner aparece sem ação de clique.'}
              </p>
            </div>
            <div>
              <Label htmlFor="banner-valor">Valor promocional (R$)</Label>
              <Input
                id="banner-valor"
                className="mt-1.5"
                inputMode="decimal"
                value={form.valor_promocional}
                onChange={(e) => set('valor_promocional', e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="Vazio = preço original"
                disabled={!form.produto_id}
              />
            </div>
          </section>

          {/* Agendamento */}
          <section className="rounded-xl border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Quando exibir</h3>
            </div>

            <ToggleGroup
              type="single"
              value={form.agendamento_tipo}
              onValueChange={(v) => v && set('agendamento_tipo', v as AgendamentoTipo)}
              className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1 border"
            >
              {TIPOS.map((t) => (
                <ToggleGroupItem
                  key={t.value}
                  value={t.value}
                  className="h-9 text-xs sm:text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
                >
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground -mt-2">
              {TIPOS.find((t) => t.value === form.agendamento_tipo)?.hint}
            </p>

            {form.agendamento_tipo === 'semanal' && (
              <div>
                <ToggleGroup
                  type="multiple"
                  value={form.dias_semana}
                  onValueChange={(v) => set('dias_semana', v)}
                  className="grid grid-cols-7 gap-1.5"
                  aria-label="Dias da semana"
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((i) => (
                    <ToggleGroupItem
                      key={DIAS_SEMANA[i].key}
                      value={DIAS_SEMANA[i].key}
                      aria-label={DIAS_SEMANA[i].longo}
                      className="h-10 px-0 border bg-background text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary transition-[background-color,color,transform] duration-150 active:scale-[0.95]"
                    >
                      {DIAS_SEMANA[i].curto}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {errorText('dias')}
              </div>
            )}

            {form.agendamento_tipo === 'data' && (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="banner-data-inicio" className="text-xs">Data</Label>
                    <Input
                      id="banner-data-inicio"
                      type="date"
                      className="mt-1 bg-background"
                      min={isEditing ? undefined : today}
                      value={form.data_inicio}
                      onChange={(e) => set('data_inicio', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="banner-data-fim" className="text-xs">Até (opcional)</Label>
                    <Input
                      id="banner-data-fim"
                      type="date"
                      className="mt-1 bg-background"
                      min={form.data_inicio || today}
                      value={form.data_fim}
                      onChange={(e) => set('data_fim', e.target.value)}
                    />
                  </div>
                </div>
                {errorText('data')}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="banner-dia-todo" className="text-sm">Dia todo</Label>
                <Switch id="banner-dia-todo" checked={form.dia_todo} onCheckedChange={(v) => set('dia_todo', v)} />
              </div>
              {!form.dia_todo && (
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="banner-hora-inicio" className="text-xs">Das</Label>
                      <Input
                        id="banner-hora-inicio"
                        type="time"
                        className="mt-1 bg-background"
                        value={form.hora_inicio}
                        onChange={(e) => set('hora_inicio', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="banner-hora-fim" className="text-xs">Até</Label>
                      <Input
                        id="banner-hora-fim"
                        type="time"
                        className="mt-1 bg-background"
                        value={form.hora_fim}
                        onChange={(e) => set('hora_fim', e.target.value)}
                      />
                    </div>
                  </div>
                  {overnight && (
                    <p className="text-xs text-muted-foreground mt-1.5">Termina no dia seguinte, após a meia-noite.</p>
                  )}
                  {errorText('hora')}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-background border px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Vai aparecer: </span>
              <span className="font-medium">{resumo}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Horário de Brasília</span>
            </div>
          </section>

          <div className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <Label htmlFor="banner-ativo" className="text-sm">Ativado</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Desligado, o banner nunca aparece, mesmo agendado.</p>
            </div>
            <Switch id="banner-ativo" checked={form.ativo} onCheckedChange={(v) => set('ativo', v)} />
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-4 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saveBanner.isPending || isUploading} className="active:scale-[0.97] transition-transform">
            {saveBanner.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEditing ? 'Salvar alterações' : 'Criar banner'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
