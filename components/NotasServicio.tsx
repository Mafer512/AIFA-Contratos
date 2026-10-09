import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StickyNote, AlertTriangle, CheckCircle2, X, Loader2, Pencil, Trash2, Save, CalendarDays, MessageSquarePlus,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';

// Notas de un servicio: lo que no cabe en una columna del estatus pero hay que
// saber ("se reprogramó el fallo", "DEFENSA pidió otra versión del anexo").
// Cada nota tiene la fecha a la que se refiere, y en el Diagrama de Gantt se
// dibuja como un marcador justo en ese día. Tabla: notas_servicio
// (supabase/migrations/20261008050000_notas_servicio.sql).

export type TipoNota = 'nota' | 'alerta' | 'acuerdo';

export interface NotaServicio {
  id: number;
  anio: number;
  servicio_id: number;
  servicio_nombre: string | null;
  /** YYYY-MM-DD: el día al que se refiere la nota. */
  fecha: string;
  tipo: TipoNota;
  texto: string;
  autor_id: string;
  autor_nombre: string | null;
  created_at: string;
  updated_at: string;
}

export const TIPOS_NOTA: Record<TipoNota, { etiqueta: string; color: string; fondo: string; borde: string; texto: string; icono: React.ElementType; ayuda: string }> = {
  nota: { etiqueta: 'Nota', color: '#6366F1', fondo: 'bg-indigo-50', borde: 'border-indigo-200', texto: 'text-indigo-700', icono: StickyNote, ayuda: 'Un dato o avance' },
  alerta: { etiqueta: 'Alerta', color: '#F59E0B', fondo: 'bg-amber-50', borde: 'border-amber-200', texto: 'text-amber-800', icono: AlertTriangle, ayuda: 'Algo que frena o pone en riesgo' },
  acuerdo: { etiqueta: 'Acuerdo', color: '#10B981', fondo: 'bg-emerald-50', borde: 'border-emerald-200', texto: 'text-emerald-700', icono: CheckCircle2, ayuda: 'Una decisión tomada' },
};

const MAX_TEXTO = 1000;

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "12 mar 2026" a partir de "2026-03-12", sin pasar por UTC (que corre el día). */
export const fechaNota = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
};

/** La fecha de la nota como Date local, para ubicarla en el Gantt. */
export const fechaNotaDate = (iso: string): Date | null => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

const haceCuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

/** Chip con el tipo de la nota. */
export const ChipTipoNota: React.FC<{ tipo: TipoNota; chico?: boolean }> = ({ tipo, chico = false }) => {
  const t = TIPOS_NOTA[tipo] ?? TIPOS_NOTA.nota;
  const Icono = t.icono;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold ${t.fondo} ${t.borde} ${t.texto} ${chico ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
      <Icono className={chico ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {t.etiqueta}
    </span>
  );
};

interface PanelProps {
  anio: number;
  servicioId: number;
  servicioNombre: string;
  /** Las notas de este servicio, de la más reciente a la más vieja. */
  notas: NotaServicio[];
  puedeEscribir: boolean;
  usuarioId: string;
  esAdmin: boolean;
  onGuardada: (nota: NotaServicio) => void;
  onBorrada: (id: number) => void;
  onCerrar: () => void;
}

/** Ventana con las notas de un servicio: leerlas, agregar, corregir y borrar. */
export const PanelNotas: React.FC<PanelProps> = ({
  anio, servicioId, servicioNombre, notas, puedeEscribir, usuarioId, esAdmin, onGuardada, onBorrada, onCerrar,
}) => {
  const [tipo, setTipo] = useState<TipoNota>('nota');
  const [fecha, setFecha] = useState(hoyISO());
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<NotaServicio | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const areaTexto = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  const limpiar = () => {
    setTipo('nota');
    setFecha(hoyISO());
    setTexto('');
    setEditando(null);
    setError(null);
  };

  const puedeCambiar = (n: NotaServicio) => esAdmin || (puedeEscribir && n.autor_id === usuarioId);

  const guardar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio) { setError('Escribe la nota.'); areaTexto.current?.focus(); return; }
    if (!fecha) { setError('Elige la fecha a la que se refiere.'); return; }
    setGuardando(true);
    setError(null);
    try {
      const datos = { tipo, fecha, texto: limpio };
      const { data, error: err } = editando
        ? await supabase.from('notas_servicio').update(datos).eq('id', editando.id).select().single()
        : await supabase.from('notas_servicio').insert({ ...datos, anio, servicio_id: servicioId, servicio_nombre: servicioNombre }).select().single();
      if (err) throw err;
      onGuardada(data as NotaServicio);
      limpiar();
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      setError(/row-level security|permission/i.test(msg)
        ? 'Tu perfil no puede escribir notas. Las agregan Administradores y Operadores.'
        : `No se pudo guardar la nota: ${msg || 'error inesperado'}`);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (n: NotaServicio) => {
    setBorrando(n.id);
    setError(null);
    try {
      const { error: err, count } = await supabase.from('notas_servicio').delete({ count: 'exact' }).eq('id', n.id);
      if (err) throw err;
      if (count === 0) throw new Error('No tienes permiso para borrar esta nota.');
      onBorrada(n.id);
      if (editando?.id === n.id) limpiar();
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo borrar la nota.');
    } finally {
      setBorrando(null);
      setConfirmarBorrar(null);
    }
  };

  const editar = (n: NotaServicio) => {
    setEditando(n);
    setTipo(n.tipo);
    setFecha(n.fecha);
    setTexto(n.texto);
    setError(null);
    window.setTimeout(() => areaTexto.current?.focus(), 0);
  };

  const conteo = useMemo(() => {
    const c: Record<TipoNota, number> = { nota: 0, alerta: 0, acuerdo: 0 };
    notas.forEach((n) => { c[n.tipo] = (c[n.tipo] ?? 0) + 1; });
    return c;
  }, [notas]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Notas de ${servicioNombre}`}
        className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="relative px-5 sm:px-6 py-4 text-white flex items-start justify-between gap-3 overflow-hidden" style={{ background: 'linear-gradient(120deg, #312E81 0%, #1B3A5E 100%)' }}>
          <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/5 pointer-events-none" />
          <div className="relative min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-200/80 mb-0.5">Notas del servicio</p>
            <h3 className="text-base sm:text-lg font-bold leading-snug">{servicioNombre}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-xs text-indigo-100/80 mr-1">{notas.length} nota{notas.length !== 1 ? 's' : ''}</span>
              {(Object.keys(TIPOS_NOTA) as TipoNota[]).filter((t) => conteo[t] > 0).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TIPOS_NOTA[t].color }} />
                  {conteo[t]} {TIPOS_NOTA[t].etiqueta.toLowerCase()}{conteo[t] !== 1 ? 's' : ''}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="relative w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Formulario */}
          {puedeEscribir ? (
            <form onSubmit={guardar} className={`rounded-2xl border bg-white p-4 shadow-sm ${editando ? 'border-indigo-300 ring-4 ring-indigo-500/10' : 'border-slate-200'}`}>
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                {editando ? <Pencil className="h-4 w-4 text-indigo-600" /> : <MessageSquarePlus className="h-4 w-4 text-indigo-600" />}
                {editando ? `Corrigiendo la nota del ${fechaNota(editando.fecha)}` : 'Agregar nota'}
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <div role="radiogroup" aria-label="Tipo de nota" className="flex gap-1.5 flex-wrap">
                  {(Object.keys(TIPOS_NOTA) as TipoNota[]).map((t) => {
                    const meta = TIPOS_NOTA[t];
                    const Icono = meta.icono;
                    const activo = tipo === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        onClick={() => setTipo(t)}
                        title={meta.ayuda}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                          activo ? `${meta.fondo} ${meta.texto}` : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                        }`}
                        style={activo ? { borderColor: meta.color } : undefined}
                      >
                        <Icono className="h-3.5 w-3.5" />
                        {meta.etiqueta}
                      </button>
                    );
                  })}
                </div>
                <label className="relative sm:ml-auto">
                  <span className="sr-only">Fecha a la que se refiere</span>
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    aria-label="Fecha a la que se refiere la nota"
                    className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </label>
              </div>

              <textarea
                ref={areaTexto}
                value={texto}
                onChange={(e) => setTexto(e.target.value.slice(0, MAX_TEXTO))}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void guardar(); }}
                rows={3}
                placeholder="Ej. DEFENSA devolvió el anexo con observaciones; se reenvía el lunes."
                aria-label="Texto de la nota"
                className="mt-3 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-y placeholder:text-slate-300"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <span className={`text-[11px] tabular-nums ${texto.length > MAX_TEXTO - 50 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {texto.length}/{MAX_TEXTO} · La fecha marca dónde aparece en el Gantt
                </span>
                <div className="flex items-center gap-2">
                  {editando && (
                    <button type="button" onClick={limpiar} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700">
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={guardando}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-60 shadow-md shadow-indigo-600/20 transition-colors"
                  >
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar nota'}
                  </button>
                </div>
              </div>
              {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
            </form>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
              Tu perfil es de solo lectura: puedes leer las notas, pero las agregan Administradores y Operadores.
            </p>
          )}

          {/* Notas */}
          {notas.length === 0 ? (
            <div className="text-center py-10">
              <StickyNote className="h-10 w-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Este servicio todavía no tiene notas.</p>
            </div>
          ) : (
            <ol className="relative space-y-3 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
              {notas.map((n) => {
                const meta = TIPOS_NOTA[n.tipo] ?? TIPOS_NOTA.nota;
                const Icono = meta.icono;
                const editada = new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 60_000;
                return (
                  <li key={n.id} className="relative pl-9">
                    <span className="absolute left-0 top-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-slate-50 text-white" style={{ backgroundColor: meta.color }}>
                      <Icono className="h-3.5 w-3.5" />
                    </span>
                    <div className={`rounded-2xl border bg-white p-3.5 shadow-sm ${editando?.id === n.id ? 'border-indigo-300' : 'border-slate-200'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ChipTipoNota tipo={n.tipo} />
                          <span className="text-xs font-bold text-slate-700">{fechaNota(n.fecha)}</span>
                        </div>
                        {puedeCambiar(n) && (
                          confirmarBorrar === n.id ? (
                            <span className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-slate-500">¿Borrarla?</span>
                              <button type="button" onClick={() => borrar(n)} disabled={borrando === n.id} className="px-2 py-1 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-60">
                                {borrando === n.id ? 'Borrando...' : 'Sí, borrar'}
                              </button>
                              <button type="button" onClick={() => setConfirmarBorrar(null)} className="px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 font-semibold">No</button>
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5">
                              <button type="button" onClick={() => editar(n)} title="Corregir" aria-label="Corregir nota" className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => setConfirmarBorrar(n.id)} title="Borrar" aria-label="Borrar nota" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          )
                        )}
                      </div>
                      <p className="mt-2 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{n.texto}</p>
                      <p className="mt-2 text-[11px] text-slate-400">
                        {n.autor_nombre ?? 'Usuario'} · {haceCuanto(n.created_at)}{editada ? ' · corregida' : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};
