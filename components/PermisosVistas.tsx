import React from 'react';
import { AlertTriangle, ClipboardCheck, Eye, EyeOff, LayoutGrid } from 'lucide-react';
import { GRUPOS_VISTAS, TODAS_LAS_VISTAS, normalizarModulos, puedeVer, resumenModulos } from '../utils/vistas';

// Qué vistas ve una persona y si es del área de Auditoría. Se usa al dar de
// alta y en la fila de cada usuario (Accesos → Usuarios). No guarda nada: el
// que lo usa decide cuándo.

export interface Permisos {
  /** null = todas las vistas. */
  modulos: string[] | null;
  areaAuditoria: boolean;
}

interface Props {
  valor: Permisos;
  onCambio: (p: Permisos) => void;
  deshabilitado?: boolean;
  /** Al elegir "Usuario de Auditoría" (el alta lo usa para sugerir Solo lectura). */
  onPresetAuditoria?: () => void;
}

const Casilla: React.FC<{ marcada: boolean; parcial?: boolean; className?: string }> = ({ marcada, parcial, className = '' }) => (
  <span aria-hidden="true" className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
    marcada || parcial ? 'border-[#0F4C3A] bg-[#0F4C3A]' : 'border-slate-300 bg-white'} ${className}`}>
    {marcada ? (
      <svg viewBox="0 0 12 12" className="h-3 w-3 text-white"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    ) : parcial ? <span className="h-0.5 w-2 rounded bg-white" /> : null}
  </span>
);

const SelectorPermisos: React.FC<Props> = ({ valor, onCambio, deshabilitado, onPresetAuditoria }) => {
  const elegidas = new Set(valor.modulos ?? TODAS_LAS_VISTAS);
  const poner = (ids: string[], si: boolean) => {
    const n = new Set(elegidas);
    ids.forEach((id) => (si ? n.add(id) : n.delete(id)));
    onCambio({ ...valor, modulos: normalizarModulos([...n]) });
  };

  const presets: { id: string; etiqueta: string; icono: React.ElementType; aplicar: () => void; activo: boolean }[] = [
    { id: 'todas', etiqueta: 'Todas', icono: LayoutGrid, activo: valor.modulos === null, aplicar: () => onCambio({ ...valor, modulos: null }) },
    {
      id: 'auditoria', etiqueta: 'Usuario de Auditoría', icono: ClipboardCheck,
      activo: valor.areaAuditoria && valor.modulos?.length === 1 && valor.modulos[0] === 'auditoria',
      aplicar: () => { onCambio({ modulos: ['auditoria'], areaAuditoria: true }); onPresetAuditoria?.(); },
    },
    { id: 'ninguna', etiqueta: 'Ninguna', icono: EyeOff, activo: valor.modulos?.length === 0, aplicar: () => onCambio({ ...valor, modulos: [] }) },
  ];

  const sinVistaAuditoria = valor.areaAuditoria && !puedeVer(valor.modulos, 'auditoria');

  return (
    <fieldset disabled={deshabilitado} className="space-y-3 disabled:opacity-60">
      {/* Área de Auditoría */}
      <button
        type="button"
        role="switch"
        aria-checked={valor.areaAuditoria}
        onClick={() => onCambio({ ...valor, areaAuditoria: !valor.areaAuditoria })}
        className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all ${
          valor.areaAuditoria ? 'border-cyan-500 bg-cyan-50/70' : 'border-slate-200 bg-white hover:border-slate-300'}`}
      >
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${valor.areaAuditoria ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-800">Área de Auditoría</span>
          <span className="block text-[11px] text-slate-500 leading-snug">
            Captura, corrige, agrega y quita en el módulo de Auditoría. Nadie más lo puede modificar, ni los administradores.
          </span>
        </span>
        <span className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${valor.areaAuditoria ? 'bg-cyan-600' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${valor.areaAuditoria ? 'left-[22px]' : 'left-0.5'}`} />
        </span>
      </button>

      {/* Atajos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Vistas</span>
        {presets.map((p) => (
          <button key={p.id} type="button" onClick={p.aplicar}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              p.activo ? 'border-[#0F4C3A] bg-[#0F4C3A] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            <p.icono className="h-3.5 w-3.5" /> {p.etiqueta}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <Eye className="h-3.5 w-3.5" /> {resumenModulos(valor.modulos)}
        </span>
      </div>

      {/* Vistas por grupo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {GRUPOS_VISTAS.map((g) => {
          const ids = g.vistas.map((v) => v.id);
          const n = ids.filter((id) => elegidas.has(id)).length;
          const todas = n === ids.length;
          return (
            <div key={g.id} className={`rounded-2xl border p-3 transition-colors ${n ? 'border-[#0F4C3A]/25 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
              <button type="button" onClick={() => poner(ids, !todas)} aria-pressed={todas}
                className="w-full flex items-center gap-2.5 text-left">
                <Casilla marcada={todas} parcial={n > 0 && !todas} />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-slate-800">{g.etiqueta}</span>
                  <span className="ml-1.5 text-[11px] text-slate-400">{g.detalle}</span>
                </span>
                {ids.length > 1 && <span className="text-[11px] font-semibold tabular-nums text-slate-400">{n}/{ids.length}</span>}
              </button>
              {ids.length > 1 && (
                <div className="mt-2 ml-1.5 pl-4 border-l border-slate-200 space-y-0.5">
                  {g.vistas.map((v) => {
                    const si = elegidas.has(v.id);
                    return (
                      <button key={v.id} type="button" role="checkbox" aria-checked={si} onClick={() => poner([v.id], !si)}
                        className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-white">
                        <Casilla marcada={si} />
                        <span className={`text-xs ${si ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{v.etiqueta}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sinVistaAuditoria && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="flex-1 text-xs text-amber-800">Es del área de Auditoría pero no tiene la vista de Auditoría: no podrá entrar a capturar.</p>
          <button type="button" onClick={() => poner(['auditoria'], true)} className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700">
            Darle la vista
          </button>
        </div>
      )}
      {valor.modulos?.length === 0 && (
        <p className="text-[11px] text-slate-500">Sin vistas, la persona entra y ve un aviso de que aún no tiene módulos asignados.</p>
      )}
    </fieldset>
  );
};

export default SelectorPermisos;
