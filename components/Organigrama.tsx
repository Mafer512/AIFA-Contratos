import React, { useMemo, useState } from 'react';
import {
  Users, UserPlus, Pencil, Trash2, X, Loader2, Search, AlertCircle,
  Briefcase, GraduationCap, CalendarClock, Hash, BadgeCheck, ChevronDown,
} from 'lucide-react';
import {
  COLORES_EQUIPO, ETIQUETA_NIVEL, construirEstructura, contarPersonas,
  type ClaveColor, type NivelOrganico,
} from '../data/organigrama.ts';
import type { ResponsableProfile } from '../data/responsables.ts';

// Organigrama de la Gerencia de Proyectos y Concursos.
//
// Vive en su propio archivo, no dentro de Dashboard.tsx. Ese archivo pasa de
// las 19 mil líneas y cada bloque nuevo ahí encarece tocar cualquier otra cosa;
// además esto es una vista con su propia forma —un árbol, no una tabla— y se
// entiende mejor sola.
//
// El orden y los colores replican la plantilla en Excel del área a propósito:
// quien ya conoce ese documento reconoce los equipos sin tener que aprender
// nada nuevo.

export interface ServicioResumen {
  name: string;
  estatus: string;
  row: Record<string, any>;
}

interface Props {
  personas: ResponsableProfile[];
  /** Servicios por catalogValue, ya agrupados por quien llama. */
  serviciosPorPersona: Map<string, ServicioResumen[]>;
  /** catalogValue de la persona abierta, o null. */
  personaAbierta: string | null;
  onAbrirPersona: (catalogValue: string | null) => void;
  onVerFoto: (url: string) => void;
  /** Sólo ADMIN y OPERADOR pueden mantener la plantilla. */
  puedeEditar: boolean;
  onGuardar: (persona: ResponsableProfile, esNueva: boolean) => Promise<void>;
  onDarDeBaja: (persona: ResponsableProfile) => Promise<void>;
  /** Contenido que se dibuja al abrir una persona (su lista de servicios). */
  renderServicios: (catalogValue: string, servicios: ServicioResumen[]) => React.ReactNode;
  guardando: boolean;
  avisoTabla?: string | null;
  /** Color de cada estatus, para que el resumen use la misma paleta que las tablas. */
  colorEstatus?: (estatus: string) => string;
}

/**
 * Lo que responde una persona, según su lugar en la estructura.
 *
 * Un gerente no lleva expedientes en la mano: responde por los de toda su
 * gerencia. Decirle "0 servicios a su cargo" era literal y falso a la vez, y
 * además dejaba su tarjeta vacía justo en la parte que más se mira.
 */
interface ResumenAlcance {
  /** Servicios del área completa de esa persona (los suyos más los de su gente). */
  total: number;
  /** Los que lleva personalmente. Para jefes suele ser 0, y está bien. */
  propios: number;
  /** Cuánta gente cuelga de ella. */
  personas: number;
  /** Cómo se reparte el total: por coordinación para el gerente, por persona para un coordinador. */
  reparto: { etiqueta: string; cantidad: number; color: string }[];
  /** Cuántos servicios hay en cada estatus. */
  porEstatus: { estatus: string; cantidad: number }[];
  /** Cómo llamar a ese alcance en la tarjeta. */
  ambito: string;
}

const iniciales = (nombre: string) =>
  nombre.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

/** Foto o, si todavía no hay, las iniciales sobre el color del equipo. */
const Retrato: React.FC<{
  persona: ResponsableProfile;
  tam: number;
  color: ClaveColor;
  onVerFoto: (url: string) => void;
}> = ({ persona, tam, color, onVerFoto }) => {
  const paleta = COLORES_EQUIPO[color] ?? COLORES_EQUIPO.sinEquipo;
  const estilo: React.CSSProperties = { width: tam, height: tam };

  if (!persona.photoUrl) {
    return (
      <div
        className="rounded-2xl flex items-center justify-center font-black text-white flex-shrink-0 select-none"
        style={{ ...estilo, background: paleta.banda, fontSize: tam / 3 }}
        title={`${persona.fullName} — sin fotografía`}
      >
        {iniciales(persona.fullName)}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onVerFoto(persona.photoUrl); }}
      className="rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-white/60 hover:ring-white transition-all hover:scale-105"
      style={estilo}
      title="Ver fotografía"
    >
      <img src={persona.photoUrl} alt={persona.fullName} className="w-full h-full object-cover" loading="lazy" />
    </button>
  );
};

/** Un dato de la ficha con su icono. */
const Dato: React.FC<{ icono: React.ElementType; etiqueta: string; valor?: string }> = ({ icono: Icono, etiqueta, valor }) => {
  if (!valor) return null;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
        <Icono className="h-2.5 w-2.5" />
        {etiqueta}
      </p>
      <p className="text-[12px] text-slate-700 leading-snug break-words">{valor}</p>
    </div>
  );
};

/** Barra proporcional de un reparto. Una sola serie, así que un solo tono. */
const BarraReparto: React.FC<{ etiqueta: string; cantidad: number; maximo: number; color: string }> = ({ etiqueta, cantidad, maximo, color }) => (
  <div className="flex items-center gap-3">
    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    <span className="text-[12px] text-slate-600 truncate flex-1 min-w-0" title={etiqueta}>{etiqueta}</span>
    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${maximo ? Math.max(4, (cantidad / maximo) * 100) : 0}%`, backgroundColor: color }}
      />
    </div>
    <span className="text-[12px] font-bold text-slate-800 tabular-nums w-7 text-right flex-shrink-0">{cantidad}</span>
  </div>
);

const FichaPersona: React.FC<{
  persona: ResponsableProfile;
  color: ClaveColor;
  esJefe: boolean;
  servicios: ServicioResumen[];
  resumen: ResumenAlcance;
  colorEstatus: (estatus: string) => string;
  abierta: boolean;
  onAbrir: () => void;
  onVerFoto: (url: string) => void;
  puedeEditar: boolean;
  onEditar: () => void;
  onDarDeBaja: () => void;
  children?: React.ReactNode;
}> = ({ persona, color, esJefe, servicios, resumen, colorEstatus, abierta, onAbrir, onVerFoto, puedeEditar, onEditar, onDarDeBaja, children }) => {
  const paleta = COLORES_EQUIPO[color] ?? COLORES_EQUIPO.sinEquipo;
  const mandaGente = resumen.personas > 0;
  const maxReparto = Math.max(1, ...resumen.reparto.map((r) => r.cantidad));

  return (
    <div
      className="rounded-2xl border-2 overflow-hidden transition-all hover:shadow-md"
      style={{ backgroundColor: paleta.fondo, borderColor: abierta ? paleta.banda : paleta.borde }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Retrato persona={persona} tam={esJefe ? 72 : 56} color={color} onVerFoto={onVerFoto} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-bold text-slate-900 leading-tight ${esJefe ? 'text-base' : 'text-sm'}`}>
                  {persona.fullName}
                </p>
                <p className="text-[12px] font-semibold leading-snug mt-0.5" style={{ color: paleta.texto }}>
                  {persona.puesto ?? 'Sin puesto asignado'}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {persona.nivelSalarial && (
                  <span
                    className="px-2 py-0.5 rounded-lg text-[10px] font-black text-white"
                    style={{ backgroundColor: paleta.banda }}
                    title="Nivel salarial"
                  >
                    {persona.nivelSalarial}
                  </span>
                )}
                {puedeEditar && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEditar(); }}
                      title={`Editar la ficha de ${persona.fullName}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDarDeBaja(); }}
                      title={`Dar de baja a ${persona.fullName}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white/70 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 mt-3 pt-3 border-t" style={{ borderColor: paleta.borde }}>
              <Dato icono={Hash} etiqueta="No. empleado" valor={persona.employeeNumber} />
              <Dato icono={CalendarClock} etiqueta="Antigüedad" valor={persona.aifaTenure} />
              <Dato icono={BadgeCheck} etiqueta="Partida" valor={persona.partida ? String(persona.partida) : undefined} />
              <div className="col-span-2 sm:col-span-3">
                <Dato icono={GraduationCap} etiqueta="Grado académico" valor={persona.academicDegree} />
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onAbrir}
          className="w-full mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/70 hover:bg-white transition-colors"
        >
          <span className="flex items-center gap-2 text-[12px] font-bold text-slate-700 min-w-0">
            {mandaGente
              ? <Users className="h-3.5 w-3.5 flex-shrink-0" style={{ color: paleta.texto }} />
              : <Briefcase className="h-3.5 w-3.5 flex-shrink-0" style={{ color: paleta.texto }} />}
            <span className="truncate">
              {resumen.total} servicio{resumen.total !== 1 ? 's' : ''} {resumen.ambito}
            </span>
            {mandaGente && (
              <span className="hidden sm:inline text-[11px] font-medium text-slate-400 flex-shrink-0">
                · {resumen.personas} persona{resumen.personas !== 1 ? 's' : ''}
                {resumen.propios > 0 && ` · ${resumen.propios} propio${resumen.propios !== 1 ? 's' : ''}`}
              </span>
            )}
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {abierta && (
        <div className="bg-white border-t" style={{ borderColor: paleta.borde }}>
          {/* Panel de alcance: sólo para quien manda gente. A un colaborador
              esto le diría lo mismo que su propia lista, así que se le ahorra. */}
          {mandaGente && (
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-xl text-white"
                  style={{ backgroundColor: paleta.banda }}
                >
                  <span className="text-xl font-black tabular-nums leading-none">{resumen.total}</span>
                  <span className="text-[11px] font-semibold opacity-90">servicios</span>
                </span>
                {/* Cada estatus lleva su número y su nombre: el color acompaña,
                    no es el único que informa. */}
                {resumen.porEstatus.map(({ estatus, cantidad }) => (
                  <span
                    key={estatus}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-white text-[11px] font-semibold text-slate-600"
                    style={{ borderColor: `${colorEstatus(estatus)}80` }}
                    title={`${cantidad} en "${estatus}"`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorEstatus(estatus) }} />
                    <span className="tabular-nums font-black text-slate-800">{cantidad}</span>
                    <span className="truncate max-w-[150px]">{estatus}</span>
                  </span>
                ))}
              </div>

              {resumen.reparto.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    {persona.nivelOrganico === 'GERENTE' ? 'Por coordinación' : 'Por persona'}
                  </p>
                  <div className="space-y-1.5">
                    {resumen.reparto.map((r) => (
                      <BarraReparto key={r.etiqueta} etiqueta={r.etiqueta} cantidad={r.cantidad} maximo={maxReparto} color={r.color} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {servicios.length > 0 ? (
            <>
              {mandaGente && (
                <p className="px-4 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Servicios que lleva personalmente
                </p>
              )}
              {children}
            </>
          ) : mandaGente ? (
            <p className="px-4 py-4 text-[12px] text-slate-400">
              No lleva servicios personalmente; los atiende su equipo.
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
};

const Organigrama: React.FC<Props> = ({
  personas, serviciosPorPersona, personaAbierta, onAbrirPersona, onVerFoto,
  puedeEditar, onGuardar, onDarDeBaja, renderServicios, guardando, avisoTabla,
  colorEstatus = () => '#94A3B8',
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<ResponsableProfile | null>(null);
  const [esNueva, setEsNueva] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const estructura = useMemo(() => construirEstructura(personas), [personas]);
  const total = useMemo(() => contarPersonas(estructura), [estructura]);

  const totalServicios = useMemo(
    () => Array.from(serviciosPorPersona.values()).reduce((n, s) => n + s.length, 0),
    [serviciosPorPersona]
  );

  const coincide = (p: ResponsableProfile) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    const enFicha = [p.fullName, p.puesto, p.employeeNumber, p.academicDegree, p.nivelSalarial]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
    if (enFicha) return true;
    // También se busca dentro de sus servicios: es como el área pregunta
    // "¿quién lleva el de poda?" sin acordarse del nombre de la persona.
    return (serviciosPorPersona.get(p.catalogValue) ?? [])
      .some((s) => s.name.toLowerCase().includes(q) || s.estatus.toLowerCase().includes(q));
  };

  const servicios = (p: ResponsableProfile) => serviciosPorPersona.get(p.catalogValue) ?? [];

  /** Cuántos servicios hay en cada estatus, de mayor a menor. */
  const desglosarEstatus = (lista: ServicioResumen[]) => {
    const cuenta = new Map<string, number>();
    lista.forEach((s) => {
      const clave = (s.estatus ?? '').trim() || 'Sin estatus';
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    });
    return Array.from(cuenta.entries())
      .map(([estatus, cantidad]) => ({ estatus, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);
  };

  /**
   * Qué responde cada quien.
   *
   * Un colaborador responde por sus servicios. Un coordinador, por los de toda
   * su coordinación. El gerente, por los de la gerencia entera. Contar sólo lo
   * que tienen asignado en la columna "Responsable" dejaba a los jefes en cero,
   * que es justo lo contrario de lo que significan en la estructura.
   */
  const alcanceDe = (persona: ResponsableProfile): ResumenAlcance => {
    const propios = servicios(persona);
    const paleta = COLORES_EQUIPO[(persona.color ?? 'sinEquipo') as ClaveColor] ?? COLORES_EQUIPO.sinEquipo;

    if (persona.nivelOrganico === 'GERENTE') {
      // Toda la gerencia, incluida la gente que todavía no tiene coordinación.
      const todas = [
        ...estructura.coordinaciones.flatMap(({ persona: c, equipo }) => [c, ...equipo]),
        ...estructura.sinAsignar,
      ];
      const todosLosServicios = [propios, ...todas.map(servicios)].flat();
      return {
        total: todosLosServicios.length,
        propios: propios.length,
        personas: todas.length,
        ambito: 'en la Gerencia',
        porEstatus: desglosarEstatus(todosLosServicios),
        reparto: estructura.coordinaciones.map(({ persona: c, equipo }) => ({
          etiqueta: c.fullName,
          cantidad: [c, ...equipo].reduce((n, q) => n + servicios(q).length, 0),
          color: (COLORES_EQUIPO[(c.color ?? 'sinEquipo') as ClaveColor] ?? COLORES_EQUIPO.sinEquipo).banda,
        })),
      };
    }

    if (persona.nivelOrganico === 'COORDINADOR') {
      const nodo = estructura.coordinaciones.find((c) => c.persona.catalogValue === persona.catalogValue);
      const equipo = nodo?.equipo ?? [];
      const todosLosServicios = [propios, ...equipo.map(servicios)].flat();
      return {
        total: todosLosServicios.length,
        propios: propios.length,
        personas: equipo.length,
        ambito: 'en su coordinación',
        porEstatus: desglosarEstatus(todosLosServicios),
        reparto: equipo.map((q) => ({
          etiqueta: q.fullName,
          cantidad: servicios(q).length,
          color: paleta.banda,
        })).sort((a, b) => b.cantidad - a.cantidad),
      };
    }

    return {
      total: propios.length,
      propios: propios.length,
      personas: 0,
      ambito: 'a su cargo',
      porEstatus: desglosarEstatus(propios),
      reparto: [],
    };
  };

  const abrirNueva = () => {
    setEsNueva(true);
    setErrorForm('');
    setEditando({
      fullName: '', catalogValue: '', employeeNumber: '', academicDegree: '',
      aifaTenure: '', photoUrl: '', puesto: '', nivelSalarial: '',
      nivelOrganico: 'COLABORADOR', reportaA: null, color: 'sinEquipo', activo: true,
      partida: undefined,
    });
  };

  const jefesPosibles = useMemo(
    () => personas.filter((p) => p.nivelOrganico === 'GERENTE' || p.nivelOrganico === 'COORDINADOR'),
    [personas]
  );

  const guardar = async () => {
    if (!editando) return;
    const nombre = editando.fullName.trim();
    if (!nombre) { setErrorForm('El nombre completo es obligatorio.'); return; }

    // Al dar de alta, el catalogValue se deriva del nombre: es la llave con la
    // que los servicios encuentran a su responsable, y escribirla a mano se
    // presta a que no cuadre por un acento o una mayúscula.
    const catalogValue = (editando.catalogValue || nombre).toUpperCase().trim();

    const yaExiste = personas.some(
      (p) => p.catalogValue === catalogValue && (esNueva || p.catalogValue !== editando.catalogValue)
    );
    if (esNueva && yaExiste) { setErrorForm('Ya hay una ficha con ese nombre.'); return; }

    if (editando.nivelOrganico !== 'GERENTE' && !editando.reportaA) {
      setErrorForm('Indica de quién depende. Sólo el gerente puede quedar sin jefe.');
      return;
    }

    try {
      await onGuardar({ ...editando, fullName: nombre, catalogValue }, esNueva);
      setEditando(null);
    } catch (err: any) {
      setErrorForm(err?.message ?? 'No se pudo guardar.');
    }
  };

  const campo = (etiqueta: string, nodo: React.ReactNode, ancho = '') => (
    <div className={ancho}>
      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">{etiqueta}</label>
      {nodo}
    </div>
  );

  const claseInput = 'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/15 outline-none transition-all placeholder:text-slate-300';

  return (
    <div className="space-y-5">

      {/* ── Encabezado ── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="hidden sm:flex h-12 w-12 rounded-2xl bg-gradient-to-br from-[#0F4C3A] to-[#1B3A5E] text-white items-center justify-center shadow-lg shadow-[#0F4C3A]/25 flex-shrink-0">
            <Users className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Estructura de la Gerencia</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              {total} persona{total !== 1 ? 's' : ''} · {estructura.coordinaciones.length} coordinaciones · {totalServicios} servicio{totalServicios !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar persona, puesto o servicio"
              className="pl-9 pr-3 py-2.5 w-72 max-w-full text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/30"
            />
          </div>
          {puedeEditar && (
            <button
              type="button"
              onClick={abrirNueva}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-[#0F4C3A] text-white hover:bg-[#0d3f30] transition-colors shadow-sm shadow-[#0F4C3A]/25"
            >
              <UserPlus className="h-4 w-4" />
              Agregar persona
            </button>
          )}
        </div>
      </div>

      {avisoTabla && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">La plantilla todavía no es editable</p>
            <p className="text-sm text-amber-800 mt-1">{avisoTabla}</p>
          </div>
        </div>
      )}

      {/* ── Gerencia ── */}
      {estructura.gerente && coincide(estructura.gerente) && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Gerencia</p>
          <FichaPersona
            persona={estructura.gerente}
            color="gerencia"
            esJefe
            servicios={servicios(estructura.gerente)}
            resumen={alcanceDe(estructura.gerente)}
            colorEstatus={colorEstatus}
            abierta={personaAbierta === estructura.gerente.catalogValue}
            onAbrir={() => onAbrirPersona(personaAbierta === estructura.gerente!.catalogValue ? null : estructura.gerente!.catalogValue)}
            onVerFoto={onVerFoto}
            puedeEditar={puedeEditar}
            onEditar={() => { setEsNueva(false); setErrorForm(''); setEditando(estructura.gerente!); }}
            onDarDeBaja={() => onDarDeBaja(estructura.gerente!)}
          >
            {renderServicios(estructura.gerente.catalogValue, servicios(estructura.gerente))}
          </FichaPersona>
        </div>
      )}

      {/* ── Coordinaciones ── */}
      {estructura.coordinaciones.map(({ persona: coord, equipo }) => {
        const color = (coord.color ?? 'sinEquipo') as ClaveColor;
        const paleta = COLORES_EQUIPO[color] ?? COLORES_EQUIPO.sinEquipo;
        const visibles = [coord, ...equipo].filter(coincide);
        if (visibles.length === 0) return null;

        const serviciosEquipo = [coord, ...equipo].reduce((n, p) => n + servicios(p).length, 0);

        return (
          <div key={coord.catalogValue} className="rounded-2xl overflow-hidden border" style={{ borderColor: paleta.borde }}>
            {/* Banda del equipo: el mismo color con el que el área lee su plantilla. */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ backgroundColor: paleta.banda }}>
              <p className="text-white font-bold text-sm truncate">
                Coordinación · {coord.fullName}
              </p>
              <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold">
                {equipo.length + 1} persona{equipo.length + 1 !== 1 ? 's' : ''} · {serviciosEquipo} servicio{serviciosEquipo !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="p-3 space-y-3" style={{ backgroundColor: `${paleta.fondo}55` }}>
              {coincide(coord) && (
                <FichaPersona
                  persona={coord}
                  color={color}
                  esJefe
                  servicios={servicios(coord)}
                  resumen={alcanceDe(coord)}
                  colorEstatus={colorEstatus}
                  abierta={personaAbierta === coord.catalogValue}
                  onAbrir={() => onAbrirPersona(personaAbierta === coord.catalogValue ? null : coord.catalogValue)}
                  onVerFoto={onVerFoto}
                  puedeEditar={puedeEditar}
                  onEditar={() => { setEsNueva(false); setErrorForm(''); setEditando(coord); }}
                  onDarDeBaja={() => onDarDeBaja(coord)}
                >
                  {renderServicios(coord.catalogValue, servicios(coord))}
                </FichaPersona>
              )}

              {equipo.filter(coincide).length > 0 && (
                // Sangría con una guía vertical: deja ver de un golpe quién
                // depende de quién sin tener que leer los puestos.
                <div className="ml-3 pl-4 border-l-2 space-y-3" style={{ borderColor: paleta.borde }}>
                  {equipo.filter(coincide).map((p) => (
                    <FichaPersona
                      key={p.catalogValue}
                      persona={p}
                      color={color}
                      esJefe={false}
                      servicios={servicios(p)}
                      resumen={alcanceDe(p)}
                      colorEstatus={colorEstatus}
                      abierta={personaAbierta === p.catalogValue}
                      onAbrir={() => onAbrirPersona(personaAbierta === p.catalogValue ? null : p.catalogValue)}
                      onVerFoto={onVerFoto}
                      puedeEditar={puedeEditar}
                      onEditar={() => { setEsNueva(false); setErrorForm(''); setEditando(p); }}
                      onDarDeBaja={() => onDarDeBaja(p)}
                    >
                      {renderServicios(p.catalogValue, servicios(p))}
                    </FichaPersona>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Sin coordinación ──
          No se ocultan: una persona que desaparece de la pantalla por tener un
          campo vacío es peor que una fuera de lugar, porque nadie se entera de
          que hay que acomodarla. */}
      {estructura.sinAsignar.filter(coincide).length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-slate-300">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-500">
            <AlertCircle className="h-4 w-4 text-white" />
            <p className="text-white font-bold text-sm">Sin coordinación asignada</p>
          </div>
          <div className="p-3 space-y-3 bg-slate-50">
            {estructura.sinAsignar.filter(coincide).map((p) => (
              <FichaPersona
                key={p.catalogValue}
                persona={p}
                color="sinEquipo"
                esJefe={false}
                servicios={servicios(p)}
                resumen={alcanceDe(p)}
                colorEstatus={colorEstatus}
                abierta={personaAbierta === p.catalogValue}
                onAbrir={() => onAbrirPersona(personaAbierta === p.catalogValue ? null : p.catalogValue)}
                onVerFoto={onVerFoto}
                puedeEditar={puedeEditar}
                onEditar={() => { setEsNueva(false); setErrorForm(''); setEditando(p); }}
                onDarDeBaja={() => onDarDeBaja(p)}
              >
                {renderServicios(p.catalogValue, servicios(p))}
              </FichaPersona>
            ))}
          </div>
        </div>
      )}

      {busqueda.trim() && total > 0 &&
        !estructura.coordinaciones.some(({ persona, equipo }) => [persona, ...equipo].some(coincide)) &&
        !(estructura.gerente && coincide(estructura.gerente)) &&
        estructura.sinAsignar.filter(coincide).length === 0 && (
          <p className="text-center text-sm text-slate-400 py-10">Nadie coincide con "{busqueda}".</p>
        )}

      {/* ── Alta y edición ── */}
      {editando && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
          onClick={() => setEditando(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 bg-[#0F4C3A] rounded-t-2xl flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-white">
                  {esNueva ? 'Agregar persona a la estructura' : `Editar a ${editando.fullName}`}
                </h3>
                <p className="text-xs text-emerald-200 mt-0.5">
                  {esNueva ? 'Sus servicios se le asignan después, desde la tabla de estatus.' : 'Los cambios se ven de inmediato en el organigrama.'}
                </p>
              </div>
              <button onClick={() => setEditando(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campo('Nombre completo', (
                  <input
                    type="text" value={editando.fullName} autoFocus
                    onChange={(e) => setEditando({ ...editando, fullName: e.target.value })}
                    placeholder="María Fernanda López García" className={claseInput}
                  />
                ), 'md:col-span-2')}

                {campo('No. de empleado', (
                  <input type="text" value={editando.employeeNumber}
                    onChange={(e) => setEditando({ ...editando, employeeNumber: e.target.value })}
                    placeholder="1765" className={claseInput} />
                ))}

                {campo('Años en el AIFA', (
                  <input type="text" value={editando.aifaTenure}
                    onChange={(e) => setEditando({ ...editando, aifaTenure: e.target.value })}
                    placeholder="2 años 3 meses 5 días" className={claseInput} />
                ))}

                {campo('Grado académico', (
                  <input type="text" value={editando.academicDegree}
                    onChange={(e) => setEditando({ ...editando, academicDegree: e.target.value })}
                    placeholder="Licenciatura en Administración" className={claseInput} />
                ), 'md:col-span-2')}

                {campo('Puesto', (
                  <input type="text" value={editando.puesto ?? ''}
                    onChange={(e) => setEditando({ ...editando, puesto: e.target.value })}
                    placeholder="Profesional Ejecutivo Aeroportuario" className={claseInput} />
                ))}

                {campo('Nivel salarial', (
                  <input type="text" value={editando.nivelSalarial ?? ''}
                    onChange={(e) => setEditando({ ...editando, nivelSalarial: e.target.value })}
                    placeholder="N4" className={claseInput} />
                ))}

                {campo('Nivel en la estructura', (
                  <select
                    value={editando.nivelOrganico ?? 'COLABORADOR'}
                    onChange={(e) => {
                      const nivel = e.target.value as NivelOrganico;
                      setEditando({ ...editando, nivelOrganico: nivel, reportaA: nivel === 'GERENTE' ? null : editando.reportaA });
                    }}
                    className={claseInput}
                  >
                    <option value="COLABORADOR">{ETIQUETA_NIVEL.COLABORADOR}</option>
                    <option value="COORDINADOR">{ETIQUETA_NIVEL.COORDINADOR}</option>
                    <option value="GERENTE">{ETIQUETA_NIVEL.GERENTE}</option>
                  </select>
                ))}

                {campo('Depende de', (
                  <select
                    value={editando.reportaA ?? ''}
                    disabled={editando.nivelOrganico === 'GERENTE'}
                    onChange={(e) => setEditando({ ...editando, reportaA: e.target.value || null })}
                    className={`${claseInput} disabled:bg-slate-50 disabled:text-slate-400`}
                  >
                    <option value="">{editando.nivelOrganico === 'GERENTE' ? '— Nadie (es la gerencia) —' : '— Selecciona —'}</option>
                    {jefesPosibles
                      .filter((j) => j.catalogValue !== editando.catalogValue)
                      .map((j) => <option key={j.catalogValue} value={j.catalogValue}>{j.fullName}</option>)}
                  </select>
                ))}

                {campo('Color de su coordinación', (
                  <select
                    value={editando.color ?? 'sinEquipo'}
                    onChange={(e) => setEditando({ ...editando, color: e.target.value as ClaveColor })}
                    className={claseInput}
                  >
                    <option value="azul">Azul</option>
                    <option value="verde">Verde</option>
                    <option value="durazno">Durazno</option>
                    <option value="gerencia">Gerencia (verde institucional)</option>
                    <option value="sinEquipo">Sin color</option>
                  </select>
                ))}

                {campo('Partida (orden)', (
                  <input
                    type="number" min={1} value={editando.partida ?? ''}
                    onChange={(e) => setEditando({ ...editando, partida: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="15" className={claseInput}
                  />
                ))}

                {campo('Ruta de la fotografía', (
                  <input
                    type="text" value={editando.photoUrl}
                    onChange={(e) => setEditando({ ...editando, photoUrl: e.target.value })}
                    placeholder="/images/responsables/nombre-apellido.jpg" className={claseInput}
                  />
                ), 'md:col-span-2')}
              </div>

              <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                <span>
                  Si dejas la fotografía vacía, la tarjeta muestra sus iniciales. Para poner una, guarda
                  el archivo en <code className="bg-slate-100 px-1 rounded">public/images/responsables/</code> y
                  escribe aquí su ruta.
                </span>
              </p>

              {errorForm && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{errorForm}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex-shrink-0">
              <button type="button" onClick={() => setEditando(null)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                Cancelar
              </button>
              <button
                type="button" onClick={guardar} disabled={guardando}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl bg-[#0F4C3A] text-white hover:bg-[#0d3f30] disabled:opacity-60 transition-colors"
              >
                {guardando ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <>{esNueva ? <UserPlus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />} Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Organigrama;
