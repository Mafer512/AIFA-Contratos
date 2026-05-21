
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  LogOut, AlertCircle,
  X, FileText, Briefcase,
  DollarSign, PieChart as PieChartIcon,
  TrendingUp, BarChart2, Plus, Save, Loader2, Pencil, Trash2,
  CreditCard, Calendar as CalendarIcon, FileSpreadsheet, Menu, History, ArrowLeft, Maximize2, Minimize2,
  Search, Filter, Layers, Sparkles, CalendarDays, ChevronRight, ChevronDown, RefreshCw,
  Users, Plane, Activity, Info
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line, Area, AreaChart } from 'recharts';
import { Calendar as BigCalendar, dateFnsLocalizer, View, NavigateAction } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

import { User, Contract, CommercialSpace, PaasItem, PaymentControlItem, ProcedureStatusItem, ProcedureRecord, UserRole, ChangeLogEntry, ChangeDiff } from '../types';
import { supabase } from '../services/supabaseClient';

const chartPalette = ['#B38E5D', '#2563EB', '#0F4C3A', '#9E1B32', '#7C3AED', '#F97316', '#14B8A6', '#64748B'];
const invoicesPalette = ['#0F4C3A', '#B38E5D', '#2563EB', '#F97316', '#9E1B32', '#7C3AED', '#14B8A6', '#64748B'];

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CONTRACT_SOON_WINDOW_DAYS = 60;

// Reuse the PNG logo within the dashboard shell.
const AifaLogo = ({ className = 'h-32 w-auto' }: { className?: string }) => (
  <img
    src="/images/aifa-logo.png"
    alt="Logotipo AIFA"
    className={className}
    loading="lazy"
  />
);

// ---------------------------------------------------------------------------
// ColumnInfoTooltip — custom styled popover for column help hints
// Uses createPortal so it never gets clipped by table overflow
// ---------------------------------------------------------------------------
const ColumnInfoTooltip: React.FC<{ label: string; tooltip: string }> = ({ label, tooltip }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.left + rect.width / 2 });
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
        onMouseEnter={() => { updatePosition(); setIsOpen(true); }}
        onMouseLeave={() => setIsOpen(false)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Ayuda: ${label}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {isOpen && createPortal(
        <div
          className="fixed pointer-events-none"
          style={{ top: pos.top - 10, left: pos.left, transform: 'translate(-50%, -100%)', zIndex: 99999 }}
        >
          <div className="w-72 rounded-2xl bg-slate-900 text-white shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-[#0F4C3A] to-teal-600 px-4 py-2.5 flex items-center gap-2">
              <Info className="h-4 w-4 text-emerald-200 flex-shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-100 leading-tight">{label}</span>
            </div>
            <div className="px-4 py-3">
              <p className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-line">{tooltip}</p>
            </div>
          </div>
          <div className="mx-auto border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-900" style={{ width: 0, height: 0 }} />
        </div>,
        document.body
      )}
    </div>
  );
};
// ---------------------------------------------------------------------------

interface TableColumnConfig {
  key: string;
  label: string;
  width?: number;
  sticky?: boolean;
  align?: 'left' | 'center' | 'right';
  isCurrency?: boolean;
  mono?: boolean;
  className?: string;
}

const buildRowStyle = (baseColor: string): React.CSSProperties => (
  {
    '--row-bg': baseColor,
  } as React.CSSProperties
);

type TableFilterKey = 'annual2026' | 'servicios2026' | 'paas' | 'controlPagos' | 'invoices' | 'compranet' | 'procedures' | 'pendingOct' | 'estatus2026' | 'pagos2026';
type TableFilterMap = Record<TableFilterKey, string>;

const normalizeSearchFragment = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s]/g, (match) => (match.trim() ? match : ''))
    .replace(/[\u0300-\u036f]/g, '');

const extractSearchableValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return normalizeSearchFragment(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return normalizeSearchFragment(String(value));
  }
  if (value instanceof Date) {
    return normalizeSearchFragment(value.toISOString());
  }
  if (Array.isArray(value)) {
    return value.map((item) => extractSearchableValue(item)).join(' ');
  }
  if (typeof value === 'object') {
    try {
      return normalizeSearchFragment(JSON.stringify(value));
    } catch (error) {
      console.error('Error serializando valor para filtro:', error);
      return normalizeSearchFragment(String(value));
    }
  }
  return normalizeSearchFragment(String(value));
};

const buildSearchableText = (row: Record<string, any>): string => {
  if (!row) return '';
  const fragments: string[] = [];
  Object.values(row).forEach((value) => {
    const normalized = extractSearchableValue(value);
    if (normalized) {
      fragments.push(normalized);
    }
  });
  return fragments.join(' ');
};

const rowMatchesFilter = (row: Record<string, any>, query: string): boolean => {
  const normalizedQuery = normalizeSearchFragment(query ?? '').trim();
  if (!normalizedQuery) return true;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = buildSearchableText(row);
  if (!haystack) return false;
  return tokens.every((token) => haystack.includes(token));
};

const formatResultLabel = (count: number) => `${count} resultado${count === 1 ? '' : 's'}`;
const formatColumnFilterLabel = (count: number) => (
  count ? `${count} filtro${count === 1 ? '' : 's'} por columna` : ''
);

const COLUMN_FILTER_EMPTY_TOKEN = '__EMPTY__';
const COLUMN_FILTER_POPOVER_WIDTH = 240; // Tailwind w-60 (15rem)
const COLUMN_FILTER_POPOVER_MARGIN = 8;

const normalizeColumnFilterToken = (value: any): string => {
  if (value === null || value === undefined) return COLUMN_FILTER_EMPTY_TOKEN;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const asString = String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  return asString.length ? asString : COLUMN_FILTER_EMPTY_TOKEN;
};

const formatColumnFilterOptionLabel = (value: any): string => {
  if (value === null || value === undefined || value === '') return 'Vacío';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('es-MX');
  }
  if (value instanceof Date) {
    return value.toLocaleDateString('es-MX');
  }
  const compact = String(value).replace(/\s+/g, ' ').trim();
  return compact.length ? compact : 'Vacío';
};

type ColumnFilterValueMap = Record<string, string[] | undefined>;
type ColumnFiltersRegistry = Record<TableFilterKey, ColumnFilterValueMap>;

const rowMatchesColumnFilters = (row: Record<string, any>, filters?: ColumnFilterValueMap): boolean => {
  if (!filters) return true;
  const entries = Object.entries(filters).filter(([, values]) => Array.isArray(values));
  if (!entries.length) return true;
  return entries.every(([columnKey, allowedTokens]) => {
    const tokens = Array.isArray(allowedTokens) ? allowedTokens : [];
    if (!tokens.length) {
      return false;
    }
    const cellToken = normalizeColumnFilterToken(row?.[columnKey]);
    return tokens.includes(cellToken);
  });
};

const countActiveColumnFilters = (filters?: ColumnFilterValueMap) => (
  filters ? Object.values(filters).filter((value) => Array.isArray(value)).length : 0
);

interface ColumnFilterControlProps {
  tableKey: TableFilterKey;
  columnKey: string;
  label: string;
  rows: unknown[];
  selectedValues?: string[] | null;
  onChange: (tableKey: TableFilterKey, columnKey: string, values: string[] | null) => void;
  fixedOptions?: readonly string[];
}

const ColumnFilterControl: React.FC<ColumnFilterControlProps> = React.memo(({
  tableKey,
  columnKey,
  label,
  rows,
  selectedValues,
  onChange,
  fixedOptions,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const hasExplicitSelection = Array.isArray(selectedValues);
  const explicitValues = hasExplicitSelection ? selectedValues : [];
  const isActive = hasExplicitSelection;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [isOpen]);

  const updatePopoverPosition = useCallback(() => {
    if (!isOpen) return;
    if (typeof window === 'undefined') return;
    const buttonEl = buttonRef.current;
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
    const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
    const halfWidth = COLUMN_FILTER_POPOVER_WIDTH / 2;
    let left = rect.left + rect.width / 2 - halfWidth + scrollX;
    const maxLeft = scrollX + viewportWidth - COLUMN_FILTER_POPOVER_WIDTH - 8;
    const minLeft = scrollX + 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    const top = rect.bottom + COLUMN_FILTER_POPOVER_MARGIN + scrollY;
    setPopoverPosition({ top, left });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();
    if (typeof window === 'undefined') return;
    const handleReposition = () => updatePopoverPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const options = useMemo(() => {
    if (fixedOptions) {
      const countMap = new Map<string, number>();
      (rows as Array<Record<string, any>>).forEach((row) => {
        const token = normalizeColumnFilterToken(row?.[columnKey]);
        countMap.set(token, (countMap.get(token) ?? 0) + 1);
      });
      return fixedOptions.map((opt) => ({
        token: normalizeColumnFilterToken(opt),
        label: opt,
        count: countMap.get(normalizeColumnFilterToken(opt)) ?? 0,
      }));
    }
    const optionMap = new Map<string, { token: string; label: string; count: number }>();
    (rows as Array<Record<string, any>>).forEach((row) => {
      const value = row?.[columnKey];
      const token = normalizeColumnFilterToken(value);
      const labelText = formatColumnFilterOptionLabel(value);
      const existing = optionMap.get(token);
      if (existing) {
        existing.count += 1;
      } else {
        optionMap.set(token, { token, label: labelText, count: 1 });
      }
    });
    return Array.from(optionMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [rows, columnKey, fixedOptions]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const normalizedSearch = searchTerm.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalizedSearch) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedSearch));
  }, [options, searchTerm]);

  const selectedSet = useMemo(() => new Set(explicitValues), [explicitValues]);
  const allOptionTokens = useMemo(() => options.map((option) => option.token), [options]);
  const isAllSelected = !hasExplicitSelection || explicitValues.length >= allOptionTokens.length;

  const runWithoutScrollJump = useCallback((action: () => void) => {
    if (typeof window === 'undefined') {
      action();
      return;
    }
    const { scrollX, scrollY } = window;
    action();
    requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
      requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
    });
  }, []);

  const toggleToken = (token: string) => {
    const baseline = hasExplicitSelection ? new Set(selectedSet) : new Set(allOptionTokens);
    if (baseline.has(token)) {
      baseline.delete(token);
    } else {
      baseline.add(token);
    }
    if (baseline.size === allOptionTokens.length) {
      onChange(tableKey, columnKey, null);
    } else {
      onChange(tableKey, columnKey, Array.from(baseline));
    }
  };

  const handleSelectAll = () => {
    onChange(tableKey, columnKey, null);
  };

  const handleDeselectAll = () => {
    runWithoutScrollJump(() => onChange(tableKey, columnKey, []));
  };

  const handleClear = () => {
    onChange(tableKey, columnKey, null);
    setIsOpen(false);
  };

  const handleClose = () => setIsOpen(false);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  return (
    <span className="ml-1 inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Filtrar columna ${label}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`p-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
          isActive
            ? 'bg-amber-100 text-amber-700 shadow-inner shadow-amber-200 hover:bg-amber-100'
            : 'text-white/70 hover:text-white'
        }`}
      >
        <Filter className="h-3.5 w-3.5" />
      </button>
      {isOpen && portalTarget && createPortal(
        <div
          ref={popoverRef}
          className="z-[2000] w-60 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl"
          style={{ position: 'absolute', top: popoverPosition.top, left: popoverPosition.left, width: COLUMN_FILTER_POPOVER_WIDTH }}
        >
          <p className="text-[11px] font-semibold text-slate-500 mb-2 leading-snug truncate">{label}</p>
          <div className="mb-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar valor"
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-[#0F4C3A] focus:ring-1 focus:ring-[#0F4C3A]"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold mb-2 gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[#0F4C3A] hover:text-[#0c3b2d]"
            >
              {isAllSelected ? 'Todos seleccionados' : 'Seleccionar todos'}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-slate-600 hover:text-slate-800"
              >
                Borrar
              </button>
              {isActive ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-red-500 hover:text-red-600"
                >
                  Quitar filtro
                </button>
              ) : (
                <span className="text-slate-400">Sin filtro</span>
              )}
            </div>
          </div>
          <div className="max-h-56 overflow-auto rounded border border-slate-100 divide-y divide-slate-100">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-slate-400">
                Sin coincidencias
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = hasExplicitSelection ? selectedSet.has(option.token) : true;
                return (
                  <label
                    key={option.token}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 text-[#0F4C3A] focus:ring-[#0F4C3A]"
                        checked={checked}
                        onChange={() => toggleToken(option.token)}
                      />
                      <span className="truncate max-w-[160px]" title={option.label}>{option.label}</span>
                    </span>
                    <span className="text-[11px] text-slate-400">{option.count.toLocaleString('es-MX')}</span>
                  </label>
                );
              })
            )}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-[11px] font-semibold">
            <button
              type="button"
              onClick={handleClose}
              className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-700"
            >
              Cerrar
            </button>
          </div>
        </div>,
        portalTarget
      )}
    </span>
  );
});
ColumnFilterControl.displayName = 'ColumnFilterControl';

// ---------------------------------------------------------------------------
// EstatusStatusPicker — dropdown for the "Estatus" column in estatus_2026
// ---------------------------------------------------------------------------
const ESTATUS_2026_OPTIONS = [
  'Cancelado',
  'Pausado',
  'Elaboración de anexo técnico, administrativo y apéndices',
  'En proceso de publicación',
  'En investigación de mercado',
  'En revisión de Defensa',
  'Adjudicado',
] as const;

// Hex colors for each canonical status — used in the pie chart and legend
const ESTATUS_2026_COLOR_MAP: Record<string, string> = {
  'Cancelado':                                                          '#EF4444', // red-500
  'Pausado':                                                            '#F59E0B', // amber-500
  'Elaboración de anexo técnico, administrativo y apéndices':           '#06B6D4', // cyan-500
  'En proceso de publicación':                                          '#3B82F6', // blue-500
  'En investigación de mercado':                                        '#6366F1', // indigo-500
  'En revisión de Defensa':                                             '#8B5CF6', // violet-500
  'Adjudicado':                                                         '#10B981', // emerald-500
  'Sin estatus':                                                        '#94A3B8', // slate-400
};

const getEstatusColorClass = (label: string) => {
  if (!label) return 'bg-slate-100 text-slate-400 border-slate-200';
  const l = label.toLowerCase();
  if (l.includes('cancelado')) return 'bg-red-100 text-red-800 border-red-200';
  if (l.includes('pausado')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (l.includes('adjudicado')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (l.includes('publicaci')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (l.includes('investigaci')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (l.includes('defensa')) return 'bg-purple-100 text-purple-800 border-purple-200';
  if (l.includes('elaboraci')) return 'bg-cyan-100 text-cyan-800 border-cyan-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

interface EstatusStatusPickerProps {
  value: string;
  onChange: (nextValue: string) => void;
}

const EstatusStatusPicker: React.FC<EstatusStatusPickerProps> = ({ value, onChange }) => {
  const currentValue = ESTATUS_2026_OPTIONS.includes(value as any) ? value : '';
  return (
    <div className="flex flex-col items-center gap-1 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
      {currentValue && (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${getEstatusColorClass(currentValue)}`}>
          {currentValue}
        </span>
      )}
      <select
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 cursor-pointer"
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Estatus"
      >
        <option value="">— Seleccionar —</option>
        {ESTATUS_2026_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
};

interface TipoServicioPickerProps {
  value: string;
  onChange: (nextValue: string) => void;
}

const getTipoColorClass = (label: string) => {
  if (!label) return 'bg-slate-100 text-slate-400 border-slate-200';
  const labelLower = label.toLowerCase();
  if (labelLower.includes('alta')) return 'bg-red-100 text-red-800 border-red-200';
  if (labelLower.includes('media')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (labelLower.includes('baja')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (labelLower.includes('normativo')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const TipoServicioPicker: React.FC<TipoServicioPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const normalizedValue = String(value ?? '').trim();
  const currentBase = normalizedValue.startsWith('Ordinario')
    ? 'Ordinario'
    : normalizedValue.toLowerCase() === 'normativo'
      ? 'Normativo'
      : '';
  const currentPriority = currentBase === 'Ordinario'
    ? (normalizedValue.includes('Alta') ? 'Alta' : normalizedValue.includes('Media') ? 'Media' : 'Baja')
    : '';
  const displayLabel = currentBase === 'Ordinario'
    ? `Ordinario - ${currentPriority || 'Alta'}`
    : currentBase || '— Seleccionar —';

  const updatePopoverPosition = useCallback(() => {
    if (!isOpen) return;
    if (typeof window === 'undefined') return;
    const buttonEl = buttonRef.current;
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
    const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
    const popoverWidth = 260;
    let left = rect.left + scrollX;
    const maxLeft = scrollX + viewportWidth - popoverWidth - 8;
    const minLeft = scrollX + 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    const top = rect.bottom + 8 + scrollY;
    setPopoverPosition({ top, left });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();
    if (typeof window === 'undefined') return;
    const handleReposition = () => updatePopoverPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  const optionGroups = [
    {
      label: 'Normativo',
      value: 'Normativo',
      description: 'Servicio sujeto a catálogo normativo.',
    },
    {
      label: 'Ordinario - Alta',
      value: 'Ordinario - Alta',
      description: 'Servicio ordinario con prioridad alta.',
    },
    {
      label: 'Ordinario - Media',
      value: 'Ordinario - Media',
      description: 'Servicio ordinario con prioridad media.',
    },
    {
      label: 'Ordinario - Baja',
      value: 'Ordinario - Baja',
      description: 'Servicio ordinario con prioridad baja.',
    },
  ];

  return (
    <div className="relative w-full" onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Tipo de servicio"
        title="Tipo de servicio"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full rounded-md border px-2 py-1 text-[11px] font-semibold text-left focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 cursor-pointer ${getTipoColorClass(String(value ?? ''))}`}
      >
        <span className="block truncate">{displayLabel}</span>
      </button>
      {isOpen && portalTarget && createPortal(
        <div
          ref={popoverRef}
          className="z-[2000] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl"
          style={{ position: 'absolute', top: popoverPosition.top, left: popoverPosition.left, width: 260 }}
        >
          <p className="mb-2 text-[11px] font-semibold text-slate-500">Selecciona un tipo de servicio</p>
          <div className="flex flex-col gap-2">
            {optionGroups.map((option) => {
              const isActive = displayLabel === option.label;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-[#0F4C3A] bg-emerald-50 text-[#0F4C3A]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-[12px] font-semibold">{option.label}</span>
                  <span className="block text-[11px] text-slate-500">{option.description}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-700"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-700"
            >
              Cerrar
            </button>
          </div>
        </div>,
        portalTarget
      )}
    </div>
  );
};

// === DATOS MOCK DE RESPALDO (FALLBACK) ===
const MOCK_CONTRACTS: Contract[] = [
  { id: 'm1', provider_name: 'Limpieza Integral S.A.', service_concept: 'Limpieza Terminal Pasajeros', contract_number: 'C-2024-001', start_date: '2024-01-01', end_date: '2024-12-31', amount_mxn: 12500000, status: 'ACTIVO', area: 'Terminal 1' },
  { id: 'm2', provider_name: 'Seguridad Privada Elite', service_concept: 'Vigilancia de Filtros', contract_number: 'C-2024-045', start_date: '2023-06-01', end_date: '2024-06-01', amount_mxn: 8400000, status: 'POR VENCER', area: 'Accesos' },
  { id: 'm3', provider_name: 'Mantenimiento Pistas MX', service_concept: 'Mantenimiento Pista Central', contract_number: 'C-2023-889', start_date: '2023-01-01', end_date: '2023-12-31', amount_mxn: 45000000, status: 'VENCIDO', area: 'Pistas' },
  { id: 'm4', provider_name: 'Tecnología Aeroportuaria', service_concept: 'Soporte FIDS', contract_number: 'C-2024-102', start_date: '2024-02-15', end_date: '2025-02-15', amount_mxn: 3200000, status: 'ACTIVO', area: 'Sistemas' },
];

const MOCK_SPACES: CommercialSpace[] = [
  { id: 's1', space_code: 'LOC-001', tenant_name: 'Starbucks Coffee', category: 'Alimentos', monthly_rent: 85000, occupancy_status: 'OCUPADO' },
  { id: 's2', space_code: 'LOC-002', tenant_name: 'Farmacias del Ahorro', category: 'Servicios', monthly_rent: 45000, occupancy_status: 'OCUPADO' },
  { id: 's3', space_code: 'LOC-003', tenant_name: 'Duty Free Americas', category: 'Retail', monthly_rent: 120000, occupancy_status: 'OCUPADO' },
  { id: 's4', space_code: 'LOC-004', tenant_name: null, category: 'Retail', monthly_rent: 40000, occupancy_status: 'DISPONIBLE' },
  { id: 's5', space_code: 'LOC-005', tenant_name: 'Krispy Kreme', category: 'Alimentos', monthly_rent: 55000, occupancy_status: 'OCUPADO' },
];

const SERVICIOS_STATUS_STEPS = [
  'Ficha técnica en elaboración',
  'Investigación de mercado',
  'Revisión Defensa (DN3)',
  'Procedimiento de Contratación',
  'Adjudicado',
  'Validación por área',
  'Revisión Defensa (DN10)',
];

const SERVICIOS_STATUS_ACCENTS = [
  {
    surface: 'from-white via-rose-50 to-amber-50',
    progress: 'from-rose-500 via-orange-400 to-amber-400',
    badge: 'bg-rose-50 text-rose-700 border border-rose-200',
    glow: 'shadow-[0_20px_45px_rgba(249,115,22,0.18)]',
  },
  {
    surface: 'from-white via-emerald-50 to-teal-50',
    progress: 'from-emerald-400 via-teal-400 to-cyan-400',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    glow: 'shadow-[0_20px_45px_rgba(16,185,129,0.18)]',
  },
  {
    surface: 'from-white via-sky-50 to-indigo-50',
    progress: 'from-sky-400 via-indigo-400 to-purple-500',
    badge: 'bg-sky-50 text-sky-700 border border-sky-200',
    glow: 'shadow-[0_20px_45px_rgba(56,189,248,0.18)]',
  },
  {
    surface: 'from-white via-amber-50 to-lime-50',
    progress: 'from-amber-400 via-yellow-400 to-lime-400',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    glow: 'shadow-[0_20px_45px_rgba(251,191,36,0.20)]',
  },
];

const getServicioStatusAccent = (stageIndex: number) => {
  const index = stageIndex >= 0 ? stageIndex % SERVICIOS_STATUS_ACCENTS.length : 0;
  return SERVICIOS_STATUS_ACCENTS[index];
};

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [activeContractSubTab, setActiveContractSubTab] = useState<'paas' | 'payments' | 'invoices' | 'compranet' | 'pendingOct' | 'procedures'>('payments'); 
  const [statusTab, setStatusTab] = useState<'dashboard' | 'calendar' | 'table'>('dashboard');
  const [activeOperationsView, setActiveOperationsView] = useState<'passengers' | 'annual'>('passengers');
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  const [is2025Expanded, setIs2025Expanded] = useState(true);
  const [is2026Expanded, setIs2026Expanded] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Database State
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [commercialSpaces, setCommercialSpaces] = useState<CommercialSpace[]>([]);
  const [annual2026Data, setAnnual2026Data] = useState<Record<string, any>[]>([]);
  const [servicios2026Data, setServicios2026Data] = useState<Record<string, any>[]>([]);
  const [estatus2026Data, setEstatus2026Data] = useState<Record<string, any>[]>([]);
  const [pagos2026Data, setPagos2026Data] = useState<Record<string, any>[]>([]);
  const [pagos2026ExpandedMonths, setPagos2026ExpandedMonths] = useState<Set<string>>(new Set());
  const [paasData, setPaasData] = useState<PaasItem[]>([]);
  const [paymentsData, setPaymentsData] = useState<PaymentControlItem[]>([]);
  const [invoicesData, setInvoicesData] = useState<Record<string, any>[]>([]);
  const [compranetData, setCompranetData] = useState<Record<string, any>[]>([]);
  const [proceduresData, setProceduresData] = useState<ProcedureRecord[]>([]);
  const [procedureStatuses, setProcedureStatuses] = useState<ProcedureStatusItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [changeHistory, setChangeHistory] = useState<ChangeLogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTableFilter, setHistoryTableFilter] = useState<string>('all');
  const historyAvailableRef = useRef(true);
  
  // Executive Summary Interactive State
  const [selectedServicePhase, setSelectedServicePhase] = useState<string | null>(null);

  // === STATES FOR PAAS RECORD MODAL ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // ID si estamos editando, null si es nuevo

  type FieldInputType = 'text' | 'number' | 'date' | 'textarea';

  interface FieldInputConfig {
    key: string;
    label: string;
    type: FieldInputType;
    placeholder?: string;
    required?: boolean;
    helpText?: string;
  }

  interface ContractAlert {
    id: string;
    contractNumber: string;
    provider: string;
    service: string;
    endDateLabel: string;
    daysLeft: number;
    amount: number;
  }

  interface ExecutiveInsight {
    id: string;
    title: string;
    detail: string;
    tone: 'neutral' | 'positive' | 'alert' | 'critical';
    icon: React.ComponentType<{ className?: string }>;
  }

  interface ProcedureServiceSnapshot {
    id: number | string;
    label: string;
    statusLabel: string | null;
    deadlineLabel: string | null;
    raw: ProcedureRecord;
  }

  interface ProcedureResponsibleSummary {
    responsible: string;
    total: number;
    statusBreakdown: Array<{ label: string; count: number }>;
    services: ProcedureServiceSnapshot[];
  }

  interface ServicioStatusEntry {
    id: string | number;
    serviceName: string;
    clave?: string | number | null;
    statusLabel: string;
    stageIndex: number;
    stageLabel?: string | null;
    stageShort?: string | null;
    monetary: Array<{ label: string; value: number }>;
  }

  type GenericRecordEditorConfig = {
    table: string;
    title: string;
    isNew: boolean;
    primaryKey?: string | null;
    note?: string;
    fields: FieldInputConfig[];
    formValues: Record<string, any>;
    originalRow: Record<string, any> | null;
  };

  const [recordEditorConfig, setRecordEditorConfig] = useState<GenericRecordEditorConfig | null>(null);
  const [recordEditorSaving, setRecordEditorSaving] = useState(false);
  const [recordEditorError, setRecordEditorError] = useState<string | null>(null);
  const [selectedResponsibleName, setSelectedResponsibleName] = useState<string | null>(null);
  const [isProceduresEditing, setIsProceduresEditing] = useState(false);
  const [isProceduresCompact, setIsProceduresCompact] = useState(false);
  const [isServiciosEditing, setIsServiciosEditing] = useState(false);
  const [isServiciosCompact, setIsServiciosCompact] = useState(false);
  const [isAnnualEditing, setIsAnnualEditing] = useState(false);
  const [isAnnualCompact, setIsAnnualCompact] = useState(false);
  const [isPaasEditing, setIsPaasEditing] = useState(false);
  const [isPaasCompact, setIsPaasCompact] = useState(false);
  const [isPaymentsEditing, setIsPaymentsEditing] = useState(false);
  const [isPaymentsCompact, setIsPaymentsCompact] = useState(false);
  const [isInvoicesEditing, setIsInvoicesEditing] = useState(false);
  const [isInvoicesCompact, setIsInvoicesCompact] = useState(false);
  const [isCompranetEditing, setIsCompranetEditing] = useState(false);
  const [isCompranetCompact, setIsCompranetCompact] = useState(false);
  const [isPendingOctEditing, setIsPendingOctEditing] = useState(false);
  const [isPendingOctCompact, setIsPendingOctCompact] = useState(false);
  const [isEstatus2026Editing, setIsEstatus2026Editing] = useState(false);
  const [isEstatus2026Compact, setIsEstatus2026Compact] = useState(false);
  const [isAddingEstatus2026Row, setIsAddingEstatus2026Row] = useState(false);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [deletingRecordKey, setDeletingRecordKey] = useState<string | null>(null);
  const [isPagos2026Editing, setIsPagos2026Editing] = useState(false);
  const [isPagos2026Compact, setIsPagos2026Compact] = useState(false);
  // Tracks which observation cells are open for editing (key = rowKey__column)
  const [obsOpenSet, setObsOpenSet] = useState<Record<string, true>>({});
  // Holds uncontrolled textarea DOM refs so we can read value only on Save (no re-renders while typing)
  const obsTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const [active2026View, setActive2026View] = useState<'resumen' | 'estatus' | 'pagos'>('resumen');
  const [activePagos2026View, setActivePagos2026View] = useState<'tabla' | 'resumen'>('tabla');
  const [expandedPagos2026SummaryKey, setExpandedPagos2026SummaryKey] = useState<string | null>(null);
  const [activeReportesView, setActiveReportesView] = useState<'gastoEfectuado' | 'historicoServicios' | 'anteproyecto' | 'paaas' | 'deductivas'>('gastoEfectuado');
  const [isReportesExpanded, setIsReportesExpanded] = useState(true);
  const [selectedHistoricoYear, setSelectedHistoricoYear] = useState<number>(2026);
  const [selectedEstatus2026Phase, setSelectedEstatus2026Phase] = useState<string | null>(null);
  const [selectedEstatus2026Estatus, setSelectedEstatus2026Estatus] = useState<string | null>(null);
  
  const [expandedServicioStatusId, setExpandedServicioStatusId] = useState<string | number | null>(null);
  const [expandedServiciosConvenio, setExpandedServiciosConvenio] = useState<Record<string, boolean>>({});
  const [expandedEstatus2026Convenio, setExpandedEstatus2026Convenio] = useState<Record<string, boolean>>({});
  const [tableFilters, setTableFilters] = useState<TableFilterMap>({
    annual2026: '',
    servicios2026: '',
    paas: '',
    controlPagos: '',
    invoices: '',
    compranet: '',
    procedures: '',
    pendingOct: '',
    estatus2026: '',
    pagos2026: '',
  });
  const updateTableFilter = (key: TableFilterKey, value: string) => {
    setTableFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersRegistry>({
    annual2026: {},
    servicios2026: {},
    paas: {},
    controlPagos: {},
    invoices: {},
    compranet: {},
    procedures: {},
    pendingOct: {},
    estatus2026: {},
    pagos2026: {},
  });

  const [estatus2026ColumnSearch, setEstatus2026ColumnSearch] = useState<Record<string, string>>({});
  const [pagos2026ColumnSearch, setPagos2026ColumnSearch] = useState<Record<string, string>>({});

  const updateColumnFilter = useCallback((tableKey: TableFilterKey, columnKey: string, values: string[] | null) => {
    setColumnFilters((prev) => {
      const currentForTable = prev[tableKey] ?? {};
      const nextForTable = { ...currentForTable };
      if (values === null) {
        if (!Object.prototype.hasOwnProperty.call(currentForTable, columnKey)) {
          return prev;
        }
        delete nextForTable[columnKey];
      } else {
        const sanitizedValues = Array.isArray(values)
          ? Array.from(new Set(values.filter((token) => typeof token === 'string' && token.length)))
          : [];
        const existing = currentForTable[columnKey];
        const hasSameValues = Array.isArray(existing)
          && existing.length === sanitizedValues.length
          && sanitizedValues.every((token) => existing.includes(token));
        if (hasSameValues) return prev;
        nextForTable[columnKey] = sanitizedValues;
      }

      return {
        ...prev,
        [tableKey]: nextForTable,
      };
    });
  }, []);

  const clearColumnFilters = useCallback((tableKey: TableFilterKey) => {
    setColumnFilters((prev) => {
      if (!Object.keys(prev[tableKey] ?? {}).length) return prev;
      return {
        ...prev,
        [tableKey]: {},
      };
    });
  }, []);

  const renderColumnFilterControl = useCallback((
    tableKey: TableFilterKey,
    columnKey: string,
    label: string,
    rowsSource: unknown[],
    fixedOptions?: readonly string[]
  ) => {
    // Calculate available options based on OTHER active filters to ensure precision
    const query = tableFilters[tableKey]?.trim() ?? '';
    const currentFilters = columnFilters[tableKey] ?? {};
    
    const relevantRows = (rowsSource as any[]).filter((row) => {
      // 1. Must match global search
      if (query && !rowMatchesFilter(row, query)) return false;

      // 2. Must match ALL OTHER column filters
      const otherFilters = Object.entries(currentFilters).filter(([k, v]) => k !== columnKey && Array.isArray(v) && v.length > 0);
      if (otherFilters.length > 0) {
        const matchesOthers = otherFilters.every(([k, allowed]) => {
           const val = normalizeColumnFilterToken(row?.[k]);
           return allowed!.includes(val);
        });
        if (!matchesOthers) return false;
      }
      return true;
    });

    return (
      <ColumnFilterControl
        tableKey={tableKey}
        columnKey={columnKey}
        label={label}
        rows={relevantRows}
        selectedValues={columnFilters[tableKey]?.[columnKey]}
        onChange={updateColumnFilter}
        fixedOptions={fixedOptions}
      />
    );
  }, [columnFilters, tableFilters, updateColumnFilter]);

  const renderActiveColumnFilterBadges = useCallback((
    tableKey: TableFilterKey,
    labelResolver?: (columnKey: string) => string
  ) => {
    const entries = Object.entries(columnFilters[tableKey] ?? {}).filter(([, values]) => Array.isArray(values));
    if (!entries.length) return null;
    return (
      <div className="w-full mt-2 flex flex-wrap gap-1.5">
        {entries.map(([columnKey, values]) => {
          const displayLabel = (labelResolver ? labelResolver(columnKey) : humanizeKey(columnKey)) || humanizeKey(columnKey);
          return (
            <span
              key={`${tableKey}-${columnKey}`}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-[#8a5a00]"
            >
              <span className="truncate max-w-[130px]" title={displayLabel}>{displayLabel}</span>
              <span className="text-[9px] font-normal text-[#a97100]">
                {Array.isArray(values) && values.length ? `${values.length} valor${values.length === 1 ? '' : 'es'}` : 'Vacío'}
              </span>
              <button
                type="button"
                onClick={() => updateColumnFilter(tableKey, columnKey, null)}
                className="ml-0.5 rounded-full p-0.5 text-[#8a5a00] hover:bg-amber-100"
                aria-label={`Quitar filtro para ${displayLabel}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
    );
  }, [columnFilters, updateColumnFilter]);

  const annualColumnFiltersCount = countActiveColumnFilters(columnFilters.annual2026);
  const serviciosColumnFiltersCount = countActiveColumnFilters(columnFilters.servicios2026);
  const paasColumnFiltersCount = countActiveColumnFilters(columnFilters.paas);
  const paymentsColumnFiltersCount = countActiveColumnFilters(columnFilters.controlPagos);
  const invoicesColumnFiltersCount = countActiveColumnFilters(columnFilters.invoices);
  const compranetColumnFiltersCount = countActiveColumnFilters(columnFilters.compranet);
  const proceduresColumnFiltersCount = countActiveColumnFilters(columnFilters.procedures);
  const pendingOctColumnFiltersCount = countActiveColumnFilters(columnFilters.pendingOct);

  const pendingOctColumnLabels = useMemo(() => ({
    created_at: 'Registro',
    contrato: 'Contrato',
    descripcion: 'Descripción del Servicio',
    empresa: 'Empresa',
    mes_factura_nota: 'Mes factura / nota',
    observacion_pago: 'Observación de Pago',
  }), []);

  const resolvePendingOctColumnLabel = useCallback((columnKey: string) => (
    pendingOctColumnLabels[columnKey as keyof typeof pendingOctColumnLabels] ?? humanizeKey(columnKey)
  ), [pendingOctColumnLabels]);

  // Initial state matches the columns of your table
  const initialFormState = {
    "No.": '',
    "Clave cucop": '',
    "Nombre del Servicio.": '',
    "Subdirección": '',
    "Gerencia": '',
    "Monto solicitado anteproyecto 2026": 0,
    "Modificado": 0,
    "Justificación": ''
  };
  const [formState, setFormState] = useState(initialFormState);

  useEffect(() => {
    if (!proceduresData.length && isProceduresEditing) {
      setIsProceduresEditing(false);
    }
  }, [proceduresData.length, isProceduresEditing]);

  const createTableSizing = (isCompact: boolean) => {
    if (isCompact) {
      return {
        containerHeightClass: 'max-h-[85vh]',
        tableTextClass: 'text-[10px]',
        tableMinWidthClass: 'lg:min-w-[900px]',
        headerTextClass: 'text-[9px]',
        headerRowClass: 'h-10',
        headerCellPadding: 'px-2 py-1.5',
        actionsCellPadding: 'px-2 py-1.5',
        actionsMinWidth: 120,
        stickyFallbackWidth: 130,
        numericCellClass: 'px-2 py-1.5 text-center font-mono text-slate-600 align-middle',
        textCellClass: 'px-2 py-1.5 text-center text-slate-700 align-middle whitespace-pre-wrap break-words',
        editorMinHeightClass: 'min-h-[18px]',
      } as const;
    }
    return {
      containerHeightClass: 'max-h-[80vh]',
      tableTextClass: 'text-[11px]',
      tableMinWidthClass: 'lg:min-w-[1100px]',
      headerTextClass: 'text-[10px]',
      headerRowClass: 'h-11',
      headerCellPadding: 'px-3 py-2',
      actionsCellPadding: 'px-3 py-2',
      actionsMinWidth: 140,
      stickyFallbackWidth: 150,
      numericCellClass: 'px-3 py-2 text-center font-mono text-slate-600 align-middle',
      textCellClass: 'px-3 py-2 text-center text-slate-700 align-middle whitespace-pre-wrap break-words',
      editorMinHeightClass: 'min-h-[22px]',
    } as const;
  };

  const proceduresSizing = useMemo(() => createTableSizing(isProceduresCompact), [isProceduresCompact]);
  const serviciosSizing = useMemo(() => createTableSizing(isServiciosCompact), [isServiciosCompact]);
  const annualTableSizing = useMemo(() => createTableSizing(isAnnualCompact), [isAnnualCompact]);
  const paasTableSizing = useMemo(() => createTableSizing(isPaasCompact), [isPaasCompact]);
  const paymentsTableSizing = useMemo(() => createTableSizing(isPaymentsCompact), [isPaymentsCompact]);
  const invoicesTableSizing = useMemo(() => createTableSizing(isInvoicesCompact), [isInvoicesCompact]);
  const compranetTableSizing = useMemo(() => createTableSizing(isCompranetCompact), [isCompranetCompact]);
  const pendingOctTableSizing = useMemo(() => createTableSizing(isPendingOctCompact), [isPendingOctCompact]);

  const PRIMARY_KEY_HINTS: Record<string, string> = {
    'año_2026': 'id',
    'estatus_servicios_2026': 'id',
    'estatus_2026': 'id',
    'pagos': 'id',
    'balance_paas_2026': 'id',
    'paas': 'id',
    'control_pagos': 'id',
    'estatus_facturas': 'id',
    'procedimientos_compranet': 'id',
    'procedimientos': 'id',
    'estatus_procedimiento': 'id',
    contracts: 'id',
    commercial_spaces: 'id',
  };

  const generateTemplateFromColumns = (columns: string[]) => {
    const template: Record<string, any> = {};
    columns
      .filter((column) => column && column !== '__actions')
      .forEach((column) => {
        const normalized = normalizeAnnualKey(column);
        if (['id', 'created_at', 'updated_at', 'inserted_at'].includes(normalized)) return;
        template[column] = '';
      });
    return template;
  };

  const createSafeInitialRecord = (columns: string[]) => {
    const record: Record<string, any> = {};
    console.log('Generating safe record for columns:', columns);
    
    columns.forEach((col) => {
      if (!col || col === '__actions') return;
      const lower = col.toLowerCase().trim().replace(/['"]/g, ''); // Remove quotes just in case
      if (['id', 'created_at', 'updated_at', 'inserted_at'].includes(lower)) return;

      // Special case for "No" / "No." columns (often text or numeric but required)
      if (/^(no\.?|num(ero|er|ber)?|#|consecutivo|orden)$/.test(lower)) {
        record[col] = 0;
      }
      // Numeric
      else if (['monto', 'importe', 'total', 'presupuesto', 'costo', 'ejercido', 'modificado', 'pagado', 'cantidad', 'precio', 'iva', 'subtotal', 'percent', 'porcentaje', 'estimado', 'adjudicado', 'año', 'year', 'mes', 'month', 'dia', 'day', 'trimestre', 'semestre', 'prioridad', 'orden', 'consecutivo', 'num'].some(t => lower.includes(t))) {
        record[col] = 0;
      } 
      // Date — match known date prefixes/suffixes (conservative)
      else if (['fecha', 'date', 'vigencia', 'firma', 'apertura', 'fallo', 'publicacion', 'visita', 'junta', 'revision', 'termino', 'inicio', 'fin'].some(t => lower.includes(t))) {
        record[col] = null; 
      } 
      // Boolean — only clearly boolean snake_case patterns (avoid accented columns)
      else if (/^(activo|active|enabled|visible|is_|has_|es_|requiere_|aplica_)/.test(lower)
        || ['investigacion_mercado', 'suficiencia_presupuestal', 'procedimiento_contratacion',
            'documentacion_soporte', 'convenio_modificatorio', 'garantia_cumplimiento',
            'garantia_calidad', 'poliza_responsabilidad', 'desierta', 'evaluacion_tecnica'].some(t => lower === t || lower.startsWith(t))
        || (lower.endsWith('_cumplimiento') || lower.endsWith('_calidad') || lower.endsWith('_modificatorio'))) {
        record[col] = false;
      }
      // Text (Explicit)
      else if (['nombre', 'descripcion', 'concepto', 'proveedor', 'observaciones', 'comentarios', 'nota', 'justificacion', 'gerencia', 'subdireccion', 'fase', 'tipo', 'modalidad', 'categoria', 'clave', 'contrato', 'oficio', 'contacto', 'responsable', 'empresa', 'dependencia', 'unidad', 'titulo'].some(t => lower.includes(t))) {
        record[col] = '';
      }
      // Fallback - omit: let DB defaults apply
    });
    console.log('Safe record generated:', record);
    return record;
  };

  /**
   * Data-driven initial record: determines column types from existing row data rather than
   * column names. Much safer than keyword matching — avoids sending wrong types (e.g., false
   * to a date column) when column names are ambiguous.
   */
  const createInitialRecordFromData = (
    columns: string[],
    sampleRows: Record<string, any>[]
  ): Record<string, any> => {
    const record: Record<string, any> = {};
    for (const col of columns) {
      if (!col || col === '__actions' || col.startsWith('__')) continue;
      const norm = col.toLowerCase().trim().replace(/['"]/g, '');
      if (['id', 'created_at', 'updated_at', 'inserted_at'].includes(norm)) continue;

      // Find a non-null sample value to detect the type
      const nonNullValues = sampleRows
        .map(r => r?.[col])
        .filter(v => v !== null && v !== undefined);

      if (nonNullValues.length === 0) {
        // All nulls in sample data → column is nullable or has DB default → omit
        continue;
      }

      const firstVal = nonNullValues[0];
      if (typeof firstVal === 'boolean') {
        record[col] = false;    // Boolean column → default false
      } else if (typeof firstVal === 'number') {
        record[col] = 0;        // Numeric column → default 0
      }
      // string (text, dates) or object → omit; DB handles defaults or it's nullable
    }
    return record;
  };

  const resolvePrimaryKey = (row: Record<string, any> | null | undefined, table: string, explicit?: string | null) => {
    if (!row) return explicit ?? PRIMARY_KEY_HINTS[table] ?? null;
    const candidateList = [explicit, PRIMARY_KEY_HINTS[table], 'id', 'ID', 'Id', `${table}_id`].filter(Boolean) as string[];
    const lowerMap = new Map<string, string>();
    Object.keys(row).forEach((key) => {
      lowerMap.set(key.toLowerCase(), key);
    });

    for (const candidate of candidateList) {
      if (!candidate) continue;
      if (Object.prototype.hasOwnProperty.call(row, candidate) && row[candidate] !== undefined && row[candidate] !== null) {
        return candidate;
      }
      const normalized = candidate.toLowerCase();
      if (lowerMap.has(normalized)) {
        const resolved = lowerMap.get(normalized)!;
        if (row[resolved] !== undefined && row[resolved] !== null) {
          return resolved;
        }
      }
    }

    const fallbackKey = Object.keys(row).find((key) => key.toLowerCase().endsWith('_id') && row[key] !== undefined && row[key] !== null);
    return fallbackKey ?? null;
  };

  const buildEditorPayload = (columns: string[], row: Record<string, any> | null) => {
    if (row && Object.keys(row).length) {
      return row;
    }
    const template = generateTemplateFromColumns(columns);
    return Object.keys(template).length ? template : {};
  };

  const sanitizeRecord = (value: Record<string, any> | null | undefined): Record<string, any> | null => {
    if (!value || typeof value !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      console.error('Error sanitizing record for historial:', error);
      return { ...value };
    }
  };

  const cloneForDiff = (value: any): any => {
    if (value === undefined) return null;
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((item) => cloneForDiff(item));
    }
    if (typeof value === 'object') {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (error) {
        console.error('Error clonando valor para historial:', error);
        return value;
      }
    }
    return value;
  };

  const deepEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
    }
    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a ?? {});
      const bKeys = Object.keys(b ?? {});
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((key) => deepEqual(a[key], (b as Record<string, any>)[key]));
    }
    return false;
  };

  const computeChangeDetails = (beforeRecord: Record<string, any> | null, afterRecord: Record<string, any> | null): ChangeDiff[] => {
    const before = sanitizeRecord(beforeRecord) ?? {};
    const after = sanitizeRecord(afterRecord) ?? {};
    const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
    const diff: ChangeDiff[] = [];

    keys.forEach((key) => {
      const previous = cloneForDiff(before[key]);
      const next = cloneForDiff(after[key]);
      if (!deepEqual(previous, next)) {
        diff.push({ field: key, before: previous, after: next });
      }
    });

    return diff;
  };

  const normalizeRecordId = (value: any): string | number | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.error('Error serializando record_id para historial:', error);
      return String(value);
    }
  };

  const shouldSkipColumnForForm = (key: string) => {
    const normalized = normalizeAnnualKey(key);
    if (key.startsWith('__')) return true; // virtual computed columns
    return ['created_at', 'updated_at', 'inserted_at', 'deleted_at'].includes(normalized);
  };

  const inferFieldType = (key: string): FieldInputType => {
    const normalized = normalizeAnnualKey(key);
    if (normalized.includes('fecha') || normalized.includes('vigencia') || normalized.includes('inicio') || normalized.includes('termino')) {
      return 'date';
    }
    if (
      normalized.includes('descripcion') ||
      normalized.includes('detalle') ||
      normalized.includes('justificacion') ||
      normalized.includes('observacion')
    ) {
      return 'textarea';
    }
    if (
      normalized.includes('monto') ||
      normalized.includes('importe') ||
      normalized.includes('total') ||
      normalized.includes('presupuesto') ||
      normalized.includes('costo') ||
      normalized.includes('cantidad') ||
      normalized.includes('pago') ||
      normalized.includes('porcentaje')
    ) {
      return 'number';
    }
    return 'text';
  };

  const formatDateForInput = (value: any): string => {
    if (!value) return '';
    if (value instanceof Date) {
      return formatDateToDDMMYYYY(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '';
      const parsed = parsePotentialDate(trimmed);
      return parsed ? formatDateToDDMMYYYY(parsed) : trimmed;
    }
    return '';
  };

  const formatValueForInput = (value: any, type: FieldInputType): string => {
    if (value === undefined || value === null) return '';
    if (type === 'date') return formatDateForInput(value);
    if (type === 'number') {
      if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
      if (typeof value === 'string') return value;
      return '';
    }
    if (typeof value === 'string') return value;
    try {
      return String(value);
    } catch (error) {
      console.error('Error convirtiendo valor para input:', error);
      return '';
    }
  };

  const parseFieldValueForSubmission = (value: string, type: FieldInputType) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (type === 'number') {
      const sanitized = trimmed.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
      const parsed = parseFloat(sanitized);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (type === 'date') {
      const parsed = parsePotentialDate(trimmed);
      if (!parsed) return trimmed;
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      const isoDate = `${year}-${month}-${day}`;
      const hasTime = /\d{1,2}:\d{2}/.test(trimmed) || /t\d{2}:/i.test(trimmed);
      if (hasTime) {
        const hours = String(parsed.getHours()).padStart(2, '0');
        const minutes = String(parsed.getMinutes()).padStart(2, '0');
        const seconds = String(parsed.getSeconds()).padStart(2, '0');
        return `${isoDate}T${hours}:${minutes}:${seconds}`;
      }
      return isoDate;
    }
    return trimmed;
  };

  type ChangeAction = 'INSERT' | 'UPDATE' | 'DELETE';

  interface LogChangeParams {
    table: string;
    action: ChangeAction;
    recordId: string | number | null | undefined;
    before: Record<string, any> | null;
    after: Record<string, any> | null;
  }

  const fetchChangeHistory = useCallback(async () => {
    if (!historyAvailableRef.current) return;
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const { data, error } = await supabase
        .from('change_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        if (error.code === '42P01') {
          historyAvailableRef.current = false;
          setHistoryError('La tabla change_history no existe. Ejecuta la migración SQL incluida en scripts/create_change_history_table.sql.');
        } else {
          setHistoryError('No se pudo cargar el historial de cambios.');
        }
        console.error('Error fetching change history:', error);
        return;
      }

      setChangeHistory(data ?? []);
    } catch (err) {
      console.error('Error fetching change history:', err);
      setHistoryError('No se pudo cargar el historial de cambios.');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const logChange = useCallback(async ({ table, action, recordId, before, after }: LogChangeParams) => {
    if (!historyAvailableRef.current) return;
    try {
      const previousData = sanitizeRecord(before);
      const newData = sanitizeRecord(after);
      const changes = computeChangeDetails(previousData, newData);

      const payload: Record<string, any> = {
        table_name: table,
        record_id: normalizeRecordId(recordId),
        action,
        changed_by: user.id ?? null,
        changed_by_name: user.name ?? null,
        changed_by_role: user.role ?? null,
        changes: changes.length ? changes : null,
        previous_data: previousData,
        new_data: newData,
      };

      const { error } = await supabase.from('change_history').insert([payload]);
      if (error) {
        if (error.code === '42P01') {
          historyAvailableRef.current = false;
          setHistoryError('La tabla change_history no existe. Ejecuta la migración SQL incluida en scripts/create_change_history_table.sql.');
        } else {
          console.error('Error registrando historial:', error);
          setHistoryError('No se pudo registrar el historial del cambio.');
        }
        return;
      }

      await fetchChangeHistory();
    } catch (err) {
      console.error('Error logging change history:', err);
    }
  }, [fetchChangeHistory, user.id, user.name, user.role]);

  const historyActionMeta: Record<ChangeAction, { label: string; className: string }> = {
    INSERT: {
      label: 'Creación',
      className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    },
    UPDATE: {
      label: 'Actualización',
      className: 'bg-blue-100 text-blue-700 border border-blue-200',
    },
    DELETE: {
      label: 'Eliminación',
      className: 'bg-rose-100 text-rose-700 border border-rose-200',
    },
  };

  const historyTables = useMemo(() => {
    const tables = new Set<string>();
    changeHistory.forEach((entry) => {
      if (entry.table_name) {
        tables.add(entry.table_name);
      }
    });
    return Array.from(tables).sort((a, b) => a.localeCompare(b));
  }, [changeHistory]);

  const filteredHistory = useMemo(() => {
    if (historyTableFilter === 'all') return changeHistory;
    return changeHistory.filter((entry) => entry.table_name === historyTableFilter);
  }, [changeHistory, historyTableFilter]);

  useEffect(() => {
    if (historyTableFilter !== 'all' && !historyTables.includes(historyTableFilter)) {
      setHistoryTableFilter('all');
    }
  }, [historyTableFilter, historyTables]);

  const refreshTable = async (table: string) => {
    switch (table) {
      case 'año_2026':
        await fetchAnnual2026Data();
        break;
      case 'estatus_servicios_2026':
        await fetchServicios2026Data();
        break;
      case 'estatus_2026':
        await fetchEstatus2026Data();
        break;
      case 'pagos':
        await fetchPagos2026Data();
        break;
      case 'balance_paas_2026':
        await fetchPaasData();
        break;
      case 'control_pagos':
        await fetchPaymentsData();
        break;
      case 'estatus_facturas':
        await fetchInvoicesData();
        break;
      case 'procedimientos_compranet':
        await fetchCompranetData();
        break;
      case 'procedimientos':
        await fetchProceduresData();
        break;
      case 'estatus_procedimiento':
        await fetchProcedureStatusData();
        break;
      case 'contracts':
        await fetchContractsData();
        break;
      case 'commercial_spaces':
        await fetchCommercialSpacesData();
        break;
      default:
        console.warn('No refresh handler registered for table', table);
    }
  };

  const openRecordEditor = (
    table: string,
    title: string,
    columns: string[],
    row: Record<string, any> | null,
    primaryKey?: string | null,
    note?: string
  ) => {
    if (!requireManagePermission()) return;
    const payload = buildEditorPayload(columns, row);
    const resolvedKey = resolvePrimaryKey(row ?? payload, table, primaryKey);

    const formValues: Record<string, any> = {};
    const fieldConfigs: FieldInputConfig[] = [];
    const referenceRows = getReferenceRowsForTable(table);

    Object.keys(payload).forEach((key) => {
      if (shouldSkipColumnForForm(key) && key !== resolvedKey) return;
      const insights = analyzeFieldData(table, key, referenceRows);
      let type = inferFieldType(key);
      if (insights) {
        if (insights.isMostlyNumeric) type = 'number';
        else if (insights.isMostlyDate) type = 'date';
        else if (insights.isLongText && type !== 'date') type = 'textarea';
      }

      formValues[key] = formatValueForInput(payload[key], type);
      const isPrimaryField = resolvedKey === key;
      const required = Boolean(insights && insights.filledRatio > 0.92 && !isPrimaryField);
      fieldConfigs.push({
        key,
        label: humanizeKey(key),
        type,
        placeholder: buildPlaceholderForField(type, insights),
        required,
        helpText: buildHelperTextForField({
          insights,
          required,
          isPrimary: isPrimaryField,
          type,
          fieldKey: key,
        }),
      });
    });

    const requiredFields = fieldConfigs.filter((field) => field.required).length;
    const referenceCount = referenceRows.length;
    const guidanceParts: string[] = [];
    if (note) guidanceParts.push(note);
    if (requiredFields) guidanceParts.push('Los campos marcados con * son obligatorios.');
    if (referenceCount) {
      guidanceParts.push(`Guía basada en ${referenceCount} registro${referenceCount === 1 ? '' : 's'} existentes.`);
    }
    const resolvedNote = guidanceParts.length ? guidanceParts.join(' ').trim() : undefined;

    setRecordEditorError(null);
    setRecordEditorConfig({
      table,
      title,
      isNew: !row,
      primaryKey: resolvedKey,
      note: resolvedNote,
      fields: fieldConfigs,
      formValues,
      originalRow: sanitizeRecord(row),
    });
  };

  const handleSaveGenericRecord = async () => {
    if (!recordEditorConfig) return;
    if (!requireManagePermission()) return;

    try {
      setRecordEditorSaving(true);
      setRecordEditorError(null);

      const { table, fields, formValues, isNew, primaryKey, originalRow } = recordEditorConfig;

      if (!fields.length) {
        throw new Error('No se detectaron columnas configuradas para este registro.');
      }

      const submission: Record<string, any> = {};
      const missingRequired: string[] = [];

      fields.forEach((field) => {
        const rawValue = formValues[field.key] ?? '';
        const parsedValue = parseFieldValueForSubmission(String(rawValue ?? ''), field.type);
        submission[field.key] = parsedValue;

        if (field.required) {
          const rawText = String(rawValue ?? '').trim();
          if (!rawText) {
            missingRequired.push(field.label || humanizeKey(field.key));
          }
        }
      });

      if (missingRequired.length) {
        setRecordEditorError(`Completa los campos obligatorios: ${missingRequired.join(', ')}.`);
        setRecordEditorSaving(false);
        return;
      }

      const resolvedKey = primaryKey ?? resolvePrimaryKey(submission, table, primaryKey);
      const resolvedValue = resolvedKey
        ? submission[resolvedKey] ?? originalRow?.[resolvedKey] ?? null
        : null;

      const cleanedSubmission: Record<string, any> = {};
      Object.entries(submission).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanedSubmission[key] = value;
        }
      });

      if (isNew && resolvedKey && (cleanedSubmission[resolvedKey] === null || cleanedSubmission[resolvedKey] === '')) {
        delete cleanedSubmission[resolvedKey];
      }

      if (isNew) {
        const { data, error } = await supabase.from(table).insert([cleanedSubmission]).select();
        if (error) throw error;

        const insertedRecord = Array.isArray(data) ? data[0] ?? null : null;
        const recordId = resolvedKey
          ? insertedRecord?.[resolvedKey] ?? null
          : null;

        await logChange({
          table,
          action: 'INSERT',
          recordId,
          before: null,
          after: insertedRecord ?? cleanedSubmission,
        });
      } else {
        if (!resolvedKey) {
          throw new Error('No se encontró un campo de clave primaria en el registro.');
        }
        const targetValue = resolvedValue;
        if (targetValue === undefined || targetValue === null || targetValue === '') {
          throw new Error('El valor de la clave primaria no puede estar vacío.');
        }

        const previousRecord = originalRow ? sanitizeRecord(originalRow) : null;

        const { data, error } = await supabase
          .from(table)
          .update(cleanedSubmission)
          .eq(resolvedKey, targetValue)
          .select();
        if (error) throw error;

        const updatedRecord = Array.isArray(data) ? data[0] ?? null : null;

        await logChange({
          table,
          action: 'UPDATE',
          recordId: targetValue,
          before: previousRecord,
          after: updatedRecord ?? cleanedSubmission,
        });
      }

      await refreshTable(table);
      setRecordEditorConfig(null);
    } catch (error: any) {
      const message = error?.message ?? 'Ocurrió un error al guardar el registro.';
      setRecordEditorError(message);
    } finally {
      setRecordEditorSaving(false);
    }
  };

  const handleDeleteGenericRecord = async (
    table: string,
    row: Record<string, any>,
    title: string,
    primaryKey?: string | null
  ) => {
    if (!requireManagePermission()) return;
    if (isDeletingRecord) {
      alert('Espera, se está eliminando un registro.');
      return;
    }

    const resolvedKey = resolvePrimaryKey(row, table, primaryKey);
    if (!resolvedKey) {
      alert('No se pudo determinar la clave primaria del registro. Verifique que exista un campo "id" o similar.');
      return;
    }

    const resolvedValue = row[resolvedKey];
    if (resolvedValue === undefined || resolvedValue === null || resolvedValue === '') {
      alert('El valor de la clave primaria es requerido para eliminar el registro.');
      return;
    }

    const confirmed = window.confirm(`¿Eliminar el registro seleccionado de "${title}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    const previousRecord = sanitizeRecord(row);

    const activeDeleteKey = `${table}:${resolvedKey}:${String(resolvedValue)}`;
    setIsDeletingRecord(true);
    setDeletingRecordKey(activeDeleteKey);

    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq(resolvedKey, resolvedValue);

      if (error) {
        alert(`Error al eliminar: ${error.message}`);
        return;
      }

      await logChange({
        table,
        action: 'DELETE',
        recordId: resolvedValue,
        before: previousRecord,
        after: null,
      });

      await refreshTable(table);
    } finally {
      setIsDeletingRecord(false);
      setDeletingRecordKey(null);
    }
  };

  const closeRecordEditor = () => {
    if (recordEditorSaving) return;
    setRecordEditorConfig(null);
  };

  const updateRecordEditorValue = (fieldKey: string, value: string) => {
    setRecordEditorError(null);
    setRecordEditorConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        formValues: {
          ...prev.formValues,
          [fieldKey]: value,
        },
      };
    });
  };

  const userInitials = useMemo(() => {
    if (!user.name) return '?';
    const segments = user.name.trim().split(/\s+/).slice(0, 2);
    const initials = segments.map((segment) => segment.charAt(0).toUpperCase()).join('');
    return initials || user.name.charAt(0).toUpperCase();
  }, [user.name]);

  const userRoleMeta = useMemo(() => {
    switch (user.role) {
      case UserRole.ADMIN:
        return {
          label: 'Administrador',
          badgeClass: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        };
      case UserRole.OPERATOR:
        return {
          label: 'Operador',
          badgeClass: 'bg-blue-100 text-blue-700 border border-blue-200',
        };
      case UserRole.VIEWER:
        return {
          label: 'Solo lectura',
          badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
        };
      default:
        return {
          label: 'Invitado',
          badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
        };
    }
  }, [user.role]);

  const canManageRecords = useMemo(
    () => user.role === UserRole.ADMIN,
    [user.role]
  );

  const requireManagePermission = () => {
    if (canManageRecords) return true;
    alert('Tu perfil es de solo consulta. Solicita privilegios de administrador para realizar cambios.');
    return false;
  };

  // Fetch Data Function (Separated to allow refreshing)
  const fetchContractsData = async () => {
    const { data: contractsData, error } = await supabase
      .from('contracts')
      .select('*')
      .order('end_date', { ascending: true });

    if (error) console.error('Error fetching contracts:', error.message);

    if (contractsData !== null) {
      setContracts(contractsData ?? []);
    } else {
      setContracts(MOCK_CONTRACTS);
    }
  };

  const fetchCommercialSpacesData = async () => {
    const { data: spacesData, error } = await supabase
      .from('commercial_spaces')
      .select('*');

    if (error) console.error('Error fetching commercial_spaces:', error.message);

    if (spacesData !== null) {
      setCommercialSpaces(spacesData ?? []);
    } else {
      setCommercialSpaces(MOCK_SPACES);
    }
  };

  const fetchAnnual2026Data = async () => {
    const { data: annualData, error } = await supabase
      .from('año_2026')
      .select('*')
      .order('id', { ascending: true });

    if (error) console.error('Error fetching año_2026:', error.message);

    if (annualData !== null) {
      setAnnual2026Data(annualData ?? []);
    }
  };

  const fetchServicios2026Data = async () => {
    const { data, error } = await supabase
      .from('estatus_servicios_2026')
      .select('*')
      .order('id', { ascending: true });

    if (error) console.error('Error fetching estatus_servicios_2026:', error.message);

    if (data !== null) {
      setServicios2026Data(data ?? []);
    }
  };

  const [debugError, setDebugError] = useState<string | null>(null);

  const extractPagosRowId = (row: any) => row.id ?? row.ID ?? row.Id ?? row['No. Contrato'] ?? row['No contrato'] ?? row['No. de contrato'] ?? null;

  const fetchEstatus2026Data = async () => {
    try {
        // Removed .order('id') to avoid potential Supabase type errors, sorting client-side instead.
        const { data, error } = await supabase
        .from('estatus_2026')
        .select('*');

        if (error) {
            console.error('Error fetching estatus_2026:', error.message);
            setDebugError("Supabase Error: " + error.message);
            return; // Exit if error
        }

        if (data !== null) {
            // Sort by id chronologically (ascending numeric)
            const sortedData = [...data].sort((a, b) => {
                const valA = parseFloat(a.id);
                const valB = parseFloat(b.id);
                if (!isNaN(valA) && !isNaN(valB)) {
                    return valA - valB;
                }
                // Fallback to string comparison if not numeric
                const strA = String(a.id ?? '');
                const strB = String(b.id ?? '');
                return strA.localeCompare(strB, undefined, { numeric: true });
            });
            setEstatus2026Data(sortedData);
             setDebugError("Data is explicitly null (no error)");
        }
    } catch (err: any) {
        setDebugError("Exception: " + err.message);
    }
  };

  const fetchPagos2026Data = async () => {
      try {
          const { data, error } = await supabase
          .from('pagos')
          .select('*')
          .eq('anio', 2026)
          .order('id', { ascending: true });

          if (error) {
              console.error('Error fetching pagos (anio=2026):', error);
              return;
          }

          if (data) {
             // Sort clientside just in case, similar to estatus_2026
             const sortedData = [...data].sort((a, b) => {
         const idA = extractPagosRowId(a);
         const idB = extractPagosRowId(b);

                 if (typeof idA === 'number' && typeof idB === 'number') return idA - idB;
                 const valA = parseFloat(idA);
                 const valB = parseFloat(idB);
                 if (!isNaN(valA) && !isNaN(valB)) {
                     return valA - valB;
                 }
                 const strA = String(idA ?? '');
                 const strB = String(idB ?? '');
                 return strA.localeCompare(strB, undefined, { numeric: true });
             });
              setPagos2026Data(sortedData);
          }
      } catch (err) {
          console.error("Exception fetching pagos (anio=2026):", err);
      }
  };


  const fetchInvoicesData = async () => {
    const { data: invoices, error } = await supabase
      .from('estatus_facturas')
      .select('*')
      .order('id', { ascending: true });

    if (error) console.error('Error fetching estatus_facturas:', error.message);

    if (invoices !== null) {
      setInvoicesData(invoices ?? []);
    }
  };

  const fetchPaasData = async () => {
    const { data: paasResults, error: paasError } = await supabase
      .from('balance_paas_2026')
      .select('*')
      .order('id', { ascending: true });
    
    if (paasResults) setPaasData(paasResults);
    if (paasError) console.error("Error fetching PAAS:", paasError.message);
  };

  const fetchPaymentsData = async () => {
    const { data: paymentsResults, error: paymentsError } = await supabase
      .from('control_pagos')
      .select('*')
      .order('id', { ascending: true });

    if (paymentsResults) setPaymentsData(paymentsResults);
    if (paymentsError) console.error("Error fetching Payments:", paymentsError.message);
  }

  const fetchProcedureStatusData = async () => {
    const { data: procedureResults, error: procedureError } = await supabase
      .from('estatus_procedimiento')
      .select('*')
      .order('created_at', { ascending: false });

    if (procedureResults) setProcedureStatuses(procedureResults);
    if (procedureError) console.error("Error fetching Procedure Status:", procedureError.message);
  };

  const fetchCompranetData = async () => {
    const { data: compranetResults, error: compranetError } = await supabase
      .from('procedimientos_compranet')
      .select('*')
      .order('id', { ascending: true });

    if (compranetResults) setCompranetData(compranetResults);
    if (compranetError) console.error('Error fetching procedimientos_compranet:', compranetError.message);
  };

  const fetchProceduresData = async () => {
    const { data: proceduresResults, error: proceduresError } = await supabase
      .from('procedimientos')
      .select('*')
      .order('id', { ascending: true });

    if (proceduresResults) setProceduresData(proceduresResults as ProcedureRecord[]);
    if (proceduresError) console.error('Error fetching procedimientos:', proceduresError.message);
  };

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoadingData(true);

        const results = await Promise.allSettled([
          fetchContractsData(),
          fetchCommercialSpacesData(),
          fetchAnnual2026Data(),
          fetchServicios2026Data(),
          fetchEstatus2026Data(),
          fetchPagos2026Data(),
          fetchPaasData(),
          fetchPaymentsData(),
          fetchInvoicesData(),
          fetchCompranetData(),
          fetchProceduresData(),
          fetchProcedureStatusData(),
          fetchChangeHistory(),
        ]);

        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`Error cargando bloque ${index + 1}:`, result.reason);
          }
        });

      } catch (e) {
        console.error("Exception fetching data", e);
      } finally {
        setLoadingData(false);
      }
    };

    fetchAllData();
  }, [fetchChangeHistory]);

  useEffect(() => {
    if (activeTab !== 'serviciosStatus') {
      setExpandedServicioStatusId(null);
    }
  }, [activeTab]);

  const filteredAnnualData = useMemo(() => {
    const query = tableFilters.annual2026.trim();
    const columnMap = columnFilters.annual2026;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return annual2026Data;
    return annual2026Data.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [annual2026Data, tableFilters.annual2026, columnFilters.annual2026]);

  const filteredServicios2026Data = useMemo(() => {
    const query = tableFilters.servicios2026.trim();
    const columnMap = columnFilters.servicios2026;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return servicios2026Data;
    return servicios2026Data.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [servicios2026Data, tableFilters.servicios2026, columnFilters.servicios2026]);

  const estatus2026ActiveColumnSearch = useMemo(
    () => Object.entries(estatus2026ColumnSearch ?? {}).filter(([, term]) => Boolean(term && term.trim().length > 0)).map(([key, term]) => [key, term.toLowerCase()] as const),
    [estatus2026ColumnSearch]
  );

  const filteredEstatus2026Data = useMemo(() => {
    const query = tableFilters.estatus2026.trim();
    const columnMap = columnFilters.estatus2026;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    const hasSearchFilters = estatus2026ActiveColumnSearch.length > 0;

    if (!query && !hasColumnFilters && !hasSearchFilters) return estatus2026Data;
    return estatus2026Data.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      if (hasSearchFilters) {
          for (const [key, term] of estatus2026ActiveColumnSearch) {
              const val = String(row[key] ?? '').toLowerCase();
              if (!val.includes(term)) return false;
          }
      }
      return true;
    });
  }, [estatus2026Data, tableFilters.estatus2026, columnFilters.estatus2026, estatus2026ActiveColumnSearch]);

  const filteredPagos2026Data = useMemo(() => {
    const query = tableFilters.pagos2026.trim();
    const columnMap = columnFilters.pagos2026;
    const searchMap = pagos2026ColumnSearch;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    const hasSearchFilters = Object.keys(searchMap ?? {}).length > 0;

    if (!query && !hasColumnFilters && !hasSearchFilters) return pagos2026Data;
    return pagos2026Data.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      if (hasSearchFilters) {
          for (const [key, term] of Object.entries(searchMap)) {
              if (term) {
                  const val = String(row[key] ?? '').toLowerCase();
                  if (!val.includes(term.toLowerCase())) return false;
              }
          }
      }
      return true;
    });
  }, [pagos2026Data, tableFilters.pagos2026, columnFilters.pagos2026, pagos2026ColumnSearch]);

  const filteredPaasData = useMemo(() => {
    const query = tableFilters.paas.trim();
    const columnMap = columnFilters.paas;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return paasData;
    return paasData.filter((row) => {
      if (query && !rowMatchesFilter(row as unknown as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as unknown as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [paasData, tableFilters.paas, columnFilters.paas]);

  const filteredPaymentsData = useMemo(() => {
    const query = tableFilters.controlPagos.trim();
    const columnMap = columnFilters.controlPagos;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return paymentsData;
    return paymentsData.filter((row) => {
      if (query && !rowMatchesFilter(row as unknown as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as unknown as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [paymentsData, tableFilters.controlPagos, columnFilters.controlPagos]);

  const filteredInvoicesData = useMemo(() => {
    const query = tableFilters.invoices.trim();
    const columnMap = columnFilters.invoices;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return invoicesData;
    return invoicesData.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [invoicesData, tableFilters.invoices, columnFilters.invoices]);

  const filteredCompranetData = useMemo(() => {
    const query = tableFilters.compranet.trim();
    const columnMap = columnFilters.compranet;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return compranetData;
    return compranetData.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [compranetData, tableFilters.compranet, columnFilters.compranet]);

  const filteredProceduresData = useMemo(() => {
    const query = tableFilters.procedures.trim();
    const columnMap = columnFilters.procedures;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return proceduresData;
    return proceduresData.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [proceduresData, tableFilters.procedures, columnFilters.procedures]);

  const filteredPendingOctData = useMemo(() => {
    const query = tableFilters.pendingOct.trim();
    const columnMap = columnFilters.pendingOct;
    const hasColumnFilters = Object.keys(columnMap ?? {}).length > 0;
    if (!query && !hasColumnFilters) return procedureStatuses;
    return procedureStatuses.filter((row) => {
      if (query && !rowMatchesFilter(row as Record<string, any>, query)) return false;
      if (hasColumnFilters && !rowMatchesColumnFilters(row as Record<string, any>, columnMap)) return false;
      return true;
    });
  }, [procedureStatuses, tableFilters.pendingOct, columnFilters.pendingOct]);

  // === HANDLE FORM INPUT CHANGE ===
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: (name.includes('Monto') || name === 'Modificado') ? parseFloat(value) || 0 : value
    }));
  };

  // === OPEN MODAL FUNCTIONS ===
  const openNewRecordModal = () => {
    if (!requireManagePermission()) return;
    setEditingId(null);
    setFormState(initialFormState);
    setIsModalOpen(true);
  };

  const openEditRecordModal = (item: PaasItem) => {
    if (!requireManagePermission()) return;
    setEditingId(item.id);
    setFormState({
      "No.": item["No."] || '',
      "Clave cucop": item["Clave cucop"] || '',
      "Nombre del Servicio.": item["Nombre del Servicio."] || '',
      "Subdirección": item["Subdirección"] || '',
      "Gerencia": item["Gerencia"] || '',
      "Monto solicitado anteproyecto 2026": item["Monto solicitado anteproyecto 2026"] || 0,
      "Modificado": item["Modificado"] || 0,
      "Justificación": item["Justificación"] || ''
    });
    setIsModalOpen(true);
  };

  // === HANDLE SUBMIT (CREATE OR UPDATE) ===
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireManagePermission()) return;
    setIsSubmitting(true);

    try {
      if (editingId) {
        const existingRecord = paasData.find(item => item.id === editingId) ?? null;
        const previousSnapshot = existingRecord
          ? sanitizeRecord(existingRecord as unknown as Record<string, any>)
          : null;

        const { data, error: updateError } = await supabase
          .from('balance_paas_2026')
          .update(formState)
          .eq('id', editingId)
          .select();

        if (updateError) throw updateError;

        const updatedRecord = Array.isArray(data) ? data[0] ?? null : null;

        await logChange({
          table: 'balance_paas_2026',
          action: 'UPDATE',
          recordId: editingId,
          before: previousSnapshot,
          after: updatedRecord ?? { ...formState, id: editingId },
        });
      } else {
        const { data, error: insertError } = await supabase
          .from('balance_paas_2026')
          .insert([formState])
          .select();

        if (insertError) throw insertError;

        const insertedRecord = Array.isArray(data) ? data[0] ?? null : null;

        await logChange({
          table: 'balance_paas_2026',
          action: 'INSERT',
          recordId: insertedRecord?.id ?? null,
          before: null,
          after: insertedRecord ?? formState,
        });
      }

      // Success
      await fetchPaasData(); // Refresh table
      setIsModalOpen(false); // Close modal
    } catch (error: any) {
      console.error("Error saving record:", error);
      alert("Error al guardar: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // === HANDLE DELETE ===
  const handleDeleteRecord = async (id: number) => {
    if (!requireManagePermission()) return;
    if (!window.confirm("¿Está seguro que desea eliminar este registro? Esta acción no se puede deshacer.")) {
      return;
    }

    try {
        const existingRecord = paasData.find(item => item.id === id) ?? null;
        const previousSnapshot = existingRecord
          ? sanitizeRecord(existingRecord as unknown as Record<string, any>)
          : null;

      const { error } = await supabase
        .from('balance_paas_2026')
        .delete()
        .eq('id', id);

      if (error) throw error;

        await logChange({
          table: 'balance_paas_2026',
          action: 'DELETE',
          recordId: id,
          before: previousSnapshot,
          after: null,
        });

      await fetchPaasData(); // Refresh table
    } catch (error: any) {
      console.error("Error deleting:", error);
      alert("Error al eliminar: " + error.message);
    }
  };

  // Calculos para Gráficas Generales
  const contractStatusData = [
    { name: 'Activos', value: contracts.filter(c => c.status === 'ACTIVO').length },
    { name: 'Por Vencer', value: contracts.filter(c => c.status === 'POR VENCER').length },
    { name: 'Vencidos', value: contracts.filter(c => c.status === 'VENCIDO').length },
  ];

  // Agrupar datos por "Gerencia" para graficar el presupuesto
  const paasByGerencia = paasData.reduce<{ name: string; value: number }[]>((acc, item) => {
    const gerenciaName = item["Gerencia"] || 'Sin Asignar';
    const monto = Number(item["Monto solicitado anteproyecto 2026"]) || 0;
    
    const existing = acc.find(x => x.name === gerenciaName);
    if (existing) {
      existing.value += monto;
    } else {
      acc.push({
        name: gerenciaName,
        value: monto
      });
    }
    return acc;
  }, []).sort((a, b) => {
    const valueA = typeof a.value === 'number' ? a.value : Number(a.value) || 0;
    const valueB = typeof b.value === 'number' ? b.value : Number(b.value) || 0;
    return valueB - valueA;
  });

  // Cálculos para Gráficas de Pagos
  const paymentsMonthlyFlow = [
    { name: 'Ene', value: paymentsData.reduce((acc, item) => acc + (item.ene || 0), 0) },
    { name: 'Feb', value: paymentsData.reduce((acc, item) => acc + (item.feb || 0), 0) },
    { name: 'Mar', value: paymentsData.reduce((acc, item) => acc + (item.mar || 0), 0) },
    { name: 'Abr', value: paymentsData.reduce((acc, item) => acc + (item.abr || 0), 0) },
    { name: 'May', value: paymentsData.reduce((acc, item) => acc + (item.may || 0), 0) },
    { name: 'Jun', value: paymentsData.reduce((acc, item) => acc + (item.jun || 0), 0) },
    { name: 'Jul', value: paymentsData.reduce((acc, item) => acc + (item.jul || 0), 0) },
    { name: 'Ago', value: paymentsData.reduce((acc, item) => acc + (item.ago || 0), 0) },
    { name: 'Sep', value: paymentsData.reduce((acc, item) => acc + (item.sept || 0), 0) }, // Note: DB usually uses 'sept'
    { name: 'Oct', value: paymentsData.reduce((acc, item) => acc + (item.oct || 0), 0) },
    { name: 'Nov', value: paymentsData.reduce((acc, item) => acc + (item.nov || 0), 0) },
    { name: 'Dic', value: paymentsData.reduce((acc, item) => acc + (item.dic || 0), 0) },
  ];

  const peakPaymentMonth = useMemo(() => {
    let best: { name: string; value: number } | null = null;

    paymentsMonthlyFlow.forEach((item) => {
      if (!item || typeof item.value !== 'number' || Number.isNaN(item.value) || item.value <= 0) return;
      if (!best || item.value > best.value) {
        best = item;
      }
    });

    return best;
  }, [paymentsData]);

  // Total Ejecutado vs Total Contratado
  const totalContratado = paymentsData.reduce((acc, item) => acc + (item.mont_max || 0), 0);
  const totalEjercido = paymentsData.reduce((acc, item) => acc + (item.monto_ejercido || 0), 0);
  const budgetExecutionData = [
    { name: 'Ejercido', value: totalEjercido },
    { name: 'Restante', value: Math.max(0, totalContratado - totalEjercido) }
  ];

  const paymentsExecutionRate = totalContratado > 0 ? totalEjercido / totalContratado : 0;

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '$0.00';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(val);
  };

  const formatDateToDDMMYYYY = (dateValue: Date) => {
    const day = String(dateValue.getDate()).padStart(2, '0');
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const year = dateValue.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '-';
    try {
      const parsed = parsePotentialDate(value);
      if (!parsed) return typeof value === 'string' ? value : '-';
      const datePart = formatDateToDDMMYYYY(parsed);
      const timePart = parsed.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      return `${datePart} ${timePart}`;
    } catch (err) {
      console.error('Error formatting date:', err);
      return typeof value === 'string' ? value : '-';
    }
  };

  const formatDateOnly = (value: string | Date | null | undefined) => {
    if (!value) return '-';
    try {
      const dateValue = value instanceof Date ? value : parsePotentialDate(value);
      if (!dateValue) return typeof value === 'string' ? value : '-';
      return formatDateToDDMMYYYY(dateValue);
    } catch (err) {
      console.error('Error formatting date (short):', err);
      return typeof value === 'string' ? value : '-';
    }
  };

  const BOOLEAN_TRUE_VALUES = new Set(['si', 'true', '1', 'verdadero', 'yes']);
  const BOOLEAN_FALSE_VALUES = new Set(['no', 'false', '0', 'falso', 'nope']);

  const isBooleanLikeValue = (value: any) => {
    if (typeof value === 'boolean') return true;
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return BOOLEAN_TRUE_VALUES.has(normalized) || BOOLEAN_FALSE_VALUES.has(normalized);
  };

  const getBooleanChecked = (value: any) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (BOOLEAN_TRUE_VALUES.has(normalized)) return true;
      if (BOOLEAN_FALSE_VALUES.has(normalized)) return false;
    }
    return Boolean(value);
  };

  const shouldTreatAsBooleanColumn = (column: string, value: any, extraHints: string[] = []) => {
    const normalized = normalizeAnnualKey(column);
    const explicitNonBooleans = ['ene', 'enero', 'feb', 'febrero', 'mar', 'marzo', 'abr', 'abril', 'may', 'mayo', 'jun', 'junio', 'jul', 'julio', 'ago', 'agosto', 'sep', 'septiembre', 'oct', 'octubre', 'nov', 'noviembre', 'dic', 'diciembre'];
    if (explicitNonBooleans.some(k => normalized === k || (normalized.startsWith(`${k} `) && !normalized.includes('si no')))) return false;
    
    if (isBooleanLikeValue(value)) return true;
    const defaultHints = ['si/no', 'pagado', 'complemento', 'confirmado', 'validado', 'documentacion', 'documentación', 'investigacion', 'investigación', 'suficiencia', 'plurianual', 'anticipo', 'convenio', 'procedimiento', 'garantia', 'cumplimiento', 'garantia de calidad'];
    if (normalized.includes('fecha')) return false;
    return [...defaultHints, ...extraHints].some((hint) => normalized.includes(normalizeAnnualKey(hint)));
  };

  const getBooleanSaveValue = (rawValue: any, column: string, checked: boolean) => {
    if (typeof rawValue === 'boolean') return checked;
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      if (normalized === 'si' || normalized === 'no') return checked ? 'SI' : 'NO';
      if (BOOLEAN_TRUE_VALUES.has(normalized) || BOOLEAN_FALSE_VALUES.has(normalized)) return checked;
    }
    // rawValue is null/undefined — the DB column is boolean, so send the actual boolean value.
    return checked;
  };

  const describeDaysUntil = (days: number) => {
    if (days < 0) {
      const absolute = Math.abs(days);
      return `Vencido hace ${absolute} día${absolute === 1 ? '' : 's'}`;
    }
    if (days === 0) return 'Vence hoy';
    if (days === 1) return 'Falta 1 día';
    return `Faltan ${days} días`;
  };

  const normalizeWhitespace = (value: string | null | undefined) => {
    if (!value) return '-';
    return value.replace(/\s+/g, ' ').trim();
  };

  const formatNumber = (val: number | null | undefined) => {
    if (val === null || val === undefined || Number.isNaN(val)) return '--';
    if (!Number.isFinite(val)) return String(val);
    return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(val);
  };

  const shouldFormatAsCurrency = (key: string) => {
    const normalized = key.toLowerCase();
    const exactMonths = ['ene', 'enero', 'feb', 'febrero', 'mar', 'marzo', 'abr', 'abril', 'may', 'mayo', 'jun', 'junio', 'jul', 'julio', 'ago', 'agosto', 'sep', 'septiembre', 'oct', 'octubre', 'nov', 'noviembre', 'dic', 'diciembre'].flatMap(m => [m, `${m}.`]);
    if (exactMonths.includes(normalized)) return true;
    return ['monto', 'importe', 'total', 'presupuesto', 'costo', 'valor', 'ejercido', 'pagado', 'preventivos', 'correctivos', 'nota de', 'credito', 'crédito'].some(fragment => normalized.includes(fragment));
  };

  const HUMANIZED_LABEL_OVERRIDES: Record<string, string> = {
    'no contrato': 'Número de contrato',
    'numero contrato': 'Número de contrato',
    'num contrato': 'Número de contrato',
    'objeto del contrato': 'Objeto del contrato',
    'mont max': 'Monto máximo',
    'mont min': 'Monto mínimo',
    'mont total': 'Monto total',
    'monto total': 'Monto total',
    'fecha termino': 'Fecha de término',
    'fecha inicio': 'Fecha de inicio',
    'fecha fin': 'Fecha de término',
    'ene': 'Enero',
    'feb': 'Febrero',
    'mar': 'Marzo',
    'abr': 'Abril',
    'may': 'Mayo',
    'jun': 'Junio',
    'jul': 'Julio',
    'ago': 'Agosto',
    'sep': 'Septiembre',
    'oct': 'Octubre',
    'nov': 'Noviembre',
    'dic': 'Diciembre',
    'incidencias del servicio': 'Observaciones',
    'incidencias_del_servicio': 'Observaciones',
    'incidencias del servicio.': 'Observaciones',
    'incidencias': 'Observaciones'
  };

  const HUMANIZED_WORD_OVERRIDES: Record<string, string> = {
    ano: 'año',
    anio: 'año',
    anos: 'años',
    mont: 'monto',
    monto: 'monto',
    max: 'máximo',
    maximo: 'máximo',
    min: 'mínimo',
    minimo: 'mínimo',
    subdireccion: 'subdirección',
    subdir: 'subdirección',
    justificacion: 'justificación',
    observacion: 'observación',
    descripcion: 'descripción',
    terminacion: 'terminación',
    termino: 'término',
    vigencia: 'vigencia',
    numero: 'número',
    folio: 'folio',
    factura: 'factura',
    proveedor: 'proveedor',
    contrato: 'contrato',
    objeto: 'objeto',
    clasificacion: 'clasificación',
    ubicacion: 'ubicación',
    observaciones: 'observaciones',
    justificac: 'justificación',
    // Accentuated words for common column name patterns
    investigacion: 'investigación',
    contratacion: 'contratación',
    remision: 'remisión',
    recepcion: 'recepción',
    publicacion: 'publicación',
    adjudicacion: 'adjudicación',
    actualizacion: 'actualización',
    tramitacion: 'tramitación',
    revision: 'revisión',
    validacion: 'validación',
    elaboracion: 'elaboración',
    generacion: 'generación',
    distribucion: 'distribución',
    notificacion: 'notificación',
    adquisicion: 'adquisición',
    gestion: 'gestión',
    seleccion: 'selección',
    conclusion: 'conclusión',
    relacion: 'relación',
    condicion: 'condición',
    facturacion: 'facturación',
    atencion: 'atención',
    operacion: 'operación',
    comunicacion: 'comunicación',
    autorizacion: 'autorización',
    ejecucion: 'ejecución',
    presentacion: 'presentación',
    evaluacion: 'evaluación',
    negociacion: 'negociación',
    verificacion: 'verificación',
    inspeccion: 'inspección',
    extension: 'extensión',
    denominacion: 'denominación',
    asignacion: 'asignación',
    duracion: 'duración',
    produccion: 'producción',
    participacion: 'participación',
    disposicion: 'disposición',
    situacion: 'situación',
    informacion: 'información',
    modificacion: 'modificación',
    cancelacion: 'cancelación',
    intervencion: 'intervención',
    prorroga: 'prórroga',
    tecnico: 'técnico',
    tecnica: 'técnica',
    calculo: 'cálculo',
    calculos: 'cálculos',
    analisis: 'análisis',
    codigo: 'código',
    credito: 'crédito',
    deposito: 'depósito',
    tramite: 'trámite',
    tramites: 'trámites',
    proximo: 'próximo',
    proxima: 'próxima',
    pagina: 'página',
    periodo: 'período',
    periodos: 'períodos',
    ene: 'enero',
    feb: 'febrero',
    mar: 'marzo',
    abr: 'abril',
    may: 'mayo',
    jun: 'junio',
    jul: 'julio',
    ago: 'agosto',
    sep: 'septiembre',
    sept: 'septiembre',
    oct: 'octubre',
    nov: 'noviembre',
    dic: 'diciembre'
  };

  const LOWERCASE_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'para', 'por', 'en', 'al', 'con', 'sin']);

  const VIRTUAL_COLUMN_LABELS: Record<string, string> = {
    '__row_num': '#',
    '__dias_remision_recepcion': 'Días rem. → recep.',
    '__dias_recepcion_validacion': 'Días recep. → valid.',
  };

  const humanizeKey = (rawKey: string) => {
    if (VIRTUAL_COLUMN_LABELS[rawKey]) return VIRTUAL_COLUMN_LABELS[rawKey];
    const cleaned = rawKey.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';

    const normalized = cleaned.toLowerCase();
    if (HUMANIZED_LABEL_OVERRIDES[normalized]) {
      return HUMANIZED_LABEL_OVERRIDES[normalized];
    }

    const tokens = normalized
      .split(' ')
      .filter(Boolean)
      .map((token) => HUMANIZED_WORD_OVERRIDES[token] ?? token);

    const words = tokens.map((word, index) => {
      if (word === 'id') return 'ID';
      if (word === 'no' && index === 0) return 'No.';
      if (LOWERCASE_WORDS.has(word) && index !== 0) return word;
      if (word.length === 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

    return words.join(' ');
  };

  const formatMetricValue = (key: string, value: number | null | undefined) => {
    if (value === null || value === undefined) return '--';
    return shouldFormatAsCurrency(key) ? formatCurrency(value) : formatNumber(value);
  };

  const formatPercent = (value: number) => {
    const normalized = Number.isFinite(value) ? Math.max(-1, value) : 0;
    return new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 }).format(normalized);
  };

  const formatTableValue = (key: string, value: any) => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return formatMetricValue(key, value);
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true') return 'Sí';
      if (lower === 'false') return 'No';
    }
    if (Array.isArray(value)) {
      if (!value.length) return '-';
      const printableItems = value
        .map((item) => {
          if (item === null || item === undefined) return null;
          if (typeof item === 'number') return formatMetricValue(key, item);
          if (typeof item === 'boolean') return item ? 'Sí' : 'No';
          if (typeof item === 'object') {
            try {
              return JSON.stringify(item, null, 2);
            } catch (err) {
              console.error('Error stringifying array item:', err);
              return String(item);
            }
          }
          const stringItem = normalizeWhitespace(String(item));
          const parsed = parsePotentialDate(stringItem);
          return parsed ? formatDateToDDMMYYYY(parsed) : stringItem;
        })
        .filter((item): item is string => Boolean(item && item.trim().length));

      return printableItems.length ? printableItems.join('\n') : '-';
    }
    if (value instanceof Date) return formatDateToDDMMYYYY(value);
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (err) {
        console.error('Error stringifying value:', err);
        return String(value);
      }
    }
    const stringValue = normalizeWhitespace(String(value));
    const parsed = parsePotentialDate(stringValue);
    return parsed ? formatDateToDDMMYYYY(parsed) : stringValue;
  };

  interface FieldInsights {
    totalRows: number;
    filledCount: number;
    filledRatio: number;
    sampleText?: string;
    isMostlyNumeric: boolean;
    isMostlyDate: boolean;
    isLongText: boolean;
    uniqueRatio: number;
  }

  const getReferenceRowsForTable = (table: string): Record<string, any>[] => {
    switch (table) {
      case 'año_2026':
        return annual2026Data as Record<string, any>[];
      case 'estatus_servicios_2026':
        return servicios2026Data as Record<string, any>[];
      case 'balance_paas_2026':
        return paasData as unknown as Record<string, any>[];
      case 'control_pagos':
        return paymentsData as unknown as Record<string, any>[];
      case 'estatus_facturas':
        return invoicesData as Record<string, any>[];
      case 'procedimientos_compranet':
        return compranetData as Record<string, any>[];
      case 'procedimientos':
        return proceduresData as Record<string, any>[];
      case 'estatus_procedimiento':
        return procedureStatuses as unknown as Record<string, any>[];
      case 'contracts':
        return contracts as unknown as Record<string, any>[];
      case 'commercial_spaces':
        return commercialSpaces as unknown as Record<string, any>[];
      default:
        return [];
    }
  };

  const analyzeFieldData = (table: string, key: string, referenceRowsOverride?: Record<string, any>[]): FieldInsights | null => {
    const referenceRows = referenceRowsOverride ?? getReferenceRowsForTable(table);
    if (!referenceRows.length) {
      return null;
    }

    let filledCount = 0;
    const rawValues: any[] = [];

    referenceRows.forEach((row) => {
      if (!row) return;
      const rowValue = (row as Record<string, any>)[key];
      if (rowValue === undefined || rowValue === null) return;
      if (typeof rowValue === 'string' && !rowValue.trim()) return;
      filledCount += 1;
      rawValues.push(rowValue);
    });

    const totalRows = referenceRows.length;
    const filledRatio = totalRows ? filledCount / totalRows : 0;

    if (!rawValues.length) {
      return {
        totalRows,
        filledCount,
        filledRatio,
        isMostlyNumeric: false,
        isMostlyDate: false,
        isLongText: false,
        uniqueRatio: 0,
      };
    }

    const numericCount = rawValues.filter((value) => {
      if (typeof value === 'number') return true;
      if (typeof value === 'string') {
        const sanitized = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
        if (!sanitized) return false;
        return !Number.isNaN(parseFloat(sanitized));
      }
      return false;
    }).length;

    const dateCount = rawValues.filter((value) => {
      if (value instanceof Date) return true;
      if (typeof value === 'string') {
        return Boolean(parsePotentialDate(value));
      }
      return false;
    }).length;

    const stringValues = rawValues.map((value) => {
      if (typeof value === 'string') {
        const parsed = parsePotentialDate(value);
        return parsed ? formatDateToDDMMYYYY(parsed) : normalizeWhitespace(value);
      }
      if (typeof value === 'number') {
        return shouldFormatAsCurrency(key) ? formatCurrency(value) : formatNumber(value);
      }
      if (value instanceof Date) return formatDateToDDMMYYYY(value);
      return normalizeWhitespace(String(value));
    });

    const uniqueRatio = stringValues.length
      ? new Set(stringValues.map((value) => value.toLowerCase())).size / stringValues.length
      : 0;

    const hasLongText = stringValues.some((value) => value.length > 160 || value.includes('\n'));

    let sampleText = stringValues.find((value) => value && value.length > 0) ?? '';
    if (sampleText.length > 60) {
      sampleText = `${sampleText.slice(0, 57)}...`;
    }

    return {
      totalRows,
      filledCount,
      filledRatio,
      sampleText: sampleText || undefined,
      isMostlyNumeric: numericCount / rawValues.length > 0.7,
      isMostlyDate: dateCount / rawValues.length > 0.7,
      isLongText: hasLongText,
      uniqueRatio,
    };
  };

  const buildPlaceholderForField = (type: FieldInputType, insights?: FieldInsights | null) => {
    if (!insights || !insights.sampleText) {
      switch (type) {
        case 'number':
          return 'Ingresa un número';
        case 'date':
          return 'DD-MM-YYYY';
        case 'textarea':
          return 'Describe el detalle';
        default:
          return 'Escribe un texto';
      }
    }

    if (type === 'textarea') {
      return `Ej. ${insights.sampleText}`;
    }

    return type === 'text' ? `Ej. ${insights.sampleText}` : insights.sampleText;
  };

  interface HelperTextOptions {
    insights: FieldInsights | null;
    required: boolean;
    isPrimary: boolean;
    type: FieldInputType;
    fieldKey: string;
  }

  const buildHelperTextForField = ({ insights, required, isPrimary, type, fieldKey }: HelperTextOptions) => {
    if (isPrimary) {
      return 'Identificador principal; evita modificarlo.';
    }

    if (!insights || !insights.totalRows) {
      return required ? 'Completa este campo.' : 'Deja vacío si no aplica.';
    }

    const filledPct = Math.round(insights.filledRatio * 100);
    let message = '';

    if (required) {
      message = `Obligatorio; ${filledPct}% de los registros lo incluyen.`;
    } else if (insights.uniqueRatio > 0.85 && insights.filledRatio > 0.5) {
      message = 'Valor casi único; verifica que no se repita.';
    } else if (filledPct >= 70) {
      message = `Se llena en ${filledPct}% de los registros.`;
    } else {
      message = 'Completa cuando tengas el dato.';
    }

    if (insights.sampleText) {
      message = `${message} Ejemplo: ${insights.sampleText}.`.trim();
    } else if (!required) {
      message = `${message} Deja vacío si no aplica.`.trim();
    }

    if (type === 'date') {
      message = `${message} Usa formato DD-MM-YYYY.`.trim();
    }

    const normalizedKey = normalizeAnnualKey(fieldKey);
    if (normalizedKey.includes('monto') && type === 'number') {
      message = `${message} Usa números sin separadores.`.trim();
    }

    return message;
  };

  const parseNumericValue = (value: any) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const sanitized = value.replace(/[^0-9\-.,]/g, '').replace(/,/g, '');
      const parsed = parseFloat(sanitized);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const normalizeAnnualKey = (key: string) => key
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '')
    .replace(/[\.\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[º°#]/g, '')
    .trim();

  const normalizeValueToken = (value: any) => {
    if (value === null || value === undefined) return '';
    return normalizeAnnualKey(String(value));
  };

  const abbreviateLabel = (label: string, wordLimit = 2) => {
    const cleaned = label.replace(/\(.+?\)/g, '').trim();
    const words = cleaned.split(/\s+/).slice(0, wordLimit);
    return words.join(' ') || cleaned;
  };

  
  const categorizeObservation = (value: string | null | undefined) => {
    if (!value) return 'Sin observación';
    const text = value.toLowerCase();
    if (text.includes('revisión') || text.includes('revision')) return 'En revisión';
    if (text.includes('error') || text.includes('corregir')) return 'Correcciones pendientes';
    if (text.includes('trimestral') || text.includes('programado')) return 'Programado';
    if (text.includes('prefactura')) return 'Sin prefactura';
    if (text.includes('pago')) return 'Pendiente de pago';
    return 'Otro';
  };

  const findColumnByFragments = (columns: string[], fragments: string[]) => {
    if (!columns.length) return null;
    // Normalize fragments the same way columns are normalized so dots/dashes match correctly
    const normalizedFragments = fragments.map(fragment => normalizeAnnualKey(fragment));
    for (const column of columns) {
      const normalized = normalizeAnnualKey(column);
      if (normalizedFragments.some(fragment => normalized.includes(fragment))) {
        return column;
      }
    }
    return null;
  };

  const findServiceNameColumn = (columns: string[]) => {
    if (!columns.length) return null;

    const candidates = columns
      .map((column) => {
        const normalized = normalizeAnnualKey(column);
        let score = -1;

        if (normalized === 'nombre del servicio' || normalized === 'nombre_servicio' || normalized === 'nombre del servicio.') {
          score = 100;
        } else if (normalized.includes('nombre del servicio') || normalized.includes('nombre_servicio')) {
          score = 95;
        } else if (normalized === 'objeto del contrato' || normalized === 'descripcion del servicio') {
          score = 85;
        } else if (
          (normalized.includes('servicio') || normalized.includes('objeto') || normalized.includes('concepto') || normalized.includes('descripcion')) &&
          !normalized.includes('observacion') &&
          !normalized.includes('observación') &&
          !normalized.includes('estatus') &&
          !normalized.includes('fase') &&
          !normalized.includes('clave')
        ) {
          score = 60;
        }

        return score >= 0 ? { column, score, length: normalized.length } : null;
      })
      .filter((value): value is { column: string; score: number; length: number } => value !== null);

    if (!candidates.length) return null;

    candidates.sort((a, b) => (b.score - a.score) || (a.length - b.length));
    return candidates[0].column;
  };

  const parsePotentialDate = (value: any) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const hasDateSeparator = /[-\/]/.test(trimmed);
      const hasTimeComponent = /t\d{2}:/i.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed);
      if (!hasDateSeparator && !hasTimeComponent) {
        return null;
      }

      // Preserve local-day handling only for pure dates like 2026-03-31.
      // If the string already includes time, let the native parser keep it.
      const exactIsoDatePattern = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/;
      const exactIsoDateMatch = !hasTimeComponent ? trimmed.match(exactIsoDatePattern) : null;
      if (exactIsoDateMatch) {
        const year = parseInt(exactIsoDateMatch[1], 10);
        const month = parseInt(exactIsoDateMatch[2], 10) - 1;
        const day = parseInt(exactIsoDateMatch[3], 10);
        const candidate = new Date(year, month, day);
        if (!Number.isNaN(candidate.getTime())) return candidate;
      }

      const direct = new Date(trimmed);
      if (!Number.isNaN(direct.getTime())) return direct;

      const normalized = trimmed.replace(/-/g, '/');
      const fallback = new Date(normalized);
      if (!Number.isNaN(fallback.getTime())) return fallback;

      const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const yearFragment = match[3];
        const year = yearFragment.length === 2 ? parseInt(`20${yearFragment}`, 10) : parseInt(yearFragment, 10);
        const candidate = new Date(year, month, day);
        if (!Number.isNaN(candidate.getTime())) return candidate;
      }
    }
    return null;
  };

  const renderCompanyTick = ({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
    const text = normalizeWhitespace(payload.value);
    const maxCharsPerLine = 28;
    const regex = new RegExp(`.{1,${maxCharsPerLine}}(\s|$)`, 'g');
    const segments = text.match(regex)?.map(segment => segment.trim()).filter(Boolean) || [text];

    return (
      <text x={x} y={y} fill="#475569" fontSize={11} textAnchor="end" dy={3}>
        {segments.map((segment, index) => (
          <tspan key={index} x={x} dy={index === 0 ? 0 : 12}>
            {segment}
          </tspan>
        ))}
      </text>
    );
  };

  const contractTimelineInsights = useMemo(() => {
    if (!contracts.length) {
      return {
        total: 0,
        active: 0,
        expiringSoon: 0,
        overdue: 0,
        upcoming: [] as ContractAlert[],
        overdueList: [] as ContractAlert[],
      };
    }

    const now = new Date();
    const upcoming: ContractAlert[] = [];
    const overdueList: ContractAlert[] = [];
    let active = 0;

    contracts.forEach((contract) => {
      if (contract.status === 'ACTIVO') active += 1;
      const endDate = parsePotentialDate(contract.end_date);
      if (!endDate) return;

      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / DAY_IN_MS);
      const alert: ContractAlert = {
        id: contract.id,
        contractNumber: normalizeWhitespace(contract.contract_number ?? 'Sin folio'),
        provider: normalizeWhitespace(contract.provider_name ?? 'Sin proveedor'),
        service: normalizeWhitespace(contract.service_concept ?? 'Sin servicio'),
        endDateLabel: formatDateOnly(endDate),
        daysLeft,
        amount: contract.amount_mxn ?? 0,
      };

      if (daysLeft < 0) {
        overdueList.push(alert);
      } else if (daysLeft <= CONTRACT_SOON_WINDOW_DAYS) {
        upcoming.push(alert);
      }
    });

    upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
    overdueList.sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      total: contracts.length,
      active,
      expiringSoon: upcoming.length,
      overdue: overdueList.length,
      upcoming: upcoming.slice(0, 4),
      overdueList: overdueList.slice(0, 3),
    };
  }, [contracts]);

  const paasSummary = useMemo(() => {
    if (!paasData.length) {
      return {
        totalRequested: 0,
        totalModified: 0,
        delta: 0,
        averageRequested: 0,
        gerenciasCount: 0,
        progress: 0,
        topService: null as PaasItem | null,
        topGerencia: paasByGerencia[0] ?? null,
      };
    }

    const totalRequested = paasData.reduce((acc, item) => acc + (item["Monto solicitado anteproyecto 2026"] || 0), 0);
    const totalModified = paasData.reduce((acc, item) => acc + (item["Modificado"] || 0), 0);
    const averageRequested = totalRequested / paasData.length;
    const topService = [...paasData]
      .sort((a, b) => ((b["Monto solicitado anteproyecto 2026"] || 0) - (a["Monto solicitado anteproyecto 2026"] || 0)))[0] ?? null;
    const gerenciasCount = paasByGerencia.filter(entry => (entry.value ?? 0) > 0).length || paasByGerencia.length;

    return {
      totalRequested,
      totalModified,
      delta: totalModified - totalRequested,
      averageRequested,
      gerenciasCount,
      progress: totalRequested > 0 ? totalModified / totalRequested : 0,
      topService,
      topGerencia: paasByGerencia[0] ?? null,
    };
  }, [paasData, paasByGerencia]);

  const paasTopServices = useMemo(() => {
    if (!paasData.length) return [] as PaasItem[];
    return [...paasData]
      .sort((a, b) => ((b["Monto solicitado anteproyecto 2026"] || 0) - (a["Monto solicitado anteproyecto 2026"] || 0)))
      .slice(0, 5);
  }, [paasData]);

  const topPaasGerencias = useMemo(() => {
    if (!paasByGerencia.length) return [] as { name: string; value: number }[];
    return paasByGerencia.slice(0, 6);
  }, [paasByGerencia]);

  const paasProgressPercent = useMemo(() => {
    const raw = (paasSummary.progress || 0) * 100;
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(160, raw));
  }, [paasSummary.progress]);

  const paasInsightItems = useMemo(() => {
    const items: { label: string; value: string; description: string }[] = [];

    if (paasSummary.topService) {
      items.push({
        label: 'Servicio destacado',
        value: normalizeWhitespace(paasSummary.topService["Nombre del Servicio."] || 'Sin nombre'),
        description: `Solicitado: ${formatCurrency(paasSummary.topService["Monto solicitado anteproyecto 2026"] || 0)}`,
      });
    }

    if (paasSummary.topGerencia) {
      items.push({
        label: 'Gerencia con mayor demanda',
        value: normalizeWhitespace(paasSummary.topGerencia.name || 'Sin asignar'),
        description: `Total: ${formatCurrency(paasSummary.topGerencia.value || 0)}`,
      });
    }

    items.push({
      label: 'Ticket promedio solicitado',
      value: formatCurrency(paasSummary.averageRequested || 0),
      description: `${paasData.length} partida${paasData.length === 1 ? '' : 's'} registradas`,
    });

    items.push({
      label: 'Modificado vs solicitado',
      value: formatPercent(Math.max(0, Math.min(paasSummary.progress || 0, 2))),
      description: `Modificado: ${formatCurrency(paasSummary.totalModified || 0)}`,
    });

    return items;
  }, [paasData.length, paasSummary]);

  const paasDeltaClasses = useMemo(() => {
    const delta = paasSummary.delta || 0;

    if (delta > 0) {
      return {
        title: 'Incremento neto',
        valueClass: 'text-emerald-600',
        badgeClass: 'bg-emerald-500/10 text-emerald-500 border border-emerald-400/40',
        description: `El modificado supera al solicitado por ${formatCurrency(delta)}.`,
        iconWrapper: 'bg-emerald-500/10 text-emerald-500'
      } as const;
    }

    if (delta < 0) {
      return {
        title: 'Reducción neta',
        valueClass: 'text-rose-600',
        badgeClass: 'bg-rose-500/10 text-rose-500 border border-rose-400/40',
        description: `Ajuste a la baja de ${formatCurrency(Math.abs(delta))}.`,
        iconWrapper: 'bg-rose-500/10 text-rose-500'
      } as const;
    }

    return {
      title: 'Sin variación',
      valueClass: 'text-slate-600',
      badgeClass: 'bg-slate-500/10 text-slate-500 border border-slate-400/40',
      description: 'Modificado y solicitado están alineados.',
      iconWrapper: 'bg-slate-500/10 text-slate-500'
    } as const;
  }, [paasSummary.delta]);

  const paasProgressDisplay = useMemo(() => (
    formatPercent(Math.max(0, Math.min(paasSummary.progress || 0, 2)))
  ), [paasSummary.progress]);

  const paasProgressBarWidth = useMemo(() => (
    Math.max(0, Math.min(100, paasProgressPercent))
  ), [paasProgressPercent]);

  const paasTableConfig = useMemo(() => {
    const columns: TableColumnConfig[] = [
      { key: 'No.', label: 'No.', sticky: true, width: 88, align: 'center', className: 'text-slate-500 font-semibold' },
      { key: 'Clave cucop', label: 'Clave CUCOP', sticky: true, width: 180, align: 'center', mono: true, className: 'text-slate-600 uppercase tracking-wide text-[11px]' },
      { key: 'Nombre del Servicio.', label: 'Nombre del Servicio', sticky: true, width: 280, align: 'left', className: 'text-slate-800 font-semibold' },
      { key: 'Gerencia', label: 'Gerencia', align: 'left', className: 'text-slate-500 text-xs' },
      { key: 'Monto solicitado anteproyecto 2026', label: 'Monto Solicitado', align: 'right', isCurrency: true, mono: true, className: 'text-slate-800 font-semibold' },
      { key: 'Modificado', label: 'Modificado', align: 'right', isCurrency: true, mono: true, className: 'text-slate-600' },
      { key: 'Justificación', label: 'Justificación', align: 'left', className: 'text-slate-600 text-xs whitespace-pre-wrap break-words leading-relaxed' },
      { key: '__actions', label: 'Acciones', align: 'center', width: 150 },
    ];

    let runningLeft = 0;
    const stickyMeta = new Map<string, { left: number; width: number }>();
    let lastStickyKey: string | null = null;

    columns.forEach((column) => {
      if (column.sticky) {
        const width = column.width ?? 180;
        stickyMeta.set(column.key, { left: runningLeft, width });
        runningLeft += width;
        lastStickyKey = column.key;
      }
    });

    return { columns, stickyMeta, lastStickyKey };
  }, []);

  const paasOrderedRows = useMemo(() => {
    const extractSequence = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const sanitized = value.trim();
        if (!sanitized) return Number.POSITIVE_INFINITY;
        const numeric = Number(sanitized.replace(/[^0-9.-]/g, ''));
        if (Number.isFinite(numeric)) return numeric;
      }
      return Number.POSITIVE_INFINITY;
    };

    const normalizeLabel = (value: unknown) => {
      if (value === null || value === undefined) return '';
      return String(value).trim().toLowerCase();
    };

    return [...filteredPaasData]
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const aNoRaw = (a.item as Record<string, any>)['No.'] ?? (a.item as Record<string, any>)['No'];
        const bNoRaw = (b.item as Record<string, any>)['No.'] ?? (b.item as Record<string, any>)['No'];

        const aSeq = extractSequence(aNoRaw);
        const bSeq = extractSequence(bNoRaw);

        if (Number.isFinite(aSeq) && Number.isFinite(bSeq) && aSeq !== bSeq) {
          return aSeq - bSeq;
        }

        if (Number.isFinite(aSeq) && !Number.isFinite(bSeq)) return -1;
        if (!Number.isFinite(aSeq) && Number.isFinite(bSeq)) return 1;

        const aLabel = normalizeLabel(aNoRaw);
        const bLabel = normalizeLabel(bNoRaw);
        if (aLabel && bLabel) {
          const labelComparison = aLabel.localeCompare(bLabel, 'es');
          if (labelComparison !== 0) return labelComparison;
        }

        const aId = (a.item as Record<string, any>).id;
        const bId = (b.item as Record<string, any>).id;
        if (typeof aId === 'number' && typeof bId === 'number' && aId !== bId) {
          return aId - bId;
        }

        return a.index - b.index;
      })
        .map(({ item }) => item);
      }, [filteredPaasData]);

  const paasColumnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    paasOrderedRows.forEach((item) => {
      paasTableConfig.columns.forEach((column) => {
        if (!column.isCurrency) return;
        const rawValue = (item as Record<string, any>)[column.key];
        const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (!Number.isFinite(numericValue)) return;
        totals[column.key] = (totals[column.key] ?? 0) + numericValue;
      });
    });
    return totals;
  }, [paasOrderedRows, paasTableConfig]);

  const DeltaIcon = useMemo(() => {
    const delta = paasSummary.delta || 0;
    if (delta > 0) return TrendingUp;
    if (delta < 0) return AlertCircle;
    return FileText;
  }, [paasSummary.delta]);

  const procedureByCompany = useMemo(() => {
    if (!procedureStatuses.length) return [] as { name: string; value: number }[];
    const counts = procedureStatuses.reduce<Record<string, number>>((acc, item) => {
      const key = item.empresa ? item.empresa.trim() : 'Sin empresa';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  }, [procedureStatuses]);

  const topProcedureCompanies = useMemo(() => procedureByCompany.slice(0, 8), [procedureByCompany]);

  const handleSidebarSelection = (tabId: string) => {
    setActiveTab(tabId);
    setIsSidebarOpen(false);
  };

  const procedureByCategory = useMemo(() => {
    if (!procedureStatuses.length) return [] as { name: string; value: number }[];
    const counts = procedureStatuses.reduce<Record<string, number>>((acc, item) => {
      const key = categorizeObservation(item.observacion_pago);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  }, [procedureStatuses]);

  const uniquePendingCompanies = procedureByCompany.length;
  const uniqueObservationCategories = procedureByCategory.length;
  const dominantObservationCategory = procedureByCategory[0];
  const topPendingCompany = procedureByCompany[0];
  const dominantObservationShare = dominantObservationCategory && procedureStatuses.length > 0
    ? Math.round(((dominantObservationCategory?.value ?? 0) / procedureStatuses.length) * 100)
    : 0;
  const procedureFieldList = useMemo(() => {
    if (!procedureStatuses.length) return [] as string[];
    const keys = new Set<string>();
    procedureStatuses.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [procedureStatuses]);
  const latestProcedureRecord = procedureStatuses[0];
  const companyChartHeight = topProcedureCompanies.length ? Math.max(320, topProcedureCompanies.length * 68) : 280;
  const procedureCategoryColors = ['#B38E5D', '#0F4C3A', '#9E1B32', '#2563EB', '#7C3AED', '#F97316', '#64748B'];

  const pendingObservationsCount = procedureStatuses.length;
  const invoicesTotal = invoicesData.length;

  // Helper para mapear meses dinámicamente
  const monthsConfig = [
      { key: 'ene', label: 'Ene.' },
      { key: 'feb', label: 'Feb.' },
      { key: 'mar', label: 'Mar.' },
      { key: 'abr', label: 'Abr.' },
      { key: 'may', label: 'May.' },
      { key: 'jun', label: 'Jun.' },
      { key: 'jul', label: 'Jul.' },
      { key: 'ago', label: 'Ago.' },
      { key: 'sep', label: 'Sep.', dbPrefix: 'sep' },
      { key: 'oct', label: 'Oct.' },
      { key: 'nov', label: 'Nov.' },
      { key: 'dic', label: 'Dic.' },
  ];

  const paymentsFieldList = useMemo(() => {
    if (!paymentsData.length) return [] as string[];
    const keys = new Set<string>();
    paymentsData.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [paymentsData]);

  const proceduresFieldList = useMemo(() => {
    if (!proceduresData.length) return [] as string[];
    const keys = new Set<string>();
    proceduresData.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [proceduresData]);

  const annualNumericTotals = useMemo(() => {
    if (!annual2026Data.length) return [] as { key: string; label: string; value: number }[];

    const totals: Record<string, number> = {};
    annual2026Data.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey === 'id' || normalizedKey.endsWith('_id')) return;
        if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return;
        totals[key] = (totals[key] ?? 0) + value;
      });
    });

    return Object.entries(totals)
      .map(([key, value]) => ({ key, label: humanizeKey(key), value }))
      .sort((a, b) => b.value - a.value);
  }, [annual2026Data]);

  const annualPrimaryMetric = annualNumericTotals[0];
  const annualSecondaryMetric = annualNumericTotals[1];

  const annualCategoryField = useMemo(() => {
    if (!annual2026Data.length) return null as string | null;

    const candidates: { key: string; uniqueCount: number }[] = [];
    const keys = Object.keys(annual2026Data[0]);

    keys.forEach((key) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'id' || normalizedKey.endsWith('_id') || normalizedKey.includes('fecha') || normalizedKey.includes('created') || normalizedKey.includes('updated')) return;

      const values = annual2026Data
        .map((row) => row[key])
        .filter((value) => value !== null && value !== undefined && value !== '' && typeof value !== 'number');

      if (!values.length) return;

      const normalizedValues = values
        .map((value) => String(value).replace(/\s+/g, ' ').trim())
        .filter((value) => value.length > 0);

      const uniqueCount = new Set(normalizedValues).size;
      if (uniqueCount < 2 || uniqueCount > 12) return;

      candidates.push({ key, uniqueCount });
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => a.uniqueCount - b.uniqueCount);
    return candidates[0].key;
  }, [annual2026Data]);

  const annualCategoryMetadata = useMemo(() => {
    if (!annual2026Data.length || !annualCategoryField) return null as { key: string; uniqueCount: number } | null;

    const values = annual2026Data
      .map((row) => row[annualCategoryField])
      .filter((value) => value !== null && value !== undefined && value !== '');

    const normalizedValues = values
      .map((value) => String(value).replace(/\s+/g, ' ').trim())
      .filter((value) => value.length > 0);

    const uniqueCount = new Set(normalizedValues).size;

    return {
      key: annualCategoryField,
      uniqueCount,
    };
  }, [annual2026Data, annualCategoryField]);

  const annualCategoryBreakdown = useMemo(() => {
    if (!annual2026Data.length) return [] as { name: string; value: number }[];
    const primaryKey = annualNumericTotals[0]?.key;
    if (!primaryKey || !annualCategoryField) return [];

    const totals: Record<string, number> = {};

    annual2026Data.forEach((row) => {
      const categoryRaw = row[annualCategoryField];
      const value = row[primaryKey];
      if (categoryRaw === null || categoryRaw === undefined || categoryRaw === '') return;
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      const label = String(categoryRaw).replace(/\s+/g, ' ').trim();
      if (!label.length) return;
      totals[label] = (totals[label] ?? 0) + value;
    });

    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [annual2026Data, annualCategoryField, annualNumericTotals]);

  const annualPieSlices = useMemo(() => (
    annualNumericTotals.slice(0, 5).map((item) => ({
      key: item.key,
      name: item.label,
      value: item.value,
    }))
  ), [annualNumericTotals]);

  const annualCategoryChartHeight = useMemo(() => {
    if (!annualCategoryBreakdown.length) return 260;
    return Math.min(Math.max(annualCategoryBreakdown.length * 56, 240), 420);
  }, [annualCategoryBreakdown]);

  const annualPieChartHeight = useMemo(() => {
    if (!annualPieSlices.length) return 260;
    return Math.min(Math.max(annualPieSlices.length * 38 + 140, 260), 340);
  }, [annualPieSlices]);

  const annualSharedChartHeight = useMemo(
    () => Math.max(annualCategoryChartHeight, annualPieChartHeight),
    [annualCategoryChartHeight, annualPieChartHeight]
  );

  const annualPreferredOrder = [
    'no', 'no.', '#',
    'clave cucop',
    'nombre del servicio',
    'monto solicitado anteproyecto 2026',
    'monto maximo 2024',
    'fase',
    'documentacion soporte',
    'estatus',
    'fecha de remision de investigacion de mercado',
    'comentarios',
  ];

  const invoicesPreferredOrder = [
    'no contrato', 'numero contrato', 'numero de contrato', 'no.', '#',
    'objeto del contrato', 'objeto', 'descripcion', 'concepto',
    'monto maximo', 'monto máximo', 'monto total',
    'monto minimo', 'monto mínimo',
    'inicio del servicio', 'fecha inicio', 'fecha de inicio',
    'conclusion del servicio', 'fecha conclusion', 'fecha de conclusion', 'fecha termino', 'fecha de termino',
    'tipo', 'tipo de contrato',
    'fecha de correo', 'fecha envio', 'fecha de envio',
    'estatus', 'status', 'fase',
    'proveedor', 'razon social', 'empresa',
    'observaciones', 'comentarios'
  ];

  const invoicesStickyDefinitions = [
    { id: 'contract', match: ['no contrato', 'numero contrato', 'numero de contrato', '#', 'no.'], width: 190 },
    { id: 'object', match: ['objeto del contrato', 'objeto', 'descripcion', 'concepto', 'servicio'], width: 460 },
  ];

  const invoicesTableColumns = useMemo(() => {
    if (!invoicesData.length) return [] as string[];
    const seen = new Set<string>();
    const collected: string[] = [];
    invoicesData.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (seen.has(key)) return;
        const normalized = normalizeAnnualKey(key);
        if (normalized === 'id' || normalized.endsWith(' id') || normalized.includes('created') || normalized.includes('updated')) return;
        seen.add(key);
        collected.push(key);
      });
    });

    return collected.sort((a, b) => {
      const normalizedA = normalizeAnnualKey(a);
      const normalizedB = normalizeAnnualKey(b);
      const priorityA = invoicesPreferredOrder.findIndex((target) => normalizedA === target);
      const priorityB = invoicesPreferredOrder.findIndex((target) => normalizedB === target);
      const safePriorityA = priorityA === -1 ? Number.MAX_SAFE_INTEGER : priorityA;
      const safePriorityB = priorityB === -1 ? Number.MAX_SAFE_INTEGER : priorityB;
      if (safePriorityA !== safePriorityB) return safePriorityA - safePriorityB;
      return normalizedA.localeCompare(normalizedB);
    });
  }, [invoicesData]);

  const invoicesColumnsToRender = useMemo(() => {
    if (!invoicesTableColumns.length) return [] as string[];
    return canManageRecords ? [...invoicesTableColumns, '__actions'] : [...invoicesTableColumns];
  }, [invoicesTableColumns, canManageRecords]);

  const invoicesColumnCount = Math.max(invoicesColumnsToRender.length || invoicesTableColumns.length || 1, 1);

  const invoicesStatusSummary = useMemo(() => {
    if (!invoicesData.length) return [] as { name: string; value: number }[];
    const statusCounts = invoicesData.reduce<Record<string, number>>((acc, row) => {
      const rawStatus = row.estatus ?? row.status ?? row.estado ?? 'Sin estatus';
      const label = normalizeWhitespace(String(rawStatus || 'Sin estatus'));
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(statusCounts)
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [invoicesData]);

  const invoicesPendingCount = useMemo(() => {
    if (!invoicesData.length) return 0;
    return invoicesData.reduce((acc, row) => {
      const statusRaw = normalizeWhitespace(String(row.estatus ?? row.status ?? row.estado ?? '')).toLowerCase();
      if (!statusRaw) return acc;
      if (statusRaw.includes('pend') || statusRaw.includes('proceso') || statusRaw.includes('por pagar')) {
        return acc + 1;
      }
      return acc;
    }, 0);
  }, [invoicesData]);

  const invoicesPaidCount = useMemo(() => {
    if (!invoicesData.length) return 0;
    return invoicesData.reduce((acc, row) => {
      const statusRaw = normalizeWhitespace(String(row.estatus ?? row.status ?? row.estado ?? '')).toLowerCase();
      if (!statusRaw) return acc;
      if (statusRaw.includes('pag') || statusRaw.includes('cobrad') || statusRaw.includes('cerr')) {
        return acc + 1;
      }
      return acc;
    }, 0);
  }, [invoicesData]);

  const invoicesProviderSummary = useMemo(() => {
    if (!invoicesData.length) return [] as { name: string; value: number }[];
    const counts = invoicesData.reduce<Record<string, number>>((acc, row) => {
      const rawProvider = row.proveedor ?? row.proveedor_nombre ?? row.razon_social ?? row.proveedor_name ?? 'Sin proveedor';
      const label = normalizeWhitespace(String(rawProvider || 'Sin proveedor'));
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 8);
  }, [invoicesData]);

  const invoicesProviderChartHeight = useMemo(() => {
    if (!invoicesProviderSummary.length) return 260;
    return Math.min(Math.max(invoicesProviderSummary.length * 52, 240), 420);
  }, [invoicesProviderSummary]);

  const invoicesAmountTotals = useMemo(() => {
    if (!invoicesData.length) return { total: 0, paid: 0, pending: 0 };
    return invoicesData.reduce((acc, row) => {
      const total = parseNumericValue(row.monto_total ?? row.monto_maximo ?? row.total);
      const pagado = parseNumericValue(row.monto_pagado ?? row.pagado ?? row.monto_pagado_parcial);
      return {
        total: acc.total + total,
        paid: acc.paid + pagado,
        pending: acc.pending + Math.max(0, total - pagado),
      };
    }, { total: 0, paid: 0, pending: 0 });
  }, [invoicesData]);

  const invoicesPendingProviders = useMemo(() => {
    if (!invoicesData.length) return [] as { name: string; value: number }[];

    const counts = invoicesData.reduce<Record<string, number>>((acc, row) => {
      const statusRaw = normalizeWhitespace(String(row.estatus ?? row.status ?? row.estado ?? '')).toLowerCase();
      if (!statusRaw) return acc;
      const isPending = statusRaw.includes('pend') || statusRaw.includes('proceso') || statusRaw.includes('por pagar');
      if (!isPending) return acc;

      const providerRaw = row.proveedor ?? row.proveedor_nombre ?? row.razon_social ?? row.proveedor_name ?? 'Sin proveedor';
      const provider = normalizeWhitespace(String(providerRaw || 'Sin proveedor'));
      acc[provider] = (acc[provider] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 3);
  }, [invoicesData]);

  const executiveHighlights = useMemo(() => {
    const totalContracts = contractTimelineInsights.total;
    const cards: Array<{
      id: string;
      label: string;
      value: string;
      helper: string;
      icon: React.ComponentType<{ className?: string }>;
      accentBg: string;
      accentText: string;
    }> = [];

    const activeShare = totalContracts ? Math.round((contractTimelineInsights.active / totalContracts) * 100) : 0;
    cards.push({
      id: 'contracts-active',
      label: 'Contratos activos',
      value: contractTimelineInsights.active.toString(),
      helper: totalContracts ? `${activeShare}% de ${totalContracts} contratos` : 'Sin registros cargados.',
      icon: Briefcase,
      accentBg: 'bg-emerald-100',
      accentText: 'text-emerald-700',
    });

    const overdue = contractTimelineInsights.overdue;
    cards.push({
      id: 'contracts-expiring',
      label: `Por vencer (${CONTRACT_SOON_WINDOW_DAYS} días)`,
      value: contractTimelineInsights.expiringSoon.toString(),
      helper: overdue
        ? `${overdue} contrato${overdue === 1 ? '' : 's'} vencido${overdue === 1 ? '' : 's'}`
        : 'Sin vencimientos registrados.',
      icon: CalendarIcon,
      accentBg: 'bg-amber-100',
      accentText: 'text-amber-700',
    });

    cards.push({
      id: 'paas-requested',
      label: 'PAAS solicitado',
      value: formatCurrency(paasSummary.totalRequested || 0),
      helper: `Modificado: ${formatCurrency(paasSummary.totalModified || 0)}`,
      icon: FileText,
      accentBg: 'bg-slate-100',
      accentText: 'text-slate-700',
    });

    cards.push({
      id: 'payments-execution',
      label: 'Ejecución de pagos',
      value: formatPercent(Math.max(0, Math.min(paymentsExecutionRate || 0, 2))),
      helper:
        totalContratado > 0
          ? `${formatCurrency(totalEjercido)} de ${formatCurrency(totalContratado)}`
          : 'Carga la tabla de control de pagos.',
      icon: CreditCard,
      accentBg: 'bg-blue-100',
      accentText: 'text-blue-700',
    });

    const pendingShare = invoicesTotal ? Math.round((invoicesPendingCount / invoicesTotal) * 100) : 0;
    cards.push({
      id: 'invoices-pending',
      label: 'Facturas pendientes',
      value: invoicesPendingCount.toString(),
      helper: invoicesTotal
        ? `${pendingShare}% de ${invoicesTotal} · Pagadas: ${invoicesPaidCount}`
        : 'Sin facturas registradas.',
      icon: FileSpreadsheet,
      accentBg: 'bg-slate-100',
      accentText: 'text-slate-700',
    });

    cards.push({
      id: 'payment-observations',
      label: 'Observaciones activas',
      value: pendingObservationsCount.toString(),
      helper: pendingObservationsCount
        ? dominantObservationCategory
          ? `${dominantObservationCategory.name} (${dominantObservationShare}% del total)`
          : 'Distribución equilibrada entre categorías.'
        : 'Sin observaciones registradas.',
      icon: AlertCircle,
      accentBg: 'bg-rose-100',
      accentText: 'text-rose-700',
    });

    return cards;
  }, [
    contractTimelineInsights,
    paasSummary,
    paymentsExecutionRate,
    totalContratado,
    totalEjercido,
    invoicesPendingCount,
    invoicesPaidCount,
    invoicesTotal,
    pendingObservationsCount,
    dominantObservationCategory,
    dominantObservationShare,
  ]);

  const insightToneClasses: Record<ExecutiveInsight['tone'], string> = {
    neutral: 'bg-slate-50 border-slate-200 text-slate-700',
    positive: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    alert: 'bg-amber-50 border-amber-200 text-amber-700',
    critical: 'bg-rose-50 border-rose-200 text-rose-700',
  };

  const insightIconClasses: Record<ExecutiveInsight['tone'], string> = {
    neutral: 'bg-white/80 text-slate-600 border-slate-200/70',
    positive: 'bg-white/80 text-emerald-600 border-emerald-200/60',
    alert: 'bg-white/80 text-amber-600 border-amber-200/60',
    critical: 'bg-white/80 text-rose-600 border-rose-200/60',
  };

  const contractStatusHasData = useMemo(() => contractStatusData.some((item) => item.value > 0), [contractStatusData]);
  const invoicesStatusHasData = useMemo(() => invoicesStatusSummary.some((item) => item.value > 0), [invoicesStatusSummary]);
  const paymentsFlowHasData = useMemo(() => paymentsMonthlyFlow.some((item) => Math.abs(item.value) > 0), [paymentsMonthlyFlow]);
  const topPaasGerenciasHasData = useMemo(() => topPaasGerencias.some((item) => item.value > 0), [topPaasGerencias]);
  const budgetExecutionHasData = totalContratado > 0;

  const annualTableColumns = useMemo(() => {
    if (!annual2026Data.length) return [] as string[];
    const seen = new Set<string>();
    const allColumns: string[] = [];
    annual2026Data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          allColumns.push(key);
        }
      });
    });

    const ordered = [...allColumns].sort((a, b) => {
      const normalizedA = normalizeAnnualKey(a);
      const normalizedB = normalizeAnnualKey(b);
      const priorityA = annualPreferredOrder.findIndex((target) => normalizedA === target);
      const priorityB = annualPreferredOrder.findIndex((target) => normalizedB === target);
      const safePriorityA = priorityA === -1 ? Number.MAX_SAFE_INTEGER : priorityA;
      const safePriorityB = priorityB === -1 ? Number.MAX_SAFE_INTEGER : priorityB;
      if (safePriorityA !== safePriorityB) return safePriorityA - safePriorityB;
      return normalizedA.localeCompare(normalizedB);
    });

    return ordered;
  }, [annual2026Data]);

  const annualColumnsToRender = useMemo(() => {
    if (!annualTableColumns.length) return [] as string[];
    return canManageRecords ? [...annualTableColumns, '__actions'] : [...annualTableColumns];
  }, [annualTableColumns, canManageRecords]);

  const annualMonetaryColumns = useMemo(() => {
    if (!annualTableColumns.length) return [] as string[];
    const monetaryTokens = ['monto', 'importe', 'presupuesto', 'modificado', 'costo', 'ejercido'];
    return annualTableColumns.filter((column) => {
      const normalized = normalizeAnnualKey(column);
      return monetaryTokens.some((token) => normalized.includes(token));
    });
  }, [annualTableColumns]);


  const annualStickyInfo = useMemo(() => {
    const definitions: Array<{ id: string; match: string[]; width: number }> = [
      { id: 'no', match: ['no', 'no.', '#', 'n'], width: 80 },
      { id: 'clave', match: ['clave cucop', 'clave cucop (dn 10)', 'clave cucop dn10'], width: 160 },
      { id: 'servicio', match: ['nombre del servicio', 'nombre del servicio.', 'servicio'], width: 380 },
    ];

    const meta = new Map<string, { left: number; width: number }>();
    const order: string[] = [];
    let left = 0;

    definitions.forEach((definition) => {
      const matchedColumn = annualTableColumns.find((column) => {
        const normalized = normalizeAnnualKey(column);
        return definition.match.some((target) => normalized === target);
      });

      if (matchedColumn) {
        meta.set(matchedColumn, { left, width: definition.width });
        order.push(matchedColumn);
        left += definition.width;
      }
    });

    return { meta, order };
  }, [annualTableColumns]);

  const annualLastStickyKey = annualStickyInfo.order[annualStickyInfo.order.length - 1];

  const invoicesStickyInfo = useMemo(() => {
    const meta = new Map<string, { left: number; width: number }>();
    const order: string[] = [];
    let left = 0;

    invoicesStickyDefinitions.forEach((definition) => {
      const matchedColumn = invoicesTableColumns.find((column) => {
        const normalized = normalizeAnnualKey(column);
        return definition.match.some((target) => normalized === target);
      });

      if (matchedColumn) {
        meta.set(matchedColumn, { left, width: definition.width });
        order.push(matchedColumn);
        left += definition.width;
      }
    });

    return { meta, order };
  }, [invoicesTableColumns]);

  const invoicesLastStickyKey = invoicesStickyInfo.order[invoicesStickyInfo.order.length - 1];

  const serviciosPreferredOrderHints = [
    ['id'],
    ['clave_cucop', 'clave cucop', 'clave servicio', 'clave'],
    ['nombre_servicio', 'nombre del servicio', 'servicio', 'descripcion del servicio'],
    ['subdireccion', 'subdirección'],
    ['gerencia'],
    ['estatus', 'status', 'estado'],
    ['fase'],
    ['monto_maximo_2026', 'monto maximo 2026', 'monto 2026'],
    ['monto_solicitado_anteproyecto_2026', 'monto solicitado'],
    ['monto_suficiencia_presupuestal', 'monto suficiencia'],
    ['monto_maximo_2025', 'monto 2025'],
    ['monto_maximo_2024', 'monto 2024'],
    ['documentacion_soporte', 'documentación soporte'],
    ['investigacion_mercado', 'investigación mercado'],
    ['suficiencia_presupuestal', 'suficiencia presupuestal'],
    ['procedimiento_contratacion', 'procedimiento contratación'],
    ['fecha_remision_investigacion_mercado', 'fecha remisión im'],
    ['fecha_recepcion_investigacion_mercado', 'fecha recepción im'],
    ['publicacion_convocatoria', 'publicación convocatoria'],
    ['visita_instalaciones', 'visita instalaciones'],
    ['junta_aclaraciones', 'junta aclaraciones'],
    ['apertura_proposiciones', 'apertura proposiciones'],
    ['fallo'],
    ['diferimiento_fallo', 'diferimiento fallo']
  ];

  // Tooltips de ayuda para columnas de la tabla estatus_servicios_2026.
  // La clave es el nombre de columna normalizado (sin acentos, en minúsculas, espacios simples).
  const SERVICIOS_COLUMN_TOOLTIPS: Record<string, string> = {
    'metodo calculo monto maximo': [
      'Criterio metodológico utilizado para estimar el monto máximo del servicio.',
      '',
      'Ejemplos de valores válidos:',
      '• "Factor 2.5" — multiplica el monto base por un factor acordado.',
      '• "Garantizados + Detectados" — suma los servicios comprometidos y los detectados en campo.',
      '• "Precio unitario × volumen estimado".',
      '',
      'Registra el método exactamente como fue aprobado en la estimación.',
    ].join('\n'),
    'precio prevaleciente': [
      'Precio de referencia o de mercado vigente para este servicio, utilizado como base para negociación o comparación.',
      '',
      'Puede provenir de:',
      '• Investigación de mercado.',
      '• Precio del contrato anterior.',
      '• Cotización más reciente del proveedor.',
      '',
      'Captura el valor en pesos mexicanos (MXN) sin comas ni símbolo $.',
    ].join('\n'),
    'monto real ejecutado': [
      'Importe total efectivamente devengado o ejercido al cierre del servicio.',
      '',
      'Diferencias frecuentes con el monto máximo:',
      '• Puede ser menor si no se llegó al tope contratado.',
      '• Incluye todos los conceptos facturados y aceptados.',
      '',
      'Captura el valor final una vez conciliadas todas las estimaciones.',
    ].join('\n'),
  };

  const estatus2026PreferredOrderHints = [
    ['id'],
    ['clave_cucop', 'clave cucop', 'cucop'],
    ['observacion_general_del_servicio', 'observación general del servicio', 'observaciones'],
    ['nombre_servicio', 'nombre del servicio.', 'nombre del servicio', 'servicio'],
    ['subdireccion', 'subdirección', 'área'],
    ['gerencia'],
    ['tipo_de_servicio', 'tipo de servicio'],
    ['monto_solicitado_anteproyecto_2026', 'monto solicitado anteproyecto 2026', 'solicitado 2026'],
    ['monto_maximo_2024', 'monto máximo 2024', 'monto 2024'],
    ['fase'],
    ['documentacion_soporte', 'documentación soporte'],
    ['estatus', 'status', 'estado'],
    ['fecha_remision_investigacion_mercado', 'fecha de remisión de investigación de mercado', 'remisión im'],
    ['tiempo_en_oic', 'tiempo en oic'],
    ['fecha_recepcion_investigacion_mercado', 'fecha de recepción de investigación de mercado', 'recepción im'],
    ['__dias_remision_recepcion'],
    ['Validación por el área', 'validacion por el area', 'validación por el área', 'validacion por area'],
    ['__dias_recepcion_validacion'],
    ['monto_maximo_2025', 'monto máximo 2025', 'monto 2025'],
    ['monto_suficiencia_presupuestal', 'monto de suficiencia presupuestal'],
    ['monto_maximo_2026', 'monto máximo 2026', 'monto 2026'],
    ['no_procedimiento_contratacion', 'no. de procedimiento de contratación', 'no. procedimiento'],
    ['investigacion_mercado', 'investigación de mercado'],
    ['suficiencia_presupuestal', 'suficiencia presupuestal'],
    ['procedimiento_contratacion', 'procedimiento de contratación'],
    ['fecha_firma_contrato', 'fecha de firma de contrato', 'firma contrato'],
    ['publicacion_convocatoria', 'publicación de convocatoria'],
    ['visita_instalaciones', 'visita a las instalaciones'],
    ['junta_aclaraciones', 'junta de aclaraciones'],
    ['apertura_proposiciones', 'apertura de proposiciones'],
    ['fallo'],
    ['lista_asistencia', 'lista de asistencia.', 'lista asistencia'],
    ['diferimiento_fallo', 'diferimiento de fallo'],
    ['administrador_contrato', 'administrador de contrato'],
    ['proveedor'],
    ['no_contrato', 'no. de contrato'],
    ['vigencia_inicio', 'vigencia de inicio'],
    ['vigencia_termino', 'vigencia de término'],
    ['garantia_cumplimiento', 'garantia de cumplimiento', 'garantía de cumplimiento', 'garantia cumplimiento'],
    ['poliza_responsabilidad_civil', 'poliza de responsabilidad civil', 'póliza de responsabilidad civil', 'responsabilidad civil'],
    ['garantia_calidad', 'garantia de calidad', 'garantía de calidad', 'garantía calidad']
  ];

  const pagos2026PreferredOrderHints: [string, ...string[]][] = [
    ['id', 'ID', 'Id', 'uuid'],
    ['No. Contrato'],
    ['Objeto del contrato'],
    ['Proveedor'],
    ['Tipo de contrato'],
    ['Fecha de inicio'],
    ['Fecha de termino'],
    ['Mont. Max.'],

    // Enero
    ['Ene.'],
    ['Ene. Preventivos'],
    ['Ene. Correctivos'],
    ['Ene. Nota de Crédito'],
    ['Complemento de Pago  Enero\nSI/NO', 'Complemento de Pago  Enero SI/NO', 'complemento de pago enero si/no'],
    ['Observación de pago Enero'],

    // Febrero
    ['Feb.'],
    ['Feb. Preventivos'],
    ['Feb. Correctivos'],
    ['Feb. Nota de Crédito'],
    ['Complemento de Pago  Feb.\nSI/NO', 'Complemento de Pago  Feb. SI/NO'],
    ['Observación de pago Feb.'],

    // Marzo
    ['Mar.'],
    ['Mar. Preventivos'],
    ['Mar. Correctivos'],
    ['Mar. Nota de Crédito'],
    ['Complemento de Pago  Mar.\nSI/NO', 'Complemento de Pago  Mar. SI/NO'],
    ['Observación de pago Mar.'],

    // Abril
    ['Abr.'],
    ['Abr. Preventivos'],
    ['Abr. Correctivos'],
    ['Abr. Nota de Crédito'],
    ['Complemento de Pago  Abr.\nSI/NO', 'Complemento de Pago  Abr. SI/NO'],
    ['Observación de pago Abr.'],

    // Mayo
    ['May.'],
    ['May. Preventivos'],
    ['May. Correctivos'],
    ['May. Nota de Crédito'],
    ['Complemento de Pago  May.\nSI/NO', 'Complemento de Pago  May. SI/NO'],
    ['Observación de pago May.'],

    // Junio
    ['Jun.'],
    ['Jun. Preventivos'],
    ['Jun. Correctivos'],
    ['Jun. Nota de Crédito'],
    ['Complemento de Pago  Jun.\nSI/NO', 'Complemento de Pago  Jun. SI/NO'],
    ['Observación de pago Jun.'],

    // Julio
    ['Jul.'],
    ['Jul. Preventivos'],
    ['Jul. Correctivos'],
    ['Jul. Nota de Crédito'],
    ['Complemento de Pago  Jul.\nSI/NO', 'Complemento de Pago  Jul. SI/NO'],
    ['Observación de pago Jul.'],

    // Agosto
    ['Ago.'],
    ['Ago. Preventivos'],
    ['Ago. Correctivos'],
    ['Ago. Nota de Crédito'],
    ['Complemento de Pago  Ago.\nSI/NO', 'Complemento de Pago  Ago. SI/NO'],
    ['Observación de pago Ago.'],

    // Septiembre
    ['Sept.'],
    ['Sep. Preventivos'],
    ['Sep. Correctivos'],
    ['Sep. Nota de Crédito'],
    ['Complemento de Pago  Sep.\nSI/NO', 'Complemento de Pago  Sep. SI/NO'],
    ['Observación de pago Sep.'],

    // Octubre
    ['Oct.'],
    ['Oct. Preventivos'],
    ['Oct. Correctivos'],
    ['Oct. Nota de Crédito'],
    ['Complemento de Pago  Oct.\nSI/NO', 'Complemento de Pago  Oct. SI/NO'],
    ['Observación de pago Oct.'],

    // Noviembre
    ['Nov.'],
    ['Nov. Preventivos'],
    ['Nov. Correctivos'],
    ['Nov. Nota de Crédito'],
    ['Complemento de Pago  Nov.\nSI/NO', 'Complemento de Pago  Nov. SI/NO'],
    ['Observación de pago Nov.'],

    // Diciembre
    ['Dic.'],
    ['Dic. Preventivos'],
    ['Dic. Correctivos'],
    ['Dic. Nota de Crédito'],
    ['Complemento de Pago  Dic.\nSI/NO', 'Complemento de Pago  Dic. SI/NO'],
    ['Observación de pago Dic.'],

    ['Monto máximo contrato'],
    ['Monto ejercido'],
    ['Facturas devengadas'],
    ['Observaciones']
  ];


  const estatus2026TableColumns = useMemo(() => {
    if (!estatus2026Data.length) return [] as string[];

    const priorityMap = new Map<string, number>();
    estatus2026PreferredOrderHints.forEach((synonyms, index) => {
      synonyms.forEach((label) => {
        priorityMap.set(normalizeAnnualKey(label), index);
      });
    });

    const columns = new Set<string>();
    estatus2026Data.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => {
        if (key && !shouldSkipColumnForForm(key)) columns.add(key);
      });
    });

    // Deduplicate columns that normalise to the same key, keeping the
    // exact-lowercase version when possible (e.g. keep 'id', drop 'ID').
    const seenNorm = new Map<string, string>(); // normalizedKey → chosen column name
    for (const col of Array.from(columns)) {
      const norm = normalizeAnnualKey(col);
      if (!seenNorm.has(norm)) {
        seenNorm.set(norm, col);
      } else {
        const existing = seenNorm.get(norm)!;
        // Prefer the exact lowercase version over uppercase variants
        if (col === col.toLowerCase() && existing !== existing.toLowerCase()) {
          seenNorm.set(norm, col);
        }
      }
    }
    const dedupedColumns = new Set(seenNorm.values());
    const sorted = Array.from(dedupedColumns)
      .filter(c => normalizeAnnualKey(c) !== 'id') // hide DB id column — row numbers shown as virtual __row_num
      .sort((a, b) => {
      const normalizedA = normalizeAnnualKey(a);
      const normalizedB = normalizeAnnualKey(b);

      // Always put the observations/incidencias column last
      const isIncA = normalizedA.includes('incidencia');
      const isIncB = normalizedB.includes('incidencia');
      if (isIncA !== isIncB) return isIncA ? 1 : -1;

      const priorityA = priorityMap.get(normalizedA);
      const priorityB = priorityMap.get(normalizedB);

      if (priorityA !== undefined && priorityB !== undefined && priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      if (priorityA !== undefined && priorityB === undefined) return -1;
      if (priorityB !== undefined && priorityA === undefined) return 1;
      return normalizedA.localeCompare(normalizedB, 'es');
    });

    // Inject virtual day-counter columns at the correct positions
    const recepcionIdx = sorted.findIndex(c => normalizeAnnualKey(c).includes('recepcion') && normalizeAnnualKey(c).includes('investigacion'));
    if (recepcionIdx !== -1) sorted.splice(recepcionIdx + 1, 0, '__dias_remision_recepcion');
    const validacionIdx = sorted.findIndex(c => normalizeAnnualKey(c).includes('validacion') && normalizeAnnualKey(c).includes('area'));
    if (validacionIdx !== -1) sorted.splice(validacionIdx + 1, 0, '__dias_recepcion_validacion');

    // Prepend row-number virtual column
    sorted.unshift('__row_num');

    return sorted;
  }, [estatus2026Data]);

  const estatus2026StickyDefinitions = [
    { id: 'clave_cucop', match: ['clave_cucop', 'clave cucop', 'cucop'], width: 140 },
    { id: 'observacion_general', match: ['observacion_general_del_servicio', 'observación general del servicio', 'observacion general', 'observaciones'], width: 280 },
    { id: 'nombre_servicio', match: ['nombre_servicio', 'nombre del servicio', 'servicio', 'descripcion'], width: 320 }
  ];

  const estatus2026StickyInfo = useMemo(() => {
    const meta = new Map<string, { left: number; width: number }>();
    const order: string[] = [];
    let left = 0;

    estatus2026StickyDefinitions.forEach((definition) => {
      const normalId = definition.id;
      const matchedColumn = estatus2026TableColumns.find((col) => {
         const normCol = normalizeAnnualKey(col);
         return definition.match.some((m) => normalizeAnnualKey(m) === normCol);
      });

      if (matchedColumn) {
        meta.set(matchedColumn, { left, width: definition.width });
        order.push(matchedColumn);
        left += definition.width;
      }
    });

    return { meta, order };
  }, [estatus2026TableColumns]);

  const estatus2026LastStickyKey = estatus2026StickyInfo.order[estatus2026StickyInfo.order.length - 1];

  const estatus2026ObservationsColumn = useMemo(
    () => estatus2026TableColumns.find((c) => normalizeAnnualKey(c).includes('incidencia')) ?? null,
    [estatus2026TableColumns]
  );

  // Pre-calculate column metadata (types, sticky configs, highlights) to improve render performance
  const estatus2026ColumnMeta = useMemo(() => {
    const meta = new Map<string, { 
        isBoolean: boolean; 
        isDate: boolean; 
        isHighlighted: boolean;
        isObservations: boolean;
        stickyConfig?: { left: number; width: number };
        isLastSticky: boolean;
    }>();

    const highlightColumns = [
        'publicacion de convocatoria', 'publicacion_convocatoria',
        'visita a las instalaciones', 'visita_instalaciones',
        'junta de aclaraciones', 'junta_aclaraciones',
        'apertura de proposiciones', 'apertura_proposiciones',
        'fallo'
    ].map(h => normalizeAnnualKey(h));

    estatus2026TableColumns.forEach(column => {
        const norm = normalizeAnnualKey(column);

        // Virtual day-counter columns
        if (column === '__dias_remision_recepcion' || column === '__dias_recepcion_validacion' || column === '__row_num') {
            meta.set(column, { isBoolean: false, isDate: false, isHighlighted: false, isObservations: false, isLastSticky: false });
            return;
        }

        // Boolean Detection
        let isBoolean = false;
        const explicitBooleans = [
            'procedimiento de contratacion', 
            'suficiencia', 
            'investigacion', 
            'plurianual', 
            'anticipo', 
            'convenio', 
            'validado',
            'complemento de pago',
            'complementos de pago',
            'entregable',
            'garantia de cumplimiento',
            'garantia de calidad',
            'garantia calidad',
            'garantia cumplimiento',
            'cumplimiento',
            'garantia',
            'poliza',
            'paas'
            // Removed 'publicacion' to avoid conflict with dates like 'publicacion de convocatoria'
        ];
        if (!norm.includes('fecha') && explicitBooleans.some(k => norm.includes(k))) {
            isBoolean = true;
        } else if (['estatus', 'fase'].some(k => norm.includes(k))) {
            isBoolean = false;
        }

        if (!isBoolean) {
          const hasBooleanLike = estatus2026Data.some((row) => isBooleanLikeValue(row?.[column]));
          if (hasBooleanLike) isBoolean = true;
        }

        // Date Detection
        let isDate = false;
        if (!isBoolean) {
            const dateKeywords = ['fecha', 'vigencia', 'fallo', 'apertura', 'inicio', 'término', 'termino', 'visita', 'revision', 'revisión', 'diferimiento', 'junta', 'programacion', 'formalizacion'];
             if (dateKeywords.some(k => norm.includes(k))) isDate = true;
             else if (['publicacion de convocatoria', 'publicacion convocatoria'].some(k => norm.includes(k))) isDate = true;
             else if (['validacion por el area', 'validacion por area'].some(k => norm.includes(k))) isDate = true;
        }

        const isHighlighted = highlightColumns.includes(norm);
        const isObservations = norm.includes('incidencia');
        
        meta.set(column, {
            isBoolean,
            isDate,
            isHighlighted,
            isObservations,
            stickyConfig: estatus2026StickyInfo.meta.get(column),
            isLastSticky: estatus2026LastStickyKey === column
        });
    });

    return meta;
  }, [estatus2026TableColumns, estatus2026StickyInfo, estatus2026LastStickyKey, estatus2026Data]);

  // ── RESUMEN 2026 ──────────────────────────────────────────────────────────

  const estatus2026StatusFieldSummary = useMemo(() => (
    findColumnByFragments(estatus2026TableColumns, ['fase', 'estatus', 'status', 'avance'])
  ), [estatus2026TableColumns]);

  const estatus2026ServiceNameFieldSummary = useMemo(() => (
    findServiceNameColumn(estatus2026TableColumns)
  ), [estatus2026TableColumns]);

  const estatus2026ClaveFieldSummary = useMemo(() => (
    findColumnByFragments(estatus2026TableColumns, ['clave_cucop', 'clave cucop', 'cucop', 'clave servicio', 'clave'])
  ), [estatus2026TableColumns]);

  const estatus2026GarantiaCumplimientoField = useMemo(() => (
    // Do NOT use a generic 'garantia' fallback — it would accidentally match
    // the "Garantía de Calidad" column when no cumplimiento column exists.
    findColumnByFragments(estatus2026TableColumns, ['garantia de cumplimiento', 'garantia cumplimiento'])
  ), [estatus2026TableColumns]);

  const estatus2026PolizaResponsabilidadCivilField = useMemo(() => (
    findColumnByFragments(estatus2026TableColumns, ['poliza de responsabilidad civil', 'poliza responsabilidad civil', 'responsabilidad civil'])
      ?? findColumnByFragments(estatus2026TableColumns, ['poliza'])
  ), [estatus2026TableColumns]);

  const estatus2026GarantiaCalidadField = useMemo(() => (
    findColumnByFragments(estatus2026TableColumns, ['garantia de calidad', 'garantia calidad'])
      ?? findColumnByFragments(estatus2026TableColumns, ['calidad'])
  ), [estatus2026TableColumns]);

  const getEstatus2026PaymentRequirementState = useCallback((row: Record<string, any>) => {
    const garantiaOk = estatus2026GarantiaCumplimientoField
      ? getBooleanChecked(row?.[estatus2026GarantiaCumplimientoField])
      : true;
    const polizaOk = estatus2026PolizaResponsabilidadCivilField
      ? getBooleanChecked(row?.[estatus2026PolizaResponsabilidadCivilField])
      : true;
    const calidadOk = estatus2026GarantiaCalidadField
      ? getBooleanChecked(row?.[estatus2026GarantiaCalidadField])
      : true;

    const missingItems: string[] = [];
    if (!garantiaOk) missingItems.push('garantía de cumplimiento');
    if (!polizaOk) missingItems.push('póliza de responsabilidad civil');

    if (!calidadOk) missingItems.push('garantia de calidad');

    let shortLabel = '';
    if (missingItems.length > 1) {
      shortLabel = `Faltan ${missingItems.slice(0, -1).join(', ')} y ${missingItems[missingItems.length - 1]}`;
    } else if (missingItems.length === 1) {
      shortLabel = `Falta ${missingItems[0]}`;
    }

    return {
      garantiaOk,
      polizaOk,
      calidadOk,
      missingItems,
      readyForPayment: missingItems.length === 0,
      shortLabel,
    };
  }, [estatus2026GarantiaCalidadField, estatus2026GarantiaCumplimientoField, estatus2026PolizaResponsabilidadCivilField]);

  const estatus2026PaymentAlertSummary = useMemo(() => {
    if (!estatus2026GarantiaCumplimientoField && !estatus2026PolizaResponsabilidadCivilField && !estatus2026GarantiaCalidadField) {
      return {
        pendingCount: 0,
        garantiaMissingCount: 0,
        polizaMissingCount: 0,
        calidadMissingCount: 0,
        allMissingCount: 0,
      };
    }

    let pendingCount = 0;
    let garantiaMissingCount = 0;
    let polizaMissingCount = 0;
    let calidadMissingCount = 0;
    let allMissingCount = 0;

    filteredEstatus2026Data.forEach((row) => {
      const state = getEstatus2026PaymentRequirementState(row as Record<string, any>);
      if (state.readyForPayment) return;

      pendingCount += 1;
      if (!state.garantiaOk) garantiaMissingCount += 1;
      if (!state.polizaOk) polizaMissingCount += 1;
      if (!state.calidadOk) calidadMissingCount += 1;
      if (!state.garantiaOk && !state.polizaOk && !state.calidadOk) allMissingCount += 1;
    });

    return {
      pendingCount,
      garantiaMissingCount,
      polizaMissingCount,
      calidadMissingCount,
      allMissingCount,
    };
  }, [
    estatus2026GarantiaCalidadField,
    estatus2026GarantiaCumplimientoField,
    estatus2026PolizaResponsabilidadCivilField,
    filteredEstatus2026Data,
    getEstatus2026PaymentRequirementState,
  ]);

  const displayedEstatus2026Rows = useMemo(() => {
    if (!estatus2026ServiceNameFieldSummary) {
      return filteredEstatus2026Data.map((row) => ({ row, groupKey: '', isPrimary: true, turnNumber: 1 }));
    }

    const grouped = new Map<string, Record<string, any>[]>();
    filteredEstatus2026Data.forEach((row) => {
      const key = buildConvenioGroupKey(row, estatus2026ServiceNameFieldSummary, estatus2026ClaveFieldSummary);
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    });

    const result: Array<{ row: Record<string, any>; groupKey: string; isPrimary: boolean; turnNumber: number }> = [];
    grouped.forEach((rows, key) => {
      const hasConvenioGroup = rows.some((row) =>
        Object.entries(row).some(([column, value]) => isConvenioColumnName(column) && getBooleanChecked(value))
      );
      // Collapse any group with >1 rows sharing the same clave+service name.
      // This handles properly-flagged convenios AND unflagged duplicates created when
      // the convenio_modificatorio flag wasn't persisted on the original row.
      const shouldCollapseGroup = rows.length > 1;

      if (!shouldCollapseGroup) {
        rows.forEach((row) => {
          result.push({ row, groupKey: '', isPrimary: true, turnNumber: 1 });
        });
        return;
      }

      // Sort so the row with convenio_modificatorio=true (the original) is always first.
      const sortedRows = [...rows].sort((a, b) => {
        const aIsConvenio = Object.entries(a).some(([col, val]) => isConvenioColumnName(col) && getBooleanChecked(val));
        const bIsConvenio = Object.entries(b).some(([col, val]) => isConvenioColumnName(col) && getBooleanChecked(val));
        if (aIsConvenio && !bIsConvenio) return -1;
        if (!aIsConvenio && bIsConvenio) return 1;
        // Secondary: sort by id ascending so original (lower id) comes first
        const aId = typeof a.id === 'number' ? a.id : parseFloat(String(a.id ?? '0'));
        const bId = typeof b.id === 'number' ? b.id : parseFloat(String(b.id ?? '0'));
        return aId - bId;
      });

      sortedRows.forEach((row, index) => {
        if (index === 0 || expandedEstatus2026Convenio[key]) {
          result.push({ row, groupKey: key, isPrimary: index === 0, turnNumber: index + 1 });
        }
      });
    });

    return result;
  }, [estatus2026ClaveFieldSummary, estatus2026ServiceNameFieldSummary, expandedEstatus2026Convenio, filteredEstatus2026Data]);

  const estatus2026SubdirFieldSummary = useMemo(() => (
    findColumnByFragments(estatus2026TableColumns, ['subdireccion', 'subdirección', 'subdir'])
  ), [estatus2026TableColumns]);

  const estatus2026GerenciaFieldSummary = useMemo(() => (
    findColumnByFragments(estatus2026TableColumns, ['gerencia'])
  ), [estatus2026TableColumns]);

  const estatus2026MontoFieldSummary = useMemo(() => (
    findColumnByFragments(estatus2026TableColumns, ['monto', 'importe', 'total', 'presupuesto', 'costo', 'adjudicado', 'estimado'])
  ), [estatus2026TableColumns]);

  const estatus2026PhaseDistribution = useMemo(() => {
    if (!estatus2026Data.length) return [] as { name: string; value: number }[];
    const counts: Record<string, number> = {};
    estatus2026Data.forEach((row) => {
      const raw = estatus2026StatusFieldSummary ? row[estatus2026StatusFieldSummary] : null;
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        counts['Sin fase'] = (counts['Sin fase'] ?? 0) + 1;
        return;
      }
      // Use raw value from 'Fase' column as-is (capitalize first letter for display consistency)
      const label = String(raw).trim();
      const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
      counts[displayLabel] = (counts[displayLabel] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [estatus2026Data, estatus2026StatusFieldSummary]);

  // Column that holds the 'estatus' value (distinct from 'fase')
  const estatus2026EstatusColumnField = useMemo(() => {
    if (!estatus2026TableColumns.length) return null;
    // Exact match first (column literally named 'Estatus', 'estatus', etc.)
    const exactEstatus = estatus2026TableColumns.find(col => col.toLowerCase() === 'estatus');
    if (exactEstatus) return exactEstatus;
    // Fuzzy fallback: contains 'estatus' or 'status' but NOT 'fase'
    for (const col of estatus2026TableColumns) {
      const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
      if ((norm.includes('estatus') || norm.includes('status')) && !norm.includes('fase')) return col;
    }
    return null;
  }, [estatus2026TableColumns]);

  // Normalize a raw status value to one of the 7 canonical options (or 'Sin estatus')
  const normalizeEstatus2026Value = (raw: any): string => {
    if (raw === null || raw === undefined || String(raw).trim() === '') return 'Sin estatus';
    const val = String(raw).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (val.includes('cancelad') || val.includes('cancelar')) return 'Cancelado';
    if (val.includes('pausad') || val.includes('pausa')) return 'Pausado';
    if (val.includes('adjudicad') || val.includes('contratad')) return 'Adjudicado';
    if (val.includes('publicaci') || val.includes('compras mx') || val.includes('publicada')) return 'En proceso de publicación';
    if (val.includes('investigaci') || val.includes('investigacion')) return 'En investigación de mercado';
    if (val.includes('defensa') || val.includes('revision')) return 'En revisión de Defensa';
    if (val.includes('elaboraci') || val.includes('anexo') || val.includes('apendice') || val.includes('tecnico') || val.includes('ficha')) return 'Elaboración de anexo técnico, administrativo y apéndices';
    return 'Sin estatus';
  };

  const estatus2026EstatusDistribution = useMemo(() => {
    if (!estatus2026Data.length || !estatus2026EstatusColumnField) return [] as { name: string; value: number }[];
    const counts: Record<string, number> = {};
    // Pre-seed all canonical options at 0 so they always appear
    ESTATUS_2026_OPTIONS.forEach((opt) => { counts[opt] = 0; });
    counts['Sin estatus'] = 0;
    estatus2026Data.forEach((row) => {
      const raw = row[estatus2026EstatusColumnField];
      const label = normalizeEstatus2026Value(raw);
      counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [estatus2026Data, estatus2026EstatusColumnField]);

  const estatus2026TotalMonto = useMemo(() => {
    if (!estatus2026Data.length || !estatus2026MontoFieldSummary) return 0;
    return estatus2026Data.reduce((acc, row) => {
      const val = parseNumericValue(row[estatus2026MontoFieldSummary!]);
      return acc + (Number.isFinite(val) ? val : 0);
    }, 0);
  }, [estatus2026Data, estatus2026MontoFieldSummary]);

  const estatus2026GerenciaDistribution = useMemo(() => {
    if (!estatus2026Data.length || !estatus2026GerenciaFieldSummary) return [] as { name: string; value: number }[];
    const counts: Record<string, number> = {};
    estatus2026Data.forEach((row) => {
      const raw = row[estatus2026GerenciaFieldSummary!];
      if (!raw) return;
      const rawLabel = String(raw).trim();
      if (!rawLabel) return;
      // Restore accents on common Spanish proper-name words stored without them in the DB
      const ACCENT_MAP: [RegExp, string][] = [
        [/\bAeronautica\b/gi, 'Aeronáutica'],
        [/\bElectromecanica\b/gi, 'Electromecánica'],
        [/\bElectromecanico\b/gi, 'Electromecánico'],
        [/\bIngenieria\b/gi, 'Ingeniería'],
        [/\bGerencia\b/gi, 'Gerencia'],
        [/\bDistribucion\b/gi, 'Distribución'],
        [/\bGeneracion\b/gi, 'Generación'],
        [/\bOperacion\b/gi, 'Operación'],
        [/\bOperaciones\b/gi, 'Operaciones'],
        [/\bSeguridad\b/gi, 'Seguridad'],
        [/\bAdministracion\b/gi, 'Administración'],
        [/\bMedico\b/gi, 'Médico'],
        [/\bTecnico\b/gi, 'Técnico'],
        [/\bTecnica\b/gi, 'Técnica'],
        [/\bJuridica\b/gi, 'Jurídica'],
        [/\bJuridico\b/gi, 'Jurídico'],
        [/\bEconomia\b/gi, 'Economía'],
        [/\bGestion\b/gi, 'Gestión'],
        [/\bComunicacion\b/gi, 'Comunicación'],
      ];
      const label = ACCENT_MAP.reduce((s, [re, rep]) => s.replace(re, rep), rawLabel);
      counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [estatus2026Data, estatus2026GerenciaFieldSummary]);

  const estatus2026KPIs = useMemo(() => {
    const total = estatus2026Data.length;
    const uniqueStatuses = estatus2026EstatusDistribution.length;
    const adjudicados = estatus2026EstatusDistribution.find(d =>
      d.name.toLowerCase().includes('adjudicad') || d.name.toLowerCase().includes('contratad')
    )?.value ?? 0;
    const procedimiento = estatus2026EstatusDistribution.find(d =>
      d.name.toLowerCase().includes('procedimiento') || d.name.toLowerCase().includes('contratacion')
    )?.value ?? 0;
    return { total, uniqueStatuses, adjudicados, procedimiento };
  }, [estatus2026Data, estatus2026EstatusDistribution]);

  const pagos2026MonthlyFlow = useMemo(() => {
    if (!pagos2026Data.length) return [] as { name: string; value: number }[];
    const monthKeys = [
      { short: 'Ene.', label: 'Ene' },
      { short: 'Feb.', label: 'Feb' },
      { short: 'Mar.', label: 'Mar' },
      { short: 'Abr.', label: 'Abr' },
      { short: 'May.', label: 'May' },
      { short: 'Jun.', label: 'Jun' },
      { short: 'Jul.', label: 'Jul' },
      { short: 'Ago.', label: 'Ago' },
      { short: 'Sept.', label: 'Sep' },
      { short: 'Oct.', label: 'Oct' },
      { short: 'Nov.', label: 'Nov' },
      { short: 'Dic.', label: 'Dic' },
    ];
    return monthKeys.map(({ short, label }) => {
      let total = 0;
      pagos2026Data.forEach((row) => {
        Object.entries(row).forEach(([col, val]) => {
          const normCol = col.toLowerCase();
          if (normCol.startsWith(short.toLowerCase().replace('.', '')) || normCol.includes(short.toLowerCase())) {
            const n = parseNumericValue(val);
            if (Number.isFinite(n)) total += n;
          }
        });
      });
      return { name: label, value: total };
    }).filter(m => m.value > 0);
  }, [pagos2026Data]);

  const pagos2026TotalAmount = useMemo(() => (
    pagos2026MonthlyFlow.reduce((acc, m) => acc + m.value, 0)
  ), [pagos2026MonthlyFlow]);

  // ── END RESUMEN 2026 ──────────────────────────────────────────────────────

  // ── EXTRA ANALYSIS MEMOS ──────────────────────────────────────────────────

  // 2026 estatus_2026 — subdirección distribution
  const estatus2026SubdirDistribution = useMemo(() => {
    if (!estatus2026Data.length || !estatus2026SubdirFieldSummary) return [] as { name: string; value: number }[];
    const counts: Record<string, number> = {};
    estatus2026Data.forEach(row => {
      const raw = row[estatus2026SubdirFieldSummary!];
      if (!raw) return;
      const label = String(raw).trim();
      if (label) counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [estatus2026Data, estatus2026SubdirFieldSummary]);

  // 2026 estatus_2026 — monto (presupuesto) by gerencia
  const estatus2026MontoByGerencia = useMemo(() => {
    if (!estatus2026Data.length || !estatus2026GerenciaFieldSummary || !estatus2026MontoFieldSummary) return [] as { name: string; value: number }[];
    const ACCENTS: [RegExp, string][] = [
      [/\bAeronautica\b/gi, 'Aeronáutica'], [/\bElectromecanica\b/gi, 'Electromecánica'],
      [/\bIngenieria\b/gi, 'Ingeniería'], [/\bDistribucion\b/gi, 'Distribución'],
      [/\bGeneracion\b/gi, 'Generación'], [/\bOperacion\b/gi, 'Operación'],
      [/\bAdministracion\b/gi, 'Administración'], [/\bTecnico\b/gi, 'Técnico'],
      [/\bTecnica\b/gi, 'Técnica'], [/\bJuridica\b/gi, 'Jurídica'],
      [/\bGestion\b/gi, 'Gestión'], [/\bComunicacion\b/gi, 'Comunicación'],
    ];
    const totals: Record<string, number> = {};
    estatus2026Data.forEach(row => {
      const rawG = row[estatus2026GerenciaFieldSummary!];
      if (!rawG) return;
      const label = ACCENTS.reduce((s, [re, rep]) => s.replace(re, rep), String(rawG).trim());
      const monto = parseNumericValue(row[estatus2026MontoFieldSummary!]);
      if (Number.isFinite(monto) && monto > 0) {
        totals[label] = (totals[label] ?? 0) + monto;
      }
    });
    return Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [estatus2026Data, estatus2026GerenciaFieldSummary, estatus2026MontoFieldSummary]);

  // 2026 estatus_2026 — completion rate of key boolean columns
  const estatus2026BooleanCompletion = useMemo(() => {
    if (!estatus2026Data.length || !estatus2026TableColumns.length) return [] as { name: string; done: number; pending: number; pct: number }[];
    const total = estatus2026Data.length;
    const targets = [
      { fragment: 'investigacion', label: 'Inv. de Mercado' },
      { fragment: 'suficiencia', label: 'Suficiencia Presup.' },
      { fragment: 'procedimiento de contratacion', label: 'Proc. de Contratación' },
      { fragment: 'anticipo', label: 'Anticipo' },
      { fragment: 'convenio', label: 'Convenio' },
      { fragment: 'plurianual', label: 'Plurianual' },
      { fragment: 'validado', label: 'Validado' },
    ];
    const results: { name: string; done: number; pending: number; pct: number }[] = [];
    targets.forEach(({ fragment, label }) => {
      const col = estatus2026TableColumns.find(c => normalizeAnnualKey(c).includes(fragment));
      if (!col) return;
      const allNull = estatus2026Data.every(r => r[col] === null || r[col] === undefined);
      if (allNull) return;
      const done = estatus2026Data.filter(r => getBooleanChecked(r[col])).length;
      results.push({ name: label, done, pending: total - done, pct: Math.round((done / total) * 100) });
    });
    return results;
  }, [estatus2026Data, estatus2026TableColumns]);

  // ── END EXTRA ANALYSIS MEMOS ──────────────────────────────────────────────

  // PAGOS 2026 TABLE CONFIGURATION

  const pagos2026TableColumns = useMemo(() => {
    if (!pagos2026Data.length) return [] as string[];

    const priorityMap = new Map<string, number>();
    pagos2026PreferredOrderHints.forEach((synonyms, index) => {
        synonyms.forEach((label) => {
            priorityMap.set(normalizeAnnualKey(label), index);
        });
    });

    const columns = new Set<string>();
    pagos2026Data.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => {
        if (key && !shouldSkipColumnForForm(key)) columns.add(key);
      });
    });

    const getParentColumnFor = (col: string): string | null => {
        const norm = col.toLowerCase();
        if (norm.includes('ene.') || norm.includes('enero')) return 'Ene.';
        if (norm.includes('feb.') || norm.includes('febrero')) return 'Feb.';
        if (norm.includes('mar.') || norm.includes('marzo')) return 'Mar.';
        if (norm.includes('abr.') || norm.includes('abril')) return 'Abr.';
        if (norm.includes('may.') || norm.includes('mayo')) return 'May.';
        if (norm.includes('jun.') || norm.includes('junio')) return 'Jun.';
        if (norm.includes('jul.') || norm.includes('julio')) return 'Jul.';
        if (norm.includes('ago.') || norm.includes('agosto')) return 'Ago.';
        if (norm.includes('sept.') || norm.includes('sep.') || norm.includes('septiembre')) return 'Sept.';
        if (norm.includes('oct.') || norm.includes('octubre')) return 'Oct.';
        if (norm.includes('nov.') || norm.includes('noviembre')) return 'Nov.';
        if (norm.includes('dic.') || norm.includes('diciembre')) return 'Dic.';
        return null;
    };

    const parentMonths = new Set(['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sept.', 'Sep.', 'Oct.', 'Nov.', 'Dic.']);

    return Array.from(columns)
      .filter(col => {
          if (parentMonths.has(col)) return true;
          const parent = getParentColumnFor(col);
          if (parent && parentMonths.has(parent)) {
              if (col === parent) return true;
              return pagos2026ExpandedMonths.has(parent);
          }
          return true;
      })
      .sort((a, b) => {
      const normalizedA = normalizeAnnualKey(a);
      const normalizedB = normalizeAnnualKey(b);
      const priorityA = priorityMap.get(normalizedA);
      const priorityB = priorityMap.get(normalizedB);

      if (priorityA !== undefined && priorityB !== undefined && priorityA !== priorityB) {
          return priorityA - priorityB;
      }
      if (priorityA !== undefined && priorityB === undefined) return -1;
      if (priorityB !== undefined && priorityA === undefined) return 1;
       return normalizedA.localeCompare(normalizedB);
    });
  }, [pagos2026Data, pagos2026ExpandedMonths]);

  const pagos2026StickyDefinitions = [
    { id: 'id', match: ['id', 'ID', 'Id', 'no.', 'numero'], width: 90 },
  ];

  const pagos2026StickyInfo = useMemo(() => {
    const meta = new Map<string, { left: number; width: number }>();
    const order: string[] = [];
    let left = 0;

    pagos2026StickyDefinitions.forEach((definition) => {
      const matchedColumn = pagos2026TableColumns.find((col) => {
         const normCol = normalizeAnnualKey(col);
         return definition.match.some((m) => normalizeAnnualKey(m) === normCol);
      });

      if (matchedColumn) {
        meta.set(matchedColumn, { left, width: definition.width });
        order.push(matchedColumn);
        left += definition.width;
      }
    });

    return { meta, order };
  }, [pagos2026TableColumns]);

  const pagos2026LastStickyKey = useMemo(() => {
        if (pagos2026StickyInfo.order.length === 0) return null;
        return pagos2026StickyInfo.order[pagos2026StickyInfo.order.length - 1];
  }, [pagos2026StickyInfo]);

  const pagos2026ColumnMeta = useMemo(() => {
    const meta = new Map<string, {
        isBoolean: boolean;
        isDate: boolean;
        isHighlighted: boolean;
        isMonthRelated: boolean;
        isNotaCredito: boolean;
        stickyConfig?: { left: number; width: number };
        isLastSticky: boolean;
    }>();

    const monthTokens = ['ene', 'enero', 'feb', 'febrero', 'mar', 'marzo', 'abr', 'abril', 'may', 'mayo', 'jun', 'junio', 'jul', 'julio', 'ago', 'agosto', 'sep', 'sept', 'septiembre', 'oct', 'octubre', 'nov', 'noviembre', 'dic', 'diciembre'];

    pagos2026TableColumns.forEach(column => {
        const norm = normalizeAnnualKey(column);

        // Boolean Detection
        let isBoolean = false; 
        const explicitBooleans = ['pagado', 'validado', 'autorizado', 'anticipo', 'finiquito', 'complemento de pago', 'complemento', 'si/no', 'si no'];
        const explicitNonBooleans = ['ene', 'enero', 'feb', 'febrero', 'mar', 'marzo', 'abr', 'abril', 'may', 'mayo', 'jun', 'junio', 'jul', 'julio', 'ago', 'agosto', 'sep', 'septiembre', 'oct', 'octubre', 'nov', 'noviembre', 'dic', 'diciembre'];
        
        if (explicitBooleans.some(k => norm.includes(k))) {
            isBoolean = true;
        }
        if (!isBoolean) {
          const hasBooleanLike = pagos2026Data.some((row) => isBooleanLikeValue(row?.[column]));
          if (hasBooleanLike) isBoolean = true;
        }
        if (isBoolean && explicitNonBooleans.some(k => norm === k || norm.startsWith(`${k} `) && !norm.includes('si no'))) {
            isBoolean = false;
        }

        // Date Detection
        let isDate = false;
        if (!isBoolean) {
            const dateKeywords = ['fecha', 'vigencia', 'emision', 'vencimiento'];
             if (dateKeywords.some(k => norm.includes(k))) isDate = true;
        }

        // Month-related: month totals, preventivos, correctivos, nota de crédito
        const isMonthRelated = !isBoolean && !isDate && (
            monthTokens.some(t => norm === t || norm === `${t}.` || norm.startsWith(`${t} `) || norm.startsWith(`${t}.`)) ||
            norm.includes('preventivo') ||
            norm.includes('correctivo') ||
            (norm.includes('nota') && (norm.includes('credito') || norm.includes('crédito')))
        );

        // Nota de Crédito → rojo como la tabla 2025
        const isNotaCredito = norm.includes('nota') && (norm.includes('credito') || norm.includes('crédito'));

        // Determine which parent month this sub-column belongs to (null for parent months and non-month columns)
        const parentMonthKeys = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sept.', 'Oct.', 'Nov.', 'Dic.'];
        // Use column.toLowerCase() (NOT normalizeAnnualKey) so dots are preserved in fragment matching
        const colLower = column.toLowerCase();
        const parentMonthFragments: Array<[string, string[]]> = [
          ['Ene.', ['ene.', 'enero']],   ['Feb.', ['feb.', 'febrero']],  ['Mar.', ['mar.', 'marzo']],
          ['Abr.', ['abr.', 'abril']],   ['May.', ['may.', 'mayo']],     ['Jun.', ['jun.', 'junio']],
          ['Jul.', ['jul.', 'julio']],   ['Ago.', ['ago.', 'agosto']],   ['Sept.', ['sept.', 'sep.', 'septiembre']],
          ['Oct.', ['oct.', 'octubre']], ['Nov.', ['nov.', 'noviembre']], ['Dic.', ['dic.', 'diciembre']],
        ];
        let parentMonth: string | null = null;
        if (!parentMonthKeys.includes(column)) {
          for (const [pk, frags] of parentMonthFragments) {
            if (frags.some(f => colLower.includes(f))) { parentMonth = pk; break; }
          }
        }

        meta.set(column, {
            isBoolean,
            isDate,
            isHighlighted: false,
            isMonthRelated,
            isNotaCredito,
            parentMonth,
            stickyConfig: pagos2026StickyInfo.meta.get(column),
            isLastSticky: pagos2026LastStickyKey === column
        });
    });
    return meta;
  }, [pagos2026TableColumns, pagos2026StickyInfo, pagos2026LastStickyKey, pagos2026Data]);

  const pagos2026ServiceFieldSummary = useMemo(() => (
    findColumnByFragments(pagos2026TableColumns, ['objeto del contrato', 'nombre del servicio', 'servicio', 'objeto', 'concepto'])
  ), [pagos2026TableColumns]);

  const pagos2026MontoMaxFieldSummary = useMemo(() => (
    findColumnByFragments(pagos2026TableColumns, ['Mont. Max.', 'monto maximo contrato', 'mont. max.', 'monto maximo', 'monto max', 'monto maximo 2026', 'monto maximo 2025', 'monto maximo 2024'])
  ), [pagos2026TableColumns]);

  const pagos2026MonthColumns = useMemo(() => {
    const defs = [
      { label: 'Enero', tokens: ['ene', 'enero'] },
      { label: 'Febrero', tokens: ['feb', 'febrero'] },
      { label: 'Marzo', tokens: ['mar', 'marzo'] },
      { label: 'Abril', tokens: ['abr', 'abril'] },
      { label: 'Mayo', tokens: ['may', 'mayo'] },
      { label: 'Junio', tokens: ['jun', 'junio'] },
      { label: 'Julio', tokens: ['jul', 'julio'] },
      { label: 'Agosto', tokens: ['ago', 'agosto'] },
      { label: 'Septiembre', tokens: ['sep', 'sept', 'septiembre'] },
      { label: 'Octubre', tokens: ['oct', 'octubre'] },
      { label: 'Noviembre', tokens: ['nov', 'noviembre'] },
      { label: 'Diciembre', tokens: ['dic', 'diciembre'] },
    ];

    const exclusions = ['preventivo', 'correctivo', 'nota', 'credito', 'complemento', 'observacion'];

    const pickColumn = (tokens: string[]) => {
      const candidates = pagos2026TableColumns
        .map((col) => {
          const norm = normalizeAnnualKey(col);
          if (exclusions.some((x) => norm.includes(x))) return null;

          let score = 0;
          tokens.forEach((token, idx) => {
            if (norm === token) score = Math.max(score, 100 - idx);
            else if (norm.startsWith(`${token} `) || norm.endsWith(` ${token}`) || norm.includes(` ${token} `)) score = Math.max(score, 80 - idx);
            else if (norm.includes(token)) score = Math.max(score, 60 - idx);
          });

          if (score === 0) return null;
          return { col, score, len: norm.length };
        })
        .filter(Boolean) as { col: string; score: number; len: number }[];

      if (!candidates.length) return null;
      candidates.sort((a, b) => (b.score - a.score) || (a.len - b.len));
      return candidates[0].col;
    };

    return defs.map((def) => ({ label: def.label, column: pickColumn(def.tokens) }));
  }, [pagos2026TableColumns]);

  const pagos2026ServicePaymentProgress = useMemo(() => {
    if (!pagos2026Data.length) return [] as Array<{
      key: string;
      service: string;
      paid: number;
      total: number;
      pct: number;
      pctRaw: number;
      monthly: Array<{ month: string; value: number }>;
    }>;

    // For each month, find sub-columns (preventivos, correctivos, nota) and parent total column
    const monthDefs = [
      { label: 'Enero',      fragments: ['ene.', 'enero'],       parentKey: 'Ene.'  },
      { label: 'Febrero',    fragments: ['feb.', 'febrero'],     parentKey: 'Feb.'  },
      { label: 'Marzo',      fragments: ['mar.', 'marzo'],       parentKey: 'Mar.'  },
      { label: 'Abril',      fragments: ['abr.', 'abril'],       parentKey: 'Abr.'  },
      { label: 'Mayo',       fragments: ['may.', 'mayo'],        parentKey: 'May.'  },
      { label: 'Junio',      fragments: ['jun.', 'junio'],       parentKey: 'Jun.'  },
      { label: 'Julio',      fragments: ['jul.', 'julio'],       parentKey: 'Jul.'  },
      { label: 'Agosto',     fragments: ['ago.', 'agosto'],      parentKey: 'Ago.'  },
      { label: 'Septiembre', fragments: ['sept.', 'sep.', 'septiembre'], parentKey: 'Sept.' },
      { label: 'Octubre',    fragments: ['oct.', 'octubre'],     parentKey: 'Oct.'  },
      { label: 'Noviembre',  fragments: ['nov.', 'noviembre'],   parentKey: 'Nov.'  },
      { label: 'Diciembre',  fragments: ['dic.', 'diciembre'],   parentKey: 'Dic.'  },
    ];

    // Pre-compute column keys for each month's sub-columns (use toLowerCase to preserve dots)
    const resolvedMonths = monthDefs.map(({ label, fragments, parentKey }) => {
      const colL = (col: string) => col.toLowerCase();
      const isThisMonth = (col: string) => fragments.some(f => colL(col).includes(f));
      const prevCol   = pagos2026TableColumns.find(c => isThisMonth(c) && colL(c).includes('preventivo')) ?? null;
      const corrCol   = pagos2026TableColumns.find(c => isThisMonth(c) && colL(c).includes('correctivo')) ?? null;
      const notaCol   = pagos2026TableColumns.find(c => isThisMonth(c) && (colL(c).includes('nota') || colL(c).includes('crédito') || colL(c).includes('credito'))) ?? null;
      const parentCol = pagos2026TableColumns.find(c => c === parentKey) ?? null;
      return { label, prevCol, corrCol, notaCol, parentCol };
    });

    const parseNum = (v: any): number => {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    return pagos2026Data.map((row, index) => {
      const serviceValue = pagos2026ServiceFieldSummary ? row[pagos2026ServiceFieldSummary] : null;
      const contractRef = String(row['No. Contrato'] ?? row['No contrato'] ?? row['No. de contrato'] ?? '').trim();
      const service = String(serviceValue ?? '').trim() || (contractRef ? `Contrato ${contractRef}` : `Servicio ${index + 1}`);

      const total = parseNumericValue(pagos2026MontoMaxFieldSummary ? row[pagos2026MontoMaxFieldSummary] : null);

      // For each month: prefer sub-column sum (most accurate); fall back to parent total if sub-columns absent
      const monthly = resolvedMonths.map(({ label, prevCol, corrCol, notaCol, parentCol }) => {
        const prev = parseNum(prevCol ? row[prevCol] : 0);
        const corr = parseNum(corrCol ? row[corrCol] : 0);
        const nota = parseNum(notaCol ? row[notaCol] : 0);
        const subTotal = prev + corr - nota;
        // If at least one sub-column has data, use the computed sub-total; otherwise use parent total
        const hasSubData = prev !== 0 || corr !== 0 || nota !== 0;
        const parentVal = parseNum(parentCol ? row[parentCol] : 0);
        const value = hasSubData ? subTotal : parentVal;
        return { month: label, value: Math.max(0, value) };
      });

      const paid = monthly.reduce((acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0), 0);

      const pctRaw = total > 0 ? (paid / total) * 100 : 0;
      const pct = Math.max(0, Math.min(100, pctRaw));

      const key = String(extractPagosRowId(row) ?? contractRef ?? index);

      return {
        key,
        service,
        paid,
        total,
        pct,
        pctRaw,
        monthly,
      };
    }).sort((a, b) => b.paid - a.paid);
  }, [pagos2026Data, pagos2026ServiceFieldSummary, pagos2026MontoMaxFieldSummary, pagos2026TableColumns]);

  const pagos2026ProgressTotals = useMemo(() => {
    const totalToPay = pagos2026ServicePaymentProgress.reduce((acc, row) => acc + row.total, 0);
    const totalPaid = pagos2026ServicePaymentProgress.reduce((acc, row) => acc + row.paid, 0);
    const pct = totalToPay > 0 ? (totalPaid / totalToPay) * 100 : 0;
    return { totalToPay, totalPaid, pct };
  }, [pagos2026ServicePaymentProgress]);

  // ── REPORTES: Gasto Efectuado 2026 ───────────────────────────────────────
  const REPORTE_MONTH_DEFS = [
    { label: 'Ene',  frags: ['ene.', 'enero']     },
    { label: 'Feb',  frags: ['feb.', 'febrero']   },
    { label: 'Mar',  frags: ['mar.', 'marzo']     },
    { label: 'Abr',  frags: ['abr.', 'abril']     },
    { label: 'May',  frags: ['may.', 'mayo']      },
    { label: 'Jun',  frags: ['jun.', 'junio']     },
    { label: 'Jul',  frags: ['jul.', 'julio']     },
    { label: 'Ago',  frags: ['ago.', 'agosto']    },
    { label: 'Sep',  frags: ['sept.', 'sep.', 'septiembre'] },
    { label: 'Oct',  frags: ['oct.', 'octubre']   },
    { label: 'Nov',  frags: ['nov.', 'noviembre'] },
    { label: 'Dic',  frags: ['dic.', 'diciembre'] },
  ] as const;

  const gastoEfectuado2026Data = useMemo(() => {
    if (!pagos2026Data.length) return [] as Array<{
      key: string; noContrato: string; objeto: string; proveedor: string;
      fechaInicio: string; fechaTermino: string; montMax: number;
      monthly: Array<{ label: string; amount: number; pctMensual: number; pctAcum: number }>;
      totalPagado: number; pctTotal: number;
    }>;

    const allCols = Object.keys(pagos2026Data[0] ?? {});
    const findFixed = (fragments: string[]) =>
      allCols.find(c => fragments.some(f => c.toLowerCase() === f.toLowerCase())) ??
      allCols.find(c => fragments.some(f => c.toLowerCase().includes(f.toLowerCase())));

    const noContratoCol = findFixed(['No. Contrato', 'no_contrato', 'No contrato']);
    const proveedorCol  = findFixed(['Proveedor']);
    const fechaIniCol   = findFixed(['Fecha de inicio', 'fecha_de_inicio']);
    const fechaFinCol   = findFixed(['Fecha de termino', 'fecha_de_termino', 'Fecha de término']);
    const montMaxCol    = pagos2026MontoMaxFieldSummary;
    const objetoCol     = pagos2026ServiceFieldSummary;

    const excls = ['preventivo', 'correctivo', 'nota', 'complemento', 'observacion', 'credito', 'crédito', 'si/no'];
    const resolvedCols = REPORTE_MONTH_DEFS.map(({ label, frags }) => {
      const cL = (c: string) => c.toLowerCase();
      const isMonth = (c: string) => frags.some(f => cL(c).includes(f));
      const isExcl  = (c: string) => excls.some(x => cL(c).includes(x));
      const prevCol   = allCols.find(c => isMonth(c) && cL(c).includes('preventivo')) ?? null;
      const corrCol   = allCols.find(c => isMonth(c) && cL(c).includes('correctivo')) ?? null;
      const notaCol   = allCols.find(c => isMonth(c) && (cL(c).includes('nota') || cL(c).includes('crédito') || cL(c).includes('credito'))) ?? null;
      const parentCol = allCols.find(c => !isExcl(c) && isMonth(c)) ?? null;
      return { label, prevCol, corrCol, notaCol, parentCol };
    });

    const pNum = (v: any): number => {
      if (v == null || v === '') return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    return pagos2026Data.map((row, idx) => {
      const montMax = pNum(montMaxCol ? row[montMaxCol] : null);
      let cumulative = 0;
      const monthly = resolvedCols.map(({ label, prevCol, corrCol, notaCol, parentCol }) => {
        const prev = pNum(prevCol ? row[prevCol] : 0);
        const corr = pNum(corrCol ? row[corrCol] : 0);
        const nota = pNum(notaCol ? row[notaCol] : 0);
        const subTotal = prev + corr - nota;
        const hasSubData = prev !== 0 || corr !== 0 || nota !== 0;
        const parentVal = pNum(parentCol ? row[parentCol] : 0);
        const amount = Math.max(0, hasSubData ? subTotal : parentVal);
        cumulative += amount;
        const pctMensual = montMax > 0 ? (amount / montMax) * 100 : 0;
        const pctAcum = montMax > 0 ? (cumulative / montMax) * 100 : 0;
        return { label, amount, pctMensual, pctAcum };
      });
      const totalPagado = monthly.reduce((acc, m) => acc + m.amount, 0);
      const pctTotal = montMax > 0 ? (totalPagado / montMax) * 100 : 0;
      return {
        key: String(extractPagosRowId(row) ?? idx),
        noContrato:   String(noContratoCol ? row[noContratoCol] ?? '' : '').trim(),
        objeto:       String(objetoCol     ? row[objetoCol]     ?? '' : '').trim(),
        proveedor:    String(proveedorCol  ? row[proveedorCol]  ?? '' : '').trim(),
        fechaInicio:  String(fechaIniCol   ? row[fechaIniCol]   ?? '' : '').trim(),
        fechaTermino: String(fechaFinCol   ? row[fechaFinCol]   ?? '' : '').trim(),
        montMax, monthly, totalPagado, pctTotal,
      };
    });
  }, [pagos2026Data, pagos2026MontoMaxFieldSummary, pagos2026ServiceFieldSummary]);
  // ── END REPORTES ──────────────────────────────────────────────────────────

  const serviciosStickyDefinitions = [
    { id: 'indice', match: ['id', 'no', 'no.', '#'], width: 90 },
    { id: 'clave', match: ['clave_cucop', 'clave cucop', 'clave servicio', 'clave'], width: 150 },
    { id: 'servicio', match: ['nombre_servicio', 'nombre del servicio', 'servicio', 'descripcion del servicio', 'concepto'], width: 360 },
  ];

  const serviciosTableColumns = useMemo(() => {
    if (!servicios2026Data.length) return [] as string[];

    const priorityMap = new Map<string, number>();
    serviciosPreferredOrderHints.forEach((synonyms, index) => {
      synonyms.forEach((label) => {
        priorityMap.set(normalizeAnnualKey(label), index);
      });
    });

    const columns = new Set<string>();
    servicios2026Data.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => {
        if (key) columns.add(key);
      });
    });

    return Array.from(columns).sort((a, b) => {
      const normalizedA = normalizeAnnualKey(a);
      const normalizedB = normalizeAnnualKey(b);
      const priorityA = priorityMap.get(normalizedA);
      const priorityB = priorityMap.get(normalizedB);

      if (priorityA !== undefined && priorityB !== undefined && priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      if (priorityA !== undefined && priorityB === undefined) return -1;
      if (priorityB !== undefined && priorityA === undefined) return 1;
      return normalizedA.localeCompare(normalizedB, 'es');
    });
  }, [servicios2026Data]);



  const serviciosColumnsToRender = useMemo(() => {
    if (!serviciosTableColumns.length) return [] as string[];
    // The servicios table renders action buttons in a separate {canManageRecords && <td>} block,
    // NOT inside the column map. Adding '__actions' here would create a ghost empty column.
    return [...serviciosTableColumns];
  }, [serviciosTableColumns]);

  const serviciosColumnCount = Math.max(serviciosColumnsToRender.length || serviciosTableColumns.length || 1, 1);

  const serviciosStickyInfo = useMemo(() => {
    const meta = new Map<string, { left: number; width: number }>();
    const order: string[] = [];
    let left = 0;

    serviciosStickyDefinitions.forEach((definition) => {
      const matchedColumn = serviciosTableColumns.find((column) => {
        const normalized = normalizeAnnualKey(column);
        return definition.match.some((target) => normalized === target);
      });

      if (matchedColumn) {
        meta.set(matchedColumn, { left, width: definition.width });
        order.push(matchedColumn);
        left += definition.width;
      }
    });

    return { meta, order };
  }, [serviciosTableColumns]);

  const serviciosLastStickyKey = serviciosStickyInfo.order[serviciosStickyInfo.order.length - 1];

  const compranetPreferredOrderHints = [
    ['id'],
    ['numero de procedimiento', 'numero procedimiento', 'procedimiento numero', 'numero_de_procedimiento', 'no de procedimiento', 'no procedimiento'],
    ['procedimiento', 'nombre del procedimiento', 'nombre procedimiento', 'procedimiento descripcion'],
    ['titulo', 'titulo convocatoria', 'titulo del procedimiento'],
    ['descripcion', 'descripcion del procedimiento', 'descripcion_procedimiento', 'descripcion convocatoria'],
    ['proveedor', 'proveedor ganador', 'proveedor nombre', 'razon social', 'nombre proveedor'],
    ['empresa', 'empresa participante', 'empresa ganadora', 'empresa proveedor'],
    ['dependencia', 'dependencia solicitante', 'unidad solicitante', 'unidad requisitante', 'unidad contratante', 'area solicitante', 'area contratante', 'direccion solicitante'],
    ['tipo de procedimiento', 'tipo procedimiento', 'modalidad', 'modalidad del procedimiento', 'tipo de contratacion', 'tipo contratacion'],
    ['estatus', 'estado', 'estatus procedimiento', 'status'],
    ['numero de contrato', 'numero contrato', 'no contrato'],
    ['fecha publicacion', 'fecha de publicacion', 'fecha_publicacion', 'fecha apertura', 'fecha fallo', 'fecha adjudicacion', 'fecha_de_apertura'],
    ['monto estimado', 'monto adjudicado', 'monto contratado', 'monto', 'importe', 'total', 'presupuesto', 'valor contratado', 'valor estimado'],
    ['observaciones', 'comentarios', 'notas', 'aclaraciones']
  ];

  const proceduresPreferredOrderHints = [
    ['id'],
    ['servicio', 'servicios', 'nombre del servicio', 'nombre del servicio.', 'descripcion del servicio', 'descripcion', 'actividad', 'servicio actividad'],
    ['tipo_servicio_adquisicion', 'tipo servicio adquisicion', 'tipo de servicio', 'tipo servicio', 'adquisicion'],
    ['tipo_contrato', 'tipo contrato'],
    ['administrador_contrato', 'administrador contrato', 'administrador_co', 'administrador del contrato'],
    ['gerencia'],
    ['subdireccion', 'sub direccion', 'sub-direccion'],
    ['responsable_gpyc', 'responsable gpyc', 'responsable g p y c', 'responsable seguimiento', 'responsable'],
    ['oficio_suficiencia_presupuestal', 'oficio suficiencia presupuestal'],
    ['monto_suficiencia_presupuestal', 'monto suficiencia presupuestal', 'monto_suficiencia'],
    ['paaas', 'paas', 'p a a s'],
    ['precio_prevaleciente_minimo_2025', 'precio prevaleciente minimo 2025', 'precio minimo 2025'],
    ['precio_prevaleciente_maximo_2025', 'precio prevaleciente maximo 2025', 'precio maximo 2025'],
    ['monto_maximo_adjudicado_2024', 'monto maximo adjudicado 2024'],
    ['monto_maximo_adjudicado_2025', 'monto maximo adjudicado 2025'],
    ['tipo_procedimiento', 'tipo procedimiento'],
    ['tipo_contratacion', 'tipo contratacion'],
    ['observacion', 'observaciones', 'comentarios', 'notas', 'detalle', 'hallazgos'],
    ['situacion', 'estatus', 'status', 'estado', 'avance', 'seguimiento', 'estatus seguimiento'],
    ['proveedor', 'empresa proveedor', 'empresa'],
    ['oficio_investigacion_mercado', 'oficio investigacion mercado'],
    ['ultima_revision', 'ultima revision', 'última revision', 'ultima_actualizacion', 'actualizacion'],
    ['documentacion_soporte', 'documentacion soporte', 'documentación soporte'],
    ['investigacion_mercado', 'investigacion mercado'],
    ['suficiencia_presupuestal', 'suficiencia presupuestal'],
    ['licitacion_publica', 'licitacion publica'],
    ['publicacion_convocatoria', 'publicacion convocatoria'],
    ['visita_instalaciones', 'visita instalaciones'],
    ['junta_aclaraciones', 'junta aclaraciones'],
    ['apertura_proposiciones', 'apertura proposiciones'],
    ['fallo'],
    ['diferimiento_fallo', 'diferimiento fallo'],
    ['area_responsable', 'area responsable'],
    ['area_tecnica', 'area tecnica'],
    ['contacto']
  ];

  const compranetTableColumns = useMemo(() => {
    if (!compranetData.length) return [] as string[];

    const priorityMap = new Map<string, number>();
    compranetPreferredOrderHints.forEach((synonyms, index) => {
      synonyms.forEach((label) => {
        priorityMap.set(normalizeAnnualKey(label), index);
      });
    });

    const columns = new Set<string>();
    compranetData.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => {
        if (key) columns.add(key);
      });
    });

    return Array.from(columns).sort((a, b) => {
      const normalizedA = normalizeAnnualKey(a);
      const normalizedB = normalizeAnnualKey(b);
      const priorityA = priorityMap.get(normalizedA);
      const priorityB = priorityMap.get(normalizedB);

      if (priorityA !== undefined && priorityB !== undefined && priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      if (priorityA !== undefined && priorityB === undefined) return -1;
      if (priorityB !== undefined && priorityA === undefined) return 1;
      return normalizedA.localeCompare(normalizedB, 'es');
    });
  }, [compranetData]);

  const compranetColumnsToRender = useMemo(() => {
    if (!compranetTableColumns.length) return [] as string[];
    return canManageRecords ? [...compranetTableColumns, '__actions'] : [...compranetTableColumns];
  }, [compranetTableColumns, canManageRecords]);

  const compranetColumnCount = Math.max(compranetColumnsToRender.length || compranetTableColumns.length || 1, 1);

  const proceduresTableColumns = useMemo(() => {
    if (!proceduresData.length) return [] as string[];

    const priorityMap = new Map<string, number>();
    proceduresPreferredOrderHints.forEach((synonyms, index) => {
      synonyms.forEach((label) => {
        priorityMap.set(normalizeAnnualKey(label), index);
      });
    });

    const columns = new Set<string>();
    proceduresData.forEach((row) => {
      if (!row) return;
      Object.keys(row).forEach((key) => {
        if (key) columns.add(key);
      });
    });

    return Array.from(columns).sort((a, b) => {
      const normalizedA = normalizeAnnualKey(a);
      const normalizedB = normalizeAnnualKey(b);
      const priorityA = priorityMap.get(normalizedA);
      const priorityB = priorityMap.get(normalizedB);

      if (priorityA !== undefined && priorityB !== undefined && priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      if (priorityA !== undefined && priorityB === undefined) return -1;
      if (priorityB !== undefined && priorityA === undefined) return 1;
      return normalizedA.localeCompare(normalizedB, 'es');
    });
  }, [proceduresData]);

  const proceduresColumnsToRender = useMemo(() => {
    if (!proceduresTableColumns.length) return [] as string[];
    return canManageRecords ? [...proceduresTableColumns, '__actions'] : [...proceduresTableColumns];
  }, [proceduresTableColumns, canManageRecords]);

  const proceduresColumnCount = Math.max(proceduresColumnsToRender.length || proceduresTableColumns.length || 1, 1);

  const paasTableColumns = useMemo(() => {
    return paasTableConfig.columns.map((c) => c.key);
  }, [paasTableConfig]);

  const paymentsTableColumns = useMemo(() => {
    if (!paymentsData.length) return [] as string[];
    const seen = new Set<string>();
    const allColumns: string[] = [];
    paymentsData.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          allColumns.push(key);
        }
      });
    });
    return allColumns.sort();
  }, [paymentsData]);

  const pendingOctTableColumns = useMemo(() => {
    if (!procedureStatuses.length) return [] as string[];
    const seen = new Set<string>();
    const allColumns: string[] = [];
    procedureStatuses.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          allColumns.push(key);
        }
      });
    });
    return allColumns.sort();
  }, [procedureStatuses]);

  const serviciosMonetaryColumns = useMemo(() => {
    if (!serviciosTableColumns.length) return [] as string[];
    const tokens = ['monto', 'importe', 'total', 'presupuesto', 'costo', 'pago', 'modificado'];
    return serviciosTableColumns.filter((column) => {
      const normalized = normalizeAnnualKey(column);
      return tokens.some((token) => normalized.includes(token));
    });
  }, [serviciosTableColumns]);

  const serviciosMonetaryTotals = useMemo(() => {
    if (!serviciosMonetaryColumns.length || !servicios2026Data.length) {
      return [] as { key: string; value: number }[];
    }
    const totals = serviciosMonetaryColumns.map((column) => {
      const sum = servicios2026Data.reduce((acc, row) => acc + parseNumericValue(row?.[column]), 0);
      return { key: column, value: sum };
    });
    return totals
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [serviciosMonetaryColumns, servicios2026Data]);

  const serviciosPrimaryMetric = serviciosMonetaryTotals[0] ?? null;
  const serviciosSecondaryMetric = serviciosMonetaryTotals[1] ?? null;

  const serviciosCategoryField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['gerencia', 'subdireccion', 'area', 'direccion', 'categoria', 'clasificacion', 'estatus', 'status'])
  ), [serviciosTableColumns]);

  const serviciosCategoryBreakdown = useMemo(() => {
    if (!servicios2026Data.length || !serviciosCategoryField) return [] as { name: string; value: number }[];
    const metricKey = serviciosPrimaryMetric?.key ?? null;
    const buckets = new Map<string, number>();

    servicios2026Data.forEach((row) => {
      const rawLabel = row?.[serviciosCategoryField];
      const label = normalizeWhitespace(String(rawLabel ?? 'Sin categoría')) || 'Sin categoría';
      const increment = metricKey ? parseNumericValue(row?.[metricKey]) : 1;
      const current = buckets.get(label) ?? 0;
      buckets.set(label, current + increment);
    });

    return Array.from(buckets.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [servicios2026Data, serviciosCategoryField, serviciosPrimaryMetric]);

  const serviciosDominantCategory = serviciosCategoryBreakdown[0] ?? null;

  const serviciosLastUpdatedLabel = useMemo(() => {
    if (!servicios2026Data.length) return null as string | null;
    const updateColumn = findColumnByFragments(serviciosTableColumns, [
      'updated_at',
      'ultima actualizacion',
      'fecha actualizacion',
      'fecha actualización',
      'fecha actualizada',
      'created_at',
      'fecha captura',
    ]);
    if (!updateColumn) return null;
    const timestamps = servicios2026Data
      .map((row) => parsePotentialDate(row?.[updateColumn]))
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime());
    if (!timestamps.length) return null;
    return formatDateToDDMMYYYY(timestamps[0]);
  }, [servicios2026Data, serviciosTableColumns]);

  const serviciosStatusField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['estatus', 'status', 'avance', 'fase'])
  ), [serviciosTableColumns]);

  const serviciosServiceNameField = useMemo(() => (
    findServiceNameColumn(serviciosTableColumns)
  ), [serviciosTableColumns]);

  const serviciosClaveField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['clave cucop', 'clave servicio', 'clave'])
  ), [serviciosTableColumns]);

  const displayedServicios2026Rows = useMemo(() => {
    // In edit mode, keep all rows (including newly inserted empty ones)
    const visibleRows = isServiciosEditing
      ? filteredServicios2026Data
      : filteredServicios2026Data.filter((row) => !isEmptyStatusLikeRow(row));
    if (!serviciosServiceNameField) {
      return visibleRows.map((row) => ({ row, groupKey: '', isPrimary: true, turnNumber: 1 }));
    }

    const grouped = new Map<string, Record<string, any>[]>();
    visibleRows.forEach((row) => {
      const key = buildConvenioGroupKey(row, serviciosServiceNameField, serviciosClaveField);
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    });

    const result: Array<{ row: Record<string, any>; groupKey: string; isPrimary: boolean; turnNumber: number }> = [];
    grouped.forEach((rows, key) => {
      const hasConvenioGroup = rows.some((row) =>
        Object.entries(row).some(([column, value]) => isConvenioColumnName(column) && getBooleanChecked(value))
      );
      const shouldCollapseGroup = hasConvenioGroup && rows.length > 1;

      if (!shouldCollapseGroup) {
        rows.forEach((row) => {
          result.push({ row, groupKey: '', isPrimary: true, turnNumber: 1 });
        });
        return;
      }

      rows.forEach((row, index) => {
        if (index === 0 || expandedServiciosConvenio[key]) {
          result.push({ row, groupKey: key, isPrimary: index === 0, turnNumber: index + 1 });
        }
      });
    });

    return result;
  }, [expandedServiciosConvenio, filteredServicios2026Data, serviciosClaveField, serviciosServiceNameField, isServiciosEditing]);

  const serviciosSubdireccionField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['subdireccion', 'subdirección'])
  ), [serviciosTableColumns]);

  const serviciosGerenciaField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['gerencia'])
  ), [serviciosTableColumns]);

  // 2025 estatus_servicios — gerencia distribution
  const serviciosGerenciaDistribution = useMemo(() => {
    if (!servicios2026Data.length || !serviciosGerenciaField) return [] as { name: string; value: number }[];
    const ACCENTS: [RegExp, string][] = [
      [/\bAeronautica\b/gi, 'Aeronáutica'], [/\bElectromecanica\b/gi, 'Electromecánica'],
      [/\bIngenieria\b/gi, 'Ingeniería'], [/\bDistribucion\b/gi, 'Distribución'],
      [/\bGeneracion\b/gi, 'Generación'], [/\bOperacion\b/gi, 'Operación'],
      [/\bAdministracion\b/gi, 'Administración'], [/\bTecnico\b/gi, 'Técnico'],
      [/\bTecnica\b/gi, 'Técnica'], [/\bJuridica\b/gi, 'Jurídica'],
      [/\bGestion\b/gi, 'Gestión'], [/\bComunicacion\b/gi, 'Comunicación'],
    ];
    const counts: Record<string, number> = {};
    servicios2026Data.forEach(row => {
      const raw = row[serviciosGerenciaField!];
      if (!raw) return;
      const label = ACCENTS.reduce((s, [re, rep]) => s.replace(re, rep), String(raw).trim());
      if (label) counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [servicios2026Data, serviciosGerenciaField]);

  // 2025 estatus_servicios — subdirección distribution
  const serviciosSubdirDistribution = useMemo(() => {
    if (!servicios2026Data.length || !serviciosSubdireccionField) return [] as { name: string; value: number }[];
    const counts: Record<string, number> = {};
    servicios2026Data.forEach(row => {
      const raw = serviciosSubdireccionField ? row[serviciosSubdireccionField] : null;
      if (!raw) return;
      const label = String(raw).trim();
      if (label) counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [servicios2026Data, serviciosSubdireccionField]);

  const serviciosStatusSteps = useMemo(() => (
    SERVICIOS_STATUS_STEPS.map((label) => ({
      label,
      token: normalizeValueToken(label),
      short: abbreviateLabel(label, 2),
    }))
  ), []);

  const serviciosStatusStepCount = serviciosStatusSteps.length;

  const resolveServicioStatusIndex = useCallback((rawValue: any) => {
    const normalized = normalizeValueToken(rawValue);
    if (!normalized) return -1;
    // Iterate forwards to ensure specific matches (like DN3) are checked before generic ones (like Revisión Defensa)
    for (let index = 0; index < serviciosStatusSteps.length; index += 1) {
      if (normalized.includes(serviciosStatusSteps[index].token)) {
        return index;
      }
    }
    return -1;
  }, [serviciosStatusSteps]);

  const serviciosStatusDistribution = useMemo(() => {
    if (!servicios2026Data.length) return [];

    const counts = new Array(SERVICIOS_STATUS_STEPS.length).fill(0);
    const otherStatuses: Record<string, number> = {};

    servicios2026Data.forEach(row => {
        const statusValue = serviciosStatusField ? row[serviciosStatusField] : null;
        const index = resolveServicioStatusIndex(statusValue);
        if (index >= 0) {
            counts[index]++;
        } else {
            if (statusValue) {
                const cleanStatus = String(statusValue).trim();
                // Capitalize first letter for consistency
                const formattedStatus = cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1).toLowerCase();
                otherStatuses[formattedStatus] = (otherStatuses[formattedStatus] || 0) + 1;
            }
        }
    });

    const data = SERVICIOS_STATUS_STEPS.map((step, index) => ({
        name: step,
        value: counts[index]
    })).filter(item => item.value > 0);

    // Add unmatched statuses individually instead of grouping into "Otros"
    Object.entries(otherStatuses).forEach(([name, value]) => {
        data.push({ name, value });
    });
    
    return data;
  }, [servicios2026Data, serviciosStatusField, resolveServicioStatusIndex]);

  const buildServicioMonetarySnapshot = useCallback((row: Record<string, any>) => {
    if (!serviciosMonetaryColumns.length) return [] as Array<{ label: string; value: number }>;
    const snapshot: Array<{ label: string; value: number }> = [];
    serviciosMonetaryColumns.forEach((column) => {
      const raw = row?.[column];
      if (raw === null || raw === undefined || raw === '') return;
      const numeric = parseNumericValue(raw);
      if (!Number.isFinite(numeric)) return;
      snapshot.push({ label: humanizeKey(column), value: numeric });
    });
    return snapshot.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3);
  }, [serviciosMonetaryColumns]);

  const serviciosStatusEntries = useMemo<ServicioStatusEntry[]>(() => {
    if (!filteredServicios2026Data.length) return [];
    return filteredServicios2026Data.map((row, index) => {
      const idValue = row.id ?? row.ID ?? row.clave ?? row['Clave cucop'] ?? `servicios-2026-${index}`;
      const rawName = serviciosServiceNameField ? row?.[serviciosServiceNameField] : null;
      const serviceName = normalizeWhitespace(String(rawName ?? `Servicio ${index + 1}`));
      const statusValue = serviciosStatusField ? row?.[serviciosStatusField] : null;
      const stageIndex = resolveServicioStatusIndex(statusValue);
      const stageMeta = stageIndex >= 0 ? serviciosStatusSteps[stageIndex] : null;
      return {
        id: idValue,
        serviceName,
        clave: serviciosClaveField ? row?.[serviciosClaveField] : null,
        statusLabel: statusValue ? String(statusValue) : 'Sin estatus registrado',
        stageIndex,
        stageLabel: stageMeta?.label ?? null,
        stageShort: stageMeta?.short ?? null,
        monetary: buildServicioMonetarySnapshot(row as Record<string, any>),
      };
    });
  }, [buildServicioMonetarySnapshot, filteredServicios2026Data, resolveServicioStatusIndex, serviciosClaveField, serviciosServiceNameField, serviciosStatusField, serviciosStatusSteps]);

  const serviciosStatusEntriesOrdered = useMemo(() => (
    [...serviciosStatusEntries].sort((a, b) => {
      const aIndex = a.stageIndex >= 0 ? a.stageIndex : -1;
      const bIndex = b.stageIndex >= 0 ? b.stageIndex : -1;
      if (aIndex !== bIndex) return bIndex - aIndex;
      return a.serviceName.localeCompare(b.serviceName, 'es');
    })
  ), [serviciosStatusEntries]);

  const serviciosStatusSummary = useMemo(() => {
    const total = serviciosStatusEntries.length;
    if (!total) {
      return { total: 0, completed: 0, completedPct: 0, avgPercent: 0 };
    }
    const completed = serviciosStatusEntries.filter((entry) => entry.stageIndex === serviciosStatusStepCount - 1).length;
    const percentSum = serviciosStatusEntries.reduce((acc, entry) => {
      if (entry.stageIndex < 0) return acc;
      return acc + ((entry.stageIndex + 1) / serviciosStatusStepCount) * 100;
    }, 0);
    return {
      total,
      completed,
      completedPct: Math.round((completed / total) * 100),
      avgPercent: Math.round(percentSum / total),
    };
  }, [serviciosStatusEntries, serviciosStatusStepCount]);

  const procContratacionField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['procedimiento de contratacion', 'procedimiento', 'contratacion'])
  ), [serviciosTableColumns]);

  const fechaRemisionIMField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['fecha remision investigacion mercado', 'remision im', 'remision investigacion'])
  ), [serviciosTableColumns]);

  const fechaRecepcionIMField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['fecha recepcion investigacion mercado', 'recepcion im', 'recepcion investigacion'])
  ), [serviciosTableColumns]);

  const publicacionConvocatoriaField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['publicacion convocatoria', 'convocatoria'])
  ), [serviciosTableColumns]);

  const visitaInstalacionesField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['visita instalaciones', 'visita'])
  ), [serviciosTableColumns]);

  const juntaAclaracionesField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['junta aclaraciones', 'junta'])
  ), [serviciosTableColumns]);

  const aperturaProposicionesField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['apertura proposiciones', 'apertura'])
  ), [serviciosTableColumns]);

  const falloField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['fallo'])
  ), [serviciosTableColumns]);

  const calendarEvents = useMemo(() => {
    const events: any[] = [];
    
    servicios2026Data.forEach((service) => {
      const procContratacion = procContratacionField ? service[procContratacionField] : null;
      
      // Check for "SI" or "TRUE" (case insensitive)
      const isProc = String(procContratacion).trim().toUpperCase();
      if (isProc !== 'SI' && isProc !== 'TRUE') {
        return;
      }

      const serviceName = serviciosServiceNameField ? service[serviciosServiceNameField] : 'Servicio sin nombre';

      const dateFields = [
        { key: fechaRemisionIMField, label: 'Remisión IM', color: '#3B82F6' },
        { key: fechaRecepcionIMField, label: 'Recepción IM', color: '#8B5CF6' },
        { key: publicacionConvocatoriaField, label: 'Publicación Convocatoria', color: '#10B981' },
        { key: visitaInstalacionesField, label: 'Visita Instalaciones', color: '#F59E0B' },
        { key: juntaAclaracionesField, label: 'Junta Aclaraciones', color: '#F97316' },
        { key: aperturaProposicionesField, label: 'Apertura Proposiciones', color: '#EC4899' },
        { key: falloField, label: 'Fallo', color: '#EF4444' },
      ];

      dateFields.forEach(({ key, label, color }) => {
        if (!key) return;
        const dateVal = service[key];
        if (dateVal) {
            let date = parsePotentialDate(dateVal);
            if (date && !isNaN(date.getTime())) {
                // Fix: If the input is a simple date string (YYYY-MM-DD), it is parsed as UTC.
                // We need to adjust it to local time so it appears on the correct day in the calendar.
                if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
                    const offset = date.getTimezoneOffset();
                    date = new Date(date.getTime() + offset * 60000);
                }

                events.push({
                title: `${label}: ${serviceName}`,
                start: date,
                end: date,
                allDay: true,
                resource: { color, serviceName, type: label }
                });
            }
        }
      });
    });

    return events;
  }, [
    servicios2026Data, 
    procContratacionField, 
    serviciosServiceNameField,
    fechaRemisionIMField,
    fechaRecepcionIMField,
    publicacionConvocatoriaField,
    visitaInstalacionesField,
    juntaAclaracionesField,
    aperturaProposicionesField,
    falloField
  ]);

  const nextEvent = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const upcoming = calendarEvents
      .filter(e => e.start >= now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
      
    return upcoming[0] ?? null;
  }, [calendarEvents]);

  const sortedProceduresData = useMemo(() => {
    if (!filteredProceduresData.length) return [] as ProcedureRecord[];

    const parseNumericId = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const cleaned = value.trim();
        if (!cleaned.length) return null;
        let numericText = cleaned.replace(/\s+/g, '').replace(/\$/g, '');
        if (numericText.includes(',') && !numericText.includes('.')) {
          numericText = numericText.replace(/,/g, '.');
        } else {
          numericText = numericText.replace(/,/g, '');
        }
        const parsed = Number(numericText);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    };

    const toComparableText = (value: unknown) => {
      if (value === null || value === undefined) return '';
      return String(value).trim().toLowerCase();
    };

    return filteredProceduresData
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const idA = a.row?.id ?? null;
        const idB = b.row?.id ?? null;
        const numericA = parseNumericId(idA);
        const numericB = parseNumericId(idB);

        if (numericA !== null && numericB !== null && numericA !== numericB) {
          return numericA - numericB;
        }
        if (numericA !== null && numericB === null) return -1;
        if (numericA === null && numericB !== null) return 1;

        const textA = toComparableText(idA);
        const textB = toComparableText(idB);

        if (textA && textB && textA !== textB) {
          return textA.localeCompare(textB, 'es');
        }
        if (!textA && textB) return 1;
        if (textA && !textB) return -1;

        return a.index - b.index;
      })
      .map(({ row }) => row);
  }, [filteredProceduresData]);

  const compranetStatusKey = useMemo(
    () => findColumnByFragments(compranetTableColumns, ['estatus', 'status', 'estado']),
    [compranetTableColumns]
  );

  const compranetDependencyKey = useMemo(
    () => findColumnByFragments(compranetTableColumns, ['dependencia', 'unidad', 'area', 'direccion', 'departamento']),
    [compranetTableColumns]
  );

  const compranetAmountKey = useMemo(
    () => findColumnByFragments(compranetTableColumns, ['monto', 'importe', 'total', 'valor', 'presupuesto', 'estimado', 'contratado', 'adjudicado']),
    [compranetTableColumns]
  );

  const compranetTypeKey = useMemo(
    () => findColumnByFragments(compranetTableColumns, ['tipo de procedimiento', 'modalidad', 'tipo de contratacion', 'tipo']),
    [compranetTableColumns]
  );

  const compranetDateKey = useMemo(
    () => findColumnByFragments(compranetTableColumns, ['fecha publicacion', 'fecha de publicacion', 'fecha', 'publicacion', 'apertura', 'acto', 'fallo', 'adjudicacion']),
    [compranetTableColumns]
  );

  const proceduresStickyDefinitions = useMemo(() => (
    isProceduresCompact
      ? [
          { match: ['id'], width: 80 },
          { match: ['servicio', 'nombre del servicio', 'nombre del servicio.', 'descripcion', 'actividad', 'servicio actividad'], width: 220 },
          { match: ['responsable gpyc', 'responsable g p y c', 'responsable'], width: 160 },
        ]
      : [
          { match: ['id'], width: 100 },
          { match: ['servicio', 'nombre del servicio', 'nombre del servicio.', 'descripcion', 'actividad', 'servicio actividad'], width: 260 },
          { match: ['responsable gpyc', 'responsable g p y c', 'responsable'], width: 190 },
        ]
  ), [isProceduresCompact]);

  const proceduresStickyInfo = useMemo(() => {
    if (!proceduresTableColumns.length) {
      return { meta: new Map<string, { left: number; width: number }>(), order: [] as string[] };
    }

    const meta = new Map<string, { left: number; width: number }>();
    const order: string[] = [];
    let left = 0;

    proceduresStickyDefinitions.forEach((definition) => {
      const matchedColumn = proceduresTableColumns.find((column) => {
        const normalized = normalizeAnnualKey(column);
        return definition.match.some((target) => normalized === normalizeAnnualKey(target));
      });

      if (matchedColumn) {
        meta.set(matchedColumn, { left, width: definition.width });
        order.push(matchedColumn);
        left += definition.width;
      }
    });

    return { meta, order };
  }, [proceduresTableColumns, proceduresStickyDefinitions]);

  const proceduresLastStickyKey = proceduresStickyInfo.order[proceduresStickyInfo.order.length - 1];

  const proceduresResponsibleKey = useMemo(
    () => findColumnByFragments(proceduresTableColumns, ['responsable gpyc', 'responsable', 'responsable seguimiento', 'responsable g p y c', 'gpyc']),
    [proceduresTableColumns]
  );

  const proceduresServiceKey = useMemo(
    () => findColumnByFragments(proceduresTableColumns, ['servicio', 'servicios', 'nombre del servicio', 'descripcion', 'actividad']),
    [proceduresTableColumns]
  );

  const proceduresStatusKey = useMemo(
    () => findColumnByFragments(proceduresTableColumns, ['estatus', 'status', 'estado', 'avance', 'seguimiento']),
    [proceduresTableColumns]
  );

  const proceduresDeadlineKey = useMemo(
    () => findColumnByFragments(proceduresTableColumns, ['fecha compromiso', 'fecha limite', 'fecha', 'plazo', 'entrega', 'vencimiento']),
    [proceduresTableColumns]
  );

  const proceduresUpdatedAtKey = useMemo(
    () => findColumnByFragments(proceduresTableColumns, ['updated_at', 'updated', 'ultima actualizacion', 'fecha actualizacion', 'actualizacion']),
    [proceduresTableColumns]
  );

  const proceduresLastUpdated = useMemo(() => {
    if (!proceduresData.length || !proceduresUpdatedAtKey) return null as Date | null;
    const timestamps: Date[] = [];
    proceduresData.forEach((row) => {
      const raw = row[proceduresUpdatedAtKey];
      const parsed = parsePotentialDate(raw);
      if (parsed) timestamps.push(parsed);
    });
    if (!timestamps.length) return null;
    timestamps.sort((a, b) => b.getTime() - a.getTime());
    return timestamps[0];
  }, [proceduresData, proceduresUpdatedAtKey]);

  const proceduresLastUpdatedLabel = useMemo(() => (
    proceduresLastUpdated ? formatDateTime(proceduresLastUpdated.toISOString()) : null
  ), [proceduresLastUpdated]);

  const proceduresSummaries = useMemo<ProcedureResponsibleSummary[]>(() => {
    if (!proceduresData.length) return [];

    type MutableSummary = ProcedureResponsibleSummary & { statusCounter: Map<string, number> };
    const map = new Map<string, MutableSummary>();

    const getResponsibleLabel = (rawValue: unknown) => {
      if (rawValue === null || rawValue === undefined) {
        return 'Sin responsable asignado';
      }
      const normalized = normalizeWhitespace(String(rawValue));
      return normalized.length ? normalized : 'Sin responsable asignado';
    };

    proceduresData.forEach((row, index) => {
      const responsibleLabel = getResponsibleLabel(proceduresResponsibleKey ? row[proceduresResponsibleKey] : null);

      let summary = map.get(responsibleLabel);
      if (!summary) {
        summary = {
          responsible: responsibleLabel,
          total: 0,
          statusBreakdown: [],
          services: [],
          statusCounter: new Map<string, number>(),
        };
        map.set(responsibleLabel, summary);
      }

      const serviceRaw = proceduresServiceKey ? row[proceduresServiceKey] : null;
      const serviceLabelCandidate = serviceRaw !== null && serviceRaw !== undefined
        ? normalizeWhitespace(String(serviceRaw))
        : '';
      const serviceLabel = serviceLabelCandidate.length
        ? serviceLabelCandidate
        : `Servicio ${summary.total + 1}`;

      const statusRaw = proceduresStatusKey ? row[proceduresStatusKey] : null;
      const statusCandidate = statusRaw !== null && statusRaw !== undefined
        ? normalizeWhitespace(String(statusRaw))
        : '';
      const statusLabel = statusCandidate.length ? statusCandidate : null;
      const statusCounterKey = statusLabel ?? 'Sin estatus asignado';

      let deadlineLabel: string | null = null;
      if (proceduresDeadlineKey) {
        const deadlineRaw = row[proceduresDeadlineKey];
        if (deadlineRaw !== null && deadlineRaw !== undefined) {
          const parsedDeadline = parsePotentialDate(deadlineRaw);
          if (parsedDeadline) {
            deadlineLabel = formatDateOnly(parsedDeadline);
          } else {
            const normalizedDeadline = normalizeWhitespace(String(deadlineRaw));
            deadlineLabel = normalizedDeadline.length ? normalizedDeadline : null;
          }
        }
      }

      const serviceId = row.id ?? `procedimiento-${index}`;

      summary.total += 1;
      summary.services.push({
        id: serviceId,
        label: serviceLabel,
        statusLabel,
        deadlineLabel,
        raw: row,
      });

      summary.statusCounter.set(
        statusCounterKey,
        (summary.statusCounter.get(statusCounterKey) ?? 0) + 1,
      );
    });

    const summaries = Array.from(map.values()).map((entry) => {
      const { statusCounter, ...rest } = entry;
      const statusBreakdown = Array.from(statusCounter.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => {
          if (a.count !== b.count) return b.count - a.count;
          return a.label.localeCompare(b.label, 'es');
        });

      return {
        responsible: rest.responsible,
        total: rest.total,
        services: rest.services,
        statusBreakdown,
      } as ProcedureResponsibleSummary;
    });

    summaries.sort((a, b) => {
      if (a.total !== b.total) return b.total - a.total;
      return a.responsible.localeCompare(b.responsible, 'es');
    });

    return summaries;
  }, [proceduresData, proceduresResponsibleKey, proceduresServiceKey, proceduresStatusKey, proceduresDeadlineKey]);

  const proceduresTotalServices = proceduresData.length;
  const proceduresUniqueResponsibles = proceduresSummaries.length;
  const proceduresUnassignedCount = useMemo(() => {
    const unassigned = proceduresSummaries.find((summary) => summary.responsible === 'Sin responsable asignado');
    return unassigned?.total ?? 0;
  }, [proceduresSummaries]);

  const topProcedureResponsible = proceduresSummaries[0] ?? null;

  const selectedResponsibleSummary = useMemo(() => {
    if (!selectedResponsibleName) return null;
    return proceduresSummaries.find((summary) => summary.responsible === selectedResponsibleName) ?? null;
  }, [proceduresSummaries, selectedResponsibleName]);

  const proceduresHighlightKeys = useMemo(() => {
    const source = proceduresColumnsToRender.length ? proceduresColumnsToRender : proceduresTableColumns;
    return source
      .filter((key) => key && key !== '__actions' && key !== proceduresResponsibleKey)
      .slice(0, 6);
  }, [proceduresColumnsToRender, proceduresTableColumns, proceduresResponsibleKey]);

  const handleProcedureCellEdit = async (rowRef: ProcedureRecord, column: string, rawInput: any) => {
    if (!requireManagePermission()) return;
    const normalizedInput = rawInput.replace(/\u00A0/g, ' ').trim();
    const currentValue = rowRef[column];
    const lowerColumn = column.toLowerCase();
    const columnSuggestsDate = ['fecha', 'vigencia', 'fallo', 'apertura', 'publicacion', 'término', 'termino', 'inicio', 'visita', 'revision', 'revisión', 'diferimiento']
      .some((fragment) => lowerColumn.includes(fragment));
    const inputSuggestsDate = /[-\/]/.test(normalizedInput) || /\d{1,2}\s+de\s+\w+/i.test(normalizedInput) || /\d{1,2}:\d{2}/.test(normalizedInput) || /t\d{2}:/i.test(normalizedInput);

    const looksNumeric = (value: string) => {
      const normalized = value.replace(/\s+/g, '');
      return /^[-+]?\d+(?:[.,]\d+)?$/.test(normalized.replace(/,/g, '.'));
    };

    const parseNumericLike = (value: string) => {
      let sanitized = value.replace(/\s+/g, '').replace(/\$/g, '');
      // Remove commas (thousands separators)
      sanitized = sanitized.replace(/,/g, '');
      const parsed = Number(sanitized);
      return Number.isNaN(parsed) ? null : parsed;
    };

    let nextValue: any;
    if (!normalizedInput.length) {
      nextValue = null;
    } else {
      let parsedDateInput: Date | null = null;
      if (columnSuggestsDate || inputSuggestsDate) {
        parsedDateInput = parsePotentialDate(normalizedInput);
      }

      if (parsedDateInput) {
        const isoDate = `${parsedDateInput.getFullYear()}-${String(parsedDateInput.getMonth() + 1).padStart(2, '0')}-${String(parsedDateInput.getDate()).padStart(2, '0')}`;
        const hasTime = /\d{1,2}:\d{2}/.test(normalizedInput) || /t\d{2}:/i.test(normalizedInput);
        if (hasTime) {
          const hours = String(parsedDateInput.getHours()).padStart(2, '0');
          const minutes = String(parsedDateInput.getMinutes()).padStart(2, '0');
          const seconds = String(parsedDateInput.getSeconds()).padStart(2, '0');
          nextValue = `${isoDate}T${hours}:${minutes}:${seconds}`;
        } else {
          nextValue = isoDate;
        }
      } else if (typeof currentValue === 'number' || shouldFormatAsCurrency(column)) {
        const numericCandidate = parseNumericLike(normalizedInput);
        nextValue = numericCandidate !== null ? numericCandidate : normalizedInput;
      } else if (looksNumeric(normalizedInput)) {
        const numericCandidate = parseNumericLike(normalizedInput);
        nextValue = numericCandidate !== null ? numericCandidate : normalizedInput;
      } else {
        nextValue = normalizedInput;
      }
    }

    const normalizedCurrent = currentValue === undefined ? null : currentValue;
    const normalizedNext = nextValue === undefined ? null : nextValue;
    if (deepEqual(normalizedCurrent, normalizedNext)) return;

    const resolvedKey = resolvePrimaryKey(rowRef, 'procedimientos', PRIMARY_KEY_HINTS['procedimientos']);
    if (!resolvedKey) {
      alert('No se identificó una clave primaria para este registro. Usa el formulario "Editar" para actualizarlo.');
      return;
    }

    const normalizeIdValue = (value: any): string | null => {
      if (value === undefined || value === null) return null;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (trimmed === '') return null;
      return String(trimmed);
    };

    const recordId = rowRef[resolvedKey];
    const comparableId = normalizeIdValue(recordId);
    if (!comparableId) {
      alert('Este registro todavía no existe en Supabase. Usa "Nuevo registro" para crearlo antes de editar en línea.');
      return;
    }

    const matchesTarget = (entry: ProcedureRecord) => normalizeIdValue(entry?.[resolvedKey]) === comparableId;
    const beforeRecord = sanitizeRecord(rowRef) ?? { ...rowRef };
    const optimisticSnapshot = { ...beforeRecord, [column]: nextValue };

    setProceduresData((prev) => prev.map((entry) => (matchesTarget(entry) ? { ...entry, [column]: nextValue } : entry)));

    try {
      const { data, error } = await supabase
        .from('procedimientos')
        .update({ [column]: nextValue })
        .eq(resolvedKey, recordId)
        .select();

      if (error) {
        throw error;
      }

      const updatedRecord = Array.isArray(data) ? data[0] ?? null : null;
      if (updatedRecord) {
        setProceduresData((prev) => prev.map((entry) => (matchesTarget(entry) ? { ...entry, ...updatedRecord } : entry)));
      }

      await logChange({
        table: 'procedimientos',
        action: 'UPDATE',
        recordId,
        before: beforeRecord,
        after: updatedRecord ?? optimisticSnapshot,
      });
    } catch (error) {
      console.error('Error guardando cambio en procedimientos:', error);
      alert('No se pudo guardar el cambio en Supabase. Se restauró el valor anterior.');
      setProceduresData((prev) => prev.map((entry) => (matchesTarget(entry) ? { ...entry, ...beforeRecord } : entry)));
    }
  };



  const handleGenericCellEdit = async (
    tableName: string,
    rowRef: Record<string, any>,
    column: string,
    rawInput: any,
    setData: React.Dispatch<React.SetStateAction<any[]>>,
    data: any[]
  ) => {
    if (!requireManagePermission()) return;

    const normalizedInput = (rawInput === null || rawInput === undefined) ? '' : String(rawInput).replace(/\u00A0/g, ' ').trim();
    const currentValue = rowRef[column];
    const lowerColumn = column.toLowerCase();
    const columnSuggestsDate = ['fecha', 'vigencia', 'fallo', 'apertura', 'publicacion', 'término', 'termino', 'inicio', 'visita', 'revision', 'revisión', 'diferimiento']
      .some((fragment) => lowerColumn.includes(fragment));
    const inputSuggestsDate = /[-\/]/.test(normalizedInput) || /\d{1,2}\s+de\s+\w+/i.test(normalizedInput) || /\d{1,2}:\d{2}/.test(normalizedInput) || /t\d{2}:/i.test(normalizedInput);

    const looksNumeric = (value: string) => {
      const normalized = value.replace(/\s+/g, '');
      return /^[-+]?\d+(?:[.,]\d+)?$/.test(normalized.replace(/,/g, '.'));
    };

    const parseNumericLike = (value: string) => {
      let sanitized = value.replace(/\s+/g, '').replace(/\$/g, '');
      sanitized = sanitized.replace(/,/g, '');
      const parsed = Number(sanitized);
      return Number.isNaN(parsed) ? null : parsed;
    };

    let nextValue: any;
    if (typeof rawInput === 'boolean') {
      // Preserve booleans as-is so PostgreSQL boolean columns receive the correct type
      // and the change history records display "Sí"/"No" instead of "true"/"false".
      nextValue = rawInput;
    } else if (!normalizedInput.length) {
      nextValue = null;
    } else {
      let parsedDateInput: Date | null = null;
      if (columnSuggestsDate || inputSuggestsDate) {
        parsedDateInput = parsePotentialDate(normalizedInput);
      }

      if (parsedDateInput) {
        const isoDate = `${parsedDateInput.getFullYear()}-${String(parsedDateInput.getMonth() + 1).padStart(2, '0')}-${String(parsedDateInput.getDate()).padStart(2, '0')}`;
        const hasTime = /\d{1,2}:\d{2}/.test(normalizedInput) || /t\d{2}:/i.test(normalizedInput);
        if (hasTime) {
          const hours = String(parsedDateInput.getHours()).padStart(2, '0');
          const minutes = String(parsedDateInput.getMinutes()).padStart(2, '0');
          const seconds = String(parsedDateInput.getSeconds()).padStart(2, '0');
          nextValue = `${isoDate}T${hours}:${minutes}:${seconds}`;
        } else {
          nextValue = isoDate;
        }
      } else if (typeof currentValue === 'number' || shouldFormatAsCurrency(column)) {
        const numericCandidate = parseNumericLike(normalizedInput);
        nextValue = numericCandidate !== null ? numericCandidate : normalizedInput;
      } else if (looksNumeric(normalizedInput)) {
        const numericCandidate = parseNumericLike(normalizedInput);
        nextValue = numericCandidate !== null ? numericCandidate : normalizedInput;
      } else {
        nextValue = normalizedInput;
      }
    }

    const normalizedCurrent = currentValue === undefined ? null : currentValue;
    const normalizedNext = nextValue === undefined ? null : nextValue;

    if (deepEqual(normalizedCurrent, normalizedNext)) return;

    // estatus_2026 requires editable but unique IDs in UI to avoid duplicated rows.
    const isIdColumn = column.toLowerCase() === 'id';
    if (tableName === 'estatus_2026' && isIdColumn) {
      if (normalizedNext === null || normalizedNext === '') {
        alert('El ID no puede estar vacío.');
        return;
      }
      const nextIdNormalized = String(normalizedNext).trim();
      const hasDuplicate = data.some((entry) => {
        const sameRow = entry === rowRef;
        if (sameRow) return false;
        const candidate = String(entry?.id ?? entry?.ID ?? entry?.Id ?? '').trim();
        return candidate.length > 0 && candidate === nextIdNormalized;
      });

      if (hasDuplicate) {
        alert(`El ID ${nextIdNormalized} ya existe. Usa un ID diferente.`);
        return;
      }
    }

    const optimisticSnapshot = [...data];
    const updatedRecord = { ...rowRef, [column]: nextValue };

    const pk = resolvePrimaryKey(rowRef, tableName);
    if (!pk) {
        console.error(`No primary key found for table ${tableName}. Row keys:`, Object.keys(rowRef));
        alert('No se identificó una clave primaria para este registro. Intenta recargar la página para actualizar los datos.');
        return;
    }

    const matchesTarget = (entry: Record<string, any>) => entry[pk] === rowRef[pk];

    setData((prev) => prev.map((entry) => (matchesTarget(entry) ? updatedRecord : entry)));

    try {
      const { error } = await supabase
        .from(tableName)
        .update({ [column]: nextValue })
        .eq(pk, rowRef[pk]);

      if (error) throw error;

      await logChange({
        table: tableName,
        action: 'UPDATE',
        recordId: rowRef[pk],
        before: { [column]: currentValue },
        after: { [column]: nextValue },
      });
    } catch (error) {
      console.error(`Error guardando cambio en ${tableName}:`, error);
      alert('No se pudo guardar el cambio en Supabase. Se restauró el valor anterior.');
      setData(optimisticSnapshot);
    }
  };

  function isConvenioColumnName(column: string) {
    return normalizeAnnualKey(column).includes('convenio');
  }

  const buildNextConvenioId = (rows: Record<string, any>[], primaryKey: string, currentValue: any) => {
    const numericIds = rows
      .map((entry) => {
        const raw = entry?.[primaryKey];
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        if (typeof raw === 'string' && raw.trim().length > 0) {
          const parsed = Number(raw.trim());
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })
      .filter((value): value is number => value !== null);

    if (numericIds.length > 0) return Math.max(...numericIds) + 1;

    const base = String(currentValue ?? 'convenio').trim() || 'convenio';
    return `${base}-${Date.now()}`;
  };

  const handleConvenioCellEdit = async (
    tableName: string,
    rowRef: Record<string, any>,
    column: string,
    checked: boolean,
    setData: React.Dispatch<React.SetStateAction<any[]>>,
    data: Record<string, any>[]
  ) => {
    if (!requireManagePermission()) return;

    const currentChecked = getBooleanChecked(rowRef[column]);
    if (currentChecked === checked) return;

    if (!checked) {
      await handleGenericCellEdit(tableName, rowRef, column, false, setData, data);
      return;
    }

    const pk = resolvePrimaryKey(rowRef, tableName);
    if (!pk) {
      alert('No se pudo identificar la llave primaria para crear la vuelta del convenio.');
      return;
    }

    const sourceIndex = data.findIndex((entry) => entry?.[pk] === rowRef?.[pk]);
    if (sourceIndex < 0) {
      await handleGenericCellEdit(tableName, rowRef, column, true, setData, data);
      return;
    }

    const sourceRow = { ...rowRef };
    const updatedSourceRow = { ...sourceRow, [column]: true };
    const clonePayload: Record<string, any> = { ...sourceRow, [column]: false };
    delete clonePayload[pk];

    const nextId = buildNextConvenioId(data, pk, rowRef?.[pk]);
    const optimisticClone = { ...clonePayload, [pk]: nextId };
    const optimisticRows = [...data];
    optimisticRows[sourceIndex] = updatedSourceRow;
    optimisticRows.splice(sourceIndex + 1, 0, optimisticClone);
    setData(optimisticRows);

    try {
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ [column]: true })
        .eq(pk, rowRef[pk]);

      if (updateError) throw updateError;

      const insertPayload = { ...clonePayload, [pk]: nextId };
      const { data: insertedData, error: insertError } = await supabase
        .from(tableName)
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) throw insertError;

      const insertedRow = insertedData ?? optimisticClone;

      setData((prev) => {
        const refreshed = [...prev];
        const refreshedSourceIndex = refreshed.findIndex((entry) => entry?.[pk] === rowRef?.[pk]);
        if (refreshedSourceIndex >= 0) {
          refreshed[refreshedSourceIndex] = { ...refreshed[refreshedSourceIndex], [column]: true };
          const cloneIndex = refreshed.findIndex((entry) => entry?.[pk] === optimisticClone?.[pk]);
          if (cloneIndex >= 0) {
            refreshed[cloneIndex] = insertedRow;
          } else {
            refreshed.splice(refreshedSourceIndex + 1, 0, insertedRow);
          }
        }
        return refreshed;
      });

      await logChange({
        table: tableName,
        action: 'UPDATE',
        recordId: rowRef[pk],
        before: { [column]: rowRef[column] },
        after: { [column]: true },
      });

      await logChange({
        table: tableName,
        action: 'INSERT',
        recordId: insertedRow?.[pk] ?? nextId,
        before: null,
        after: insertedRow,
      });
    } catch (error) {
      console.error(`Error guardando convenio modificatorio en ${tableName}:`, error);
      alert('No se pudo crear la nueva vuelta del convenio modificatorio. Se restauró el valor anterior.');
      setData(data);
    }
  };

  function normalizeConvenioServiceKey(value: any) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function buildConvenioGroupKey(row: Record<string, any>, serviceField: string | null, secondaryField?: string | null) {
    const serviceKey = normalizeConvenioServiceKey(serviceField ? row?.[serviceField] : null);
    const secondaryKey = secondaryField ? normalizeConvenioServiceKey(row?.[secondaryField]) : '';
    return secondaryKey ? `${serviceKey}::${secondaryKey}` : serviceKey;
  }

  function isEmptyStatusLikeRow(row: Record<string, any>) {
    const ignoredKeys = new Set(['id', 'ID', 'Id', 'created_at', 'updated_at', 'createdAt', 'updatedAt']);

    return !Object.entries(row ?? {}).some(([key, value]) => {
      if (ignoredKeys.has(key)) return false;

      if (value === null || value === undefined) return false;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (value instanceof Date) return !Number.isNaN(value.getTime());

      const normalized = String(value).replace(/\s+/g, ' ').trim();
      if (!normalized.length) return false;

      const normalizedLower = normalized.toLowerCase();
      if (normalizedLower === 'false' || normalizedLower === 'no') return false;

      return true;
    });
  }

  const createConvenioDuplicateRow = async (
    tableName: string,
    rowRef: Record<string, any>,
    serviceField: string | null,
    setData: React.Dispatch<React.SetStateAction<any[]>>,
    data: Record<string, any>[]
  ) => {
    const pk = resolvePrimaryKey(rowRef, tableName);
    if (!pk) {
      alert('No se pudo identificar la llave primaria para crear la nueva vuelta.');
      return null;
    }

    const nextId = buildNextConvenioId(data, pk, rowRef?.[pk]);
    const clonePayload: Record<string, any> = { ...rowRef, [pk]: nextId };

    Object.keys(clonePayload).forEach((key) => {
      if (isConvenioColumnName(key)) {
        clonePayload[key] = false;
      }
    });

    const sourceIndex = data.findIndex((entry) => entry?.[pk] === rowRef?.[pk]);
    const optimisticRows = [...data];
    if (sourceIndex >= 0) {
      optimisticRows.splice(sourceIndex + 1, 0, clonePayload);
      setData(optimisticRows);
    }

    try {
      const { data: insertedData, error } = await supabase
        .from(tableName)
        .insert(clonePayload)
        .select()
        .single();

      if (error) throw error;

      const insertedRow = insertedData ?? clonePayload;
      setData((prev) => {
        const refreshed = [...prev];
        const optimisticIndex = refreshed.findIndex((entry) => entry?.[pk] === nextId);
        if (optimisticIndex >= 0) {
          refreshed[optimisticIndex] = insertedRow;
        } else if (sourceIndex >= 0) {
          refreshed.splice(sourceIndex + 1, 0, insertedRow);
        } else {
          refreshed.push(insertedRow);
        }
        return refreshed;
      });

      await logChange({
        table: tableName,
        action: 'INSERT',
        recordId: insertedRow?.[pk] ?? nextId,
        before: null,
        after: insertedRow,
      });

      return insertedRow;
    } catch (error) {
      console.error(`Error creando nueva vuelta en ${tableName}:`, error);
      alert('No se pudo crear la nueva vuelta del servicio.');
      setData(data);
      return null;
    }
  };

  const handleConvenioServiceClick = async (
    tableName: string,
    rowRef: Record<string, any>,
    serviceField: string | null,
    secondaryField: string | null,
    data: Record<string, any>[],
    setData: React.Dispatch<React.SetStateAction<any[]>>,
    expandedMap: Record<string, boolean>,
    setExpandedMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  ) => {
    if (!serviceField) return;

    const serviceKey = buildConvenioGroupKey(rowRef, serviceField, secondaryField);
    if (!serviceKey) return;

    const matchingRows = data.filter((entry) => buildConvenioGroupKey(entry, serviceField, secondaryField) === serviceKey);
    const hasConvenio = Object.entries(rowRef).some(([key, value]) => isConvenioColumnName(key) && getBooleanChecked(value));
    if (!hasConvenio) return;

    const hasDuplicate = matchingRows.length > 1;
    if (!hasDuplicate) {
      const insertedRow = await createConvenioDuplicateRow(tableName, rowRef, serviceField, setData, data);
      if (!insertedRow) return;
    }

    setExpandedMap((prev) => ({ ...prev, [serviceKey]: !prev[serviceKey] }));
  };

  const handleAnnualCellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('año_2026', row, col, val, setAnnual2026Data, annual2026Data);
  const handleServiciosCellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('estatus_servicios_2026', row, col, val, setServicios2026Data, servicios2026Data);
  const handlePaasCellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('balance_paas_2026', row, col, val, setPaasData, paasData);
  const handlePaymentsCellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('control_pagos', row, col, val, setPaymentsData, paymentsData);
  const handleInvoicesCellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('estatus_facturas', row, col, val, setInvoicesData, invoicesData);
  const handleCompranetCellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('procedimientos_compranet', row, col, val, setCompranetData, compranetData);
  const handlePendingOctCellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('estatus_procedimiento', row, col, val, setProcedureStatuses, procedureStatuses);
  const handleEstatus2026CellEdit = (row: Record<string, any>, col: string, val: any) => handleGenericCellEdit('estatus_2026', row, col, val, setEstatus2026Data, estatus2026Data);

  const handleAddServicioRow = useCallback(async () => {
    if (!serviciosTableColumns.length) return;
    
    try {
      // First try with empty object to use DB defaults
      let { data, error } = await supabase.from('estatus_servicios_2026').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        // Fallback: derive column types from existing data to avoid type mismatches
        // (e.g. sending `false` to a DATE column when the name is ambiguous)
        const safeRecord = createInitialRecordFromData(serviciosTableColumns, servicios2026Data);

        const retry = await supabase.from('estatus_servicios_2026').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      // Always refetch from DB so order is preserved and the new row appears last
      await fetchServicios2026Data();
      setIsServiciosEditing(true);
    } catch (error: any) {
      console.error('Error creating row in estatus_servicios_2026:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [serviciosTableColumns, servicios2026Data]);

  const handleAddEstatus2026Row = useCallback(async () => {
    if (!estatus2026TableColumns.length || isAddingEstatus2026Row) return;
    setIsAddingEstatus2026Row(true);
    try {
      // Build a full safe record and assign a consecutive ID that does not exist.
      // Exclude virtual computed columns that don't exist in the DB.
      const realColumns = estatus2026TableColumns.filter(c => !c.startsWith('__'));
      // Use data-driven type detection so accented column names (e.g. 'Validación por el área')
      // are never sent as boolean `false` when they are DATE columns in the DB.
      const safeRecord = createInitialRecordFromData(realColumns, estatus2026Data);

      const localNumericIds = estatus2026Data
        .map((row) => Number(row?.id ?? row?.ID ?? row?.Id))
        .filter((val) => Number.isFinite(val));

      let nextId = (localNumericIds.length ? Math.max(...localNumericIds) : 0) + 1;

      // Try to anchor from DB max(id) so consecutive ID is based on the latest persisted value.
      const { data: maxIdRows, error: maxIdError } = await supabase
        .from('estatus_2026')
        .select('ID')
        .order('ID', { ascending: false })
        .limit(1);

      if (!maxIdError && Array.isArray(maxIdRows) && maxIdRows.length > 0) {
        const dbMax = Number(maxIdRows[0]?.ID ?? maxIdRows[0]?.id);
        if (Number.isFinite(dbMax)) {
          nextId = Math.max(nextId, dbMax + 1);
        }
      }

      // Final anti-duplicate guard (important when users are editing IDs manually).
      for (let i = 0; i < 50; i += 1) {
        const { count, error: countError } = await supabase
          .from('estatus_2026')
          .select('*', { count: 'exact', head: true })
          .eq('ID', nextId);

        if (countError) throw countError;
        if ((count ?? 0) === 0) break;
        nextId += 1;
      }

      safeRecord['ID'] = nextId;

      const { error } = await supabase.from('estatus_2026').insert(safeRecord);
      if (error) throw error;

      // Always refetch canonical data after insert.
      await fetchEstatus2026Data();
      setIsEstatus2026Editing(true);
    } catch (error: any) {
      console.error('Error creating row in estatus_2026:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}.`);
    } finally {
      setIsAddingEstatus2026Row(false);
    }
  }, [estatus2026TableColumns, isAddingEstatus2026Row, estatus2026Data]);

  const handlePagos2026CellEdit = async (row: Record<string, any>, col: string, val: any) => {
    // Save the edited column first
    await handleGenericCellEdit('pagos', row, col, val, setPagos2026Data, pagos2026Data);

    // Auto-compute the parent month total when a sub-column is edited
    const colNormL = col.toLowerCase();
    const isPreventivos = colNormL.includes('preventivo');
    const isCorrectivos = colNormL.includes('correctivo');
    const isNotaCreditoCol = colNormL.includes('nota') && (colNormL.includes('credito') || colNormL.includes('crédito'));
    if (!isPreventivos && !isCorrectivos && !isNotaCreditoCol) return;

    // Map each month abbreviation to fragments used to detect its columns
    const monthMap: Array<{ key: string; fragments: string[] }> = [
      { key: 'Ene.', fragments: ['ene.', 'enero'] },
      { key: 'Feb.', fragments: ['feb.', 'febrero'] },
      { key: 'Mar.', fragments: ['mar.', 'marzo'] },
      { key: 'Abr.', fragments: ['abr.', 'abril'] },
      { key: 'May.', fragments: ['may.', 'mayo'] },
      { key: 'Jun.', fragments: ['jun.', 'junio'] },
      { key: 'Jul.', fragments: ['jul.', 'julio'] },
      { key: 'Ago.', fragments: ['ago.', 'agosto'] },
      { key: 'Sept.', fragments: ['sept.', 'sep.', 'septiembre'] },
      { key: 'Oct.', fragments: ['oct.', 'octubre'] },
      { key: 'Nov.', fragments: ['nov.', 'noviembre'] },
      { key: 'Dic.', fragments: ['dic.', 'diciembre'] },
    ];

    const monthEntry = monthMap.find(({ fragments }) => fragments.some(f => colNormL.includes(f)));
    if (!monthEntry) return;

    // Verify the parent month total column actually exists in the table
    const parentMonthKey = pagos2026TableColumns.find(c => c === monthEntry.key);
    if (!parentMonthKey) return;

    // Find sibling sub-columns for this month
    const isThisMonth = (c: string) => monthEntry.fragments.some(f => c.toLowerCase().includes(f));
    const prevColKey = pagos2026TableColumns.find(c => isThisMonth(c) && c.toLowerCase().includes('preventivo'));
    const corrColKey = pagos2026TableColumns.find(c => isThisMonth(c) && c.toLowerCase().includes('correctivo'));
    const notaColKey = pagos2026TableColumns.find(c => isThisMonth(c) && c.toLowerCase().includes('nota'));

    const parseNum = (v: any): number => {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };

    // Build row with the newly edited value applied so totals are correct
    const parsedNewVal = parseNum(val);
    const updatedRow = { ...row, [col]: parsedNewVal };

    const prevVal = parseNum(prevColKey ? updatedRow[prevColKey] : 0);
    const corrVal = parseNum(corrColKey ? updatedRow[corrColKey] : 0);
    const notaVal = parseNum(notaColKey ? updatedRow[notaColKey] : 0);

    const monthTotal = prevVal + corrVal - notaVal;

    // Save the computed total to the parent month column
    await handleGenericCellEdit('pagos', updatedRow, parentMonthKey, monthTotal, setPagos2026Data, pagos2026Data);
  };

  const handleRecalcPagos2026AllTotals = useCallback(async () => {
    if (!requireManagePermission()) return;
    const monthMap: Array<{ key: string; fragments: string[] }> = [
      { key: 'Ene.', fragments: ['ene.', 'enero'] },
      { key: 'Feb.', fragments: ['feb.', 'febrero'] },
      { key: 'Mar.', fragments: ['mar.', 'marzo'] },
      { key: 'Abr.', fragments: ['abr.', 'abril'] },
      { key: 'May.', fragments: ['may.', 'mayo'] },
      { key: 'Jun.', fragments: ['jun.', 'junio'] },
      { key: 'Jul.', fragments: ['jul.', 'julio'] },
      { key: 'Ago.', fragments: ['ago.', 'agosto'] },
      { key: 'Sept.', fragments: ['sept.', 'sep.', 'septiembre'] },
      { key: 'Oct.', fragments: ['oct.', 'octubre'] },
      { key: 'Nov.', fragments: ['nov.', 'noviembre'] },
      { key: 'Dic.', fragments: ['dic.', 'diciembre'] },
    ];
    const parseNum = (v: any): number => {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    const pk = 'id';
    const updates: Array<{ rowId: any; col: string; val: number }> = [];
    for (const row of pagos2026Data) {
      for (const monthEntry of monthMap) {
        const parentKey = pagos2026TableColumns.find(c => c === monthEntry.key);
        if (!parentKey) continue;
        const isThisMonth = (c: string) => monthEntry.fragments.some(f => c.toLowerCase().includes(f));
        const prevCol = pagos2026TableColumns.find(c => isThisMonth(c) && c.toLowerCase().includes('preventivo'));
        const corrCol = pagos2026TableColumns.find(c => isThisMonth(c) && c.toLowerCase().includes('correctivo'));
        const notaCol = pagos2026TableColumns.find(c => isThisMonth(c) && c.toLowerCase().includes('nota'));
        const total = parseNum(prevCol ? row[prevCol] : 0) + parseNum(corrCol ? row[corrCol] : 0) - parseNum(notaCol ? row[notaCol] : 0);
        if (parseNum(row[parentKey]) !== total) {
          updates.push({ rowId: row[pk], col: parentKey, val: total });
        }
      }
    }
    if (!updates.length) { alert('Todos los totales ya están al día.'); return; }
    try {
      await Promise.all(
        updates.map(({ rowId, col, val }) =>
          supabase.from('pagos').update({ [col]: val }).eq(pk, rowId)
        )
      );
      // Update local state
      setPagos2026Data(prev => prev.map(row => {
        const rowUpdates = updates.filter(u => u.rowId === row[pk]);
        if (!rowUpdates.length) return row;
        return rowUpdates.reduce((acc, u) => ({ ...acc, [u.col]: u.val }), { ...row });
      }));
      alert(`Se actualizaron ${updates.length} totales de meses.`);
    } catch (err: any) {
      console.error('Error al recalcular totales:', err);
      alert('Error al guardar los totales. Revisa la consola.');
    }
  }, [pagos2026Data, pagos2026TableColumns, requireManagePermission]);

  const handleAddPagos2026Row = useCallback(async () => {
    // If no columns detected yet, we try to insert empty object and rely on DB defaults/returning *
    // if (!pagos2026TableColumns.length) return; 

    const template = pagos2026TableColumns.length ? generateTemplateFromColumns(pagos2026TableColumns) : {};
    try {
      let { data, error } = await supabase.from('pagos').insert({ anio: 2026 }).select().single();
      if (error) {
         const safeRecord = createSafeInitialRecord(pagos2026TableColumns);
         // If we are here, defaults failed.
         // If the table now has a real Primary Key (id/uuid), do NOT inject a random number if it's not needed.
         // If 'id' is in columns, safeRecord created it as ''. We should remove it to let DB gen it if possible.
         if (Object.prototype.hasOwnProperty.call(safeRecord, 'id')) {
            delete safeRecord['id'];
         }

         const retry = await supabase.from('pagos').insert({ ...safeRecord, anio: 2026 }).select().single();
         data = retry.data;
         error = retry.error;
      }
      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setPagos2026Data((prev) => [...prev, newRow]);
        setIsPagos2026Editing(true);
      }
    } catch (error: any) {
         console.error('Error adding row to pagos:', error);
         alert("No se pudo agregar la fila: " + error.message);
    }
  }, [pagos2026TableColumns]);

  const handleAddProcedureRow = useCallback(async () => {
    if (!proceduresTableColumns.length) return;

    const template = generateTemplateFromColumns(proceduresTableColumns);
    
    try {
      let { data, error } = await supabase.from('procedimientos').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        const safeRecord = createSafeInitialRecord(proceduresTableColumns);
        const retry = await supabase.from('procedimientos').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setProceduresData((prev) => [...prev, newRow]);
        setIsProceduresEditing(true);
      }
    } catch (error: any) {
      console.error('Error creating row in procedimientos:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [proceduresTableColumns]);

  const handleAddAnnualRow = useCallback(async () => {
    if (!annualTableColumns.length) return;
    const template = generateTemplateFromColumns(annualTableColumns);
    
    try {
      let { data, error } = await supabase.from('año_2026').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        const safeRecord = createSafeInitialRecord(annualTableColumns);
        
        // Force "no" column to be present and 0.
        // The error "null value in column 'no'" indicates the DB expects this specific lowercase column.
        // We set it regardless of whether "No" or "NO" exists to ensure the DB constraint is met.
        safeRecord['no'] = 0;

        console.log('Retrying insert with safe record:', safeRecord);
        const retry = await supabase.from('año_2026').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setAnnual2026Data((prev) => [...prev, newRow]);
        setIsAnnualEditing(true);
      }
    } catch (error: any) {
      console.error('Error creating row in año_2026:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [annualTableColumns]);

  const handleAddPaasRow = useCallback(async () => {
    if (!paasTableColumns.length) return;
    const template = generateTemplateFromColumns(paasTableColumns);
    
    try {
      let { data, error } = await supabase.from('balance_paas_2026').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        const safeRecord = createSafeInitialRecord(paasTableColumns);
        const retry = await supabase.from('balance_paas_2026').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setPaasData((prev) => [...prev, newRow as any]);
        setIsPaasEditing(true);
      }
    } catch (error: any) {
      console.error('Error creating row in paas:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [paasTableColumns]);

  const handleAddPaymentsRow = useCallback(async () => {
    if (!paymentsTableColumns.length) return;
    const template = generateTemplateFromColumns(paymentsTableColumns);
    
    try {
      let { data, error } = await supabase.from('control_pagos').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        const safeRecord = createSafeInitialRecord(paymentsTableColumns);
        const retry = await supabase.from('control_pagos').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setPaymentsData((prev) => [...prev, newRow as any]);
        setIsPaymentsEditing(true);
      }
    } catch (error: any) {
      console.error('Error creating row in control_pagos:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [paymentsTableColumns]);

  const handleAddInvoicesRow = useCallback(async () => {
    if (!invoicesTableColumns.length) return;
    const template = generateTemplateFromColumns(invoicesTableColumns);
    
    try {
      let { data, error } = await supabase.from('estatus_facturas').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        const safeRecord = createSafeInitialRecord(invoicesTableColumns);
        const retry = await supabase.from('estatus_facturas').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setInvoicesData((prev) => [...prev, newRow]);
        setIsInvoicesEditing(true);
      }
    } catch (error: any) {
      console.error('Error creating row in estatus_facturas:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [invoicesTableColumns]);

  const handleAddCompranetRow = useCallback(async () => {
    if (!compranetTableColumns.length) return;
    const template = generateTemplateFromColumns(compranetTableColumns);
    
    try {
      let { data, error } = await supabase.from('procedimientos_compranet').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        const safeRecord = createSafeInitialRecord(compranetTableColumns);
        const retry = await supabase.from('procedimientos_compranet').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setCompranetData((prev) => [...prev, newRow]);
        setIsCompranetEditing(true);
      }
    } catch (error: any) {
      console.error('Error creating row in procedimientos_compranet:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [compranetTableColumns]);

  const handleAddPendingOctRow = useCallback(async () => {
    if (!pendingOctTableColumns.length) return;
    const template = generateTemplateFromColumns(pendingOctTableColumns);
    
    try {
      let { data, error } = await supabase.from('estatus_procedimiento').insert({}).select().single();
      
      if (error) {
        console.warn('Insert with defaults failed, trying with safe initial values...', error.message);
        const safeRecord = createSafeInitialRecord(pendingOctTableColumns);
        const retry = await supabase.from('estatus_procedimiento').insert(safeRecord).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      if (data) {
        const newRow = { ...template, ...data };
        setProcedureStatuses((prev) => [...prev, newRow as any]);
        setIsPendingOctEditing(true);
      }
    } catch (error: any) {
      console.error('Error creating row in estatus_procedimiento:', error);
      alert(`Error al crear la fila: ${error.message || 'Error desconocido'}. Detalles: ${error.details || ''}`);
    }
  }, [pendingOctTableColumns]);

  const executiveInsights = useMemo<ExecutiveInsight[]>(() => {
    const insights: ExecutiveInsight[] = [];
    const nextExpiring = contractTimelineInsights.upcoming[0] ?? null;
    const topOverdue = contractTimelineInsights.overdueList[0] ?? null;
    const pendingShare = invoicesTotal ? Math.round((invoicesPendingCount / invoicesTotal) * 100) : 0;
    const pendingLeader = invoicesPendingProviders[0];
    const paasTopGerencia = paasSummary.topGerencia;
    const hasAnyData =
      contractTimelineInsights.total > 0 ||
      paasData.length > 0 ||
      paymentsData.length > 0 ||
      invoicesTotal > 0 ||
      procedureStatuses.length > 0;

    if (topOverdue) {
      insights.push({
        id: 'overdue-contract',
        title: `Contrato vencido: ${topOverdue.contractNumber}`,
        detail: `${topOverdue.provider} concluyó el ${topOverdue.endDateLabel} · ${describeDaysUntil(topOverdue.daysLeft)} · ${formatCurrency(topOverdue.amount || 0)}`,
        tone: 'critical',
        icon: AlertCircle,
      });
    }

    if (nextExpiring) {
      insights.push({
        id: 'upcoming-contract',
        title: `Próximo vencimiento: ${nextExpiring.endDateLabel}`,
        detail: `${nextExpiring.provider} (${nextExpiring.contractNumber}) · ${describeDaysUntil(nextExpiring.daysLeft)} · ${formatCurrency(nextExpiring.amount || 0)}`,
        tone: nextExpiring.daysLeft <= 15 ? 'alert' : 'neutral',
        icon: CalendarIcon,
      });
    } else if (contractTimelineInsights.total > 0 && !topOverdue) {
      insights.push({
        id: 'no-upcoming-contracts',
        title: 'Sin vencimientos en los próximos 60 días',
        detail: 'Los contratos activos están fuera de la ventana crítica de seguimiento.',
        tone: 'positive',
        icon: Briefcase,
      });
    }

    if (pendingShare > 0) {
      insights.push({
        id: 'pending-invoices',
        title: `${pendingShare}% de facturas pendientes`,
        detail: `${invoicesPendingCount} de ${invoicesTotal} facturas siguen abiertas${pendingLeader ? `; mayor rezago: ${pendingLeader.name} (${pendingLeader.value}).` : '.'}`,
        tone: pendingShare >= 40 ? 'alert' : 'neutral',
        icon: FileSpreadsheet,
      });
    } else if (invoicesTotal > 0) {
      insights.push({
        id: 'invoices-cleared',
        title: 'Facturación al día',
        detail: 'El 100% de las facturas registradas aparece como pagado.',
        tone: 'positive',
        icon: FileSpreadsheet,
      });
    }

    if (pendingObservationsCount > 0) {
      insights.push({
        id: 'payment-observations',
        title: `${pendingObservationsCount} observación${pendingObservationsCount === 1 ? '' : 'es'} en seguimiento`,
        detail: dominantObservationCategory
          ? `${dominantObservationCategory.name} concentra el ${dominantObservationShare}% de los casos.`
          : 'Sin una categoría dominante entre las observaciones registradas.',
        tone: 'alert',
        icon: AlertCircle,
      });
    } else if (procedureStatuses.length > 0) {
      insights.push({
        id: 'no-observations',
        title: 'Pagos sin observaciones activas',
        detail: 'La tabla de observaciones no registra pendientes vigentes.',
        tone: 'positive',
        icon: AlertCircle,
      });
    }

    if (peakPaymentMonth && insights.length < 4) {
      insights.push({
        id: 'peak-payments',
        title: `${(peakPaymentMonth as any).name} concentra el mayor flujo de pagos`,
        detail: `Se ejercieron ${formatCurrency((peakPaymentMonth as any).value)} durante ese mes.`,
        tone: 'neutral',
        icon: CreditCard,
      });
    } else if (!peakPaymentMonth && totalEjercido > 0 && insights.length < 4) {
      insights.push({
        id: 'distributed-payments',
        title: 'Pagos distribuidos sin picos marcados',
        detail: `Se han ejercido ${formatCurrency(totalEjercido)} sin concentrarse en un mes específico.`,
        tone: 'neutral',
        icon: CreditCard,
      });
    }

    if (paasTopGerencia && insights.length < 4) {
      const deltaMessage = paasSummary.delta !== 0
        ? ` · Variación neta: ${formatCurrency(Math.abs(paasSummary.delta))} ${paasSummary.delta > 0 ? 'adicionales' : 'menos'}.`
        : '.';
      const tone: ExecutiveInsight['tone'] = paasSummary.delta > 0 ? 'alert' : paasSummary.delta < 0 ? 'positive' : 'neutral';
      insights.push({
        id: 'paas-leader',
        title: `Gerencia líder: ${normalizeWhitespace(paasTopGerencia.name || 'Sin asignar')}`,
        detail: `Suma ${formatCurrency(paasTopGerencia.value || 0)} solicitados${deltaMessage}`,
        tone,
        icon: FileText,
      });
    }

    if (topProcedureResponsible && topProcedureResponsible.total > 0 && insights.length < 4) {
      const topStatuses = topProcedureResponsible.statusBreakdown.slice(0, 2)
        .map((item) => `${item.label} (${item.count})`)
        .join(' · ');
      insights.push({
        id: 'gpyc-lead',
        title: `${topProcedureResponsible.responsible} concentra ${topProcedureResponsible.total} servicio${topProcedureResponsible.total === 1 ? '' : 's'}`,
        detail: topStatuses.length ? `Estatus principales: ${topStatuses}.` : 'Distribución equilibrada de estatus.',
        tone: topProcedureResponsible.total >= 6 ? 'alert' : 'neutral',
        icon: Briefcase,
      });
    }

    if (proceduresUnassignedCount > 0 && insights.length < 4) {
      insights.push({
        id: 'gpyc-unassigned',
        title: `${proceduresUnassignedCount} servicio${proceduresUnassignedCount === 1 ? '' : 's'} sin responsable GPyC`,
        detail: 'Asigna un responsable para habilitar seguimiento oportuno.',
        tone: 'alert',
        icon: AlertCircle,
      });
    }

    const limited = insights.filter(Boolean).slice(0, 4);
    if (limited.length) return limited;

    if (!hasAnyData) {
      return [{
        id: 'no-data',
        title: 'Carga información para iniciar',
        detail: 'Integra contratos, PAAS, pagos o facturas para que el tablero genere hallazgos automáticamente.',
        tone: 'neutral',
        icon: FileText,
      }];
    }

    return [{
      id: 'no-insights',
      title: 'Resumen sin hallazgos relevantes',
      detail: 'Los datos cargados no generan alertas críticas en esta revisión. Continúa monitoreando los indicadores claves.',
      tone: 'positive',
      icon: Briefcase,
    }];
  }, [
    contractTimelineInsights,
    invoicesPendingCount,
    invoicesPendingProviders,
    invoicesTotal,
    pendingObservationsCount,
    dominantObservationCategory,
    dominantObservationShare,
    peakPaymentMonth,
    totalEjercido,
    paasSummary,
    paasData.length,
    paymentsData.length,
    procedureStatuses.length,
    proceduresSummaries,
    proceduresUnassignedCount,
  ]);

  const compranetTotalAmount = useMemo(() => {
    if (!compranetAmountKey) return 0;
    return compranetData.reduce((acc, row) => acc + parseNumericValue(row[compranetAmountKey]), 0);
  }, [compranetAmountKey, compranetData]);

  const compranetUniqueDependencies = useMemo(() => {
    if (!compranetDependencyKey) return 0;
    const unique = new Set<string>();
    compranetData.forEach((row) => {
      const raw = row[compranetDependencyKey];
      const label = normalizeWhitespace(
        typeof raw === 'string' ? raw : raw !== null && raw !== undefined ? String(raw) : null
      );
      unique.add(label);
    });
    unique.delete('-');
    return unique.size;
  }, [compranetDependencyKey, compranetData]);

  const compranetUniqueTypes = useMemo(() => {
    if (!compranetTypeKey) return 0;
    const unique = new Set<string>();
    compranetData.forEach((row) => {
      const raw = row[compranetTypeKey];
      const label = normalizeWhitespace(
        typeof raw === 'string' ? raw : raw !== null && raw !== undefined ? String(raw) : null
      );
      unique.add(label);
    });
    unique.delete('-');
    return unique.size;
  }, [compranetTypeKey, compranetData]);

  const compranetStatusDistribution = useMemo(() => {
    if (!compranetStatusKey) return [] as { name: string; value: number }[];
    const counts = compranetData.reduce<Record<string, number>>((acc, row) => {
      const label = normalizeWhitespace(
        typeof row[compranetStatusKey] === 'string'
          ? (row[compranetStatusKey] as string)
          : row[compranetStatusKey] !== null && row[compranetStatusKey] !== undefined
            ? String(row[compranetStatusKey])
            : null
      );
      const key = label === '-' ? 'Sin dato' : label;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  }, [compranetData, compranetStatusKey]);

  const compranetCategorySeries = useMemo(() => {
    if (!compranetDependencyKey) return [] as { name: string; value: number }[];
    const useAmount = Boolean(compranetAmountKey);
    const totals = compranetData.reduce<Record<string, number>>((acc, row) => {
      const raw = row[compranetDependencyKey];
      const label = normalizeWhitespace(
        typeof raw === 'string' ? raw : raw !== null && raw !== undefined ? String(raw) : null
      );
      const key = label === '-' ? 'Sin dato' : label;
      const increment = useAmount && compranetAmountKey
        ? parseNumericValue(row[compranetAmountKey])
        : 1;
      acc[key] = (acc[key] ?? 0) + increment;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [compranetAmountKey, compranetData, compranetDependencyKey]);

  const compranetTimeline = useMemo(() => {
    if (!compranetDateKey) return [] as { name: string; count: number; amount: number }[];
    const buckets = new Map<string, { name: string; count: number; amount: number; timestamp: number }>();

    compranetData.forEach((row) => {
      const raw = row[compranetDateKey];
      const parsedDate = parsePotentialDate(raw);
      if (!parsedDate) return;

      const key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
      const label = parsedDate
        .toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
        .replace('.', '');

      const bucket = buckets.get(key) ?? {
        name: label,
        count: 0,
        amount: 0,
        timestamp: parsedDate.getTime(),
      };

      bucket.count += 1;
      if (compranetAmountKey) {
        bucket.amount += parseNumericValue(row[compranetAmountKey]);
      }
      bucket.timestamp = Math.min(bucket.timestamp, parsedDate.getTime());

      buckets.set(key, bucket);
    });

    return Array.from(buckets.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ name, count, amount }) => ({ name, count, amount }));
  }, [compranetAmountKey, compranetData, compranetDateKey]);

  const compranetCategoryUsesAmount = Boolean(compranetAmountKey);
  const compranetTimelineHasAmount = useMemo(
    () => Boolean(compranetAmountKey && compranetTimeline.some(item => (item.amount ?? 0) > 0)),
    [compranetAmountKey, compranetTimeline]
  );

  const compranetStatusTitle = compranetStatusKey ? humanizeKey(compranetStatusKey) : 'Estatus';
  const compranetCategoryTitle = compranetDependencyKey ? humanizeKey(compranetDependencyKey) : 'Categoría';
  const compranetDateTitle = compranetDateKey ? humanizeKey(compranetDateKey) : 'Fecha';
  const compranetAmountTitle = compranetAmountKey ? humanizeKey(compranetAmountKey) : 'Monto';
  const compranetCategoryMetricLabel = compranetCategoryUsesAmount ? 'Monto acumulado' : 'Procedimientos';
  const compranetTopStatus = compranetStatusDistribution[0];
  const compranetTopStatusShare = compranetTopStatus && compranetData.length > 0
    ? Math.round((compranetTopStatus.value / compranetData.length) * 100)
    : 0;
  const compranetStickyWidths = [220, 260];

  return (
    <div className="relative h-screen bg-slate-50 overflow-hidden font-sans">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-10 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-full w-64 flex-col bg-white border-r border-slate-200 shadow-lg transition-transform duration-300 md:shadow-none ${
          isSidebarOpen ? 'translate-x-0 md:translate-x-0' : '-translate-x-full md:-translate-x-full'
        }`}
      >
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
           <AifaLogo className="h-10 w-auto mr-3" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900 leading-tight">AIFA</span>
            <span className="text-xs font-bold text-[#B38E5D] tracking-wider">CONTRATOS</span>
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {/* 2025 Group */}
          <div>
            <button
              onClick={() => setIs2025Expanded(!is2025Expanded)}
              className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
            >
              <div className="flex items-center">
                 <CalendarIcon className="h-5 w-5 mr-3 text-slate-400" />
                 2025
              </div>
              {is2025Expanded ? (
                  <Minimize2 className="h-4 w-4 text-slate-400"/>
              ) : (
                  <Plus className="h-4 w-4 text-slate-400"/>
              )}
            </button>
            
            {is2025Expanded && (
                <div className="pl-4 mt-1 space-y-1">
                   {[ 
                    { id: 'overview', icon: LayoutDashboard, label: 'Resumen' },
                    { id: 'serviciosStatus', icon: BarChart2, label: 'Estatus servicios' },
                    { id: 'contracts', icon: FileText, label: 'Gestión Contratos' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSidebarSelection(item.id)}
                      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        activeTab === item.id
                          ? 'bg-slate-100 text-[#B38E5D]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <item.icon className={`h-4 w-4 mr-3 ${activeTab === item.id ? 'text-[#B38E5D]' : 'text-slate-400'}`} />
                      {item.label}
                    </button>
                  ))}
                </div>
            )}
          </div>
        
          {/* 2026 Group */}
          <div>
            <button
              onClick={() => setIs2026Expanded(!is2026Expanded)}
              className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
            >
              <div className="flex items-center">
                <CalendarDays className="h-5 w-5 mr-3 text-slate-400" />
                2026
              </div>
              {is2026Expanded ? (
                <Minimize2 className="h-4 w-4 text-slate-400" />
              ) : (
                <Plus className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {is2026Expanded && (
              <div className="pl-4 mt-1 space-y-1">
                {[
                  { view: 'resumen' as const, icon: LayoutDashboard, label: 'Resumen' },
                  { view: 'estatus' as const, icon: BarChart2, label: 'Estatus servicios' },
                  { view: 'pagos' as const, icon: FileText, label: 'Pagos 2026' },
                ].map((item) => {
                  const isActive = activeTab === '2026' && active2026View === item.view;
                  return (
                    <button
                      key={item.view}
                      onClick={() => {
                        handleSidebarSelection('2026');
                        setActive2026View(item.view);
                        setSelectedEstatus2026Estatus(null);
                        setSelectedEstatus2026Phase(null);
                      }}
                      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-slate-100 text-[#B38E5D]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <item.icon className={`h-4 w-4 mr-3 ${isActive ? 'text-[#B38E5D]' : 'text-slate-400'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reportes Group */}
          <div>
            <button
              onClick={() => setIsReportesExpanded(!isReportesExpanded)}
              className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
            >
              <div className="flex items-center">
                <FileSpreadsheet className="h-5 w-5 mr-3 text-slate-400" />
                Reportes
              </div>
              {isReportesExpanded ? (
                <Minimize2 className="h-4 w-4 text-slate-400" />
              ) : (
                <Plus className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {isReportesExpanded && (
              <div className="pl-4 mt-1 space-y-1">
                {([
                  { id: 'gastoEfectuado',    icon: DollarSign,      label: 'Gasto Efectuado 2026' },
                  { id: 'historicoServicios', icon: TrendingUp,       label: 'Histórico de Servicios' },
                  { id: 'anteproyecto',      icon: FileText,         label: 'Anteproyecto' },
                  { id: 'paaas',             icon: Layers,           label: 'PAAAS' },
                  { id: 'deductivas',        icon: CreditCard,       label: 'Deductivas' },
                ] as { id: typeof activeReportesView; icon: React.ComponentType<{className?: string}>; label: string }[]).map((item) => {
                  const isActive = activeTab === 'reportes' && activeReportesView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleSidebarSelection('reportes');
                        setActiveReportesView(item.id);
                      }}
                      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-slate-100 text-[#B38E5D]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <item.icon className={`h-4 w-4 mr-3 ${isActive ? 'text-[#B38E5D]' : 'text-slate-400'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

             {/* History */}
             <button
              onClick={() => handleSidebarSelection('history')}
              className={`w-full flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'history'
                  ? 'bg-slate-100 text-[#B38E5D]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
               <History className={`h-5 w-5 mr-3 ${activeTab === 'history' ? 'text-[#B38E5D]' : 'text-slate-400'}`} />
              Historial
            </button>

        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center p-3 bg-slate-50 rounded-lg mb-3">
            <div className="h-10 w-10 rounded-full bg-[#B38E5D]/10 flex items-center justify-center text-[#B38E5D] font-bold border border-[#B38E5D]/20">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-bold text-slate-700 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex h-full flex-col transition-all duration-300 ${
          isSidebarOpen ? 'md:ml-64' : 'md:ml-0'
        }`}
      >
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-transparent p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
              aria-label="Alternar menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center md:hidden">
              <AifaLogo className="h-8 w-auto mr-2" />
              <span className="font-bold text-slate-800">AIFA CONTRATOS</span>
            </div>
          </div>

          {nextEvent && (
            <div 
              className="hidden lg:flex items-center bg-amber-50 text-amber-800 px-4 py-1.5 rounded-full border border-amber-200 text-xs font-medium shadow-sm cursor-pointer hover:bg-amber-100 transition-colors"
              onClick={() => {
                setActiveTab('serviciosStatus');
                setStatusTab('calendar');
                setCalendarDate(nextEvent.start);
              }}
              title="Ver en calendario"
            >
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="mr-1 font-bold">Próximo evento:</span>
              <span className="capitalize">{format(nextEvent.start, "EEEE d 'de' MMMM", { locale: es })}</span>
              <span className="mx-1">-</span>
              <span className="truncate max-w-[250px]">{nextEvent.title}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="sm:hidden">
              <div className="h-9 w-9 rounded-full bg-[#B38E5D]/15 text-[#B38E5D] font-semibold flex items-center justify-center uppercase">
                {userInitials}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="h-10 w-10 rounded-full bg-[#B38E5D]/15 text-[#B38E5D] font-semibold flex items-center justify-center uppercase">
                {userInitials}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-slate-700">{user.name}</span>
                <span className={`inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest rounded-full ${userRoleMeta.badgeClass}`}>
                  {userRoleMeta.label}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-8 space-y-8">
          
          {/* === CONTENIDO DINÁMICO SEGÚN TAB === */}
          
          {activeTab === 'overview' && (
            <>
              {!selectedServicePhase ? (
                <>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Resumen ejecutivo</h1>
                <p className="text-slate-500 mt-1">
                  Datos consolidados de contratos, presupuestos PAAS, control de pagos, facturas y observaciones recientes.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">Hallazgos clave</h3>
                  <span className="text-xs text-slate-400">Lectura automática del tablero</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {executiveInsights.map((insight) => {
                    const toneClass = insightToneClasses[insight.tone] ?? insightToneClasses.neutral;
                    const iconClass = insightIconClasses[insight.tone] ?? insightIconClasses.neutral;
                    return (
                      <div key={insight.id} className={`rounded-xl border p-4 ${toneClass}`}>
                        <div className="flex items-start gap-3">
                          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${iconClass}`}>
                            <insight.icon className="h-5 w-5" />
                          </span>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold leading-snug">{insight.title}</p>
                            <p className="text-xs leading-relaxed opacity-90">{insight.detail}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
                {executiveHighlights.map((card) => (
                  <div
                    key={card.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                        <p className="text-2xl font-bold text-slate-900 mt-2">{card.value}</p>
                        <p className="text-xs text-slate-500 mt-2 leading-snug">{card.helper}</p>
                      </div>
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/60 shadow-sm ${card.accentBg} ${card.accentText}`}>
                        <card.icon className="h-5 w-5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Distribución de Servicios por Fase</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Visualización de la carga de trabajo según la etapa del proceso.
                        </p>
                    </div>
                    <span className="text-xs text-slate-400">{servicios2026Data.length} servicios</span>
                  </div>
                  <div className="h-[450px] w-full">
                      {loadingData ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                      ) : serviciosStatusDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 40, bottom: 40, left: 40, right: 40 }}>
                            <Pie 
                                data={serviciosStatusDistribution} 
                                dataKey="value" 
                                nameKey="name" 
                                cx="50%" 
                                cy="50%" 
                                outerRadius={100} 
                                onClick={(data: any) => setSelectedServicePhase(data.name)}
                                className="cursor-pointer"
                                label={({ cx, cy, midAngle = 0, innerRadius, outerRadius, percent = 0, index, name = '' }: any) => {
                                    const RADIAN = Math.PI / 180;
                                    let radius = outerRadius + 50;

                                    // Ajuste específico para evitar superposición
                                    if (name && name.includes('Procedimiento de Contratación')) {
                                        radius += 25;
                                    }

                                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                    
                                    return (
                                      <text 
                                        x={x} 
                                        y={y} 
                                        fill={chartPalette[index % chartPalette.length]} 
                                        textAnchor={x > cx ? 'start' : 'end'} 
                                        dominantBaseline="central" 
                                        className="text-[11px] font-bold"
                                      >
                                        {`${name} (${(percent * 100).toFixed(0)}%)`}
                                      </text>
                                    );
                                }}
                                labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                            >
                              {serviciosStatusDistribution.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={chartPalette[index % chartPalette.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `${value} servicio${value === 1 ? '' : 's'}`} />
                            <Legend 
                                verticalAlign="bottom" 
                                height={36} 
                                iconType="circle" 
                                wrapperStyle={{ fontSize: '12px', paddingTop: '20px', cursor: 'pointer' }} 
                                onClick={(data) => setSelectedServicePhase(data.value || null)}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                          No hay datos suficientes para generar la gráfica.
                        </div>
                      )}
                  </div>
              </div>

              {/* ── Servicios 2025: Gerencia + Subdirección ─────────────────────────── */}
              {(serviciosGerenciaDistribution.length > 0 || serviciosSubdirDistribution.length > 0) && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Gerencia 2025 */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-slate-800">Servicios 2025 por Gerencia</h3>
                      <span className="text-xs font-medium text-slate-400">{servicios2026Data.length} total</span>
                    </div>
                    <div className="space-y-3">
                      {serviciosGerenciaDistribution.length > 0 ? (() => {
                        const maxVal = Math.max(...serviciosGerenciaDistribution.map(e => e.value), 1);
                        return serviciosGerenciaDistribution.map((entry, index) => {
                          const barWidth = Math.round((entry.value / maxVal) * 100);
                          const pct = servicios2026Data.length > 0 ? Math.round((entry.value / servicios2026Data.length) * 100) : 0;
                          const color = chartPalette[index % chartPalette.length];
                          return (
                            <div key={entry.name} className="flex items-center gap-3">
                              <div className="w-32 text-xs text-slate-600 truncate text-right shrink-0" title={entry.name}>{entry.name}</div>
                              <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                              </div>
                              <span className="text-xs text-slate-500 shrink-0 font-medium">{entry.value} ({pct}%)</span>
                            </div>
                          );
                        });
                      })() : (
                        <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Sin datos de gerencia</div>
                      )}
                    </div>
                  </div>
                  {/* Subdirección 2025 */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-slate-800">Servicios 2025 por Subdirección</h3>
                      <span className="text-xs font-medium text-slate-400">{servicios2026Data.length} total</span>
                    </div>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {serviciosSubdirDistribution.length > 0 ? (() => {
                        const maxVal = Math.max(...serviciosSubdirDistribution.map(e => e.value), 1);
                        return serviciosSubdirDistribution.map((entry, index) => {
                          const barWidth = Math.round((entry.value / maxVal) * 100);
                          const pct = servicios2026Data.length > 0 ? Math.round((entry.value / servicios2026Data.length) * 100) : 0;
                          const color = chartPalette[index % chartPalette.length];
                          return (
                            <div key={entry.name} className="flex items-center gap-3">
                              <div className="w-32 text-xs text-slate-600 truncate text-right shrink-0" title={entry.name}>{entry.name}</div>
                              <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                              </div>
                              <span className="text-xs text-slate-500 shrink-0 font-medium">{entry.value} ({pct}%)</span>
                            </div>
                          );
                        });
                      })() : (
                        <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Sin datos de subdirección</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Contratos por estatus</h3>
                    <span className="text-xs text-slate-400">{contractTimelineInsights.total} total</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-64">
                      {loadingData ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                      ) : contractStatusHasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={contractStatusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={4}>
                              {contractStatusData.map((entry, index) => (
                                <Cell key={`contract-status-${entry.name}-${index}`} fill={chartPalette[index % chartPalette.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `${value} contrato${value === 1 ? '' : 's'}`} />
                            <Legend verticalAlign="bottom" height={32} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                          Registra contratos para visualizar su distribución por estatus.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Ejecución presupuestal</h3>
                    <span className="text-xs text-slate-400">{formatCurrency(totalContratado)}</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-64">
                      {loadingData ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                      ) : budgetExecutionHasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={budgetExecutionData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={4}>
                              <Cell key="budget-executed" fill="#0F4C3A" />
                              <Cell key="budget-remaining" fill="#B38E5D" />
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend verticalAlign="bottom" height={32} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                          Aún no se registran montos contratados en el control de pagos.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Facturas por estatus</h3>
                    <span className="text-xs text-slate-400">{invoicesTotal} registros</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-64">
                      {loadingData ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                      ) : invoicesStatusHasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={invoicesStatusSummary} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={4}>
                              {invoicesStatusSummary.map((entry, index) => (
                                <Cell key={`invoice-status-${entry.name}-${index}`} fill={invoicesPalette[index % invoicesPalette.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `${value} factura${value === 1 ? '' : 's'}`} />
                            <Legend verticalAlign="bottom" height={32} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                          Carga facturas para monitorear su avance por estatus.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Flujo mensual de pagos</h3>
                    <span className="text-xs text-slate-400">{formatCurrency(totalEjercido)} ejercido</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-72">
                      {loadingData ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                      ) : paymentsFlowHasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={paymentsMonthlyFlow} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(value: number) => formatNumber(value)} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Bar dataKey="value" name="Pagos" fill="#0F4C3A" radius={[4, 4, 0, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                          Aún no hay montos mensuales registrados en el control de pagos.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Top gerencias por monto PAAS</h3>
                    <span className="text-xs text-slate-400">{paasSummary.gerenciasCount} gerencia{paasSummary.gerenciasCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="flex-1">
                    <div className="h-72">
                      {loadingData ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                      ) : topPaasGerenciasHasData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topPaasGerencias} layout="vertical" margin={{ top: 10, right: 24, left: 0, bottom: 10 }} barCategoryGap={18}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={240} tick={renderCompanyTick} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value: number | string) => formatCurrency(typeof value === 'number' ? value : Number(value))} />
                            <Bar dataKey="value" fill="#B38E5D" radius={[0, 6, 6, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                          Registra partidas PAAS para visualizar su distribución por gerencia.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">Alertas y pendientes</h3>
                  <span className="text-xs text-slate-400">Última actualización: {formatDateTime(new Date().toISOString())}</span>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-[#0F4C3A]" />
                    Contratos por vencer
                  </h4>
                  {contractTimelineInsights.upcoming.length ? (
                    <ul className="mt-3 space-y-3">
                      {contractTimelineInsights.upcoming.map((alert) => (
                        <li key={alert.id} className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{alert.provider}</p>
                            <p className="text-xs text-slate-500">{alert.contractNumber} · {alert.service}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-600">{alert.endDateLabel}</p>
                            <p className="text-xs text-slate-500">{describeDaysUntil(alert.daysLeft)}</p>
                            <p className="text-xs text-slate-400">{formatCurrency(alert.amount || 0)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">No hay contratos dentro de la ventana de {CONTRACT_SOON_WINDOW_DAYS} días.</p>
                  )}
                </div>

                {contractTimelineInsights.overdueList.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-600">Vencidos</h4>
                    <ul className="mt-2 space-y-2">
                      {contractTimelineInsights.overdueList.map((alert) => (
                        <li key={`${alert.id}-overdue`} className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{alert.provider}</p>
                            <p className="text-xs text-slate-500">{alert.contractNumber} · {alert.service}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-rose-600">{alert.endDateLabel}</p>
                            <p className="text-xs text-rose-500">{describeDaysUntil(alert.daysLeft)}</p>
                            <p className="text-xs text-slate-400">{formatCurrency(alert.amount || 0)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observaciones de pago</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">{pendingObservationsCount}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {pendingObservationsCount
                        ? dominantObservationCategory
                          ? `Categoría líder: ${dominantObservationCategory.name} (${dominantObservationShare}%).`
                          : 'Distribución equilibrada entre categorías.'
                        : 'Sin observaciones registradas.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Procedimientos Compranet</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">{compranetData.length}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {compranetTopStatus
                        ? `${compranetTopStatus.name}: ${compranetTopStatus.value} (${compranetTopStatusShare}% del total).`
                        : 'Integra procedimientos para identificar estatus dominantes.'}
                    </p>
                  </div>
                </div>
              </div>
                </>
              ) : (
                <div className="space-y-6">
                  <button 
                    onClick={() => setSelectedServicePhase(null)}
                    className="flex items-center text-sm text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Volver al resumen
                  </button>

                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Servicios en fase: <span className="text-[#B38E5D]">{selectedServicePhase}</span></h2>
                    <p className="text-slate-500 mt-1">Listado detallado de servicios en esta etapa.</p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-800 text-white">
                          <tr>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Servicio</th>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Subdirección</th>
                            <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Gerencia</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                          {servicios2026Data
                            .filter(row => {
                                const statusValue = serviciosStatusField ? row[serviciosStatusField] : null;
                                const index = resolveServicioStatusIndex(statusValue);
                                if (index >= 0) {
                                    return SERVICIOS_STATUS_STEPS[index] === selectedServicePhase;
                                } else {
                                    const cleanStatus = String(statusValue || '').trim();
                                    const formattedStatus = cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1).toLowerCase();
                                    return formattedStatus === selectedServicePhase;
                                }
                            })
                            .map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors duration-150">
                                <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                                  {serviciosServiceNameField ? row[serviciosServiceNameField] : 'Sin descripción'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {serviciosSubdireccionField ? row[serviciosSubdireccionField] : 'N/A'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                                    {serviciosGerenciaField ? row[serviciosGerenciaField] : 'N/A'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}



          {activeTab === 'serviciosStatus' && (
            <div className="space-y-8">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Estatus de servicios</h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Seguimiento visual del avance por estatus y los montos declarados en cada registro de <code className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs">estatus_servicios_2026</code>.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => setStatusTab('dashboard')}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        statusTab === 'dashboard'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Tablero
                    </button>
                    <button
                      onClick={() => setStatusTab('calendar')}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        statusTab === 'calendar'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Seguimiento
                    </button>
                    <button
                      onClick={() => setStatusTab('table')}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                        statusTab === 'table'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Tabla
                    </button>
                  </div>
                  <span className="inline-flex items-center justify-center rounded-full bg-[#0F4C3A]/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0F4C3A]">
                    {formatResultLabel(serviciosStatusEntries.length)}
                  </span>
                </div>
              </div>

              {statusTab === 'dashboard' && (
                <>
                  {!serviciosStatusField && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                      No se detectó una columna con la palabra “estatus” en la tabla. Añádela en Supabase para activar el tablero y reflejar el flujo oficial.
                    </div>
                  )}

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0F4C3A] via-emerald-500 to-teal-400 p-6 text-white shadow-2xl shadow-emerald-600/20">
                  <div className="absolute inset-y-0 right-0 w-48 opacity-30 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.65),transparent)]" aria-hidden="true" />
                  <div className="relative flex items-start justify-between gap-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-semibold">Promedio de avance</p>
                      <p className="text-5xl font-black mt-2 drop-shadow-lg">{serviciosStatusSummary.avgPercent}%</p>
                      <p className="text-white/90 text-sm mt-2">
                        {serviciosStatusSummary.total ? 'Cálculo dinámico a partir del último estatus capturado.' : 'Carga registros con estatus para comenzar el seguimiento.'}
                      </p>
                    </div>
                    <Sparkles className="h-10 w-10 text-white/80" />
                  </div>
                  <div className="relative mt-6">
                    <div className="flex items-center justify-between text-xs font-semibold text-white/80">
                      <span>Estatus cubiertos</span>
                      <span>{SERVICIOS_STATUS_STEPS.length} hitos</span>
                    </div>
                    <div className="mt-3 h-3 rounded-full bg-white/25 shadow-inner">
                      <div
                        className="h-full rounded-full bg-white"
                        style={{ width: `${serviciosStatusSummary.avgPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
                  <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-emerald-100/70">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Servicios completados</p>
                    <p className="text-4xl font-black text-slate-900 mt-2">{serviciosStatusSummary.completed}</p>
                    <p className="text-sm text-slate-500 mt-1">{serviciosStatusSummary.completedPct}% del universo monitoreado.</p>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-amber-100/70">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pendientes por cerrar</p>
                    <p className="text-4xl font-black text-slate-900 mt-2">{Math.max(serviciosStatusSummary.total - serviciosStatusSummary.completed, 0)}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {serviciosStatusSummary.total ? 'Enfoca esfuerzos en estos servicios para acelerar el flujo.' : 'Aún no hay registros listos para seguimiento.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-slate-200/70 p-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Detalle por servicio</h3>
                    <p className="text-xs text-slate-500 mt-1">Expande cualquier tarjeta para revisar los montos detectados en el registro.</p>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    {formatResultLabel(serviciosStatusEntries.length)} · {SERVICIOS_STATUS_STEPS.length} hitos monitoreados
                  </div>
                </div>
                <div className="mt-6 space-y-5">
                  {loadingData ? (
                    <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Cargando estatus…</div>
                  ) : !serviciosStatusEntriesOrdered.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      {serviciosStatusField
                        ? 'No hay coincidencias con los filtros aplicados en Servicios 2026.'
                        : 'Agrega una columna de estatus en Supabase para habilitar este tablero.'}
                    </div>
                  ) : (
                    serviciosStatusEntriesOrdered.map((entry) => {
                      const percent = entry.stageIndex >= 0
                        ? Math.round(((entry.stageIndex + 1) / serviciosStatusStepCount) * 100)
                        : 0;
                      const accent = getServicioStatusAccent(entry.stageIndex);
                      const isExpanded = expandedServicioStatusId === entry.id;
                      return (
                        <div
                          key={entry.id ?? entry.serviceName}
                          className={`relative rounded-3xl border border-white/70 bg-gradient-to-br ${accent.surface} p-6 shadow-xl ${accent.glow}`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-base font-semibold text-slate-900">{entry.serviceName}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                                {entry.clave && (
                                  <span className="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-2 py-0.5 text-slate-700">
                                    Clave {entry.clave}
                                  </span>
                                )}
                                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold ${accent.badge}`}>
                                  {entry.stageLabel ?? 'Sin estatus detectado'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-1">{entry.statusLabel}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Avance de estatus</p>
                              <p className="text-3xl font-black text-slate-900">{percent}%</p>
                            </div>
                          </div>
                          <div className="mt-4 relative">
                            <div className="h-3 rounded-full bg-white/60 overflow-hidden">
                              <div className={`h-full rounded-full bg-gradient-to-r ${accent.progress}`} style={{ width: `${percent}%` }} />
                            </div>
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent)]" />
                          </div>
                          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600">
                            <span>{entry.stageIndex >= 0 ? 'Avance de estatus detectado' : 'Sin estatus detectado'}</span>
                            <button
                              type="button"
                              onClick={() => setExpandedServicioStatusId((prev) => (prev === entry.id ? null : entry.id))}
                              className="inline-flex items-center gap-1 text-[#0F4C3A] font-semibold hover:text-[#0c3b2d]"
                            >
                              {isExpanded ? 'Ocultar montos' : 'Ver montos' }
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="mt-4 rounded-2xl border border-white/60 bg-white/80 p-4">
                              {entry.monetary.length ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {entry.monetary.map((item, idx) => (
                                    <div key={`${entry.id}-monto-${idx}`} className="rounded-2xl border border-slate-100 bg-white p-4">
                                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
                                      <p className="text-base font-semibold text-slate-900 mt-1">{formatCurrency(item.value)}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">No se detectaron campos monetarios en este registro.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
                </>
              )}

              {statusTab === 'calendar' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-[800px]">
                   <BigCalendar
                      localizer={localizer}
                      events={calendarEvents}
                      startAccessor="start"
                      endAccessor="end"
                      culture="es"
                      style={{ height: '100%' }}
                      view={calendarView}
                      onView={(view) => setCalendarView(view)}
                      date={calendarDate}
                      onNavigate={(date) => setCalendarDate(date)}
                      messages={{
                        next: "Siguiente",
                        previous: "Anterior",
                        today: "Hoy",
                        month: "Mes",
                        week: "Semana",
                        day: "Día",
                        agenda: "Agenda",
                        date: "Fecha",
                        time: "Hora",
                        event: "Evento",
                        noEventsInRange: "No hay eventos en este rango",
                      }}
                      eventPropGetter={(event) => ({
                        style: {
                          backgroundColor: event.resource?.color || '#3B82F6',
                          fontSize: '0.85rem',
                          borderRadius: '4px',
                          border: 'none',
                        }
                      })}
                      components={{
                        event: ({ event }) => (
                          <div title={event.title} className="flex flex-col">
                            <span className="font-semibold text-[10px] leading-tight">{event.resource?.type}</span>
                            <span className="text-[10px] truncate opacity-90">{event.resource?.serviceName}</span>
                          </div>
                        )
                      }}
                   />
                </div>
              )}

              {statusTab === 'table' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Tabla de Estatus de Servicios</h3>
                        <p className="text-xs text-slate-500 mt-1">Consulta y edita los registros de estatus.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <button
                          onClick={() => setIsServiciosCompact(!isServiciosCompact)}
                          className={`p-2 rounded-md transition-colors ${isServiciosCompact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                          title={isServiciosCompact ? "Vista normal" : "Vista compacta"}
                        >
                          {isServiciosCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                        </button>
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={() => setIsServiciosEditing((prev) => !prev)}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isServiciosEditing ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                          >
                            {isServiciosEditing ? (
                              <>
                                <Save className="h-4 w-4" />
                                Salir de edición
                              </>
                            ) : (
                              <>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </>
                            )}
                          </button>
                        )}
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={handleAddServicioRow}
                            disabled={!serviciosTableColumns.length}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${serviciosTableColumns.length ? 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                          >
                            <Plus className="h-4 w-4" />
                            Agregar fila
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {isServiciosEditing && (
                      <div className="px-6 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Modo edición activo: ajusta cualquier celda como en Excel y usa "Salir de edición" para bloquear cambios.
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <div className="relative w-full sm:w-80">
                        <Search className="table-filter-icon" aria-hidden="true" />
                        <input
                          type="text"
                          value={tableFilters.servicios2026}
                          onChange={(event) => updateTableFilter('servicios2026', event.target.value)}
                          placeholder="Filtra por servicio, clave o monto"
                          className="table-filter-input"
                        />
                        {tableFilters.servicios2026 && (
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                            onClick={() => updateTableFilter('servicios2026', '')}
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px] font-semibold">
                        {serviciosColumnFiltersCount > 0 && (
                          <button
                            type="button"
                            className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                            onClick={() => clearColumnFilters('servicios2026')}
                          >
                            Limpiar filtros por columna
                          </button>
                        )}
                        <span className="text-slate-500">
                          {formatResultLabel(displayedServicios2026Rows.length)}
                          {tableFilters.servicios2026.trim() ? ' · filtro general' : ''}
                          {serviciosColumnFiltersCount ? ` · ${formatColumnFilterLabel(serviciosColumnFiltersCount)}` : ''}
                        </span>
                      </div>
                      {renderActiveColumnFilterBadges('servicios2026')}
                    </div>

                    <div className={`relative ${serviciosSizing.containerHeightClass} overflow-auto`}>
                      <table className={`min-w-full ${serviciosSizing.tableMinWidthClass} ${serviciosSizing.tableTextClass} text-center border-collapse`}>
                        <thead className={`uppercase tracking-wide text-white ${serviciosSizing.headerTextClass}`}>
                          <tr className={serviciosSizing.headerRowClass}>
                            {(serviciosColumnsToRender.length ? serviciosColumnsToRender : serviciosTableColumns).map((column) => (
                                <th
                                  key={column}
                                  className={`${serviciosSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center`}
                                  style={{ backgroundColor: '#0F4C3A', color: '#fff' }}
                                >
                                  <div className="flex items-center justify-center gap-1 text-white">
                                    <span className="truncate">{humanizeKey(column)}</span>
                                    {(() => {
                                      const colTooltip = SERVICIOS_COLUMN_TOOLTIPS[normalizeAnnualKey(column)];
                                      return colTooltip ? (
                                        <ColumnInfoTooltip label={humanizeKey(column)} tooltip={colTooltip} />
                                      ) : null;
                                    })()}
                                    {renderColumnFilterControl('servicios2026', column, humanizeKey(column), servicios2026Data)}
                                  </div>
                                </th>
                            ))}
                            {canManageRecords && (
                                <th className={`${serviciosSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center`} style={{ backgroundColor: '#0F4C3A', color: '#fff' }}>
                                    Acciones
                                </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loadingData ? (
                            <tr><td colSpan={serviciosTableColumns.length + (canManageRecords ? 1 : 0)} className="text-center py-10 text-slate-500">Cargando...</td></tr>
                          ) : !displayedServicios2026Rows.length ? (
                            <tr><td colSpan={serviciosTableColumns.length + (canManageRecords ? 1 : 0)} className="text-center py-10 text-slate-500">No hay datos.</td></tr>
                          ) : (
                            displayedServicios2026Rows.map(({ row, isPrimary, turnNumber }, rowIndex) => {
                              const rowKey = row.id ?? `servicio-row-${rowIndex}`;
                              const rowHasConvenio = Object.entries(row as Record<string, any>).some(([key, value]) => isConvenioColumnName(key) && getBooleanChecked(value));
                              const isStriped = rowIndex % 2 === 0;
                              const zebraBackground = rowHasConvenio ? '#ECFDF5' : (isStriped ? '#ffffff' : '#f8fafc');
                              const rowStyle = buildRowStyle(zebraBackground);
                              const columns = serviciosColumnsToRender.length ? serviciosColumnsToRender : serviciosTableColumns;

                              return (
                                <tr key={rowKey} className="transition-colors table-row" style={rowStyle}>
                                  {columns.map((column) => {
                                    const rawValue = row[column];
                                    const numeric = typeof rawValue === 'number' || shouldFormatAsCurrency(column);
                                    const baseClasses = numeric ? serviciosSizing.numericCellClass : serviciosSizing.textCellClass;
                                    const isCellEditable = isServiciosEditing;
                                    const cellClasses = isCellEditable ? `${baseClasses} cursor-text` : baseClasses;

                                    let editingValue = '';
                                    if (rawValue !== null && rawValue !== undefined) {
                                        if (typeof rawValue === 'number') {
                                            if (shouldFormatAsCurrency(column)) {
                                                editingValue = rawValue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                            } else {
                                                editingValue = String(rawValue);
                                            }
                                        } else if (rawValue instanceof Date) {
                                            editingValue = formatDateToDDMMYYYY(rawValue);
                                        } else if (typeof rawValue === 'string') {
                                            const parsedForEdit = parsePotentialDate(rawValue);
                                            if (parsedForEdit) {
                                                editingValue = formatDateToDDMMYYYY(parsedForEdit);
                                            } else {
                                                if (shouldFormatAsCurrency(column)) {
                                                    const sanitized = rawValue.replace(/,/g, '');
                                                    const num = parseFloat(sanitized);
                                                    if (!isNaN(num)) {
                                                        editingValue = num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                    } else {
                                                        editingValue = rawValue;
                                                    }
                                                } else {
                                                    editingValue = rawValue;
                                                }
                                            }
                                        } else {
                                            editingValue = String(rawValue);
                                        }
                                    }

                                    const isBooleanCol = shouldTreatAsBooleanColumn(column, rawValue, [
                                      'procedimiento de contratacion',
                                      'plurianual',
                                      'anticipo',
                                      'convenio',
                                      'suficiencia',
                                      'investigacion',
                                      'validado'
                                    ]);
                                    
                                    const isDateCol = normalizeAnnualKey(column).includes('fecha');
                                    const isServiceNameCell = column === serviciosServiceNameField;
                                    const convenioBadge = rowHasConvenio ? (
                                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                        Convenio modificatorio
                                      </span>
                                    ) : !isPrimary ? (
                                      <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                        {`Vuelta ${turnNumber}`}
                                      </span>
                                    ) : null;

                                    const isChecked = isBooleanCol ? getBooleanChecked(rawValue) : false;
                                    const _colNorm = column.toLowerCase().replace(/[\s_]+/g, '_');
                                    const isTipoServicioCol = _colNorm === 'tipo_de_servicio' || (_colNorm.includes('tipo') && _colNorm.includes('servicio'));

                                    return (
                                      <td key={column} className={cellClasses}>
                                        {isCellEditable ? (
                                          isTipoServicioCol ? (
                                            <TipoServicioPicker
                                              value={rawValue ? String(rawValue) : ''}
                                              onChange={(nextValue) => handleServiciosCellEdit(row, column, nextValue)}
                                            />
                                          ) : isBooleanCol ? (
                                              <div className="flex items-center justify-center h-full min-h-[1.5em]" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                      type="checkbox"
                                                      aria-label={`Alternar ${humanizeKey(column)}`}
                                                      title={`Alternar ${humanizeKey(column)}`}
                                                      className="w-5 h-5 text-[#0F4C3A] bg-gray-100 border-gray-300 rounded focus:ring-[#0F4C3A] cursor-pointer accent-[#2d3e50]"
                                                      checked={isChecked}
                                                        onChange={(e) => {
                                                          const newVal = e.target.checked;
                                                          if (isConvenioColumnName(column)) {
                                                            handleConvenioCellEdit('estatus_servicios_2026', row, column, newVal, setServicios2026Data, servicios2026Data);
                                                            return;
                                                          }
                                                          const valToSave = getBooleanSaveValue(rawValue, column, newVal);
                                                          handleServiciosCellEdit(row, column, valToSave);
                                                        }}
                                                  />
                                              </div>
                                          ) : isDateCol ? (
                                            <input
                                                type="date"
                                              aria-label={`Fecha ${humanizeKey(column)}`}
                                              title={`Fecha ${humanizeKey(column)}`}
                                                className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                value={(() => {
                                                     if (rawValue instanceof Date) return rawValue.toISOString().split('T')[0];
                                                     if (typeof rawValue === 'string') {
                                                         const p = parsePotentialDate(rawValue);
                                                         return p ? p.toISOString().split('T')[0] : '';
                                                     }
                                                     return '';
                                                })()}
                                                onChange={(e) => handleServiciosCellEdit(row, column, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                          ) : (
                                          isServiceNameCell ? (
                                            <div className="flex flex-col items-center gap-1">
                                              {rowHasConvenio && isPrimary ? (
                                                <button
                                                  type="button"
                                                  className="inline-block w-full px-0.5 py-0.5 text-center font-medium text-slate-700 hover:text-emerald-700"
                                                  onClick={() => handleConvenioServiceClick('estatus_servicios_2026', row, serviciosServiceNameField, serviciosClaveField, servicios2026Data, setServicios2026Data, expandedServiciosConvenio, setExpandedServiciosConvenio)}
                                                >
                                                  {editingValue}
                                                </button>
                                              ) : (
                                                <div
                                                  contentEditable
                                                  suppressContentEditableWarning
                                                  className={`inline-block w-full ${serviciosSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                                  onBlur={(event) => handleServiciosCellEdit(row, column, event.currentTarget.textContent ?? '')}
                                                  onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                      event.preventDefault();
                                                      (event.currentTarget as HTMLDivElement).blur();
                                                    }
                                                  }}
                                                >
                                                  {editingValue}
                                                </div>
                                              )}
                                              {rowHasConvenio && isPrimary ? (
                                                <button
                                                  type="button"
                                                  className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-200"
                                                  onClick={() => handleConvenioServiceClick('estatus_servicios_2026', row, serviciosServiceNameField, serviciosClaveField, servicios2026Data, setServicios2026Data, expandedServiciosConvenio, setExpandedServiciosConvenio)}
                                                >
                                                  Convenio modificatorio
                                                </button>
                                              ) : convenioBadge}
                                            </div>
                                          ) : (
                                            <div
                                              contentEditable
                                              suppressContentEditableWarning
                                              className={`inline-block w-full ${serviciosSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                              onBlur={(event) => handleServiciosCellEdit(row, column, event.currentTarget.textContent ?? '')}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                  event.preventDefault();
                                                  (event.currentTarget as HTMLDivElement).blur();
                                                }
                                              }}
                                            >
                                              {editingValue}
                                            </div>
                                          )
                                          )
                                        ) : (
                                          isTipoServicioCol ? (
                                            <div className="flex items-center justify-center">
                                              {rawValue ? (
                                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getTipoColorClass(String(rawValue))}`}>
                                                    {String(rawValue)}
                                                  </span>
                                              ) : (
                                                <span className="text-xs text-slate-400 italic">—</span>
                                              )}
                                            </div>
                                          ) : isBooleanCol ? (
                                              <div className="flex items-center justify-center h-full min-h-[1.5em]">
                                                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#2d3e50] border-[#2d3e50]' : 'bg-transparent border-slate-300'}`}>
                                                      {isChecked && (
                                                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                          </svg>
                                                      )}
                                                  </div>
                                              </div>
                                          ) : (
                                            isServiceNameCell ? (
                                              <div className="flex flex-col items-center gap-1">
                                                {rowHasConvenio && isPrimary ? (
                                                  <button
                                                    type="button"
                                                    className="font-medium text-slate-700 hover:text-emerald-700"
                                                    onClick={() => handleConvenioServiceClick('estatus_servicios_2026', row, serviciosServiceNameField, serviciosClaveField, servicios2026Data, setServicios2026Data, expandedServiciosConvenio, setExpandedServiciosConvenio)}
                                                  >
                                                    {formatTableValue(column, rawValue)}
                                                  </button>
                                                ) : (
                                                  <span>{formatTableValue(column, rawValue)}</span>
                                                )}
                                                {rowHasConvenio && isPrimary ? (
                                                  <button
                                                    type="button"
                                                    className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-200"
                                                    onClick={() => handleConvenioServiceClick('estatus_servicios_2026', row, serviciosServiceNameField, serviciosClaveField, servicios2026Data, setServicios2026Data, expandedServiciosConvenio, setExpandedServiciosConvenio)}
                                                  >
                                                    Convenio modificatorio
                                                  </button>
                                                ) : convenioBadge}
                                              </div>
                                            ) : (
                                              formatTableValue(column, rawValue)
                                            )
                                          )
                                        )}
                                      </td>
                                    );
                                  })}
                                  {canManageRecords && (
                                      <td className={`${serviciosSizing.actionsCellPadding} text-center`}>
                                          <div className="flex justify-center gap-2">
                                              <button
                                                onClick={() => openRecordEditor('estatus_servicios_2026', 'Servicio', serviciosTableColumns, row as Record<string, any>)}
                                                className="p-1.5 rounded-md text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 transition-colors"
                                                title="Editar"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </button>
                                              <button
                                                onClick={() => handleDeleteGenericRecord('estatus_servicios_2026', row as Record<string, any>, 'Servicio')}
                                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                title="Eliminar"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                          </div>
                                      </td>
                                  )}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Historial de Cambios</h1>
                  <p className="text-slate-500 text-sm">
                    Consulta qué administradores modificaron los registros y qué campos se alteraron.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Filtrar historial por tabla"
                    title="Filtrar historial por tabla"
                    value={historyTableFilter}
                    onChange={(event) => setHistoryTableFilter(event.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#B38E5D]/40"
                  >
                    <option value="all">Todas las tablas</option>
                    {historyTables.map((tableName) => (
                      <option key={tableName} value={tableName}>
                        {humanizeKey(tableName)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={fetchChangeHistory}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <History className="h-4 w-4" />
                    Actualizar
                  </button>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {historyError ? (
                  <div className="p-6 text-sm text-red-600 bg-red-50 border-b border-red-100">
                    {historyError}
                  </div>
                ) : (
                  <div>
                    {loadingHistory ? (
                      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Cargando historial...
                      </div>
                    ) : filteredHistory.length === 0 ? (
                      <div className="p-6 text-sm text-slate-500 text-center">
                        No hay registros aún. Cuando un administrador cree, actualice o elimine información aparecerá aquí.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {filteredHistory.map((entry) => {
                          const diffList = entry.changes && entry.changes.length
                            ? entry.changes
                            : computeChangeDetails(
                                entry.previous_data as Record<string, any> | null,
                                entry.new_data as Record<string, any> | null
                              );
                          const meta = historyActionMeta[entry.action] ?? historyActionMeta.UPDATE;
                          const roleLabel =
                            entry.changed_by_role === UserRole.ADMIN
                              ? 'Administrador'
                              : entry.changed_by_role === UserRole.OPERATOR
                                ? 'Operador'
                                : entry.changed_by_role === UserRole.VIEWER
                                  ? 'Solo lectura'
                                  : entry.changed_by_role ?? null;

                          return (
                            <div key={`${entry.id}-${entry.created_at}`} className="p-6 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">
                                    {entry.changed_by_name ?? 'Usuario desconocido'}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {formatDateTime(entry.created_at)}
                                  </p>
                                </div>
                                <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${meta.className}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                                <span>
                                  Tabla:{' '}
                                  <span className="font-mono text-slate-700">{entry.table_name}</span>
                                </span>
                                <span>
                                  Registro:{' '}
                                  <span className="font-mono text-slate-700">{entry.record_id ?? '—'}</span>
                                </span>
                                {roleLabel && (
                                  <span>
                                    Rol:{' '}
                                    <span className="font-semibold text-slate-600">{roleLabel}</span>
                                  </span>
                                )}
                              </div>
                              {diffList.length ? (
                                <div className="overflow-x-auto rounded-lg border border-slate-100">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                                      <tr>
                                        <th className="px-4 py-2 text-left font-semibold">Campo</th>
                                        <th className="px-4 py-2 text-left font-semibold">Antes</th>
                                        <th className="px-4 py-2 text-left font-semibold">Después</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {diffList.map((change) => {
                                        const rowStyle = buildRowStyle('#ffffff');
                                        return (
                                          <tr
                                            key={`${entry.id}-${change.field}`}
                                            className="border-t border-slate-100 table-row transition-colors"
                                            style={rowStyle}
                                          >
                                            <td className="px-4 py-2 font-semibold text-slate-700 align-top whitespace-nowrap">
                                              {humanizeKey(change.field)}
                                            </td>
                                            <td className="px-4 py-2 text-slate-500 align-top whitespace-pre-wrap break-words">
                                              {formatTableValue(change.field, change.before)}
                                            </td>
                                            <td className="px-4 py-2 text-slate-700 align-top whitespace-pre-wrap break-words">
                                              {formatTableValue(change.field, change.after)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  No se registraron cambios de campo para esta acción.
                                </p>
                              )}
                              <details className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                                <summary className="cursor-pointer font-semibold text-slate-600">
                                  Ver detalle JSON
                                </summary>
                                <div className="mt-3 space-y-3">
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Antes</p>
                                    <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700">
                                      {entry.previous_data ? JSON.stringify(entry.previous_data, null, 2) : '—'}
                                    </pre>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Después</p>
                                    <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700">
                                      {entry.new_data ? JSON.stringify(entry.new_data, null, 2) : '—'}
                                    </pre>
                                  </div>
                                </div>
                              </details>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === '2026' && (
            <div className="space-y-6">
              {active2026View === 'resumen' && (
                <>
                  {selectedEstatus2026Estatus ? (
                    /* Detail view: services in selected estatus */
                    <div className="space-y-6">
                      <button
                        onClick={() => setSelectedEstatus2026Estatus(null)}
                        className="flex items-center text-sm text-slate-500 hover:text-slate-800 transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Volver al resumen 2026
                      </button>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">
                          Servicios con estatus: <span className="text-[#B38E5D]">{selectedEstatus2026Estatus}</span>
                        </h2>
                        <p className="text-slate-500 mt-1">
                          {estatus2026Data.filter((row) => {
                            if (!estatus2026EstatusColumnField) return false;
                            const raw = row[estatus2026EstatusColumnField];
                            if ((!raw || String(raw).trim() === '') && selectedEstatus2026Estatus === 'Sin estatus') return true;
                            const label = String(raw ?? '').trim();
                            let displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
                            if (displayLabel.toLowerCase().startsWith('investigaci')) displayLabel = 'Investigación de mercado';
                            return displayLabel === selectedEstatus2026Estatus;
                          }).length} servicio(s) con este estatus.
                        </p>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-[#0F4C3A] text-white">
                              <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Servicio</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Subdirección</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Gerencia</th>
                                {estatus2026MontoFieldSummary && (
                                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">Monto</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {estatus2026Data
                                .filter((row) => {
                                  if (!estatus2026EstatusColumnField) return false;
                                  const raw = row[estatus2026EstatusColumnField];
                                  if ((!raw || String(raw).trim() === '') && selectedEstatus2026Estatus === 'Sin estatus') return true;
                                  const label = String(raw ?? '').trim();
                                  let displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
                                  if (displayLabel.toLowerCase().startsWith('investigaci')) displayLabel = 'Investigación de mercado';
                                  return displayLabel === selectedEstatus2026Estatus;
                                })
                                .map((row, idx) => (
                                  <tr key={idx} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                                      {estatus2026ServiceNameFieldSummary ? String(row[estatus2026ServiceNameFieldSummary] ?? 'Sin nombre') : 'Sin nombre'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        {estatus2026SubdirFieldSummary ? String(row[estatus2026SubdirFieldSummary] ?? 'N/A') : 'N/A'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                                        {estatus2026GerenciaFieldSummary ? [['Aeronautica','Aeronáutica'],['Electromecanica','Electromecánica'],['Electromecanico','Electromecánico'],['Ingenieria','Ingeniería'],['Distribucion','Distribución'],['Generacion','Generación'],['Operacion','Operación'],['Administracion','Administración'],['Medico','Médico'],['Tecnico','Técnico'],['Tecnica','Técnica'],['Juridica','Jurídica'],['Juridico','Jurídico'],['Gestion','Gestión'],['Comunicacion','Comunicación']].reduce((s, [a, b]) => s.replace(new RegExp(`\\b${a}\\b`, 'gi'), b), String(row[estatus2026GerenciaFieldSummary] ?? 'N/A')) : 'N/A'}
                                      </span>
                                    </td>
                                    {estatus2026MontoFieldSummary && (
                                      <td className="px-6 py-4 text-right font-mono text-sm text-slate-700">
                                        {formatCurrency(parseNumericValue(row[estatus2026MontoFieldSummary]))}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : !selectedEstatus2026Phase ? (
                    <div className="space-y-6">
                      <div>
                        <h1 className="text-2xl font-bold text-slate-900">Resumen 2026</h1>
                        <p className="text-slate-500 mt-1">
                          Vista consolidada del estatus de servicios y flujo de pagos para el ejercicio 2026.
                        </p>
                      </div>

                      {/* KPI Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Servicios</p>
                              <p className="text-3xl font-bold text-slate-900 mt-2">{estatus2026KPIs.total}</p>
                              <p className="text-xs text-slate-500 mt-2">Registros en estatus 2026</p>
                            </div>
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[#0F4C3A] border border-white/60 shadow-sm">
                              <Layers className="h-5 w-5" />
                            </span>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Adjudicados</p>
                              <p className="text-3xl font-bold text-slate-900 mt-2">{estatus2026KPIs.adjudicados}</p>
                              <p className="text-xs text-slate-500 mt-2">
                                {estatus2026KPIs.total > 0
                                  ? `${Math.round((estatus2026KPIs.adjudicados / estatus2026KPIs.total) * 100)}% del total`
                                  : 'Sin datos'}
                              </p>
                            </div>
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-700 border border-white/60 shadow-sm">
                              <TrendingUp className="h-5 w-5" />
                            </span>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">En Procedimiento</p>
                              <p className="text-3xl font-bold text-slate-900 mt-2">{estatus2026KPIs.procedimiento}</p>
                              <p className="text-xs text-slate-500 mt-2">
                                {estatus2026KPIs.total > 0
                                  ? `${Math.round((estatus2026KPIs.procedimiento / estatus2026KPIs.total) * 100)}% del total`
                                  : 'Sin datos'}
                              </p>
                            </div>
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700 border border-white/60 shadow-sm">
                              <Activity className="h-5 w-5" />
                            </span>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Pagos 2026</p>
                              <p className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(pagos2026TotalAmount)}</p>
                              <p className="text-xs text-slate-500 mt-2">{pagos2026Data.length} registros de pago</p>
                            </div>
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-700 border border-white/60 shadow-sm">
                              <DollarSign className="h-5 w-5" />
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Pie chart: Distribución por Estatus – columna Estatus de la tabla estatus_2026 */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800">Distribución de Servicios por Estatus</h3>
                            <p className="text-xs text-slate-500 mt-1">
                              Haz clic en un estatus para ver los servicios en esa categoría.
                            </p>
                          </div>
                          <span className="text-xs text-slate-400">{estatus2026Data.length} servicios</span>
                        </div>
                        <div className="h-[460px] w-full">
                          {loadingData ? (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                          ) : estatus2026EstatusDistribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 40, bottom: 40, left: 40, right: 40 }}>
                                <Pie
                                  data={estatus2026EstatusDistribution}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={100}
                                  onClick={(data: any) => setSelectedEstatus2026Estatus(data.name)}
                                  className="cursor-pointer"
                                  label={({ cx, cy, midAngle = 0, outerRadius, percent = 0, index, name = '' }: any) => {
                                    const RADIAN = Math.PI / 180;
                                    const radius = outerRadius + 55;
                                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                    if ((percent * 100) < 2) return null;
                                    return (
                                      <text
                                        x={x}
                                        y={y}
                                        fill={ESTATUS_2026_COLOR_MAP[name] ?? chartPalette[index % chartPalette.length]}
                                        textAnchor={x > cx ? 'start' : 'end'}
                                        dominantBaseline="central"
                                        className="text-[11px] font-bold"
                                      >
                                        {`${name} (${(percent * 100).toFixed(0)}%)`}
                                      </text>
                                    );
                                  }}
                                  labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                >
                                  {estatus2026EstatusDistribution.map((entry, index) => (
                                    <Cell key={`cell-estatus2-${index}`} fill={ESTATUS_2026_COLOR_MAP[entry.name] ?? chartPalette[index % chartPalette.length]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(value: number, name: string) => {
                                    const total = estatus2026EstatusDistribution.reduce((a, b) => a + b.value, 0);
                                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                                    return [`${value} servicio${value === 1 ? '' : 's'} (${pct}%)`, name];
                                  }}
                                />
                                <Legend
                                  verticalAlign="bottom"
                                  height={36}
                                  iconType="circle"
                                  wrapperStyle={{ fontSize: '12px', paddingTop: '20px', cursor: 'pointer' }}
                                  onClick={(data: any) => setSelectedEstatus2026Estatus(data.value || null)}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                              No hay datos en la columna Estatus de la tabla Estatus 2026.
                            </div>
                          )}
                        </div>
                        {/* Desglose rápido por estatus */}
                        {estatus2026EstatusDistribution.length > 0 && (
                          <div className="mt-6 space-y-3">
                            <h4 className="text-sm font-semibold text-slate-600">Desglose por estatus</h4>
                            {estatus2026EstatusDistribution.map((item, index) => {
                              const pct = estatus2026Data.length > 0 ? Math.round((item.value / estatus2026Data.length) * 100) : 0;
                              const color = ESTATUS_2026_COLOR_MAP[item.name] ?? chartPalette[index % chartPalette.length];
                              return (
                                <button key={item.name} className="w-full text-left group" onClick={() => setSelectedEstatus2026Estatus(item.name)}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{item.name}</span>
                                    <span className="text-sm font-bold text-slate-600">{item.value} <span className="text-xs font-normal text-slate-400">({pct}%)</span></span>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Pie chart: Distribución por Fase */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800">Distribución de Servicios por Fase</h3>
                            <p className="text-xs text-slate-500 mt-1">
                              Haz clic en una fase para ver los servicios en esa etapa.
                            </p>
                          </div>
                          <span className="text-xs text-slate-400">{estatus2026Data.length} servicios</span>
                        </div>
                        <div className="h-[460px] w-full">
                          {loadingData ? (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                          ) : estatus2026PhaseDistribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 40, bottom: 40, left: 40, right: 40 }}>
                                <Pie
                                  data={estatus2026PhaseDistribution}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={100}
                                  onClick={(data: any) => setSelectedEstatus2026Phase(data.name)}
                                  className="cursor-pointer"
                                  label={({ cx, cy, midAngle = 0, outerRadius, percent = 0, index, name = '' }: any) => {
                                    const RADIAN = Math.PI / 180;
                                    const radius = outerRadius + 55;
                                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                    if ((percent * 100) < 2) return null;
                                    return (
                                      <text
                                        x={x}
                                        y={y}
                                        fill={chartPalette[index % chartPalette.length]}
                                        textAnchor={x > cx ? 'start' : 'end'}
                                        dominantBaseline="central"
                                        className="text-[11px] font-bold"
                                      >
                                        {`${name} (${(percent * 100).toFixed(0)}%)`}
                                      </text>
                                    );
                                  }}
                                  labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                >
                                  {estatus2026PhaseDistribution.map((entry, index) => (
                                    <Cell key={`cell-estatus-${index}`} fill={chartPalette[index % chartPalette.length]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(value: number, name: string, props: any) => {
                                    const total = estatus2026PhaseDistribution.reduce((a, b) => a + b.value, 0);
                                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                                    return [`${value} servicio${value === 1 ? '' : 's'} (${pct}%)`, name];
                                  }}
                                />
                                <Legend
                                  verticalAlign="bottom"
                                  height={36}
                                  iconType="circle"
                                  wrapperStyle={{ fontSize: '12px', paddingTop: '20px', cursor: 'pointer' }}
                                  onClick={(data: any) => setSelectedEstatus2026Phase(data.value || null)}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                              No hay datos suficientes. Agrega registros en la tabla de Estatus 2026.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        {/* Bar chart: Flujo mensual de pagos 2026 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Flujo mensual de pagos 2026</h3>
                            <span className="text-xs text-slate-400">{formatCurrency(pagos2026TotalAmount)} total</span>
                          </div>
                          <div className="h-72">
                            {loadingData ? (
                              <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando...</div>
                            ) : pagos2026MonthlyFlow.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pagos2026MonthlyFlow} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                  <YAxis tickFormatter={(v: number) => formatNumber(v)} tick={{ fontSize: 11 }} />
                                  <Tooltip
                                    formatter={(value: number) => {
                                      const pct = pagos2026TotalAmount > 0 ? ` (${((value / pagos2026TotalAmount) * 100).toFixed(1)}%)` : '';
                                      return [`${formatCurrency(value)}${pct}`, 'Pagos'];
                                    }}
                                  />
                                  <Bar dataKey="value" name="Pagos" fill="#0F4C3A" radius={[4, 4, 0, 0]}>
                                    {pagos2026MonthlyFlow.map((entry, index) => (
                                      <Cell key={`pagos-cell-${index}`} fill={chartPalette[index % chartPalette.length]} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                                Sin datos de pagos mensuales registrados.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bar chart: Servicios por Gerencia – HTML/CSS (no SVG clipping) */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Servicios por Gerencia</h3>
                            <span className="text-xs text-slate-400">{estatus2026GerenciaDistribution.length} gerencias</span>
                          </div>
                          {loadingData ? (
                            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Cargando...</div>
                          ) : estatus2026GerenciaDistribution.length > 0 ? (() => {
                            const maxVal = Math.max(...estatus2026GerenciaDistribution.map(d => d.value));
                            return (
                              <div className="space-y-3">
                                {estatus2026GerenciaDistribution.map((entry, index) => {
                                  const barWidth = maxVal > 0 ? (entry.value / maxVal) * 100 : 0;
                                  const pct = estatus2026KPIs.total > 0
                                    ? ((entry.value / estatus2026KPIs.total) * 100).toFixed(1)
                                    : '0';
                                  const color = chartPalette[index % chartPalette.length];
                                  return (
                                    <div key={entry.name} className="flex items-center gap-3">
                                      <div
                                        className="text-xs text-slate-700 text-right leading-tight shrink-0"
                                        style={{ width: '38%', wordBreak: 'break-word' }}
                                      >
                                        {entry.name}
                                      </div>
                                      <div className="flex-1 flex items-center gap-2 min-w-0">
                                        <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                                          <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${barWidth}%`, backgroundColor: color }}
                                          />
                                        </div>
                                        <span className="text-xs text-slate-500 shrink-0 font-medium">
                                          {entry.value} ({pct}%)
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })() : (
                            <div className="flex items-center justify-center py-12 text-slate-400 text-sm text-center px-4">
                              Sin columna de gerencia detectada o sin datos.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Subdirección 2026 + Presupuesto por Gerencia 2026 ──────── */}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {/* Subdirección 2026 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Servicios 2026 por Subdirección</h3>
                            <span className="text-xs font-medium text-slate-400">{estatus2026KPIs.total} total</span>
                          </div>
                          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                            {estatus2026SubdirDistribution.length > 0 ? (() => {
                              const maxVal = Math.max(...estatus2026SubdirDistribution.map(e => e.value), 1);
                              return estatus2026SubdirDistribution.map((entry, index) => {
                                const barWidth = Math.round((entry.value / maxVal) * 100);
                                const pct = estatus2026KPIs.total > 0 ? Math.round((entry.value / estatus2026KPIs.total) * 100) : 0;
                                const color = chartPalette[index % chartPalette.length];
                                return (
                                  <div key={entry.name} className="flex items-center gap-3">
                                    <div className="w-32 text-xs text-slate-600 truncate text-right shrink-0" title={entry.name}>{entry.name}</div>
                                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                      <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                                    </div>
                                    <span className="text-xs text-slate-500 shrink-0 font-medium">{entry.value} ({pct}%)</span>
                                  </div>
                                );
                              });
                            })() : (
                              <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Sin datos de subdirección</div>
                            )}
                          </div>
                        </div>
                        {/* Presupuesto por Gerencia 2026 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Presupuesto por Gerencia 2026</h3>
                            <span className="text-xs font-medium text-slate-400">Monto total</span>
                          </div>
                          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                            {estatus2026MontoByGerencia.length > 0 ? (() => {
                              const maxVal = Math.max(...estatus2026MontoByGerencia.map(e => e.value), 1);
                              return estatus2026MontoByGerencia.map((entry, index) => {
                                const barWidth = Math.round((entry.value / maxVal) * 100);
                                const color = chartPalette[index % chartPalette.length];
                                return (
                                  <div key={entry.name} className="flex items-center gap-3">
                                    <div className="w-32 text-xs text-slate-600 truncate text-right shrink-0" title={entry.name}>{entry.name}</div>
                                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                      <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                                    </div>
                                    <span className="text-[10px] text-slate-500 shrink-0 font-medium">{formatCurrency(entry.value)}</span>
                                  </div>
                                );
                              });
                            })() : (
                              <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Sin datos de monto</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Avance de Requisitos Clave 2026 */}
                      {estatus2026BooleanCompletion.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Avance de Requisitos Clave</h3>
                            <span className="text-xs text-slate-400">% de contratos con el requisito completo</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {estatus2026BooleanCompletion.map((item) => (
                              <div key={item.name} className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-slate-700">{item.name}</span>
                                  <span className={`text-xs font-bold ${item.pct >= 80 ? 'text-emerald-600' : item.pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                                    {item.pct}%
                                  </span>
                                </div>
                                <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                  <div
                                    className={`h-2.5 rounded-full transition-all duration-700 ${item.pct >= 80 ? 'bg-emerald-500' : item.pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                    style={{ width: `${item.pct}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-slate-400">{item.done} listos · {item.pending} pendientes</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resumen por fase (tabla rápida) */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-slate-800">Desglose por fase</h3>
                          <span className="text-xs text-slate-400">Haz clic en una fila para ver servicios</span>
                        </div>
                        <div className="space-y-3">
                          {estatus2026PhaseDistribution.map((phase, index) => {
                            const pct = estatus2026KPIs.total > 0
                              ? Math.round((phase.value / estatus2026KPIs.total) * 100)
                              : 0;
                            const color = chartPalette[index % chartPalette.length];
                            return (
                              <button
                                key={phase.name}
                                className="w-full text-left group"
                                onClick={() => setSelectedEstatus2026Phase(phase.name)}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                                    {phase.name}
                                  </span>
                                  <span className="text-sm font-bold text-slate-600">
                                    {phase.value} <span className="text-xs font-normal text-slate-400">({pct}%)</span>
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full transition-all"
                                    style={{ width: `${pct}%`, backgroundColor: color }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                          {estatus2026PhaseDistribution.length === 0 && !loadingData && (
                            <p className="text-sm text-slate-400 text-center py-4">Sin datos de estatus.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Detail view: services in selected phase */
                    <div className="space-y-6">
                      <button
                        onClick={() => setSelectedEstatus2026Phase(null)}
                        className="flex items-center text-sm text-slate-500 hover:text-slate-800 transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Volver al resumen 2026

                      </button>

                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">
                          Servicios en fase: <span className="text-[#B38E5D]">{selectedEstatus2026Phase}</span>
                        </h2>
                        <p className="text-slate-500 mt-1">
                          {estatus2026Data.filter((row) => {
                            const raw = estatus2026StatusFieldSummary ? row[estatus2026StatusFieldSummary] : null;
                            if ((!raw || String(raw).trim() === '') && selectedEstatus2026Phase === 'Sin fase') return true;
                            const label = String(raw ?? '').trim();
                            const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
                            return displayLabel === selectedEstatus2026Phase;
                          }).length} servicio(s) en esta etapa.
                        </p>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-[#0F4C3A] text-white">
                              <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Servicio</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Subdirección</th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider">Gerencia</th>
                                {estatus2026MontoFieldSummary && (
                                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">Monto</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {estatus2026Data
                                .filter((row) => {
                                  const raw = estatus2026StatusFieldSummary ? row[estatus2026StatusFieldSummary] : null;
                                  if ((!raw || String(raw).trim() === '') && selectedEstatus2026Phase === 'Sin fase') return true;
                                  const label = String(raw ?? '').trim();
                                  const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
                                  return displayLabel === selectedEstatus2026Phase;
                                })
                                .map((row, idx) => (
                                  <tr key={idx} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-800">
                                      {estatus2026ServiceNameFieldSummary ? String(row[estatus2026ServiceNameFieldSummary] ?? 'Sin nombre') : 'Sin nombre'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        {estatus2026SubdirFieldSummary ? String(row[estatus2026SubdirFieldSummary] ?? 'N/A') : 'N/A'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                                        {estatus2026GerenciaFieldSummary ? [['Aeronautica','Aeronáutica'],['Electromecanica','Electromecánica'],['Electromecanico','Electromecánico'],['Ingenieria','Ingeniería'],['Distribucion','Distribución'],['Generacion','Generación'],['Operacion','Operación'],['Administracion','Administración'],['Medico','Médico'],['Tecnico','Técnico'],['Tecnica','Técnica'],['Juridica','Jurídica'],['Juridico','Jurídico'],['Gestion','Gestión'],['Comunicacion','Comunicación']].reduce((s, [a, b]) => s.replace(new RegExp(`\\b${a}\\b`, 'gi'), b), String(row[estatus2026GerenciaFieldSummary] ?? 'N/A')) : 'N/A'}
                                      </span>
                                    </td>
                                    {estatus2026MontoFieldSummary && (
                                      <td className="px-6 py-4 text-right font-mono text-sm text-slate-700">
                                        {formatCurrency(parseNumericValue(row[estatus2026MontoFieldSummary]))}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {active2026View === 'estatus' && (
              <>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Tabla de Estatus de Servicios</h1>
                  <p className="text-slate-500 text-sm mt-1">
                    Consulta y edita los registros de estatus.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                     <button
                        onClick={() => setIsEstatus2026Compact(!isEstatus2026Compact)}
                        className={`p-2 rounded-md transition-colors ${isEstatus2026Compact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                        title={isEstatus2026Compact ? "Vista normal" : "Vista compacta"}
                      >
                       {isEstatus2026Compact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                     </button>

                    {canManageRecords && (
                      <button
                        type="button"
                        onClick={() => setIsEstatus2026Editing(!isEstatus2026Editing)}
                        className={`btn-secondary flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors text-sm font-medium ${isEstatus2026Editing ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}`}
                      >
                         <Pencil className="h-4 w-4" />
                         {isEstatus2026Editing ? 'Salir de edición' : 'Editar'}
                      </button>
                    )}
                     {canManageRecords && (
                      <button
                        type="button"
                        onClick={handleAddEstatus2026Row}
                        disabled={isAddingEstatus2026Row}
                        className={`btn-primary flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${isAddingEstatus2026Row ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                      >
                        {isAddingEstatus2026Row ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {isAddingEstatus2026Row ? 'Agregando...' : 'Agregar fila'}
                      </button>
                    )}
                </div>
              </div>

               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                 {/* Removed in-flow alert to prevent layout shift */}

                 <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="relative w-full sm:w-96">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Filtra por servicio, clave o monto"
                        value={tableFilters.estatus2026}
                        onChange={(e) => updateTableFilter('estatus2026', e.target.value)}
                        className="pl-10 block w-full rounded-2xl border-slate-200 bg-white text-sm focus:border-[#0F4C3A] focus:ring-[#0F4C3A]"
                      />
                    </div>
                     <div className="text-xs text-slate-500 font-medium">
                      {loadingData ? (
                        <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Cargando 2026...</span>
                      ) : (
                        <span>{formatResultLabel(filteredEstatus2026Data.length)}</span>
                      )}
                    </div>
                 </div>

                 {isDeletingRecord && (
                   <div className="px-4 py-2 border-b border-amber-200 bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
                     <Loader2 className="h-4 w-4 animate-spin" />
                     Espera, se está eliminando el registro...
                   </div>
                 )}
                 
                 {renderActiveColumnFilterBadges('estatus2026')}

                 {estatus2026PaymentAlertSummary.pendingCount > 0 && (
                   <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                     <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                       <div className="flex items-start gap-3">
                         <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                         <div className="space-y-1">
                           <p className="text-sm font-semibold text-amber-900">
                             {estatus2026PaymentAlertSummary.pendingCount} servicio{estatus2026PaymentAlertSummary.pendingCount === 1 ? '' : 's'} pendiente{estatus2026PaymentAlertSummary.pendingCount === 1 ? '' : 's'} para pago
                           </p>
                           <p className="text-sm text-amber-800">
                            Para liberar pagos, deben estar palomeadas <span className="font-semibold">Garantía de cumplimiento</span>, <span className="font-semibold">Póliza de responsabilidad civil</span> y <span className="font-semibold">Garantía de calidad</span>.
                           </p>
                         </div>
                       </div>
                       <div className="flex flex-wrap gap-2 text-xs">
                         <span className="inline-flex items-center rounded-full border border-amber-200 bg-white px-3 py-1 font-semibold text-amber-800">
                           Falta garantía: {estatus2026PaymentAlertSummary.garantiaMissingCount}
                         </span>
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-white px-3 py-1 font-semibold text-amber-800">
                          Falta póliza: {estatus2026PaymentAlertSummary.polizaMissingCount}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-white px-3 py-1 font-semibold text-amber-800">
                          Falta garantía de calidad: {estatus2026PaymentAlertSummary.calidadMissingCount}
                        </span>
                        {estatus2026PaymentAlertSummary.allMissingCount > 0 && (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-white px-3 py-1 font-semibold text-amber-800">
                            Faltan las tres: {estatus2026PaymentAlertSummary.allMissingCount}
                          </span>
                        )}
                       </div>
                     </div>
                   </div>
                 )}

                 <div className="relative h-[calc(100vh-280px)] overflow-auto shadow-inner rounded-xl border border-slate-200">
                    <table className="min-w-full text-center border-collapse">
                      <thead className="sticky top-0 z-20 shadow-sm">
                        <tr className="bg-[#0F4C3A] border-b border-[#0F4C3A] text-xs uppercase tracking-wider text-white font-semibold">
                          {estatus2026TableColumns.length > 0 ? (
                             estatus2026TableColumns
                              .map((key) => {
                                const stickyConfig = estatus2026StickyInfo.meta.get(key);
                                const isSticky = !!stickyConfig;
                                const isLastSticky = estatus2026LastStickyKey === key;
                                const isObsCol = normalizeAnnualKey(key).includes('incidencia');
                                const headerBg = isObsCol ? '#7C3AED' : '#0F4C3A';
                                const stickyStyle: React.CSSProperties = isSticky ? {
                                  position: 'sticky',
                                  left: stickyConfig.left,
                                  top: 0,
                                  zIndex: 30, // Intersection (Header + Sticky Col)
                                  backgroundColor: headerBg,
                                } : {
                                  position: 'sticky',
                                  top: 0,
                                  zIndex: 20, // Normal Header
                                  backgroundColor: headerBg,
                                };
                                 
                                return (
                               <th key={key} className={`px-2 py-3 whitespace-nowrap text-center border-b border-white/20 text-white ${isEstatus2026Compact ? 'py-2' : ''} ${isLastSticky ? 'shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)] border-r border-white/20' : ''} ${isObsCol ? 'min-w-[260px]' : ''}`} style={stickyStyle}>
                                 <div className="flex flex-col items-stretch gap-2 group text-white">
                                    <div className="flex items-center justify-center gap-1">
                                        {isObsCol && <span className="text-purple-200 mr-1">📝</span>}
                                        <span className="truncate font-bold">{humanizeKey(key)}</span>
                                        {(() => {
                                          const colTooltip = SERVICIOS_COLUMN_TOOLTIPS[normalizeAnnualKey(key)];
                                          return colTooltip ? (
                                            <ColumnInfoTooltip label={humanizeKey(key)} tooltip={colTooltip} />
                                          ) : null;
                                        })()}
                                        {!VIRTUAL_COLUMN_LABELS[key] && renderColumnFilterControl('estatus2026', key, humanizeKey(key), estatus2026Data, key === estatus2026StatusFieldSummary ? ESTATUS_2026_OPTIONS : undefined)}
                                    </div>
                                    {!VIRTUAL_COLUMN_LABELS[key] && <input 
                                        type="text" 
                                        placeholder="Buscar..." 
                                        className="w-full px-2 py-1 text-xs text-slate-800 rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-normal"
                                        value={estatus2026ColumnSearch[key] || ''}
                                        onChange={(e) => setEstatus2026ColumnSearch(prev => ({...prev, [key]: e.target.value}))}
                                        onClick={(e) => e.stopPropagation()}
                                    />}
                                 </div>
                               </th>
                             )})
                          ) : (
                             <th className="px-4 py-3 text-center text-white">Registros</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                         {loadingData ? (
                            <tr>
                              <td colSpan={estatus2026TableColumns.length || 10} className="px-4 py-8 text-center text-slate-400">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-[#0F4C3A]" />
                                <p>Cargando información...</p>
                              </td>
                            </tr>
                         ) : filteredEstatus2026Data.length === 0 ? (
                             <tr>
                               <td colSpan={estatus2026TableColumns.length || 1} className="px-4 py-12 text-center text-slate-400">
                                 <FileText className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                                 <p>No se encontraron registros en estatus_2026.</p>
                               </td>
                             </tr>
                         ) : (
                             displayedEstatus2026Rows.map(({ row, isPrimary, turnNumber }, idx) => {
                               const rowKey = String(row['id'] ?? row['ID'] ?? idx); // prefer unique ID
                              const rowHasConvenio = Object.entries(row as Record<string, any>).some(([key, value]) => isConvenioColumnName(key) && getBooleanChecked(value));
                              const paymentRequirementState = getEstatus2026PaymentRequirementState(row as Record<string, any>);
                              const hasObs = estatus2026ObservationsColumn ? String(row[estatus2026ObservationsColumn] ?? '').trim().length > 0 : false;
                                const zebraBackground = rowHasConvenio ? '#ECFDF5' : (hasObs ? '#FFFBEB' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'));
                                const rowStyle = buildRowStyle(zebraBackground);
                                const isCellEditable = isEstatus2026Editing;
                               return (
                                 <tr key={rowKey} className={`transition-colors group ${hasObs ? 'hover:bg-amber-100' : 'hover:bg-slate-50'}`} style={rowStyle}>
                                    {estatus2026TableColumns.map((column) => {
                                        // Virtual day-counter columns
                                        if (column === '__dias_remision_recepcion' || column === '__dias_recepcion_validacion' || column === '__row_num') {
                                          if (column === '__row_num') {
                                            const _rowDeleteKey = `estatus_2026:ID:${String(row?.ID ?? row?.id ?? row?.Id ?? rowKey)}`;
                                            const _isDeletingThisRow = isDeletingRecord && deletingRecordKey === _rowDeleteKey;
                                            const _showDelete = canManageRecords && isEstatus2026Editing;
                                            return (
                                              <td key={column} className={`px-3 border-b border-slate-50 text-center font-mono text-slate-500 text-xs ${isEstatus2026Compact ? 'py-1' : 'py-3'} min-w-[48px] w-[48px]`}>
                                                <div className={_showDelete ? 'flex flex-col items-center gap-1' : undefined}>
                                                  <span>{idx + 1}</span>
                                                  {_showDelete && (
                                                    _isDeletingThisRow ? (
                                                      <span className="text-[10px] text-rose-400 animate-pulse">Eliminando...</span>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        title="Eliminar fila"
                                                        aria-label="Eliminar fila"
                                                        className="text-rose-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteGenericRecord('estatus_2026', row, 'Estatus 2026'); }}
                                                      >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m4-4h2a1 1 0 011 1v1H8V4a1 1 0 011-1h2z" /></svg>
                                                      </button>
                                                    )
                                                  )}
                                                </div>
                                              </td>
                                            );
                                          }
                                          const remisionCol = estatus2026TableColumns.find(c => normalizeAnnualKey(c).includes('remision') && normalizeAnnualKey(c).includes('investigacion'));
                                          const recepcionCol = estatus2026TableColumns.find(c => normalizeAnnualKey(c).includes('recepcion') && normalizeAnnualKey(c).includes('investigacion'));
                                          const validacionCol = estatus2026TableColumns.find(c => normalizeAnnualKey(c).includes('validacion') && normalizeAnnualKey(c).includes('area'));
                                          let fromDate: Date | null = null;
                                          let toDate: Date | null = null;
                                          if (column === '__dias_remision_recepcion') {
                                            fromDate = remisionCol ? parsePotentialDate(row[remisionCol]) : null;
                                            toDate = recepcionCol ? parsePotentialDate(row[recepcionCol]) : null;
                                          } else {
                                            fromDate = recepcionCol ? parsePotentialDate(row[recepcionCol]) : null;
                                            toDate = validacionCol ? parsePotentialDate(row[validacionCol]) : null;
                                          }
                                          let dias: number | null = null;
                                          if (fromDate && toDate) {
                                            dias = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
                                          }
                                          const badgeColor = dias === null ? 'bg-slate-100 text-slate-400' : dias <= 5 ? 'bg-green-100 text-green-700' : dias <= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                                          return (
                                            <td key={column} className={`px-3 border-b border-slate-50 text-center ${isEstatus2026Compact ? 'py-1' : 'py-3'} min-w-[90px]`}>
                                              {dias !== null ? (
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColor}`}>
                                                  {dias === 0 ? 'Mismo día' : `${dias} día${Math.abs(dias) !== 1 ? 's' : ''}`}
                                                </span>
                                              ) : (
                                                <span className="text-slate-300 text-xs">—</span>
                                              )}
                                            </td>
                                          );
                                        }

                                        const rawValue = row[column];
                                        const columnMeta = estatus2026ColumnMeta.get(column)!;
                                        
                                        // Use pre-calculated types
                                        const { isBoolean, isDate, isHighlighted, isObservations, stickyConfig, isLastSticky } = columnMeta;

                                        const isCurrencyColumn = shouldFormatAsCurrency(column);
                                        const numeric = !isBoolean && !isDate && (typeof rawValue === 'number' || isCurrencyColumn);
                                        const isServiceNameCell = column === estatus2026ServiceNameFieldSummary;
                                        // Only one column normalises to 'id' now (dedup above ensures this),
                                        // so use the normalised check again — works regardless of case (id / ID).
                                        const isIdColumn = normalizeAnnualKey(column) === 'id';
                                        const isGarantiaRequirementCell = column === estatus2026GarantiaCumplimientoField;
                                        const isPolizaRequirementCell = column === estatus2026PolizaResponsabilidadCivilField;
                                        const isCalidadRequirementCell = column === estatus2026GarantiaCalidadField;
                                        const isPendingRequirementCell =
                                          (isGarantiaRequirementCell && !paymentRequirementState.garantiaOk) ||
                                          (isPolizaRequirementCell && !paymentRequirementState.polizaOk) ||
                                          (isCalidadRequirementCell && !paymentRequirementState.calidadOk);
                                        const convenioBadge = rowHasConvenio ? (
                                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                            Convenio modificatorio
                                          </span>
                                        ) : !isPrimary ? (
                                          <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                            {`Vuelta ${turnNumber}`}
                                          </span>
                                        ) : null;
                                        
                                        const baseClasses = `px-4 border-b border-slate-50 min-w-[120px] whitespace-pre-wrap break-words ${isEstatus2026Compact ? 'py-1' : 'py-3'} text-center ${numeric ? 'font-mono' : ''}`;
                                        const cellClasses = isCellEditable ? `${baseClasses} cursor-text` : baseClasses;
                                       
                                        let parsedDateValue: Date | null = null;
                                        if (isDate) {
                                          parsedDateValue = rawValue instanceof Date
                                          ? rawValue
                                          : (typeof rawValue === 'string' ? parsePotentialDate(rawValue) : null);
                                        }

                                        let editingValue = '';
                                        // Optimize formatting logic
                                        if (rawValue !== null && rawValue !== undefined) {
                                            if (isDate) {
                                            editingValue = parsedDateValue ? formatDateToDDMMYYYY(parsedDateValue) : String(rawValue);
                                            } else if (isBoolean) {
                                                // No need to format editingValue string for boolean, we use isChecked
                                            } else if (typeof rawValue === 'number') {
                                             if (isCurrencyColumn) {
                                                    editingValue = rawValue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                } else {
                                                    editingValue = String(rawValue);
                                                }
                                            } else {
                                                // String Fallback
                                            if (isCurrencyColumn && typeof rawValue === 'string') {
                                                    // Try to parse string currency
                                                     const sanitized = rawValue.replace(/,/g, '');
                                                        const num = parseFloat(sanitized);
                                                        if (!isNaN(num)) {
                                                            editingValue = num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                        } else {
                                                            editingValue = rawValue;
                                                        }
                                                } else {
                                                    editingValue = String(rawValue);
                                                }
                                            }
                                        }

                                        let dateInputValue = '';
                    if (parsedDateValue) {
                      const y = parsedDateValue.getFullYear();
                      const m = String(parsedDateValue.getMonth() + 1).padStart(2, '0');
                      const d = String(parsedDateValue.getDate()).padStart(2, '0');
                                                dateInputValue = `${y}-${m}-${d}`;
                                        }

                                        const cellBackgroundColor = isPendingRequirementCell
                                          ? '#FEF3C7'
                                          : isHighlighted
                                            ? '#F4CCCC'
                                            : isObservations
                                              ? '#F5F3FF'
                                              : undefined; 

                                        const isSticky = !!stickyConfig;
                                        const stickyCellStyle: React.CSSProperties = isSticky ? {
                                          position: 'sticky',
                                          left: stickyConfig.left,
                                          zIndex: 10,
                                          backgroundColor: cellBackgroundColor || zebraBackground, 
                                          width: stickyConfig.width,
                                          minWidth: stickyConfig.width,
                                          maxWidth: stickyConfig.width,
                                        } : {
                                            backgroundColor: cellBackgroundColor
                                        };
                                        
                                        const finalCellClasses = `${cellClasses} ${isLastSticky ? 'shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)] border-r border-slate-100' : ''} ${isObservations ? 'border-l-2 border-l-violet-300 min-w-[260px]' : ''}`;
                                        
                                        const isChecked = isBoolean ? getBooleanChecked(rawValue) : false;
                                        const showInlineDelete = false; // delete button moved to __row_num column
                                        const rowDeleteKey = `estatus_2026:id:${String(row?.id ?? row?.ID ?? row?.Id ?? rowKey)}`;
                                        const isDeletingThisRow = isDeletingRecord && deletingRecordKey === rowDeleteKey;

                                        const _colNorm = column.toLowerCase().replace(/[\s_]+/g, '_');
                                        const isTipoServicioCol = _colNorm === 'tipo_de_servicio' || (_colNorm.includes('tipo') && _colNorm.includes('servicio'));
                                        const _colNormFull = normalizeAnnualKey(column);
                                        const isEstatusStatusCol = _colNormFull === 'estatus' || _colNormFull === 'status';

                                       return (
                                       <td key={column} className={finalCellClasses} title={String(editingValue || isChecked)} style={stickyCellStyle}>
                                          <div className={showInlineDelete ? 'flex flex-col items-center gap-1' : undefined}>
                                          {isCellEditable ? (
                                              isTipoServicioCol ? (
                                                  <TipoServicioPicker
                                                    value={rawValue ? String(rawValue) : ''}
                                                    onChange={(nextValue) => handleEstatus2026CellEdit(row, column, nextValue)}
                                                  />
                                              ) : isEstatusStatusCol ? (
                                                  <EstatusStatusPicker
                                                    value={rawValue ? String(rawValue) : ''}
                                                    onChange={(nextValue) => handleEstatus2026CellEdit(row, column, nextValue)}
                                                  />
                                              ) : isBoolean ? (
                                                <div className="flex items-center justify-center h-full min-h-[1.5em]" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox"
                                                      aria-label={`Alternar ${humanizeKey(column)}`}
                                                      title={`Alternar ${humanizeKey(column)}`}
                                                        className="w-5 h-5 text-[#0F4C3A] bg-gray-100 border-gray-300 rounded focus:ring-[#0F4C3A] cursor-pointer accent-[#2d3e50]"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            const newVal = e.target.checked;
                                                            if (isConvenioColumnName(column)) {
                                                              handleConvenioCellEdit('estatus_2026', row, column, newVal, setEstatus2026Data, estatus2026Data);
                                                              return;
                                                            }
                                                            const valToSave = getBooleanSaveValue(rawValue, column, newVal);
                                                            handleEstatus2026CellEdit(row, column, valToSave);
                                                        }}
                                                    />
                                                </div>
                                              ) : isDate ? (
                                                <input
                                                    type="date"
                                                  aria-label={`Fecha ${humanizeKey(column)}`}
                                                  title={`Fecha ${humanizeKey(column)}`}
                                                    className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                    value={dateInputValue}
                                                    onChange={(e) => handleEstatus2026CellEdit(row, column, e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                              ) : isObservations ? (
                                                (() => {
                                                  const draftKey = `${rowKey}__${column}`;
                                                  const isEditing = !!obsOpenSet[draftKey];
                                                  const closeObs = () => setObsOpenSet(prev => { const n = { ...prev }; delete n[draftKey]; return n; });
                                                  return isEditing ? (
                                                    <div className="flex flex-col gap-1.5 min-w-[240px]" onClick={(e) => e.stopPropagation()}>
                                                      <textarea
                                                        rows={3}
                                                        autoFocus
                                                        aria-label={humanizeKey(column)}
                                                        className="w-full bg-violet-50 border border-violet-300 rounded-md px-2 py-1.5 text-xs text-slate-700 placeholder-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y leading-relaxed"
                                                        placeholder="Escribe las observaciones..."
                                                        defaultValue={editingValue}
                                                        ref={(el) => { if (el) obsTextareaRefs.current.set(draftKey, el); else obsTextareaRefs.current.delete(draftKey); }}
                                                      />
                                                      <div className="flex gap-1.5 justify-end">
                                                        <button type="button" onClick={closeObs} className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const val = obsTextareaRefs.current.get(draftKey)?.value ?? editingValue;
                                                            handleEstatus2026CellEdit(row, column, val);
                                                            closeObs();
                                                          }}
                                                          className="px-2 py-1 text-xs rounded bg-violet-600 text-white hover:bg-violet-700 transition-colors font-medium flex items-center gap-1"
                                                        >
                                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                          Guardar
                                                        </button>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div
                                                      className="group/obs flex items-start gap-1 min-w-[220px] cursor-pointer"
                                                      onClick={(e) => { e.stopPropagation(); setObsOpenSet(prev => ({ ...prev, [draftKey]: true })); }}
                                                      title="Haz clic para editar"
                                                    >
                                                      {editingValue ? (
                                                        <p className="text-left text-xs text-amber-800 whitespace-pre-wrap leading-relaxed px-1 py-0.5 italic flex-1">{editingValue}</p>
                                                      ) : (
                                                        <span className="text-violet-300 italic text-xs flex-1">Sin observaciones</span>
                                                      )}
                                                      <svg className="w-3.5 h-3.5 text-violet-400 opacity-0 group-hover/obs:opacity-100 transition-opacity mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-.828.485l-3 1 1-3a2 2 0 01.485-.828z" /></svg>
                                                    </div>
                                                  );
                                                })()
                                              ) : (
                                                isIdColumn ? (
                                                  <span className="font-mono text-slate-600 select-none">{idx + 1}</span>
                                                ) : isServiceNameCell ? (
                                                  <div className="flex flex-col items-center gap-1">
                                                    {rowHasConvenio && isPrimary ? (
                                                      <button
                                                        type="button"
                                                        className="inline-block w-full px-0.5 py-0.5 text-center font-medium text-slate-700 hover:text-emerald-700"
                                                        onClick={() => handleConvenioServiceClick('estatus_2026', row, estatus2026ServiceNameFieldSummary, estatus2026ClaveFieldSummary, estatus2026Data, setEstatus2026Data, expandedEstatus2026Convenio, setExpandedEstatus2026Convenio)}
                                                      >
                                                        {editingValue}
                                                      </button>
                                                    ) : (
                                                      <div
                                                        contentEditable
                                                        suppressContentEditableWarning
                                                        className={`inline-block w-full min-h-[1.5em] whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                                        onBlur={(event) => handleEstatus2026CellEdit(row, column, event.currentTarget.textContent ?? '')}
                                                        onKeyDown={(event) => {
                                                          if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            (event.currentTarget as HTMLDivElement).blur();
                                                          }
                                                        }}
                                                      >
                                                        {editingValue}
                                                      </div>
                                                    )}
                                                    {rowHasConvenio && isPrimary ? (
                                                      <button
                                                        type="button"
                                                        className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-200"
                                                        onClick={() => handleConvenioServiceClick('estatus_2026', row, estatus2026ServiceNameFieldSummary, estatus2026ClaveFieldSummary, estatus2026Data, setEstatus2026Data, expandedEstatus2026Convenio, setExpandedEstatus2026Convenio)}
                                                      >
                                                        Convenio modificatorio
                                                      </button>
                                                    ) : convenioBadge}
                                                    {!paymentRequirementState.readyForPayment && (
                                                      <>
                                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                          Pago pendiente
                                                        </span>
                                                        <p className="max-w-[220px] text-center text-[10px] leading-4 text-amber-700">
                                                          {paymentRequirementState.shortLabel}. Sin las tres validaciones no se pueden liberar pagos.
                                                        </p>
                                                      </>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <div
                                                      contentEditable
                                                      suppressContentEditableWarning
                                                      className={`inline-block w-full min-h-[1.5em] whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                                      onBlur={(event) => handleEstatus2026CellEdit(row, column, event.currentTarget.textContent ?? '')}
                                                      onKeyDown={(event) => {
                                                      if (event.key === 'Enter') {
                                                          event.preventDefault();
                                                          (event.currentTarget as HTMLDivElement).blur();
                                                      }
                                                      }}
                                                  >
                                                      {editingValue}
                                                  </div>
                                                )
                                              )
                                          ) : (
                                              isTipoServicioCol ? (
                                                  <div className="flex items-center justify-center">
                                                    {rawValue ? (
                                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${getTipoColorClass(String(rawValue))}`}>
                                                        {String(rawValue)}
                                                      </span>
                                                    ) : (
                                                      <span className="text-xs text-slate-400 italic">—</span>
                                                    )}
                                                  </div>
                                              ) : isEstatusStatusCol ? (
                                                  <div className="flex items-center justify-center">
                                                    {rawValue ? (
                                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${getEstatusColorClass(String(rawValue))}`}>
                                                        {String(rawValue)}
                                                      </span>
                                                    ) : (
                                                      <span className="text-xs text-slate-400 italic">—</span>
                                                    )}
                                                  </div>
                                              ) : isBoolean ? (
                                                  <div className="flex items-center justify-center h-full min-h-[1.5em]">
                                                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#2d3e50] border-[#2d3e50]' : 'bg-transparent border-slate-300'}`}>
                                                          {isChecked && (
                                                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                              </svg>
                                                          )}
                                                      </div>
                                                  </div>
                                              ) : isObservations ? (
                                                  (() => {
                                                    const draftKey = `${rowKey}__${column}`;
                                                    const isEditing = !!obsOpenSet[draftKey];
                                                    const closeObs = () => setObsOpenSet(prev => { const n = { ...prev }; delete n[draftKey]; return n; });
                                                    return isEditing ? (
                                                      <div className="flex flex-col gap-1.5 min-w-[240px]" onClick={(e) => e.stopPropagation()}>
                                                        <textarea
                                                          rows={3}
                                                          autoFocus
                                                          aria-label={humanizeKey(column)}
                                                          className="w-full bg-violet-50 border border-violet-300 rounded-md px-2 py-1.5 text-xs text-slate-700 placeholder-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y leading-relaxed"
                                                          placeholder="Escribe las observaciones..."
                                                          defaultValue={editingValue}
                                                          ref={(el) => { if (el) obsTextareaRefs.current.set(draftKey, el); else obsTextareaRefs.current.delete(draftKey); }}
                                                        />
                                                        <div className="flex gap-1.5 justify-end">
                                                          <button type="button" onClick={closeObs} className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                                                          <button
                                                            type="button"
                                                            onClick={() => {
                                                              const val = obsTextareaRefs.current.get(draftKey)?.value ?? editingValue;
                                                              handleEstatus2026CellEdit(row, column, val);
                                                              closeObs();
                                                            }}
                                                            className="px-2 py-1 text-xs rounded bg-violet-600 text-white hover:bg-violet-700 transition-colors font-medium flex items-center gap-1"
                                                          >
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                            Guardar
                                                          </button>
                                                        </div>
                                                      </div>
                                                    ) : (
                                                      <div
                                                        className="group/obs flex items-start gap-1 min-w-[220px] cursor-pointer"
                                                        onClick={(e) => { e.stopPropagation(); setObsOpenSet(prev => ({ ...prev, [draftKey]: true })); }}
                                                        title="Haz clic para editar"
                                                      >
                                                        {editingValue ? (
                                                          <p className="text-left text-xs text-amber-800 whitespace-pre-wrap leading-relaxed px-1 py-0.5 italic flex-1">{editingValue}</p>
                                                        ) : (
                                                          <span className="text-violet-300 italic text-xs flex-1">Sin observaciones</span>
                                                        )}
                                                        <svg className="w-3.5 h-3.5 text-violet-400 opacity-0 group-hover/obs:opacity-100 transition-opacity mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-.828.485l-3 1 1-3a2 2 0 01.485-.828z" /></svg>
                                                      </div>
                                                    );
                                                  })()
                                              ) : (
                                                  isIdColumn ? (
                                                    <span className="font-mono text-slate-600 select-none">{idx + 1}</span>
                                                  ) : isServiceNameCell ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                      {rowHasConvenio && isPrimary ? (
                                                        <button
                                                          type="button"
                                                          className="font-medium text-slate-700 hover:text-emerald-700"
                                                          onClick={() => handleConvenioServiceClick('estatus_2026', row, estatus2026ServiceNameFieldSummary, estatus2026ClaveFieldSummary, estatus2026Data, setEstatus2026Data, expandedEstatus2026Convenio, setExpandedEstatus2026Convenio)}
                                                        >
                                                          {editingValue}
                                                        </button>
                                                      ) : (
                                                        <span>{editingValue}</span>
                                                      )}
                                                      {rowHasConvenio && isPrimary ? (
                                                        <button
                                                          type="button"
                                                          className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-200"
                                                          onClick={() => handleConvenioServiceClick('estatus_2026', row, estatus2026ServiceNameFieldSummary, estatus2026ClaveFieldSummary, estatus2026Data, setEstatus2026Data, expandedEstatus2026Convenio, setExpandedEstatus2026Convenio)}
                                                        >
                                                          Convenio modificatorio
                                                        </button>
                                                      ) : convenioBadge}
                                                      {!paymentRequirementState.readyForPayment && (
                                                        <>
                                                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                            Pago pendiente
                                                          </span>
                                                          <p className="max-w-[220px] text-center text-[10px] leading-4 text-amber-700">
                                                            {paymentRequirementState.shortLabel}. Sin las tres validaciones no se pueden liberar pagos.
                                                          </p>
                                                        </>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    editingValue
                                                  )
                                              )
                                          )}
                                          {showInlineDelete && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteGenericRecord('estatus_2026', row as Record<string, any>, 'Registro estatus_2026');
                                              }}
                                              disabled={isDeletingRecord}
                                              className={`mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border transition-colors text-[11px] font-semibold ${isDeletingRecord ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-200'}`}
                                              title={isDeletingRecord ? 'Espera, eliminando registro...' : 'Eliminar fila'}
                                            >
                                              {isDeletingThisRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                              {isDeletingThisRow ? 'Eliminando...' : 'Eliminar'}
                                            </button>
                                          )}
                                          </div>
                                       </td>
                                    )})}
                                 </tr>
                               );
                            })
                         )}
                      </tbody>
                    </table>
                 </div>
               </div>
              </>
              )}

              {active2026View === 'pagos' && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">Tabla de Pagos 2026</h1>
                      <p className="text-slate-500 text-sm mt-1">
                        Consulta y edita los registros de pagos.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                         <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1">
                           <button
                             type="button"
                             onClick={() => setActivePagos2026View('tabla')}
                             className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activePagos2026View === 'tabla' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                           >
                             Tabla
                           </button>
                           <button
                             type="button"
                             onClick={() => setActivePagos2026View('resumen')}
                             className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activePagos2026View === 'resumen' ? 'bg-[#0F4C3A] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                           >
                             Resumen pagos
                           </button>
                         </div>
                         <button
                            onClick={() => setIsPagos2026Compact(!isPagos2026Compact)}
                            className={`p-2 rounded-md transition-colors ${isPagos2026Compact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                            title={isPagos2026Compact ? "Vista normal" : "Vista compacta"}
                          >
                           {isPagos2026Compact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                         </button>

                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={() => setIsPagos2026Editing(!isPagos2026Editing)}
                            className={`btn-secondary flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors text-sm font-medium ${isPagos2026Editing ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}`}
                          >
                             <Pencil className="h-4 w-4" />
                             {isPagos2026Editing ? 'Salir de edición' : 'Editar'}
                          </button>
                        )}
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={handleRecalcPagos2026AllTotals}
                            className="btn-primary flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors text-sm font-medium"
                            title="Recalcular totales de meses: Preventivos + Correctivos − Nota de Crédito"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Recalcular totales
                          </button>
                        )}
                         {canManageRecords && (
                          <button
                            type="button"
                            onClick={handleAddPagos2026Row}
                            className="btn-primary flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors text-sm font-medium"
                          >
                            <Plus className="h-4 w-4" />
                            Agregar fila
                          </button>
                        )}
                    </div>
                  </div>

                   {activePagos2026View === 'tabla' ? (
                   <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                     <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="relative w-full sm:w-96">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-400" />
                          </div>
                          <input
                            type="text"
                            placeholder="Buscar en pagos..."
                            value={tableFilters.pagos2026}
                            onChange={(e) => updateTableFilter('pagos2026', e.target.value)}
                            className="pl-10 block w-full rounded-2xl border-slate-200 bg-white text-sm focus:border-[#0F4C3A] focus:ring-[#0F4C3A]"
                          />
                        </div>
                         <div className="text-xs text-slate-500 font-medium">
                          {loadingData ? (
                            <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Cargando...</span>
                          ) : (
                            <span>{formatResultLabel(filteredPagos2026Data.length)}</span>
                          )}
                        </div>
                     </div>
                     
                     {renderActiveColumnFilterBadges('pagos2026')}

                     <div className="relative h-[calc(100vh-280px)] overflow-auto shadow-inner rounded-xl border border-slate-200">
                        <table className="min-w-full text-center border-collapse">
                          <thead className="sticky top-0 z-[60] shadow-sm">
                            <tr className="text-xs uppercase tracking-wider text-white font-semibold">
                              {pagos2026TableColumns.length > 0 ? (
                                 pagos2026TableColumns.map((key) => {
                                    const colMeta = pagos2026ColumnMeta.get(key);
                                    const keyIsMonthRelated = colMeta?.isMonthRelated ?? false;
                                    const colParentMonth = colMeta?.parentMonth ?? null;
                                    // Per-month accent palette for expanded sub-columns
                                    const monthAccentPalette: Record<string, { header: string; cell: string }> = {
                                      'Ene.': { header: '#1e40af', cell: '#dbeafe' },
                                      'Feb.': { header: '#6d28d9', cell: '#ede9fe' },
                                      'Mar.': { header: '#0e7490', cell: '#cffafe' },
                                      'Abr.': { header: '#b45309', cell: '#fef3c7' },
                                      'May.': { header: '#be185d', cell: '#fce7f3' },
                                      'Jun.': { header: '#1d4ed8', cell: '#e0e7ff' },
                                      'Jul.': { header: '#c2410c', cell: '#ffedd5' },
                                      'Ago.': { header: '#0f766e', cell: '#ccfbf1' },
                                      'Sept.': { header: '#7e22ce', cell: '#f3e8ff' },
                                      'Oct.': { header: '#0369a1', cell: '#e0f2fe' },
                                      'Nov.': { header: '#4d7c0f', cell: '#ecfccb' },
                                      'Dic.': { header: '#991b1b', cell: '#ffe4e6' },
                                    };
                                    const isExpandedSubCol = colParentMonth !== null && pagos2026ExpandedMonths.has(colParentMonth);
                                    const accentColor = isExpandedSubCol ? (monthAccentPalette[colParentMonth!] ?? null) : null;
                                    const stickyConfig = pagos2026StickyInfo.meta.get(key);
                                    const isSticky = !!stickyConfig;
                                    const isLastSticky = pagos2026LastStickyKey === key;
                                    const headerBg = isSticky ? '#1B4D3E' : accentColor ? accentColor.header : keyIsMonthRelated ? '#2D6A4F' : '#1B4D3E';
                                    const stickyStyle: React.CSSProperties = isSticky ? {
                                      position: 'sticky',
                                      left: stickyConfig.left,
                                      top: 0,
                                      zIndex: 70,
                                      backgroundColor: headerBg,
                                    } : {
                                      position: 'sticky',
                                      top: 0,
                                      zIndex: 60,
                                      backgroundColor: headerBg,
                                    };

                                    const isExpandableMonth = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sept.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'].includes(key);
                                    const isExpanded = pagos2026ExpandedMonths.has(key);
                                    const colLabel = humanizeKey(key);
                                     
                                    return (
                                   <th key={key} className={`px-3 ${isPagos2026Compact ? 'py-2' : 'py-3'} whitespace-nowrap text-center border-b border-white/20 text-white ${isLastSticky ? 'shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)] border-r border-white/20' : ''}`} style={stickyStyle}>
                                     <div className="flex items-center justify-center gap-1 text-white">
                                         {isExpandableMonth && (
                                           <button 
                                             onClick={(e) => {
                                                 e.stopPropagation();
                                                 setPagos2026ExpandedMonths(prev => {
                                                     const newSet = new Set(prev);
                                                     if (newSet.has(key)) newSet.delete(key);
                                                     else newSet.add(key);
                                                     return newSet;
                                                 });
                                             }}
                                             className="mr-1 hover:text-emerald-200 transition-colors p-1"
                                             title={isExpanded ? "Ocultar desglose" : "Mostrar desglose"}
                                           >
                                             {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />} 
                                           </button>
                                         )}
                                         <span className="truncate font-bold">{colLabel}</span>
                                         {renderColumnFilterControl('pagos2026', key, colLabel, pagos2026Data)}
                                     </div>
                                   </th>
                                 )})
                              ) : (
                                 <th className="px-4 py-3 text-center text-white" style={{ backgroundColor: '#1B4D3E' }}>Registros</th>
                              )}
                              {pagos2026TableColumns.length > 0 && (
                                <th 
                                  className="px-2 py-3 text-white text-center font-bold border-b border-white/20 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.1)] border-l border-white/20" 
                                  style={{ 
                                    position: 'sticky', 
                                    right: '0', 
                                    top: '0', 
                                    zIndex: 70, 
                                    backgroundColor: '#0F4C3A',
                                    width: '100px',
                                    minWidth: '100px'
                                  }}
                                >
                                  <div className="flex items-center justify-center h-full">
                                    Acciones
                                  </div>
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                             {loadingData ? (
                                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Cargando...</td></tr>
                             ) : filteredPagos2026Data.length === 0 ? (
                                 <tr><td colSpan={pagos2026TableColumns.length || 1} className="px-4 py-12 text-center text-slate-400">No se encontraron registros.</td></tr>
                             ) : (
                                filteredPagos2026Data.map((row, idx) => {
                                   const rowKey = row['id'] || row['ID'] || idx;
                                   const zebraBackground = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                                   const rowStyle = buildRowStyle(zebraBackground);
                                   const isCellEditable = isPagos2026Editing;
                                   
                                   return (
                                     <tr key={rowKey} className="hover:bg-slate-50 transition-colors group" style={rowStyle}>
                                        {pagos2026TableColumns.map((column) => {
                                            const rawValue = row[column];
                                            const columnMeta = pagos2026ColumnMeta.get(column)!;
                                            const { isBoolean, isDate, isMonthRelated, isNotaCredito, parentMonth: colParentMonthCell, stickyConfig, isLastSticky } = columnMeta;
                                            const isIdColumn = ['id', 'ID', 'Id'].includes(column) || column.toLowerCase() === 'id' || column.toLowerCase() === 'no.' || column.toLowerCase() === 'numero';
                                            const numeric = !isBoolean && !isDate && !isIdColumn && (typeof rawValue === 'number' || shouldFormatAsCurrency(column));

                                            // Per-month accent palette (same as header)
                                            const cellMonthPalette: Record<string, string> = {
                                              'Ene.': '#dbeafe', 'Feb.': '#ede9fe', 'Mar.': '#cffafe',
                                              'Abr.': '#fef3c7', 'May.': '#fce7f3', 'Jun.': '#e0e7ff',
                                              'Jul.': '#ffedd5', 'Ago.': '#ccfbf1', 'Sept.': '#f3e8ff',
                                              'Oct.': '#e0f2fe', 'Nov.': '#ecfccb', 'Dic.': '#ffe4e6',
                                            };
                                            const isExpandedSubColCell = colParentMonthCell !== null && pagos2026ExpandedMonths.has(colParentMonthCell);
                                            // Nota de crédito values are shown in red like 2025 table
                                            const notaColorClass = isNotaCredito ? 'text-red-400' : '';
                                            // Month cells: use accent color when expanded, otherwise default green tint
                                            const monthBgClass = isExpandedSubColCell ? '' : isMonthRelated ? 'bg-emerald-50/30' : '';
                                            const cellAccentStyle: React.CSSProperties = isExpandedSubColCell && colParentMonthCell
                                              ? { backgroundColor: cellMonthPalette[colParentMonthCell] ?? undefined }
                                              : {};

                                            const baseClasses = `px-4 border-b border-slate-50 min-w-[120px] whitespace-pre-wrap break-words ${isPagos2026Compact ? 'py-1' : 'py-3'} ${numeric ? 'text-center font-mono' : 'text-center'} ${monthBgClass} ${notaColorClass}`;
                                            const cellClasses = isCellEditable ? `${baseClasses} cursor-text` : baseClasses;
                                            
                                            let editingValue = '';
                                            if (rawValue !== null && rawValue !== undefined) {
                                                if (isDate && rawValue instanceof Date) editingValue = formatDateToDDMMYYYY(rawValue);
                                                else if (isDate && typeof rawValue === 'string') {
                                                    const p = parsePotentialDate(rawValue);
                                                    editingValue = p ? formatDateToDDMMYYYY(p) : rawValue;
                                                } else if (typeof rawValue === 'number') {
                                                    if (isIdColumn) {
                                                        editingValue = String(rawValue);
                                                    } else {
                                                        // Preserve exact value — no fixed decimal rounding
                                                        editingValue = numeric
                                                          ? rawValue.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 10 })
                                                          : String(rawValue);
                                                    }
                                                } else {
                                                    editingValue = String(rawValue);
                                                }
                                            }

                                            let dateInputValue = '';
                                            if (isDate) {
                                                const p = (rawValue instanceof Date) ? rawValue : parsePotentialDate(rawValue);
                                                if (p) {
                                                    const y = p.getFullYear();
                                                    const m = String(p.getMonth() + 1).padStart(2, '0');
                                                    const d = String(p.getDate()).padStart(2, '0');
                                                    dateInputValue = `${y}-${m}-${d}`;
                                                }
                                            }

                                            const isSticky = !!stickyConfig;
                                            const stickyCellStyle: React.CSSProperties = isSticky ? {
                                              position: 'sticky', left: stickyConfig.left, zIndex: 10,
                                              backgroundColor: zebraBackground, width: stickyConfig.width,
                                              minWidth: stickyConfig.width, maxWidth: stickyConfig.width,
                                            } : cellAccentStyle;

                                            const finalCellClasses = `${cellClasses} ${isLastSticky ? 'shadow-[4px_0_4px_-2px_rgba(0,0,0,0.1)] border-r border-slate-100' : ''}`;

                                            const isChecked = isBoolean ? getBooleanChecked(rawValue) : false;

                                           return (
                                           <td key={column} className={finalCellClasses} title={String(editingValue || isChecked)} style={stickyCellStyle}>
                                              {isCellEditable ? (
                                                  isBoolean ? (
                                                    <div className="flex items-center justify-center h-full min-h-[1.5em]" onClick={(e) => e.stopPropagation()}>
                                                        <input 
                                                            type="checkbox"
                                                          aria-label={`Alternar ${humanizeKey(column)}`}
                                                          title={`Alternar ${humanizeKey(column)}`}
                                                            className="w-5 h-5 text-[#0F4C3A] bg-gray-100 border-gray-300 rounded focus:ring-[#0F4C3A] cursor-pointer accent-[#2d3e50]"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                const newVal = e.target.checked;
                                                                const valToSave = getBooleanSaveValue(rawValue, column, newVal);
                                                                handlePagos2026CellEdit(row, column, valToSave);
                                                            }}
                                                        />
                                                    </div>
                                                  ) : isDate ? (
                                                    <input
                                                        type="date"
                                                      aria-label={`Fecha ${humanizeKey(column)}`}
                                                      title={`Fecha ${humanizeKey(column)}`}
                                                        className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                        value={dateInputValue}
                                                        onChange={(e) => handlePagos2026CellEdit(row, column, e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                  ) : (
                                                    <div
                                                        contentEditable
                                                        suppressContentEditableWarning
                                                        className={`inline-block w-full min-h-[1.5em] whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                                        onBlur={(event) => handlePagos2026CellEdit(row, column, event.currentTarget.textContent ?? '')}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                (event.currentTarget as HTMLDivElement).blur();
                                                            }
                                                        }}
                                                    >
                                                        {editingValue}
                                                    </div>
                                                  )
                                              ) : (
                                                  isBoolean ? (
                                                      <div className="flex items-center justify-center h-full min-h-[1.5em]">
                                                          <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#2d3e50] border-[#2d3e50]' : 'bg-transparent border-slate-300'}`}>
                                                              {isChecked && (
                                                                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                  </svg>
                                                              )}
                                                          </div>
                                                      </div>
                                                  ) : numeric ? (
                                                      // Show exact value as captured — no rounding
                                                      (() => {
                                                        const numVal = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue ?? '').replace(/,/g, ''));
                                                        if (!Number.isFinite(numVal)) return '$0.00';
                                                        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(numVal);
                                                      })()
                                                  ) : (
                                                      editingValue
                                                  )
                                              )}
                                           </td>
                                        );
                                        })}
                                        <td 
                                            className="px-2 py-2 text-center border-b border-slate-50 sticky right-0 group-hover:bg-slate-50 shadow-[-4px_0_4px_-2px_rgba(0,0,0,0.1)] border-l border-slate-100" 
                                            style={{ 
                                                backgroundColor: zebraBackground, 
                                                position: 'sticky', 
                                                right: '0', 
                                                zIndex: 30,
                                                width: '100px',
                                                minWidth: '100px'
                                            }}
                                        >
                                              <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteGenericRecord('pagos', row as Record<string, any>, 'Pago 2026');
                                                }}
                                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                title="Eliminar"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                        </td>
                                     </tr>
                                   );
                                })
                             )}
                          </tbody>
                        </table>
                     </div>
                   </div>
                   ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Servicios</p>
                          <p className="text-2xl font-bold text-slate-900 mt-2">{pagos2026ServicePaymentProgress.length}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total pagado</p>
                          <p className="text-2xl font-bold text-slate-900 mt-2">{formatCurrency(pagos2026ProgressTotals.totalPaid)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avance global</p>
                          <p className="text-2xl font-bold text-slate-900 mt-2">{pagos2026ProgressTotals.pct.toFixed(1)}%</p>
                          <p className="text-xs text-slate-500 mt-1">Meta total: {formatCurrency(pagos2026ProgressTotals.totalToPay)}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saldo restante</p>
                          <p className="text-2xl font-bold text-amber-700 mt-2">{formatCurrency(pagos2026ProgressTotals.totalToPay - pagos2026ProgressTotals.totalPaid)}</p>
                          <p className="text-xs text-slate-500 mt-1">{pagos2026ProgressTotals.totalToPay > 0 ? (100 - pagos2026ProgressTotals.pct).toFixed(1) : '0.0'}% pendiente</p>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                          <h3 className="text-sm font-semibold text-slate-700">Resumen de pagos por servicio</h3>
                          <p className="text-xs text-slate-500 mt-1">Haz click en el total para ver el desglose por mes.</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-[#0F4C3A] text-white">
                              <tr>
                                <th className="px-4 py-3 text-left font-semibold">Servicio</th>
                                <th className="px-4 py-3 text-right font-semibold">Avance</th>
                                <th className="px-4 py-3 text-right font-semibold">Pagado</th>
                                <th className="px-4 py-3 text-right font-semibold">Saldo restante</th>
                                <th className="px-4 py-3 text-right font-semibold">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {loadingData ? (
                                <tr>
                                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                                    Cargando resumen...
                                  </td>
                                </tr>
                              ) : pagos2026ServicePaymentProgress.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No hay registros de pagos para resumir.</td>
                                </tr>
                              ) : (
                                pagos2026ServicePaymentProgress.map((item, idx) => {
                                  const isExpanded = expandedPagos2026SummaryKey === item.key;
                                  return (
                                    <React.Fragment key={item.key}>
                                      <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                        <td className="px-4 py-3 text-slate-800 font-medium">{item.service}</td>
                                        <td className="px-4 py-3 text-right">
                                          <div className="inline-flex flex-col items-end min-w-[140px]">
                                            <span className="text-slate-700 font-semibold">{item.pctRaw.toFixed(1)}%</span>
                                            <div className="w-28 bg-slate-200 rounded-full h-1.5 mt-1">
                                              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${item.pct}%` }} />
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-700">{formatCurrency(item.paid)}</td>
                                        <td className="px-4 py-3 text-right">
                                          {item.total <= 0 ? (
                                            <span className="font-mono text-slate-400 text-xs">Sin monto máximo</span>
                                          ) : (
                                            <div className="inline-flex flex-col items-end">
                                              <span className={`font-mono font-semibold ${item.paid >= item.total ? 'text-emerald-600' : 'text-amber-700'}`}>
                                                {formatCurrency(Math.max(0, item.total - item.paid))}
                                              </span>
                                              <span className="text-[11px] text-slate-400 mt-0.5">{Math.max(0, 100 - item.pctRaw).toFixed(1)}%</span>
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <button
                                            type="button"
                                            onClick={() => setExpandedPagos2026SummaryKey(isExpanded ? null : item.key)}
                                            className="font-mono text-[#0F4C3A] hover:text-[#0b3a2d] hover:underline"
                                            title="Ver desglose mensual"
                                          >
                                            {formatCurrency(item.total)}
                                          </button>
                                        </td>
                                      </tr>
                                      {isExpanded && (
                                        <tr className="bg-emerald-50/50">
                                          <td colSpan={5} className="px-4 py-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                              {item.monthly.map((month) => (
                                                <div key={`${item.key}-${month.month}`} className="rounded-lg border border-emerald-100 bg-white px-3 py-2 flex items-center justify-between">
                                                  <span className="text-xs text-slate-500">{month.month}</span>
                                                  <span className="text-xs font-semibold text-slate-700">{formatCurrency(month.value)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                   )}
                </div>
              )}
            </div>
          )}

          {/* ── REPORTES ─────────────────────────────────────────────────────── */}
          {activeTab === 'reportes' && (
            <div>
              {/* Sub-navigation tabs */}
              <div className="flex items-center gap-0 border-b border-slate-200 mb-6 overflow-x-auto">
                {([
                  { id: 'gastoEfectuado'    as const, label: 'Gasto Efectuado 2026', icon: DollarSign },
                  { id: 'historicoServicios' as const, label: 'Histórico de Servicios', icon: TrendingUp },
                  { id: 'anteproyecto'      as const, label: 'Anteproyecto', icon: FileText },
                  { id: 'paaas'             as const, label: 'PAAAS', icon: Layers },
                  { id: 'deductivas'        as const, label: 'Deductivas', icon: CreditCard },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveReportesView(id)}
                    className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeReportesView === id
                        ? 'border-[#B38E5D] text-[#B38E5D]'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* ── Gasto Efectuado 2026 ─────────────────────────────────── */}
              {activeReportesView === 'gastoEfectuado' && (
                <div>
                  {/* Header */}
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <DollarSign className="h-6 w-6 text-[#B38E5D]" />
                        Gasto Efectuado 2026
                      </h1>
                      <p className="text-slate-500 text-sm mt-1">Avance financiero mensual y acumulado por contrato, basado en la tabla de pagos.</p>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  {(() => {
                    const totalMax   = gastoEfectuado2026Data.reduce((a, r) => a + r.montMax, 0);
                    const totalPagado = gastoEfectuado2026Data.reduce((a, r) => a + r.totalPagado, 0);
                    const pctGlobal  = totalMax > 0 ? (totalPagado / totalMax) * 100 : 0;
                    const saldoRest  = Math.max(0, totalMax - totalPagado);
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-xs text-slate-500 mb-1">Mont. Max. Total</p>
                          <p className="text-lg font-bold text-slate-800">{formatCurrency(totalMax)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-xs text-slate-500 mb-1">Total Pagado</p>
                          <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalPagado)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-xs text-slate-500 mb-1">Saldo Restante</p>
                          <p className="text-lg font-bold text-amber-700">{formatCurrency(saldoRest)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                          <p className="text-xs text-emerald-700 mb-1 font-medium">Avance Global</p>
                          <p className="text-2xl font-bold text-emerald-700">{pctGlobal.toFixed(1)}%</p>
                          <div className="mt-2 h-2 rounded-full bg-emerald-200 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, pctGlobal)}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Table */}
                  {loadingData ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                      <Loader2 className="h-8 w-8 animate-spin mr-3" />
                      Cargando datos...
                    </div>
                  ) : gastoEfectuado2026Data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                      <FileSpreadsheet className="h-12 w-12 mb-3 opacity-30" />
                      <p>No hay datos de pagos disponibles.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                      <table className="min-w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#0F4C3A] text-white text-[11px] uppercase tracking-wide">
                            <th className="px-3 py-3 text-left font-bold sticky left-0 z-20 bg-[#0F4C3A] whitespace-nowrap border-r border-white/20 min-w-[260px]">Objeto del Contrato</th>
                            <th className="px-3 py-3 text-left font-bold whitespace-nowrap min-w-[130px]">No. Contrato</th>
                            <th className="px-3 py-3 text-left font-bold whitespace-nowrap min-w-[160px]">Proveedor</th>
                            <th className="px-3 py-3 text-center font-bold whitespace-nowrap">Fecha Inicio</th>
                            <th className="px-3 py-3 text-center font-bold whitespace-nowrap">Fecha Término</th>
                            <th className="px-3 py-3 text-right font-bold whitespace-nowrap border-r border-white/20">Mont. Max.</th>
                            {REPORTE_MONTH_DEFS.map(({ label }) => (
                              <th key={label} className="px-2 py-3 text-center font-bold whitespace-nowrap min-w-[100px] border-l border-white/10">{label}</th>
                            ))}
                            <th className="px-3 py-3 text-right font-bold whitespace-nowrap border-l border-white/30 bg-[#0c3b2d] min-w-[120px]">Total / %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {gastoEfectuado2026Data.map((row, rowIdx) => (
                            <tr
                              key={row.key}
                              className={`hover:bg-amber-50/40 transition-colors ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                            >
                              {/* Fixed columns */}
                              <td className="px-3 py-2.5 text-slate-700 sticky left-0 z-10 bg-inherit border-r border-slate-200 min-w-[260px] max-w-[260px]">
                                <span className="block truncate" title={row.objeto}>{row.objeto || '—'}</span>
                              </td>
                              <td className="px-3 py-2.5 font-mono font-semibold text-slate-700 whitespace-nowrap">
                                {row.noContrato || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-slate-600 max-w-[160px]">
                                <span className="block truncate" title={row.proveedor}>{row.proveedor || '—'}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">
                                {formatDateOnly(row.fechaInicio) || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">
                                {formatDateOnly(row.fechaTermino) || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-slate-700 whitespace-nowrap border-r border-slate-200">
                                {formatCurrency(row.montMax)}
                              </td>
                              {/* Month columns */}
                              {row.monthly.map(({ label, amount, pctMensual, pctAcum }) => (
                                <td key={label} className="px-2 py-2 text-center border-l border-slate-100 align-top min-w-[100px]">
                                  {amount > 0 ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-slate-700 font-semibold tabular-nums whitespace-nowrap">
                                        {formatCurrency(amount)}
                                      </span>
                                      <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden my-0.5">
                                        <div
                                          className="h-full rounded-full bg-emerald-500"
                                          style={{ width: `${Math.min(100, pctMensual)}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-bold text-emerald-700 tabular-nums">{pctMensual.toFixed(1)}%</span>
                                      <span className="text-[10px] text-blue-600 tabular-nums">Acum: {pctAcum.toFixed(1)}%</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-200 text-base">—</span>
                                  )}
                                </td>
                              ))}
                              {/* Total column */}
                              <td className="px-3 py-2.5 text-right border-l border-slate-200 bg-slate-50/80 align-top">
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                                    {formatCurrency(row.totalPagado)}
                                  </span>
                                  <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden my-0.5">
                                    <div
                                      className={`h-full rounded-full ${row.pctTotal >= 90 ? 'bg-emerald-500' : row.pctTotal >= 60 ? 'bg-blue-500' : row.pctTotal >= 30 ? 'bg-amber-500' : 'bg-red-400'}`}
                                      style={{ width: `${Math.min(100, row.pctTotal)}%` }}
                                    />
                                  </div>
                                  <span className={`text-[11px] font-bold tabular-nums ${row.pctTotal >= 90 ? 'text-emerald-600' : row.pctTotal >= 60 ? 'text-blue-600' : row.pctTotal >= 30 ? 'text-amber-600' : 'text-red-500'}`}>
                                    {row.pctTotal.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {/* Footer totals row */}
                          {(() => {
                            const totMontMax = gastoEfectuado2026Data.reduce((a, r) => a + r.montMax, 0);
                            const totPagado  = gastoEfectuado2026Data.reduce((a, r) => a + r.totalPagado, 0);
                            const totPct     = totMontMax > 0 ? (totPagado / totMontMax) * 100 : 0;
                            const monthTotals = REPORTE_MONTH_DEFS.map(({ label }, mi) => ({
                              label,
                              amount: gastoEfectuado2026Data.reduce((a, r) => a + (r.monthly[mi]?.amount ?? 0), 0),
                            }));
                            let acumSum = 0;
                            return (
                              <tr className="bg-[#0F4C3A]/10 font-bold text-xs border-t-2 border-[#0F4C3A]/30">
                                <td className="px-3 py-3 text-[#0F4C3A] sticky left-0 bg-[#f0f7f4] border-r border-[#0F4C3A]/20 whitespace-nowrap z-10">TOTALES</td>
                                <td colSpan={4} className="px-3 py-3 text-slate-500 text-center text-[10px]">{gastoEfectuado2026Data.length} contratos</td>
                                <td className="px-3 py-3 text-right text-[#0F4C3A] whitespace-nowrap border-r border-[#0F4C3A]/20">{formatCurrency(totMontMax)}</td>
                                {monthTotals.map(({ label, amount }, mi) => {
                                  acumSum += amount;
                                  const pctM = totMontMax > 0 ? (amount / totMontMax) * 100 : 0;
                                  const pctA = totMontMax > 0 ? (acumSum / totMontMax) * 100 : 0;
                                  return (
                                    <td key={label} className="px-2 py-3 text-center border-l border-[#0F4C3A]/20 min-w-[100px]">
                                      {amount > 0 ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="text-slate-700 tabular-nums whitespace-nowrap">{formatCurrency(amount)}</span>
                                          <span className="text-[10px] font-bold text-emerald-700">{pctM.toFixed(1)}%</span>
                                          <span className="text-[10px] text-blue-600">Acum: {pctA.toFixed(1)}%</span>
                                        </div>
                                      ) : <span className="text-slate-300">—</span>}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-3 text-right border-l border-[#0F4C3A]/20 bg-emerald-50">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-slate-700 tabular-nums whitespace-nowrap">{formatCurrency(totPagado)}</span>
                                    <span className="text-[11px] font-bold text-emerald-700">{totPct.toFixed(1)}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Histórico de Servicios ──────────────────────────────── */}
              {activeReportesView === 'historicoServicios' && (() => {
                // Available years — add more entries here when new pagos_XXXX tables are incorporated
                const availableYears: number[] = [2026];
                // Map each year to the already-computed data (no new fetches, no data duplication)
                const yearDataMap: Record<number, typeof gastoEfectuado2026Data> = {
                  2026: gastoEfectuado2026Data,
                };
                const rows = yearDataMap[selectedHistoricoYear] ?? [];
                const totalMax    = rows.reduce((a, r) => a + r.montMax, 0);
                const totalPagado = rows.reduce((a, r) => a + r.totalPagado, 0);
                const pctGlobal   = totalMax > 0 ? (totalPagado / totalMax) * 100 : 0;
                const saldoRest   = Math.max(0, totalMax - totalPagado);
                return (
                  <div>
                    {/* Header */}
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                          <TrendingUp className="h-6 w-6 text-[#B38E5D]" />
                          Histórico de Servicios
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Vista histórica del avance financiero por año. Los datos provienen de las tablas de pagos existentes.</p>
                      </div>
                    </div>

                    {/* Year selector */}
                    <div className="flex items-center gap-3 mb-5 flex-wrap">
                      <span className="text-sm font-semibold text-slate-600">Año:</span>
                      {availableYears.map(year => (
                        <button
                          key={year}
                          onClick={() => setSelectedHistoricoYear(year)}
                          className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                            selectedHistoricoYear === year
                              ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                              : 'bg-white text-slate-600 border-slate-300 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'
                          }`}
                        >
                          {year}
                        </button>
                      ))}
                      <span className="text-[11px] text-slate-400 italic ml-1">Cuando se incorpore la tabla de pagos de otro año, aparecerá aquí automáticamente.</span>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1">Mont. Max. Total</p>
                        <p className="text-lg font-bold text-slate-800">{formatCurrency(totalMax)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1">Total Pagado</p>
                        <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalPagado)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1">Saldo Restante</p>
                        <p className="text-lg font-bold text-amber-700">{formatCurrency(saldoRest)}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                        <p className="text-xs text-emerald-700 mb-1 font-medium">Avance Global {selectedHistoricoYear}</p>
                        <p className="text-2xl font-bold text-emerald-700">{pctGlobal.toFixed(1)}%</p>
                        <div className="mt-2 h-2 rounded-full bg-emerald-200 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, pctGlobal)}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    {loadingData ? (
                      <div className="flex items-center justify-center py-16 text-slate-400">
                        <Loader2 className="h-8 w-8 animate-spin mr-3" />
                        Cargando datos...
                      </div>
                    ) : rows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <FileSpreadsheet className="h-12 w-12 mb-3 opacity-30" />
                        <p>No hay datos de pagos disponibles para {selectedHistoricoYear}.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                        <table className="min-w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#0F4C3A] text-white text-[11px] uppercase tracking-wide">
                              <th className="px-3 py-3 text-left font-bold sticky left-0 z-20 bg-[#0F4C3A] whitespace-nowrap border-r border-white/20 min-w-[260px]">Objeto del Contrato</th>
                              <th className="px-3 py-3 text-left font-bold whitespace-nowrap min-w-[130px]">No. Contrato</th>
                              <th className="px-3 py-3 text-left font-bold whitespace-nowrap min-w-[160px]">Proveedor</th>
                              <th className="px-3 py-3 text-center font-bold whitespace-nowrap">Fecha Inicio</th>
                              <th className="px-3 py-3 text-center font-bold whitespace-nowrap">Fecha Término</th>
                              <th className="px-3 py-3 text-right font-bold whitespace-nowrap border-r border-white/20">Mont. Max.</th>
                              {REPORTE_MONTH_DEFS.map(({ label }) => (
                                <th key={label} className="px-2 py-3 text-center font-bold whitespace-nowrap min-w-[100px] border-l border-white/10">{label}</th>
                              ))}
                              <th className="px-3 py-3 text-right font-bold whitespace-nowrap border-l border-white/30 bg-[#0c3b2d] min-w-[120px]">Total / %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rows.map((row, rowIdx) => (
                              <tr key={row.key} className={`hover:bg-amber-50/40 transition-colors ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                                <td className="px-3 py-2.5 text-slate-700 sticky left-0 z-10 bg-inherit border-r border-slate-200 min-w-[260px] max-w-[260px]"><span className="block truncate" title={row.objeto}>{row.objeto || '—'}</span></td>
                                <td className="px-3 py-2.5 font-mono font-semibold text-slate-700 whitespace-nowrap">{row.noContrato || '—'}</td>
                                <td className="px-3 py-2.5 text-slate-600 max-w-[160px]"><span className="block truncate" title={row.proveedor}>{row.proveedor || '—'}</span></td>
                                <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">{formatDateOnly(row.fechaInicio) || '—'}</td>
                                <td className="px-3 py-2.5 text-center text-slate-500 whitespace-nowrap">{formatDateOnly(row.fechaTermino) || '—'}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-slate-700 whitespace-nowrap border-r border-slate-200">{formatCurrency(row.montMax)}</td>
                                {row.monthly.map(({ label, amount, pctMensual, pctAcum }) => (
                                  <td key={label} className="px-2 py-2 text-center border-l border-slate-100 align-top min-w-[100px]">
                                    {amount > 0 ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-slate-700 font-semibold tabular-nums whitespace-nowrap">{formatCurrency(amount)}</span>
                                        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden my-0.5">
                                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pctMensual)}%` }} />
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-700 tabular-nums">{pctMensual.toFixed(1)}%</span>
                                        <span className="text-[10px] text-blue-600 tabular-nums">Acum: {pctAcum.toFixed(1)}%</span>
                                      </div>
                                    ) : <span className="text-slate-200 text-base">—</span>}
                                  </td>
                                ))}
                                <td className="px-3 py-2.5 text-right border-l border-slate-200 bg-slate-50/80 align-top">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-semibold text-slate-700 tabular-nums whitespace-nowrap">{formatCurrency(row.totalPagado)}</span>
                                    <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden my-0.5">
                                      <div className={`h-full rounded-full ${row.pctTotal >= 90 ? 'bg-emerald-500' : row.pctTotal >= 60 ? 'bg-blue-500' : row.pctTotal >= 30 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${Math.min(100, row.pctTotal)}%` }} />
                                    </div>
                                    <span className={`text-[11px] font-bold tabular-nums ${row.pctTotal >= 90 ? 'text-emerald-600' : row.pctTotal >= 60 ? 'text-blue-600' : row.pctTotal >= 30 ? 'text-amber-600' : 'text-red-500'}`}>{row.pctTotal.toFixed(1)}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {/* Footer totals */}
                            {(() => {
                              const totMontMax  = rows.reduce((a, r) => a + r.montMax, 0);
                              const totPagado   = rows.reduce((a, r) => a + r.totalPagado, 0);
                              const totPct      = totMontMax > 0 ? (totPagado / totMontMax) * 100 : 0;
                              const monthTotals = REPORTE_MONTH_DEFS.map(({ label }, mi) => ({
                                label,
                                amount: rows.reduce((a, r) => a + (r.monthly[mi]?.amount ?? 0), 0),
                              }));
                              let acumSum = 0;
                              return (
                                <tr className="bg-[#0F4C3A]/10 font-bold text-xs border-t-2 border-[#0F4C3A]/30">
                                  <td className="px-3 py-3 text-[#0F4C3A] sticky left-0 bg-[#f0f7f4] border-r border-[#0F4C3A]/20 whitespace-nowrap z-10">TOTALES</td>
                                  <td colSpan={4} className="px-3 py-3 text-slate-500 text-center text-[10px]">{rows.length} contratos</td>
                                  <td className="px-3 py-3 text-right text-[#0F4C3A] whitespace-nowrap border-r border-[#0F4C3A]/20">{formatCurrency(totMontMax)}</td>
                                  {monthTotals.map(({ label, amount }, mi) => {
                                    acumSum += amount;
                                    const pctM = totMontMax > 0 ? (amount / totMontMax) * 100 : 0;
                                    const pctA = totMontMax > 0 ? (acumSum / totMontMax) * 100 : 0;
                                    return (
                                      <td key={label} className="px-2 py-3 text-center border-l border-[#0F4C3A]/20 min-w-[100px]">
                                        {amount > 0 ? (
                                          <div className="flex flex-col items-center gap-0.5">
                                            <span className="text-slate-700 tabular-nums whitespace-nowrap">{formatCurrency(amount)}</span>
                                            <span className="text-[10px] font-bold text-emerald-700">{pctM.toFixed(1)}%</span>
                                            <span className="text-[10px] text-blue-600">Acum: {pctA.toFixed(1)}%</span>
                                          </div>
                                        ) : <span className="text-slate-300">—</span>}
                                      </td>
                                    );
                                  })}
                                  <td className="px-3 py-3 text-right border-l border-[#0F4C3A]/20 bg-emerald-50">
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="text-slate-700 tabular-nums whitespace-nowrap">{formatCurrency(totPagado)}</span>
                                      <span className="text-[11px] font-bold text-emerald-700">{totPct.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Remaining placeholders (Anteproyecto, PAAAS, Deductivas) ── */}
              {(activeReportesView === 'anteproyecto' || activeReportesView === 'paaas' || activeReportesView === 'deductivas') && (
                <div className="flex flex-col items-center justify-center py-28 text-center">
                  <div className="rounded-full bg-slate-100 p-6 mb-5">
                    <FileSpreadsheet className="h-12 w-12 text-slate-300" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-700 mb-2">
                    {activeReportesView === 'anteproyecto' && 'Anteproyecto'}
                    {activeReportesView === 'paaas'        && 'PAAAS'}
                    {activeReportesView === 'deductivas'   && 'Deductivas'}
                  </h2>
                  <p className="text-slate-400 text-sm">Esta sección está en construcción.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'contracts' && (
            <div>
               <div className="flex justify-between items-center mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Gestión de Contratos</h1>
                    <p className="text-slate-500 text-sm">Administración de servicios, proveedores y presupuestos.</p>
                  </div>
                  
                  {/* Botón para abrir Modal de Nuevo Registro PAAS */}
                  {activeContractSubTab === 'paas' && canManageRecords && (
                    <button 
                      onClick={openNewRecordModal}
                      className="bg-[#B38E5D] hover:bg-[#9c7a4d] text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Nuevo Registro PAAS
                    </button>
                  )}
               </div>

               {/* Sub-Tabs Navigation */}
              <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
                  {/*
                  <button 
                     onClick={() => setActiveContractSubTab('paas')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'paas' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Balance PAAS 2026
                    </div>
                  </button>
                  */}
                  <button 
                     onClick={() => setActiveContractSubTab('payments')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'payments' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Pagos
                    </div>
                  </button>
                  <button 
                     onClick={() => setActiveContractSubTab('invoices')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'invoices' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      Facturas
                    </div>
                  </button>
                  {/*
                  <button 
                     onClick={() => setActiveContractSubTab('compranet')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'compranet' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Procedimientos Compranet
                    </div>
                  </button>
                  <button 
                     onClick={() => setActiveContractSubTab('pendingOct')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'pendingOct' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Observaciones de Pago (Octubre)
                    </div>
                  </button>
                  */}
                  <button 
                     onClick={() => setActiveContractSubTab('procedures')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'procedures' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Procedimientos
                    </div>
                  </button>
               </div>

               {/* === CONTRACTS: PAAS 2026 === */}
               {activeContractSubTab === 'paas' && (
                 <div className="animate-fade-in space-y-6">
                    {/* PAAS Stats Header */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#B38E5D]/10" />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Solicitado 2026</p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">
                              {formatCurrency(paasSummary.totalRequested)}
                            </h3>
                          </div>
                          <div className="p-3 rounded-full bg-[#B38E5D]/10 text-[#B38E5D]">
                            <DollarSign className="h-6 w-6" />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-4">Promedio por partida: {formatCurrency(paasSummary.averageRequested || 0)}</p>
                      </div>

                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-slate-500/10" />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Modificado</p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">
                              {formatCurrency(paasSummary.totalModified)}
                            </h3>
                          </div>
                          <div className="p-3 rounded-full bg-slate-100 text-slate-600">
                            <Briefcase className="h-6 w-6" />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-4">Cobertura: {paasSummary.gerenciasCount} gerencia{paasSummary.gerenciasCount === 1 ? '' : 's'}.</p>
                      </div>

                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-emerald-500/10" />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Variación neta</p>
                            <h3 className={`text-2xl font-bold mt-1 ${paasDeltaClasses.valueClass}`}>
                              {formatCurrency(paasSummary.delta || 0)}
                            </h3>
                          </div>
                          <div className={`p-3 rounded-full ${paasDeltaClasses.iconWrapper}`}>
                            <DeltaIcon className="h-6 w-6" />
                          </div>
                        </div>
                        <div className="mt-4 flex items-start gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${paasDeltaClasses.badgeClass}`}>
                            {paasDeltaClasses.title}
                          </span>
                          <span className="text-[11px] text-slate-400 flex-1">{paasDeltaClasses.description}</span>
                        </div>
                      </div>

                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-blue-500/10" />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Partidas registradas</p>
                            <h3 className="text-3xl font-bold text-slate-900 mt-1">
                              {paasData.length}
                            </h3>
                          </div>
                          <div className="p-3 rounded-full bg-blue-100 text-blue-500">
                            <FileText className="h-6 w-6" />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-4">Gerencias activas: {paasSummary.gerenciasCount || 0}.</p>
                      </div>
                    </div>

                    {/* Graphic Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart2 className="h-5 w-5 text-slate-400"/> Presupuesto por Gerencia</h3>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={paasByGerencia} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" hide />
                              <YAxis type="category" dataKey="name" width={180} tick={{fontSize: 11}} />
                              <Tooltip formatter={(value: number) => formatCurrency(value)} />
                              <Bar dataKey="value" name="Monto Solicitado" fill="#B38E5D" radius={[0, 4, 4, 0]} barSize={25} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      
                      <div className="bg-slate-900 rounded-xl shadow-lg p-6 text-white flex flex-col">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-bold mb-1">Control Presupuestal</h3>
                            <p className="text-slate-400 text-sm">Seguimiento del balance PAAS 2026.</p>
                          </div>
                          <div className="text-3xl font-bold text-emerald-300">
                            {paasProgressDisplay}
                          </div>
                        </div>
                        <div className="mt-6">
                          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-2 rounded-full bg-emerald-400 transition-all duration-500"
                              style={{ width: `${paasProgressBarWidth}%` }}
                            />
                          </div>
                          <p className="text-xs text-white/70 mt-3">
                            Modificado: {formatCurrency(paasSummary.totalModified || 0)} vs {formatCurrency(paasSummary.totalRequested || 0)} solicitado.
                          </p>
                        </div>
                        <div className="mt-6 space-y-4">
                          {paasInsightItems.map((item, idx) => (
                            <div key={`${item.label}-${idx}`} className="pt-4 border-t border-white/10 first:pt-0 first:border-t-0">
                              <p className="text-[11px] uppercase tracking-wider text-white/50">{item.label}</p>
                              <p className="text-sm font-semibold text-white mt-1">{item.value}</p>
                              <p className="text-xs text-white/60 mt-1">{item.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-slate-400" /> Top servicios por monto solicitado
                      </h3>
                      {loadingData ? (
                        <div className="h-24 flex items-center justify-center text-slate-400 text-sm">Cargando ranking...</div>
                      ) : paasTopServices.length === 0 ? (
                        <div className="h-24 flex items-center justify-center text-slate-500 text-sm">No hay información registrada en el PAAS 2026.</div>
                      ) : (
                        <div className="space-y-4">
                          {paasTopServices.map((service, idx) => (
                            <div
                              key={service.id ?? idx}
                              className="flex items-start justify-between gap-4 p-4 rounded-lg border border-slate-100 hover:border-[#B38E5D]/40 hover:bg-[#B38E5D]/5 transition-colors"
                            >
                              <div className="flex-1">
                                <p className="text-[11px] uppercase tracking-wider text-slate-400">
                                  #{idx + 1} · {normalizeWhitespace(service["Clave cucop"] || 'Sin clave')}
                                </p>
                                <p className="text-sm font-semibold text-slate-800 mt-1">
                                  {normalizeWhitespace(service["Nombre del Servicio."] || 'Sin nombre')}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  {normalizeWhitespace(service["Gerencia"] || 'Sin gerencia')}
                                </p>
                              </div>
                              <div className="text-right min-w-[120px]">
                                <p className="text-xs text-slate-400 uppercase">Solicitado</p>
                                <p className="text-sm font-bold text-slate-700">{formatCurrency(service["Monto solicitado anteproyecto 2026"] || 0)}</p>
                                {service["Modificado"] ? (
                                  <p className="text-xs text-emerald-600 mt-1">Modificado: {formatCurrency(service["Modificado"] || 0)}</p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Table Section */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 pt-6 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
                          <div className="relative w-full sm:w-80">
                            <Search className="table-filter-icon" aria-hidden="true" />
                            <input
                              type="text"
                              value={tableFilters.paas}
                              onChange={(event) => updateTableFilter('paas', event.target.value)}
                              placeholder="Filtra por clave, servicio o gerencia"
                              className="table-filter-input"
                            />
                            {tableFilters.paas && (
                              <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                                onClick={() => updateTableFilter('paas', '')}
                              >
                                Limpiar
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px] font-semibold pr-6 sm:pr-0">
                            {paasColumnFiltersCount > 0 && (
                              <button
                                type="button"
                                className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                                onClick={() => clearColumnFilters('paas')}
                              >
                                Limpiar filtros por columna
                              </button>
                            )}
                            <span className="text-slate-500">
                              {formatResultLabel(paasOrderedRows.length)}
                              {tableFilters.paas.trim() ? ' · filtro general' : ''}
                              {paasColumnFiltersCount ? ` · ${formatColumnFilterLabel(paasColumnFiltersCount)}` : ''}
                            </span>
                          </div>
                          {renderActiveColumnFilterBadges('paas')}
                          <button
                            onClick={() => setIsPaasCompact(!isPaasCompact)}
                            className={`ml-auto p-2 rounded-md transition-colors ${isPaasCompact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                            title={isPaasCompact ? 'Vista normal' : 'Vista compacta'}
                          >
                            {isPaasCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                          </button>
                          {canManageRecords && (
                            <button
                              type="button"
                              onClick={() => setIsPaasEditing((prev) => !prev)}
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isPaasEditing ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                            >
                              {isPaasEditing ? (
                                <>
                                  <Save className="h-4 w-4" />
                                  Salir de edición
                                </>
                              ) : (
                                <>
                                  <Pencil className="h-4 w-4" />
                                  Editar
                                </>
                              )}
                            </button>
                          )}
                          {canManageRecords && (
                            <button
                              type="button"
                              onClick={handleAddPaasRow}
                              disabled={!paasTableColumns.length}
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${paasTableColumns.length ? 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                            >
                              <Plus className="h-4 w-4" />
                              Agregar fila
                            </button>
                          )}
                        </div>
                        {isPaasEditing && (
                          <div className="px-6 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Modo edición activo: ajusta cualquier celda como en Excel y usa "Salir de edición" para bloquear cambios.
                          </div>
                        )}
                        <div className={`overflow-auto ${paasTableSizing.containerHeightClass} relative`}>
                          <table className={`${paasTableSizing.tableTextClass} text-center w-max min-w-full border-collapse`}>
                            <thead className={`uppercase tracking-wider text-white ${paasTableSizing.headerTextClass}`}>
                              <tr className={paasTableSizing.headerRowClass}>
                                {paasTableConfig.columns.map((column) => {
                                  const stickyInfo = paasTableConfig.stickyMeta.get(column.key);
                                  const minWidth = column.width ?? 200;
                                  const headerStyle: React.CSSProperties = {
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: stickyInfo ? 60 : 40,
                                    minWidth: `${minWidth}px`,
                                    color: '#fff',
                                    backgroundColor: stickyInfo ? '#0F4C3A' : '#124836',
                                  };

                                  if (!stickyInfo) {
                                    headerStyle.backgroundImage = 'linear-gradient(135deg, #124836 0%, #0A3224 100%)';
                                  }

                                  if (stickyInfo) {
                                    headerStyle.left = stickyInfo.left;
                                    headerStyle.width = `${stickyInfo.width}px`;
                                    if (paasTableConfig.lastStickyKey === column.key) {
                                      headerStyle.boxShadow = '6px 0 10px -4px rgba(15,76,58,0.22)';
                                    }
                                  }

                                  if (column.key === '__actions') {
                                    return (
                                      <th
                                        key={column.key}
                                        className={`${paasTableSizing.actionsCellPadding} font-semibold border-b border-white/10 text-center`}
                                        style={headerStyle}
                                      >
                                        {column.label}
                                      </th>
                                    );
                                  }

                                  return (
                                    <th
                                      key={column.key}
                                      className={`${paasTableSizing.headerCellPadding} font-semibold border-b border-white/10 text-center`}
                                      style={headerStyle}
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        <span className="truncate">{column.label}</span>
                                        {renderColumnFilterControl('paas', column.key, column.label, paasData)}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {loadingData ? (
                                <tr>
                                  <td colSpan={paasTableConfig.columns.length} className="py-8 text-center text-slate-500">Cargando PAAS...</td>
                                </tr>
                              ) : paasData.length === 0 ? (
                                <tr>
                                  <td colSpan={paasTableConfig.columns.length} className="py-8 text-center text-slate-500">No hay registros en el PAAS 2026.</td>
                                </tr>
                              ) : paasOrderedRows.length === 0 ? (
                                <tr>
                                  <td colSpan={paasTableConfig.columns.length} className="py-8 text-center text-slate-500">Sin coincidencias para el filtro aplicado.</td>
                                </tr>
                              ) : (
                                <>
                                  {paasOrderedRows.map((item, rowIndex) => {
                                  const zebraBackground = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                                  const rowStyle = buildRowStyle(zebraBackground);

                                  return (
                                    <tr
                                      key={item.id}
                                      className="table-row transition-colors"
                                      style={rowStyle}
                                    >
                                      {paasTableConfig.columns.map((column) => {
                                        const stickyInfo = paasTableConfig.stickyMeta.get(column.key);
                                        const minWidth = column.width ?? 200;
                                        const alignClass = column.align === 'right'
                                          ? 'text-right'
                                          : column.align === 'left'
                                            ? 'text-left'
                                            : 'text-center';
                                        const cellClasses = [
                                            isPaasCompact ? 'px-2 py-1.5' : 'px-4 py-3',
                                            'align-top', 
                                            alignClass, 
                                            'transition-colors'
                                        ];
                                        if (column.mono || column.isCurrency) cellClasses.push('font-mono');
                                        if (column.className) cellClasses.push(column.className);

                                        const cellStyle: React.CSSProperties = {
                                          minWidth: `${minWidth}px`,
                                        };

                                        if (stickyInfo) {
                                          cellClasses.push('sticky-cell');
                                          cellStyle.position = 'sticky';
                                          cellStyle.left = stickyInfo.left;
                                          cellStyle.width = `${stickyInfo.width}px`;
                                          cellStyle.zIndex = 30;
                                          cellStyle.backgroundColor = 'var(--row-bg, #ffffff)';
                                          if (paasTableConfig.lastStickyKey === column.key) {
                                            cellStyle.boxShadow = '6px 0 8px -4px rgba(15,76,58,0.18)';
                                          }
                                        }

                                        const rawValue = (item as Record<string, any>)[column.key];
                                        let displayValue: React.ReactNode;

                                        if (column.key === '__actions') {
                                          displayValue = canManageRecords ? (
                                            <div className="flex justify-center gap-2">
                                              <button
                                                onClick={() => openEditRecordModal(item)}
                                                className="p-1.5 text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 rounded-md transition-colors"
                                                title="Editar"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </button>
                                              <button
                                                onClick={() => handleDeleteRecord(item.id)}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                title="Eliminar"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                            </div>
                                          ) : (
                                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Solo lectura</span>
                                          );
                                        } else if (column.isCurrency) {
                                          const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue) || 0;
                                          displayValue = formatCurrency(numericValue);
                                        } else if (column.key === 'Justificación') {
                                          const textValue = typeof rawValue === 'string' ? rawValue.trim() : rawValue ? String(rawValue) : '';
                                          displayValue = textValue ? textValue : '-';
                                        } else if (column.mono) {
                                          displayValue = rawValue !== null && rawValue !== undefined && rawValue !== ''
                                            ? String(rawValue)
                                            : '-';
                                        } else if (typeof rawValue === 'number') {
                                          displayValue = rawValue.toLocaleString('es-MX');
                                        } else {
                                          displayValue = normalizeWhitespace(typeof rawValue === 'string' ? rawValue : rawValue ? String(rawValue) : '-');
                                        }

                                        const isCellEditable = isPaasEditing && column.key !== '__actions';
                                        if (isCellEditable) {
                                          cellClasses.push('cursor-text');
                                        }

                                        let editingValue = '';
                                        if (rawValue !== null && rawValue !== undefined) {
                                            if (typeof rawValue === 'number') {
                                                if (column.isCurrency) {
                                                    editingValue = rawValue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                } else {
                                                    editingValue = String(rawValue);
                                                }
                                            } else if (rawValue instanceof Date) {
                                                editingValue = formatDateToDDMMYYYY(rawValue);
                                            } else if (typeof rawValue === 'string') {
                                                const parsedForEdit = parsePotentialDate(rawValue);
                                                if (parsedForEdit) {
                                                    editingValue = formatDateToDDMMYYYY(parsedForEdit);
                                                } else {
                                                    if (column.isCurrency) {
                                                        const sanitized = rawValue.replace(/,/g, '');
                                                        const num = parseFloat(sanitized);
                                                        if (!isNaN(num)) {
                                                            editingValue = num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                        } else {
                                                            editingValue = rawValue;
                                                        }
                                                    } else {
                                                        editingValue = rawValue;
                                                    }
                                                }
                                            } else if (typeof rawValue === 'object') {
                                                try {
                                                    editingValue = JSON.stringify(rawValue);
                                                } catch (err) {
                                                    console.error('Error serializing value for inline edit:', err);
                                                    editingValue = String(rawValue);
                                                }
                                            } else {
                                                editingValue = String(rawValue);
                                            }
                                        }

                                        const isDateCol = normalizeAnnualKey(column.key).includes('fecha');
                                        const isBooleanCol = shouldTreatAsBooleanColumn(column.key, rawValue);
                                        const isChecked = isBooleanCol ? getBooleanChecked(rawValue) : false;

                                        return (
                                          <td
                                            key={column.key}
                                            className={cellClasses.join(' ')}
                                            style={cellStyle}
                                          >
                                            {isCellEditable ? (
                                              isBooleanCol ? (
                                                <div className="flex items-center justify-center h-full min-h-[1.5em]" onClick={(e) => e.stopPropagation()}>
                                                  <input
                                                    type="checkbox"
                                                    aria-label={`Alternar ${column.label}`}
                                                    title={`Alternar ${column.label}`}
                                                    className="w-5 h-5 text-[#0F4C3A] bg-gray-100 border-gray-300 rounded focus:ring-[#0F4C3A] cursor-pointer accent-[#2d3e50]"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                      const newVal = e.target.checked;
                                                      const valToSave = getBooleanSaveValue(rawValue, column.key, newVal);
                                                      handlePaasCellEdit(item, column.key, valToSave);
                                                    }}
                                                  />
                                                </div>
                                              ) : isDateCol ? (
                                                <input
                                                  type="date"
                                                  aria-label={`Fecha ${column.label}`}
                                                  title={`Fecha ${column.label}`}
                                                  className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                  value={(() => {
                                                    if (rawValue instanceof Date) return rawValue.toISOString().split('T')[0];
                                                    if (typeof rawValue === 'string') {
                                                      const p = parsePotentialDate(rawValue);
                                                      return p ? p.toISOString().split('T')[0] : '';
                                                    }
                                                    return '';
                                                  })()}
                                                  onChange={(e) => handlePaasCellEdit(item, column.key, e.target.value)}
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                              ) : (
                                                <div
                                                  contentEditable
                                                  suppressContentEditableWarning
                                                  className={`inline-block w-full ${paasTableSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                                  onBlur={(event) => handlePaasCellEdit(item, column.key, event.currentTarget.textContent ?? '')}
                                                  onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                      event.preventDefault();
                                                      (event.currentTarget as HTMLDivElement).blur();
                                                    }
                                                  }}
                                                >
                                                  {editingValue}
                                                </div>
                                              )
                                            ) : (
                                              isBooleanCol ? (
                                                <div className="flex items-center justify-center h-full min-h-[1.5em]">
                                                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#2d3e50] border-[#2d3e50]' : 'bg-transparent border-slate-300'}`}>
                                                    {isChecked && (
                                                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                      </svg>
                                                    )}
                                                  </div>
                                                </div>
                                              ) : (
                                                displayValue
                                              )
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                  })}
                                  <tr className="bg-slate-900 text-white font-semibold">
                                    {paasTableConfig.columns.map((column) => {
                                      const stickyInfo = paasTableConfig.stickyMeta.get(column.key);
                                      const minWidth = column.width ?? 200;
                                      const totalCellStyle: React.CSSProperties = {
                                        minWidth: `${minWidth}px`,
                                        backgroundColor: '#0F4C3A',
                                        borderTop: '1px solid rgba(255,255,255,0.2)',
                                        color: '#fff',
                                      };

                                      if (stickyInfo) {
                                        totalCellStyle.position = 'sticky';
                                        totalCellStyle.left = stickyInfo.left;
                                        totalCellStyle.width = `${stickyInfo.width}px`;
                                        totalCellStyle.zIndex = 40;
                                        if (paasTableConfig.lastStickyKey === column.key) {
                                          totalCellStyle.boxShadow = '6px 0 8px -4px rgba(0,0,0,0.35)';
                                        }
                                      }

                                      let displayValue: React.ReactNode = '-';
                                      if (column.key === 'No.') displayValue = 'Total';
                                      else if (column.isCurrency) displayValue = formatCurrency(paasColumnTotals[column.key] ?? 0);
                                      else if (column.key === '__actions') displayValue = null;

                                      const alignClass = column.align === 'right'
                                        ? 'text-right'
                                        : column.align === 'left'
                                          ? 'text-left'
                                          : 'text-center';

                                      return (
                                        <td
                                          key={`total-${column.key}`}
                                          className={`px-4 py-3 text-sm ${alignClass} ${column.mono || column.isCurrency ? 'font-mono' : ''}`}
                                          style={totalCellStyle}
                                        >
                                          {displayValue}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                </>
                              )}
                            </tbody>
                          </table>
                       </div>
                    </div>
                 </div>
               )}

               {/* === CONTRACTS: PAYMENTS (MEGA TABLA COMPLETA) === */}
               {activeContractSubTab === 'payments' && (
                 <div className="animate-fade-in space-y-6">
                    {/* Payments Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                           <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <BarChart2 className="h-5 w-5 text-slate-400"/> Flujo de Pagos Mensual
                           </h3>
                           <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                 <BarChart data={paymentsMonthlyFlow}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tick={{fontSize: 11}} />
                                    <YAxis tickFormatter={(val) => `$${val/1000000}M`} width={60} tick={{fontSize: 11}} />
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Bar dataKey="value" fill="#0F4C3A" radius={[4, 4, 0, 0]} name="Pagado" />
                                 </BarChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                           <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <PieChartIcon className="h-5 w-5 text-slate-400"/> Presupuesto vs Ejercido
                           </h3>
                           <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                 <PieChart>
                                    <Pie
                                       data={budgetExecutionData}
                                       cx="50%"
                                       cy="50%"
                                       innerRadius={60}
                                       outerRadius={80}
                                       paddingAngle={5}
                                       dataKey="value"
                                    >
                                       {budgetExecutionData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={index === 0 ? '#B38E5D' : '#E2E8F0'} />
                                       ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend verticalAlign="bottom" height={36}/>
                                 </PieChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                    </div>

                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                     <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                       <div>
                         <h3 className="text-lg font-bold text-slate-800">Control de Pagos</h3>
                         <p className="text-xs text-slate-500">Edite los registros de la tabla `control_pagos`, incluidos montos mensuales y observaciones.</p>
                       </div>
                       {canManageRecords && (
                         <button
                           type="button"
                           onClick={handleAddPaymentsRow}
                           disabled={!paymentsTableColumns.length}
                           className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${paymentsTableColumns.length ? 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                         >
                           <Plus className="h-4 w-4" />
                           Agregar fila
                         </button>
                       )}
                     </div>
                     <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-100">
                       <div className="relative w-full md:w-96">
                         <Search className="table-filter-icon" aria-hidden="true" />
                         <input
                           type="text"
                           value={tableFilters.controlPagos}
                           onChange={(event) => updateTableFilter('controlPagos', event.target.value)}
                           placeholder="Filtra contrato, proveedor o importe"
                           className="table-filter-input"
                         />
                         {tableFilters.controlPagos && (
                           <button
                             type="button"
                             className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                             onClick={() => updateTableFilter('controlPagos', '')}
                           >
                             Limpiar
                           </button>
                         )}
                       </div>
                       <div className="flex flex-col md:flex-row md:items-center gap-2 text-[11px] font-semibold">
                         {paymentsColumnFiltersCount > 0 && (
                           <button
                             type="button"
                             className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                             onClick={() => clearColumnFilters('controlPagos')}
                           >
                             Limpiar filtros por columna
                           </button>
                         )}
                         <span className="text-slate-500">
                           {formatResultLabel(filteredPaymentsData.length)}
                           {tableFilters.controlPagos.trim() ? ' · filtro general' : ''}
                           {paymentsColumnFiltersCount ? ` · ${formatColumnFilterLabel(paymentsColumnFiltersCount)}` : ''}
                         </span>
                       </div>
                        {renderActiveColumnFilterBadges('controlPagos')}
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={() => setIsPaymentsEditing((prev) => !prev)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${isPaymentsEditing ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                          >
                            <Pencil className="h-4 w-4" />
                            {isPaymentsEditing ? 'Salir de edición' : 'Editar'}
                          </button>
                        )}
                        <button
                            onClick={() => setIsPaymentsCompact(!isPaymentsCompact)}
                            className={`ml-auto p-2 rounded-md transition-colors ${isPaymentsCompact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                            title={isPaymentsCompact ? 'Vista normal' : 'Vista compacta'}
                          >
                            {isPaymentsCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                          </button>
                     </div>
                     {/* Contenedor con Scroll Horizontal y Altura Fija */}
                     <div className={`overflow-auto ${paymentsTableSizing.containerHeightClass} relative`}>
                       <table className={`${paymentsTableSizing.tableTextClass} text-center w-max min-w-full border-collapse`}>
                         <thead className={`text-white uppercase tracking-wider ${paymentsTableSizing.headerTextClass}`}>
                           <tr className={paymentsTableSizing.headerRowClass}>
                             {/* COLUMNAS FIJAS - CORNER LOCKING (TOP & LEFT) */}
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold border-b border-white/20 text-center`} style={{ position: 'sticky', left: 0, top: 0, width: '150px', minWidth: '150px', zIndex: 60, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>No. Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'no_contrato', 'No. Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold border-b border-white/20 text-center`} style={{ position: 'sticky', left: '150px', top: 0, width: '350px', minWidth: '350px', zIndex: 60, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Objeto del Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'objeto_del_contrato', 'Objeto del Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold border-b border-white/20 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.3)] text-center`} style={{ position: 'sticky', left: '500px', top: 0, width: '250px', minWidth: '250px', zIndex: 60, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Proveedor</span>
                                 {renderColumnFilterControl('controlPagos', 'proveedor', 'Proveedor', paymentsData)}
                               </div>
                             </th>
                             
                             {/* COLUMNAS EN ORDEN DE BASE DE DATOS - STICKY TOP ONLY */}
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold whitespace-nowrap border-b border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Tipo de Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'tipo_de_contrato', 'Tipo de Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold whitespace-nowrap border-b border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Fecha Inicio</span>
                                 {renderColumnFilterControl('controlPagos', 'fecha_de_inicio', 'Fecha Inicio', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold whitespace-nowrap border-b border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Fecha Término</span>
                                 {renderColumnFilterControl('controlPagos', 'fecha_de_termino', 'Fecha Término', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold whitespace-nowrap border-b border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '150px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Monto Máx.</span>
                                 {renderColumnFilterControl('controlPagos', 'mont_max', 'Monto Máximo', paymentsData)}
                               </div>
                             </th>
                             
                             {/* COLUMNAS MENSUALES (GENERADAS DINÁMICAMENTE) - STICKY TOP ONLY */}
                             {monthsConfig.map((m) => {
                               const prefix = m.dbPrefix || m.key;
                               const baseKey = m.key === 'sep' ? 'sept' : m.key;
                               return (
                                 <React.Fragment key={m.key}>
                                   <th className={`${paymentsTableSizing.headerCellPadding} font-bold text-white border-l border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>{m.label}</span>
                                       {renderColumnFilterControl('controlPagos', baseKey, `Monto ${m.label}`, paymentsData)}
                                     </div>
                                   </th>
                                   <th className={`${paymentsTableSizing.headerCellPadding} font-medium text-xs text-emerald-100 border-b border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>Preventivos</span>
                                       {renderColumnFilterControl('controlPagos', `${prefix}_preventivos`, `${m.label} · Preventivos`, paymentsData)}
                                     </div>
                                   </th>
                                   <th className={`${paymentsTableSizing.headerCellPadding} font-medium text-xs text-emerald-100 border-b border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>Correctivos</span>
                                       {renderColumnFilterControl('controlPagos', `${prefix}_correctivos`, `${m.label} · Correctivos`, paymentsData)}
                                     </div>
                                   </th>
                                   <th className={`${paymentsTableSizing.headerCellPadding} font-medium text-xs text-emerald-100 border-b border-white/20 text-center`} style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>Nota C.</span>
                                       {renderColumnFilterControl('controlPagos', `${prefix}_nota_de_credito`, `${m.label} · Nota de Crédito`, paymentsData)}
                                     </div>
                                   </th>
                                 </React.Fragment>
                               );
                             })}

                             {/* TOTALES FINALES - STICKY TOP ONLY */}
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold border-l border-white/20 bg-[#1B4D3E] text-center`} style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Monto Máximo Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'monto_maximo_contrato', 'Monto Máximo Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold border-b border-white/20 bg-[#1B4D3E] text-center`} style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Monto Ejercido</span>
                                 {renderColumnFilterControl('controlPagos', 'monto_ejercido', 'Monto Ejercido', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold text-center border-b border-white/20 bg-[#1B4D3E]`} style={{ position: 'sticky', top: 0, minWidth: '200px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Facturas Devengadas (%)</span>
                                 {renderColumnFilterControl('controlPagos', 'facturas_devengadas', 'Facturas Devengadas', paymentsData)}
                               </div>
                             </th>
                             <th className={`${paymentsTableSizing.headerCellPadding} font-bold border-b border-white/20 bg-[#1B4D3E] text-center`} style={{ position: 'sticky', top: 0, minWidth: '300px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Observaciones</span>
                                 {renderColumnFilterControl('controlPagos', 'observaciones', 'Observaciones', paymentsData)}
                               </div>
                             </th>
                             {canManageRecords && (
                               <th className={`${paymentsTableSizing.actionsCellPadding} font-bold border-b border-white/20 bg-[#1B4D3E] text-center`} style={{ position: 'sticky', top: 0, minWidth: `${paymentsTableSizing.actionsMinWidth}px`, zIndex: 50 }}>Acciones</th>
                             )}
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-200 bg-white">
                           {loadingData ? (
                             <tr><td colSpan={canManageRecords ? 100 : 99} className="text-center py-8">Cargando Pagos...</td></tr>
                           ) : paymentsData.length === 0 ? (
                              <tr><td colSpan={canManageRecords ? 100 : 99} className="text-center py-8 text-slate-500">No hay registros de pagos.</td></tr>
                           ) : filteredPaymentsData.length === 0 ? (
                              <tr><td colSpan={canManageRecords ? 100 : 99} className="text-center py-8 text-slate-500">Sin coincidencias para el filtro aplicado.</td></tr>
                           ) : filteredPaymentsData.map((item, idx) => {
                             const zebraBackground = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                             const rowStyle = buildRowStyle(zebraBackground);
                             return (
                               <tr
                                 key={item.id}
                                 className="transition-colors group table-row"
                                 style={rowStyle}
                               >
                               
                               {/* CELDAS FIJAS - 3 PRIMERAS COLUMNAS */}
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} font-bold text-slate-800 border-b border-slate-200 text-center sticky-cell`} style={{ position: 'sticky', left: 0, width: '150px', minWidth: '150px', zIndex: 40, backgroundColor: 'var(--row-bg, #ffffff)' }}>
                                  {isPaymentsEditing ? (
                                    <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1" onBlur={(e) => handlePaymentsCellEdit(item as any, 'no_contrato', e.currentTarget.textContent ?? '')}>{item.no_contrato ?? ''}</div>
                                  ) : (item.no_contrato || '-')}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} text-slate-600 border-b border-slate-200 whitespace-pre-wrap break-words text-center sticky-cell`} style={{ position: 'sticky', left: '150px', width: '350px', minWidth: '350px', zIndex: 40, backgroundColor: 'var(--row-bg, #ffffff)' }}>
                                  {isPaymentsEditing ? (
                                    <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 whitespace-pre-wrap" onBlur={(e) => handlePaymentsCellEdit(item as any, 'objeto_del_contrato', e.currentTarget.textContent ?? '')}>{item.objeto_del_contrato ?? ''}</div>
                                  ) : (item.objeto_del_contrato || '-')}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} text-slate-600 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.1)] border-b border-slate-200 whitespace-pre-wrap break-words border-r border-slate-300 text-center sticky-cell`} style={{ position: 'sticky', left: '500px', width: '250px', minWidth: '250px', zIndex: 40, backgroundColor: 'var(--row-bg, #ffffff)' }}>
                                  {isPaymentsEditing ? (
                                    <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 whitespace-pre-wrap" onBlur={(e) => handlePaymentsCellEdit(item as any, 'proveedor', e.currentTarget.textContent ?? '')}>{item.proveedor ?? ''}</div>
                                  ) : (item.proveedor || '-')}
                               </td>

                               {/* CELDAS GENERALES */}
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} text-slate-600 border-b border-slate-200 text-center`}>
                                 {isPaymentsEditing ? (
                                   <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1" onBlur={(e) => handlePaymentsCellEdit(item as any, 'tipo_de_contrato', e.currentTarget.textContent ?? '')}>{item.tipo_de_contrato ?? ''}</div>
                                 ) : (item.tipo_de_contrato || '-')}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} font-mono text-xs border-b border-slate-200 text-center`}>
                                 {isPaymentsEditing ? (
                                   <input type="date" className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded cursor-pointer text-xs font-mono" defaultValue={item.fecha_de_inicio ?? ''} onBlur={(e) => handlePaymentsCellEdit(item as any, 'fecha_de_inicio', e.target.value)} />
                                 ) : (item.fecha_de_inicio || '-')}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} font-mono text-xs border-b border-slate-200 text-center`}>
                                 {isPaymentsEditing ? (
                                   <input type="date" className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded cursor-pointer text-xs font-mono" defaultValue={item.fecha_de_termino ?? ''} onBlur={(e) => handlePaymentsCellEdit(item as any, 'fecha_de_termino', e.target.value)} />
                                 ) : (item.fecha_de_termino || '-')}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} font-mono border-b border-slate-200 text-center`}>
                                 {isPaymentsEditing ? (
                                   <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const n = parseFloat((e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, '')); handlePaymentsCellEdit(item as any, 'mont_max', isNaN(n) ? null : n); }}>{item.mont_max ?? ''}</div>
                                 ) : formatCurrency(item.mont_max)}
                               </td>

                               {/* CELDAS MENSUALES */}
                               {monthsConfig.map((m) => {
                                 const prefix = m.dbPrefix || m.key; 
                                 const row = item as any; 
                                 const baseKey = m.key === 'sep' ? 'sept' : m.key;
                                 const baseVal = row[baseKey];
                                 
                                 return (
                                  <React.Fragment key={m.key}>
                                    <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-4 py-4'} font-mono font-bold text-slate-700 border-l border-slate-200 bg-emerald-50/30 text-center`}>
                                      {isPaymentsEditing ? (
                                        <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const n = parseFloat((e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, '')); handlePaymentsCellEdit(row, baseKey, isNaN(n) ? null : n); }}>{baseVal ?? ''}</div>
                                      ) : formatCurrency(baseVal)}
                                    </td>
                                    <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-4 py-4'} font-mono text-xs text-slate-500 bg-emerald-50/30 text-center`}>
                                      {isPaymentsEditing ? (
                                        <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const n = parseFloat((e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, '')); handlePaymentsCellEdit(row, `${prefix}_preventivos`, isNaN(n) ? null : n); }}>{row[`${prefix}_preventivos`] ?? ''}</div>
                                      ) : formatCurrency(row[`${prefix}_preventivos`])}
                                    </td>
                                    <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-4 py-4'} font-mono text-xs text-slate-500 bg-emerald-50/30 text-center`}>
                                      {isPaymentsEditing ? (
                                        <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const n = parseFloat((e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, '')); handlePaymentsCellEdit(row, `${prefix}_correctivos`, isNaN(n) ? null : n); }}>{row[`${prefix}_correctivos`] ?? ''}</div>
                                      ) : formatCurrency(row[`${prefix}_correctivos`])}
                                    </td>
                                    <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-4 py-4'} font-mono text-xs text-red-400 bg-emerald-50/30 text-center`}>
                                      {isPaymentsEditing ? (
                                        <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const n = parseFloat((e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, '')); handlePaymentsCellEdit(row, `${prefix}_nota_de_credito`, isNaN(n) ? null : n); }}>{row[`${prefix}_nota_de_credito`] ?? ''}</div>
                                      ) : formatCurrency(row[`${prefix}_nota_de_credito`])}
                                    </td>
                                  </React.Fragment>
                                 );
                               })}

                               {/* TOTALES */}
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} font-mono text-slate-500 border-l border-slate-300 bg-slate-100 text-center`}>
                                 {isPaymentsEditing ? (
                                   <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const n = parseFloat((e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, '')); handlePaymentsCellEdit(item as any, 'monto_maximo_contrato', isNaN(n) ? null : n); }}>{item.monto_maximo_contrato ?? ''}</div>
                                 ) : formatCurrency(item.monto_maximo_contrato)}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} font-mono font-bold text-slate-800 bg-slate-100 text-center`}>
                                 {isPaymentsEditing ? (
                                   <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const n = parseFloat((e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, '')); handlePaymentsCellEdit(item as any, 'monto_ejercido', isNaN(n) ? null : n); }}>{item.monto_ejercido ?? ''}</div>
                                 ) : formatCurrency(item.monto_ejercido)}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} bg-slate-100 text-center`}>
                                 {isPaymentsEditing ? (
                                   <div contentEditable suppressContentEditableWarning className="min-h-[1.5em] outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded px-1 font-mono" onBlur={(e) => { const raw = (e.currentTarget.textContent ?? '').replace(/[^0-9.\-]/g, ''); const n = parseFloat(raw); handlePaymentsCellEdit(item as any, 'facturas_devengadas', isNaN(n) ? null : n / 100); }}>{item.facturas_devengadas != null ? ((item.facturas_devengadas) * 100).toFixed(0) : ''}</div>
                                 ) : (
                                  <div className="flex items-center gap-2 justify-center">
                                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-green-600"
                                        style={{ width: `${Math.min((item.facturas_devengadas || 0) * 100, 100)}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">
                                      {((item.facturas_devengadas || 0) * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                 )}
                               </td>
                               <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} text-xs text-slate-500 whitespace-pre-wrap max-w-xs text-center`}>
                                 {isPaymentsEditing ? (
                                   <textarea rows={2} className="w-full bg-transparent text-xs text-slate-700 border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 resize-y" defaultValue={item.observaciones ?? ''} onBlur={(e) => handlePaymentsCellEdit(item as any, 'observaciones', e.target.value)} />
                                 ) : (item.observaciones || '-')}
                               </td>
                               {canManageRecords && (
                                 <td className={`${isPaymentsCompact ? 'px-2 py-1.5' : 'px-6 py-4'} text-center`} style={{ minWidth: '160px' }}>
                                   <div className="flex justify-center gap-2">
                                     <button
                                       onClick={() => openRecordEditor('control_pagos', 'Control de Pagos', paymentsFieldList, item)}
                                       className="p-1.5 rounded-md text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 transition-colors"
                                       title="Editar"
                                     >
                                       <Pencil className="h-4 w-4" />
                                     </button>
                                     <button
                                       onClick={() => handleDeleteGenericRecord('control_pagos', item as unknown as Record<string, any>, 'Control de Pagos')}
                                       className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                       title="Eliminar"
                                     >
                                       <Trash2 className="h-4 w-4" />
                                     </button>
                                   </div>
                                 </td>
                               )}
                             </tr>
                           );
                           })}
                         </tbody>
                       </table>
                     </div>
                     <div className="p-3 bg-slate-50 text-xs text-slate-400 border-t border-slate-100 text-center sticky bottom-0">
                        Mostrando registros completos de Base de Datos. Deslice horizontalmente para ver el desglose mensual.
                     </div>
                   </div>
                 </div>
               )}

                {activeContractSubTab === 'invoices' && (
                  <div className="animate-fade-in space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10">
                          <FileSpreadsheet className="h-16 w-16 text-[#0F4C3A]" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Facturas Registradas</p>
                        <h3 className="text-3xl font-bold text-slate-900 mt-1">{loadingData ? '...' : invoicesData.length}</h3>
                        <p className="text-xs text-slate-400 mt-2">Información obtenida de la tabla `estatus_facturas`.</p>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10">
                          <PieChartIcon className="h-16 w-16 text-[#B38E5D]" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Monto Pagado</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(invoicesAmountTotals.paid)}</h3>
                        <p className="text-xs text-slate-400 mt-2">Total registrado como cubierto en la base de facturas.</p>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10">
                          <AlertCircle className="h-16 w-16 text-red-400" />
                        </div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Monto Pendiente</p>
                        <h3 className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(invoicesAmountTotals.pending)}</h3>
                        <p className="text-xs text-slate-400 mt-2">Diferencia entre el monto total y el pagado por factura.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[22rem]">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <PieChartIcon className="h-5 w-5 text-slate-400" /> Distribución por Estatus
                          </h3>
                          {invoicesStatusSummary.length > 0 && (
                            <span className="text-xs text-slate-400">{invoicesStatusSummary.length} categorías</span>
                          )}
                        </div>
                        <div className="relative flex-1" style={{ minHeight: 260 }}>
                          {loadingData ? (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Preparando gráfico...</div>
                          ) : invoicesStatusSummary.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 36 }}>
                                <Pie data={invoicesStatusSummary} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={4}>
                                  {invoicesStatusSummary.map((entry, index) => (
                                    <Cell key={`${entry.name}-${index}`} fill={invoicesPalette[index % invoicesPalette.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: number | string, _name: string, payload: any) => {
                                  const numericValue = typeof value === 'number' ? value : Number(value);
                                  return [numericValue.toLocaleString('es-MX'), payload?.payload?.name ?? ''];
                                }} />
                                <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm text-center px-6">
                              Agrega estatus en Supabase para visualizar la distribución.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[22rem]">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <BarChart2 className="h-5 w-5 text-slate-400" /> Principales Proveedores
                          </h3>
                          {invoicesProviderSummary.length > 0 && (
                            <span className="text-xs text-slate-400">Top {Math.min(invoicesProviderSummary.length, 8)}</span>
                          )}
                        </div>
                        <div style={{ height: invoicesProviderChartHeight }}>
                          {loadingData ? (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                          ) : invoicesProviderSummary.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={invoicesProviderSummary} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 8 }} barCategoryGap={18}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
                                <YAxis type="category" dataKey="name" width={260} tick={renderCompanyTick} />
                                <Tooltip formatter={(value: number | string) => (typeof value === 'number' ? value : Number(value)).toLocaleString('es-MX')} />
                                <Bar dataKey="value" fill="#0F4C3A" radius={[0, 6, 6, 0]} barSize={24} />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-6">
                              Registra proveedores para destacar los más frecuentes.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-800">Detalle de Facturas</h3>
                          <p className="text-sm text-slate-500 mt-1">Tabla completa con los campos detectados en `estatus_facturas`.</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {invoicesData.length > 0 && (
                            <span className="text-xs uppercase tracking-wider text-slate-400">Columnas detectadas: {invoicesTableColumns.length}</span>
                          )}
                          <button
                            onClick={() => setIsInvoicesCompact(!isInvoicesCompact)}
                            className={`p-2 rounded-md transition-colors ${isInvoicesCompact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                            title={isInvoicesCompact ? "Vista normal" : "Vista compacta"}
                          >
                            {isInvoicesCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                          </button>
                          {canManageRecords && (
                            <button
                              type="button"
                              onClick={() => setIsInvoicesEditing((prev) => !prev)}
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isInvoicesEditing ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                            >
                              {isInvoicesEditing ? (
                                <>
                                  <Save className="h-4 w-4" />
                                  Salir de edición
                                </>
                              ) : (
                                <>
                                  <Pencil className="h-4 w-4" />
                                  Editar
                                </>
                              )}
                            </button>
                          )}
                          {canManageRecords && (
                            <button
                              type="button"
                              onClick={handleAddInvoicesRow}
                              disabled={!invoicesTableColumns.length}
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${invoicesTableColumns.length ? 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                            >
                              <Plus className="h-4 w-4" />
                              Agregar fila
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-100">
                        <div className="relative w-full md:w-96">
                          <Search className="table-filter-icon" aria-hidden="true" />
                          <input
                            type="text"
                            value={tableFilters.invoices}
                            onChange={(event) => updateTableFilter('invoices', event.target.value)}
                            placeholder="Filtra folio, proveedor o estatus"
                            className="table-filter-input"
                          />
                          {tableFilters.invoices && (
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                              onClick={() => updateTableFilter('invoices', '')}
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 text-[11px] font-semibold">
                          {invoicesColumnFiltersCount > 0 && (
                            <button
                              type="button"
                              className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                              onClick={() => clearColumnFilters('invoices')}
                            >
                              Limpiar filtros por columna
                            </button>
                          )}
                          <span className="text-slate-500">
                            {formatResultLabel(filteredInvoicesData.length)}
                            {tableFilters.invoices.trim() ? ' · filtro general' : ''}
                            {invoicesColumnFiltersCount ? ` · ${formatColumnFilterLabel(invoicesColumnFiltersCount)}` : ''}
                          </span>
                        </div>
                        {renderActiveColumnFilterBadges('invoices')}
                      </div>
                      {isInvoicesEditing && (
                        <div className="px-6 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          Modo edición activo: ajusta cualquier celda como en Excel y usa "Salir de edición" para bloquear cambios.
                        </div>
                      )}
                      <div className={`overflow-auto relative ${invoicesTableSizing.containerHeightClass}`}>
                        <table className={`${invoicesTableSizing.tableTextClass} text-center w-max min-w-full border-collapse`}>
                          <thead className="uppercase tracking-wider text-white">
                            <tr className={invoicesTableSizing.headerRowClass}>
                              {(invoicesColumnsToRender.length ? invoicesColumnsToRender : invoicesTableColumns.length ? invoicesTableColumns : ['sin_datos']).map((column) => {
                                if (column === '__actions') {
                                  return (
                                    <th
                                      key="invoice-actions"
                                      className={`${invoicesTableSizing.headerCellPadding} font-bold whitespace-nowrap border-b border-white/20 text-center ${invoicesTableSizing.headerTextClass}`}
                                      style={{ position: 'sticky', top: 0, zIndex: 45, backgroundColor: '#14532d', color: '#fff', minWidth: invoicesTableSizing.actionsMinWidth }}
                                    >
                                      Acciones
                                    </th>
                                  );
                                }

                                if (!invoicesTableColumns.length && column === 'sin_datos') {
                                  return (
                                    <th
                                      key="invoice-empty"
                                      className={`${invoicesTableSizing.headerCellPadding} font-bold whitespace-nowrap border-b border-white/20 text-center ${invoicesTableSizing.headerTextClass}`}
                                      style={{ position: 'sticky', top: 0, backgroundColor: '#14532d', color: '#fff' }}
                                    >
                                      Sin datos
                                    </th>
                                  );
                                }

                                const stickyMeta = invoicesStickyInfo.meta.get(column);
                                const isSticky = Boolean(stickyMeta);
                                const isLastSticky = isSticky && invoicesLastStickyKey === column;
                                const headerStyle: React.CSSProperties = {
                                  position: 'sticky',
                                  top: 0,
                                  zIndex: isSticky ? 60 : 50,
                                  backgroundColor: isSticky ? '#0F3F2E' : '#14532d',
                                  color: '#fff',
                                  minWidth: stickyMeta ? `${stickyMeta.width}px` : '220px',
                                };

                                if (stickyMeta) {
                                  headerStyle.left = stickyMeta.left;
                                  headerStyle.width = `${stickyMeta.width}px`;
                                }

                                if (isLastSticky) {
                                  headerStyle.boxShadow = '6px 0 10px -4px rgba(0,0,0,0.3)';
                                }

                                const columnLabel = humanizeKey(column);

                                return (
                                  <th
                                    key={column}
                                    className={`${invoicesTableSizing.headerCellPadding} font-bold whitespace-nowrap border-b border-white/20 text-center ${invoicesTableSizing.headerTextClass}`}
                                    style={headerStyle}
                                  >
                                    <div className="flex items-center justify-center gap-1">
                                      <span className="truncate">{columnLabel}</span>
                                      {renderColumnFilterControl('invoices', column, columnLabel, invoicesData)}
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {loadingData ? (
                              <tr>
                                <td colSpan={invoicesColumnCount} className="text-center py-10 text-slate-500">Cargando registros...</td>
                              </tr>
                            ) : !invoicesData.length ? (
                              <tr>
                                <td colSpan={invoicesColumnCount} className="text-center py-10 text-slate-500">Conecta datos en `estatus_facturas` para mostrarlos aquí.</td>
                              </tr>
                            ) : filteredInvoicesData.length === 0 ? (
                              <tr>
                                <td colSpan={invoicesColumnCount} className="text-center py-10 text-slate-500">Sin coincidencias para el filtro aplicado.</td>
                              </tr>
                            ) : (
                              filteredInvoicesData.map((row, rowIndex) => {
                                const rowKey = row.id ?? row.ID ?? row.Id ?? row.numero ?? `invoice-row-${rowIndex}`;
                                const zebraBackground = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                                const rowStyle = buildRowStyle(zebraBackground);
                                return (
                                  <tr
                                    key={rowKey}
                                    className="group table-row transition-colors"
                                    style={rowStyle}
                                  >
                                    {(invoicesColumnsToRender.length ? invoicesColumnsToRender : invoicesTableColumns).map((column) => {
                                      if (column === '__actions') {
                                        return (
                                          <td
                                            key={`invoice-actions-${rowKey}`}
                                            className={`${invoicesTableSizing.actionsCellPadding} text-center`}
                                            style={{ minWidth: invoicesTableSizing.actionsMinWidth }}
                                          >
                                            {canManageRecords ? (
                                              <div className="flex justify-center gap-2">
                                                <button
                                                  onClick={() => openRecordEditor('estatus_facturas', 'Registro estatus_facturas', invoicesTableColumns, row)}
                                                  className="p-1.5 rounded-md text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 transition-colors"
                                                  title="Editar"
                                                >
                                                  <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteGenericRecord('estatus_facturas', row as Record<string, any>, 'Registro estatus_facturas')}
                                                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                  title="Eliminar"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>
                                              </div>
                                            ) : (
                                              <span className="text-xs uppercase text-slate-400 font-semibold tracking-wide">Solo lectura</span>
                                            )}
                                          </td>
                                        );
                                      }

                                      const stickyMeta = invoicesStickyInfo.meta.get(column);
                                      const isSticky = Boolean(stickyMeta);
                                      const isLastSticky = isSticky && invoicesLastStickyKey === column;
                                      const normalizedColumn = normalizeAnnualKey(column);
                                      const rawValue = row[column];
                                      const isNumericCell = typeof rawValue === 'number';
                                      const isCurrencyColumn = normalizedColumn.includes('monto') || normalizedColumn.includes('importe') || normalizedColumn.includes('total');
                                      const alignmentClass = 'text-center';
                                      const fontClass = isNumericCell || isCurrencyColumn ? 'font-mono' : '';
                                      const cellStyle: React.CSSProperties = {
                                        minWidth: stickyMeta ? `${stickyMeta.width}px` : '220px',
                                      };

                                      if (stickyMeta) {
                                        cellStyle.position = 'sticky';
                                        cellStyle.left = stickyMeta.left;
                                        cellStyle.width = `${stickyMeta.width}px`;
                                        cellStyle.zIndex = 40;
                                        cellStyle.backgroundColor = 'var(--row-bg, #ffffff)';
                                      }

                                      if (isLastSticky) {
                                        cellStyle.boxShadow = '6px 0 8px -4px rgba(15,60,40,0.25)';
                                      }

                                      const isCellEditable = isInvoicesEditing && column !== '__actions';
                                      const cellClasses = isCellEditable ? `${invoicesTableSizing.textCellClass} border-b border-slate-100 ${alignmentClass} ${fontClass} cursor-text` : `${invoicesTableSizing.textCellClass} border-b border-slate-100 ${alignmentClass} ${fontClass}`;

                                      let editingValue = '';
                                      if (rawValue !== null && rawValue !== undefined) {
                                          if (typeof rawValue === 'number') {
                                              if (isCurrencyColumn) {
                                                  editingValue = rawValue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                              } else {
                                                  editingValue = String(rawValue);
                                              }
                                          } else if (rawValue instanceof Date) {
                                              editingValue = formatDateToDDMMYYYY(rawValue);
                                          } else if (typeof rawValue === 'string') {
                                              const parsedForEdit = parsePotentialDate(rawValue);
                                              if (parsedForEdit) {
                                                  editingValue = formatDateToDDMMYYYY(parsedForEdit);
                                              } else {
                                                  if (isCurrencyColumn) {
                                                      const sanitized = rawValue.replace(/,/g, '');
                                                      const num = parseFloat(sanitized);
                                                      if (!isNaN(num)) {
                                                          editingValue = num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                      } else {
                                                          editingValue = rawValue;
                                                      }
                                                  } else {
                                                      editingValue = rawValue;
                                                  }
                                              }
                                          } else if (typeof rawValue === 'object') {
                                              try {
                                                  editingValue = JSON.stringify(rawValue);
                                              } catch (err) {
                                                  console.error('Error serializing value for inline edit:', err);
                                                  editingValue = String(rawValue);
                                              }
                                          } else {
                                              editingValue = String(rawValue);
                                          }
                                      }
                                      
                                        const isDateCol = normalizedColumn.includes('fecha') || normalizedColumn.includes('periodo') || normalizedColumn.includes('vencimiento');
                                        const isBooleanCol = shouldTreatAsBooleanColumn(column, rawValue, ['pagado', 'complemento']);

                                        const isChecked = isBooleanCol ? getBooleanChecked(rawValue) : false;

                                      return (
                                        <td
                                          key={column}
                                          className={`${cellClasses} ${isSticky ? 'sticky-cell' : ''}`}
                                          style={cellStyle}
                                        >
                                          {isCellEditable ? (
                                            isBooleanCol ? (
                                                <div className="flex items-center justify-center h-full min-h-[1.5em]" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox"
                                                      aria-label={`Alternar ${humanizeKey(column)}`}
                                                      title={`Alternar ${humanizeKey(column)}`}
                                                        className="w-5 h-5 text-[#0F4C3A] bg-gray-100 border-gray-300 rounded focus:ring-[#0F4C3A] cursor-pointer accent-[#2d3e50]"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            const newVal = e.target.checked;
                                                            const valToSave = getBooleanSaveValue(rawValue, column, newVal);
                                                            handleInvoicesCellEdit(row, column, valToSave);
                                                        }}
                                                    />
                                                </div>
                                            ) : isDateCol ? (
                                                <input
                                                  type="date"
                                                  aria-label={`Fecha ${humanizeKey(column)}`}
                                                  title={`Fecha ${humanizeKey(column)}`}
                                                  className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                  value={(() => {
                                                       if (rawValue instanceof Date) return rawValue.toISOString().split('T')[0];
                                                       if (typeof rawValue === 'string') {
                                                           const p = parsePotentialDate(rawValue);
                                                           return p ? p.toISOString().split('T')[0] : '';
                                                       }
                                                       return '';
                                                  })()}
                                                  onChange={(e) => handleInvoicesCellEdit(row, column, e.target.value)}
                                                  onClick={(e) => e.stopPropagation()}
                                              />
                                            ) : (
                                            <div
                                              contentEditable
                                              suppressContentEditableWarning
                                              className={`inline-block w-full ${invoicesTableSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                              onBlur={(event) => handleInvoicesCellEdit(row, column, event.currentTarget.textContent ?? '')}
                                              onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                  event.preventDefault();
                                                  (event.currentTarget as HTMLDivElement).blur();
                                                }
                                              }}
                                            >
                                              {editingValue}
                                            </div>
                                            )
                                          ) : (
                                            isBooleanCol ? (
                                                <div className="flex items-center justify-center h-full min-h-[1.5em]">
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#2d3e50] border-[#2d3e50]' : 'bg-transparent border-slate-300'}`}>
                                                        {isChecked && (
                                                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                            ) :
                                            formatTableValue(column, rawValue)
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-3 bg-slate-50 text-[11px] text-slate-400 border-t border-slate-100 text-center">
                        Desplázate horizontalmente para explorar el detalle completo de cada factura.
                      </div>
                    </div>
                  </div>
                )}

                  {activeContractSubTab === 'compranet' && (
                    <div className="animate-fade-in space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                          <div className="absolute right-0 top-0 p-4 opacity-10">
                            <Briefcase className="h-16 w-16 text-[#0F4C3A]" />
                          </div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Procedimientos cargados</p>
                          <h3 className="text-3xl font-bold text-slate-900 mt-1">
                            {loadingData ? '...' : compranetData.length}
                          </h3>
                          <p className="text-xs text-slate-400 mt-2">Fuente: tabla `procedimientos_compranet`.</p>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                          <div className="absolute right-0 top-0 p-4 opacity-10">
                            <BarChart2 className="h-16 w-16 text-[#B38E5D]" />
                          </div>
                          {compranetAmountKey ? (
                            <>
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total {compranetAmountTitle}</p>
                              <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(compranetTotalAmount)}</h3>
                              <p className="text-xs text-slate-400 mt-2">Suma del campo `{compranetAmountTitle}` detectado.</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Dependencias activas</p>
                              <h3 className="text-2xl font-bold text-slate-900 mt-1">{compranetUniqueDependencies}</h3>
                              <p className="text-xs text-slate-400 mt-2">Agrupadas por `{compranetCategoryTitle}`.</p>
                            </>
                          )}
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
                          <div className="absolute right-0 top-0 p-4 opacity-10">
                            <PieChartIcon className="h-16 w-16 text-slate-400" />
                          </div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Principal {compranetStatusTitle}</p>
                          <h3 className="text-xl font-bold text-slate-900 mt-1 truncate">
                            {loadingData ? '...' : (compranetTopStatus ? compranetTopStatus.name : 'Sin dato')}
                          </h3>
                          <p className="text-xs text-slate-400 mt-2">
                            {loadingData || !compranetTopStatus
                              ? 'A la espera de registros en Supabase.'
                              : `${compranetTopStatus.value} registros (${compranetTopStatusShare}% del total)`}
                          </p>
                          {compranetUniqueTypes > 0 && (
                            <p className="text-[11px] text-slate-400 mt-1">Modalidades activas: {compranetUniqueTypes}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[22rem]">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              <PieChartIcon className="h-5 w-5 text-slate-400" /> Distribución por {compranetStatusTitle}
                            </h3>
                            {compranetStatusDistribution.length > 0 && (
                              <span className="text-xs text-slate-400">{compranetStatusDistribution.length} categorías</span>
                            )}
                          </div>
                          <div className="relative flex-1" style={{ minHeight: 260 }}>
                            {loadingData ? (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Preparando gráfico...</div>
                            ) : compranetStatusDistribution.length ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 36 }}>
                                  <Pie data={compranetStatusDistribution} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={4}>
                                    {compranetStatusDistribution.map((entry, index) => (
                                      <Cell key={`${entry.name}-${index}`} fill={chartPalette[index % chartPalette.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(value: number | string, _name: string, payload: any) => {
                                    const numericValue = typeof value === 'number' ? value : Number(value);
                                    return [numericValue.toLocaleString('es-MX'), payload?.payload?.name ?? ''];
                                  }} />
                                  <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                </PieChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm text-center px-6">
                                Registra estatus en Supabase para analizar la distribución.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[22rem]">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              <BarChart2 className="h-5 w-5 text-slate-400" /> Top {compranetCategoryTitle}
                            </h3>
                            {compranetCategorySeries.length > 0 && (
                              <span className="text-xs text-slate-400">Top {Math.min(compranetCategorySeries.length, 8)}</span>
                            )}
                          </div>
                          <div className="relative flex-1" style={{ minHeight: 260 }}>
                            {loadingData ? (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Cargando información...</div>
                            ) : compranetCategorySeries.length ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={compranetCategorySeries} layout="vertical" margin={{ top: 8, right: 32, left: 0, bottom: 8 }} barCategoryGap={18}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                  <XAxis type="number" hide domain={[0, 'dataMax']} />
                                  <YAxis type="category" dataKey="name" width={260} tick={{ fontSize: 11 }} />
                                  <Tooltip formatter={(value: number | string) => (
                                    compranetCategoryUsesAmount
                                      ? formatCurrency(typeof value === 'number' ? value : Number(value))
                                      : (typeof value === 'number' ? value : Number(value)).toLocaleString('es-MX')
                                  )} labelFormatter={(label) => label} />
                                  <Bar dataKey="value" fill="#0F4C3A" radius={[0, 6, 6, 0]} barSize={24} name={compranetCategoryMetricLabel} />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm text-center px-6">
                                Integra datos de `{compranetCategoryTitle}` para visualizar los principales actores.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                              <TrendingUp className="h-5 w-5 text-slate-400" /> Ritmo temporal por {compranetDateTitle}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">
                              {compranetTimelineHasAmount
                                ? `Se comparan registros y ${compranetAmountTitle.toLowerCase()} agregados por periodo.`
                                : 'Evolución del número de procedimientos publicados.'}
                            </p>
                          </div>
                          {compranetTimeline.length > 0 && (
                            <span className="text-xs uppercase tracking-wider text-slate-400">Periodos detectados: {compranetTimeline.length}</span>
                          )}
                        </div>
                        <div className="h-72">
                          {loadingData ? (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">Calculando series...</div>
                          ) : compranetTimeline.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={compranetTimeline} margin={{ top: 16, right: 32, left: 0, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis yAxisId="left" allowDecimals={false} width={48} />
                                {compranetTimelineHasAmount && (
                                  <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tickFormatter={(value) => formatCurrency(typeof value === 'number' ? value : Number(value))}
                                    width={80}
                                  />
                                )}
                                <Tooltip formatter={(value: number | string, name: string) => (
                                  name === 'Registros'
                                    ? [(typeof value === 'number' ? value : Number(value)).toLocaleString('es-MX'), 'Registros']
                                    : [formatCurrency(typeof value === 'number' ? value : Number(value)), compranetAmountTitle]
                                )} />
                                <Bar yAxisId="left" dataKey="count" name="Registros" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                {compranetTimelineHasAmount && (
                                  <Line yAxisId="right" type="monotone" dataKey="amount" name={compranetAmountTitle} stroke="#B38E5D" strokeWidth={2} dot={false} />
                                )}
                              </ComposedChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-6">
                              Agrega un campo de fecha para construir la línea temporal.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800">Procedimientos Compranet</h3>
                            <p className="text-xs text-slate-500">Consulta y actualiza la tabla `procedimientos_compranet` sin salir del panel.</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setIsCompranetCompact(!isCompranetCompact)}
                              className={`p-2 rounded-md transition-colors ${isCompranetCompact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                              title={isCompranetCompact ? "Vista normal" : "Vista compacta"}
                            >
                              {isCompranetCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                            </button>
                            {canManageRecords && (
                              <button
                                type="button"
                                onClick={() => setIsCompranetEditing((prev) => !prev)}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isCompranetEditing ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                              >
                                {isCompranetEditing ? (
                                  <>
                                    <Save className="h-4 w-4" />
                                    Salir de edición
                                  </>
                                ) : (
                                  <>
                                    <Pencil className="h-4 w-4" />
                                    Editar
                                  </>
                                )}
                              </button>
                            )}
                            {canManageRecords && (
                              <button
                                type="button"
                                onClick={handleAddCompranetRow}
                                disabled={!compranetTableColumns.length}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${compranetTableColumns.length ? 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                              >
                                <Plus className="h-4 w-4" />
                                Agregar fila
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-100">
                          <div className="relative w-full md:w-96">
                            <Search className="table-filter-icon" aria-hidden="true" />
                            <input
                              type="text"
                              value={tableFilters.compranet}
                              onChange={(event) => updateTableFilter('compranet', event.target.value)}
                              placeholder="Filtra procedimiento, dependencia o estatus"
                              className="table-filter-input"
                            />
                            {tableFilters.compranet && (
                              <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                                onClick={() => updateTableFilter('compranet', '')}
                              >
                                Limpiar
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 text-[11px] font-semibold">
                            {compranetColumnFiltersCount > 0 && (
                              <button
                                type="button"
                                className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                                onClick={() => clearColumnFilters('compranet')}
                              >
                                Limpiar filtros por columna
                              </button>
                            )}
                            <span className="text-slate-500">
                              {formatResultLabel(filteredCompranetData.length)}
                              {tableFilters.compranet.trim() ? ' · filtro general' : ''}
                              {compranetColumnFiltersCount ? ` · ${formatColumnFilterLabel(compranetColumnFiltersCount)}` : ''}
                            </span>
                          </div>
                          {renderActiveColumnFilterBadges('compranet')}
                        </div>
                        {isCompranetEditing && (
                          <div className="px-6 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Modo edición activo: ajusta cualquier celda como en Excel y usa "Salir de edición" para bloquear cambios.
                          </div>
                        )}
                        <div className={`overflow-auto relative ${compranetTableSizing.containerHeightClass}`}>
                          <table className={`min-w-full ${compranetTableSizing.tableTextClass} text-center border-collapse`}>
                            <thead className="uppercase tracking-wider text-white">
                              <tr className={compranetTableSizing.headerRowClass}>
                                {(compranetColumnsToRender.length ? compranetColumnsToRender : compranetTableColumns.length ? compranetTableColumns : ['sin_datos']).map((column, index) => {
                                  if (column === '__actions') {
                                    return (
                                      <th
                                        key="compranet-actions"
                                        className={`${compranetTableSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center ${compranetTableSizing.headerTextClass}`}
                                        style={{ position: 'sticky', top: 0, zIndex: 45, backgroundColor: '#0F4C3A', color: '#fff', minWidth: compranetTableSizing.actionsMinWidth }}
                                      >
                                        Acciones
                                      </th>
                                    );
                                  }

                                  if (!compranetTableColumns.length && column === 'sin_datos') {
                                    return (
                                      <th
                                        key="compranet-empty"
                                        className={`${compranetTableSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center ${compranetTableSizing.headerTextClass}`}
                                        style={{ position: 'sticky', top: 0, backgroundColor: '#0F4C3A', color: '#fff' }}
                                      >
                                        Sin datos
                                      </th>
                                    );
                                  }

                                  const isSticky = index < compranetStickyWidths.length;
                                  const leftOffset = isSticky
                                    ? compranetStickyWidths.slice(0, index).reduce((acc, width) => acc + width, 0)
                                    : 0;
                                  const minWidth = isSticky ? compranetStickyWidths[index] : 180;
                                  const headerStyle: React.CSSProperties = {
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: isSticky ? 60 : 50,
                                    backgroundColor: '#0F4C3A',
                                    color: '#fff',
                                    minWidth: `${minWidth}px`,
                                  };

                                  if (isSticky) {
                                    headerStyle.left = leftOffset;
                                    headerStyle.boxShadow = index === compranetStickyWidths.length - 1
                                      ? '6px 0 10px -4px rgba(15,76,58,0.2)'
                                      : undefined;
                                  }

                                  const columnLabel = humanizeKey(column);

                                  return (
                                    <th
                                      key={column}
                                      className={`${compranetTableSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center ${compranetTableSizing.headerTextClass}`}
                                      style={headerStyle}
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        <span className="truncate">{columnLabel}</span>
                                        {renderColumnFilterControl('compranet', column, columnLabel, compranetData)}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {loadingData ? (
                                <tr>
                                  <td colSpan={compranetColumnCount} className="text-center py-10 text-slate-500">
                                    Cargando procedimientos...
                                  </td>
                                </tr>
                              ) : !compranetData.length ? (
                                <tr>
                                  <td colSpan={compranetColumnCount} className="text-center py-10 text-slate-500">
                                    No hay registros de procedimientos en Compranet.
                                  </td>
                                </tr>
                              ) : filteredCompranetData.length === 0 ? (
                                <tr>
                                  <td colSpan={compranetColumnCount} className="text-center py-10 text-slate-500">
                                    Sin coincidencias para el filtro aplicado.
                                  </td>
                                </tr>
                              ) : (
                                filteredCompranetData.map((row, rowIndex) => {
                                  const rowKey = row.id ?? `compranet-row-${rowIndex}`;
                                  const isStriped = rowIndex % 2 === 0;
                                  const zebraBackground = isStriped ? '#ffffff' : '#f8fafc';
                                  const rowStyle = buildRowStyle(zebraBackground);
                                  return (
                                    <tr
                                      key={rowKey}
                                      className="transition-colors table-row"
                                      style={rowStyle}
                                    >
                                      {(compranetColumnsToRender.length ? compranetColumnsToRender : compranetTableColumns).map((column, colIndex) => {
                                        if (column === '__actions') {
                                          return (
                                            <td
                                              key={`compranet-actions-${rowKey}`}
                                              className={`${compranetTableSizing.actionsCellPadding} text-center`}
                                              style={{ minWidth: compranetTableSizing.actionsMinWidth }}
                                            >
                                              {canManageRecords ? (
                                                <div className="flex justify-center gap-2">
                                                  <button
                                                    onClick={() => openRecordEditor('procedimientos_compranet', 'Procedimiento Compranet', compranetTableColumns, row)}
                                                    className="p-1.5 rounded-md text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 transition-colors"
                                                    title="Editar"
                                                  >
                                                    <Pencil className="h-4 w-4" />
                                                  </button>
                                                  <button
                                                    onClick={() => handleDeleteGenericRecord('procedimientos_compranet', row as Record<string, any>, 'Procedimiento Compranet')}
                                                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    title="Eliminar"
                                                  >
                                                    <Trash2 className="h-4 w-4" />
                                                  </button>
                                                </div>
                                              ) : (
                                                <span className="text-xs uppercase text-slate-400 font-semibold tracking-wide">Solo lectura</span>
                                              )}
                                            </td>
                                          );
                                        }

                                        const value = row[column];
                                        const isSticky = colIndex < compranetStickyWidths.length;
                                        const leftOffset = isSticky
                                          ? compranetStickyWidths.slice(0, colIndex).reduce((acc, width) => acc + width, 0)
                                          : 0;
                                        const minWidth = isSticky ? compranetStickyWidths[colIndex] : 180;
                                        const numeric = typeof value === 'number' || shouldFormatAsCurrency(column);
                                        const baseClasses = numeric
                                          ? compranetTableSizing.numericCellClass
                                          : compranetTableSizing.textCellClass;
                                        
                                        const isCellEditable = isCompranetEditing && column !== '__actions';
                                        const cellClasses = isCellEditable ? `${baseClasses} cursor-text` : baseClasses;

                                        const stickyStyle: React.CSSProperties = {
                                          minWidth: `${minWidth}px`,
                                        };

                                        if (isSticky) {
                                          stickyStyle.position = 'sticky';
                                          stickyStyle.left = leftOffset;
                                          stickyStyle.backgroundColor = 'var(--row-bg, #ffffff)';
                                          stickyStyle.zIndex = 30;
                                          if (colIndex === compranetStickyWidths.length - 1) {
                                            stickyStyle.boxShadow = '6px 0 10px -4px rgba(15,76,58,0.18)';
                                          }
                                        }

                                        let editingValue = '';
                                        if (value !== null && value !== undefined) {
                                            if (typeof value === 'number') {
                                                if (shouldFormatAsCurrency(column)) {
                                                    editingValue = value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                } else {
                                                    editingValue = String(value);
                                                }
                                            } else if (value instanceof Date) {
                                                editingValue = formatDateToDDMMYYYY(value);
                                            } else if (typeof value === 'string') {
                                                const parsedForEdit = parsePotentialDate(value);
                                                if (parsedForEdit) {
                                                    editingValue = formatDateToDDMMYYYY(parsedForEdit);
                                                } else {
                                                    if (shouldFormatAsCurrency(column)) {
                                                        const sanitized = value.replace(/,/g, '');
                                                        const num = parseFloat(sanitized);
                                                        if (!isNaN(num)) {
                                                            editingValue = num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                        } else {
                                                            editingValue = value;
                                                        }
                                                    } else {
                                                        editingValue = value;
                                                    }
                                                }
                                            } else if (typeof value === 'object') {
                                                try {
                                                    editingValue = JSON.stringify(value);
                                                } catch (err) {
                                                    console.error('Error serializing value for inline edit:', err);
                                                    editingValue = String(value);
                                                }
                                            } else {
                                                editingValue = String(value);
                                            }
                                        }

                                        const normalizedColumn = normalizeAnnualKey(column);
                                        const isDateCol = normalizedColumn.includes('fecha') || normalizedColumn.includes('termino') || normalizedColumn.includes('inicio') || normalizedColumn.includes('fallo') || normalizedColumn.includes('apertura') || normalizedColumn.includes('visita') || normalizedColumn.includes('publicacion');
                                        const isBooleanCol = shouldTreatAsBooleanColumn(column, value);

                                        const isChecked = isBooleanCol ? getBooleanChecked(value) : false;

                                        return (
                                          <td key={column} className={`${cellClasses} ${isSticky ? 'sticky-cell' : ''}`.trim()} style={stickyStyle}>
                                            {isCellEditable ? (
                                              isBooleanCol ? (
                                                <div className="flex items-center justify-center h-full min-h-[1.5em]" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox"
                                                      aria-label={`Alternar ${humanizeKey(column)}`}
                                                      title={`Alternar ${humanizeKey(column)}`}
                                                        className="w-5 h-5 text-[#0F4C3A] bg-gray-100 border-gray-300 rounded focus:ring-[#0F4C3A] cursor-pointer accent-[#2d3e50]"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            const newVal = e.target.checked;
                                                            const valToSave = getBooleanSaveValue(value, column, newVal);
                                                            handleCompranetCellEdit(row, column, valToSave);
                                                        }}
                                                    />
                                                </div>
                                              ) : isDateCol ? (
                                                <input
                                                    type="date"
                                                  aria-label={`Fecha ${humanizeKey(column)}`}
                                                  title={`Fecha ${humanizeKey(column)}`}
                                                    className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                    value={(() => {
                                                         if (value instanceof Date) return value.toISOString().split('T')[0];
                                                         if (typeof value === 'string') {
                                                             const p = parsePotentialDate(value);
                                                             return p ? p.toISOString().split('T')[0] : '';
                                                         }
                                                         return '';
                                                    })()}
                                                    onChange={(e) => handleCompranetCellEdit(row, column, e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                              ) : (
                                              <div
                                                contentEditable
                                                suppressContentEditableWarning
                                                className={`inline-block w-full ${compranetTableSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                                onBlur={(event) => handleCompranetCellEdit(row, column, event.currentTarget.textContent ?? '')}
                                                onKeyDown={(event) => {
                                                  if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    (event.currentTarget as HTMLDivElement).blur();
                                                  }
                                                }}
                                              >
                                                {editingValue}
                                              </div>
                                              )
                                            ) : (
                                              isBooleanCol ? (
                                                  <div className="flex items-center justify-center h-full min-h-[1.5em]">
                                                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#2d3e50] border-[#2d3e50]' : 'bg-transparent border-slate-300'}`}>
                                                          {isChecked && (
                                                              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                              </svg>
                                                          )}
                                                      </div>
                                                  </div>
                                              ) :
                                              formatTableValue(column, value)
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="p-3 bg-slate-50 text-xs text-slate-400 border-t border-slate-100 text-center">
                          Deslice horizontalmente para consultar todos los campos cargados en Compranet.
                        </div>
                      </div>
                    </div>
                  )}

              {activeContractSubTab === 'pendingOct' && (
                <div className="animate-fade-in space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Observaciones registradas</p>
                      <div className="flex items-end justify-between mt-3">
                        <h3 className="text-3xl font-bold text-slate-900">{procedureStatuses.length}</h3>
                        <span className="text-[11px] text-slate-400 text-right">
                          Última actualización<br />{latestProcedureRecord ? formatDateTime(latestProcedureRecord.created_at) : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Empresas involucradas</p>
                      <div className="flex items-end justify-between mt-3">
                        <h3 className="text-3xl font-bold text-slate-900">{uniquePendingCompanies}</h3>
                        <span className="text-[11px] text-slate-400 text-right">
                          Principal<br />{topPendingCompany ? normalizeWhitespace(topPendingCompany.name) : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Categorías de observación</p>
                      <div className="flex items-end justify-between mt-3">
                        <h3 className="text-3xl font-bold text-slate-900">{uniqueObservationCategories}</h3>
                        <span className="text-[11px] text-slate-400 text-right">
                          Predominante<br />
                          {dominantObservationCategory ? `${dominantObservationCategory.name} · ${dominantObservationShare}%` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Briefcase className="h-5 w-5 text-slate-400" /> Concentración por empresa
                        </h3>
                        <span className="text-xs text-slate-400">Top 8</span>
                      </div>
                      <div className="w-full" style={{ height: companyChartHeight }}>
                        {topProcedureCompanies.length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={topProcedureCompanies}
                              layout="vertical"
                              margin={{ top: 10, right: 30, left: 32, bottom: 10 }}
                              barCategoryGap={28}
                              barGap={12}
                            >
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" allowDecimals={false} />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={320}
                                tick={renderCompanyTick}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip formatter={(value: number) => `${value} servicio${value === 1 ? '' : 's'}`} />
                              <Bar dataKey="value" fill="#B38E5D" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                            No hay suficientes datos para la gráfica.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <PieChartIcon className="h-5 w-5 text-slate-400" /> Distribución por tipo de observación
                      </h3>
                      <div className="h-72">
                        {procedureByCategory.length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={procedureByCategory}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={55}
                                outerRadius={90}
                                paddingAngle={3}
                              >
                                {procedureByCategory.map((entry, index) => (
                                  <Cell key={`proc-cat-${entry.name}`} fill={procedureCategoryColors[index % procedureCategoryColors.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number, _name, payload) => [
                                `${value} servicio${value === 1 ? '' : 's'}`,
                                payload?.payload?.name || '',
                              ]} />
                              <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                            No hay categorías registradas.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>


                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <AlertCircle className="h-4 w-4 text-[#B38E5D]" />
                        Observaciones a servicios pendientes de pago (Octubre)
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>
                          Total registros: <span className="font-semibold text-slate-700">{procedureStatuses.length}</span>
                        </span>
                        <button
                          onClick={() => setIsPendingOctCompact(!isPendingOctCompact)}
                          className={`p-2 rounded-md transition-colors ${isPendingOctCompact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                          title={isPendingOctCompact ? "Vista normal" : "Vista compacta"}
                        >
                          {isPendingOctCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                        </button>
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={() => setIsPendingOctEditing((prev) => !prev)}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isPendingOctEditing ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                          >
                            {isPendingOctEditing ? (
                              <>
                                <Save className="h-4 w-4" />
                                Salir de edición
                              </>
                            ) : (
                              <>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </>
                            )}
                          </button>
                        )}
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={handleAddPendingOctRow}
                            disabled={!pendingOctTableColumns.length}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${pendingOctTableColumns.length ? 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                          >
                            <Plus className="h-4 w-4" />
                            Agregar fila
                          </button>
                        )}
                        {canManageRecords && (
                          <button
                            onClick={() => openRecordEditor('estatus_procedimiento', 'Observación de Pago', procedureFieldList, null, null, 'Detalla contrato, empresa y observación con redacción clara y fechas completas.')}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#B38E5D] text-white font-semibold shadow hover:bg-[#9c7a4d] transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            Nuevo registro
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-100">
                      <div className="relative w-full md:w-96">
                        <Search className="table-filter-icon" aria-hidden="true" />
                        <input
                          type="text"
                          value={tableFilters.pendingOct}
                          onChange={(event) => updateTableFilter('pendingOct', event.target.value)}
                          placeholder="Filtra contrato, empresa u observación"
                          className="table-filter-input"
                        />
                        {tableFilters.pendingOct && (
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                            onClick={() => updateTableFilter('pendingOct', '')}
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-2 text-[11px] font-semibold">
                        {pendingOctColumnFiltersCount > 0 && (
                          <button
                            type="button"
                            className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                            onClick={() => clearColumnFilters('pendingOct')}
                          >
                            Limpiar filtros por columna
                          </button>
                        )}
                        <span className="text-slate-500">
                          {formatResultLabel(filteredPendingOctData.length)}
                          {tableFilters.pendingOct.trim() ? ' · filtro general' : ''}
                          {pendingOctColumnFiltersCount ? ` · ${formatColumnFilterLabel(pendingOctColumnFiltersCount)}` : ''}
                        </span>
                      </div>
                      {renderActiveColumnFilterBadges('pendingOct', resolvePendingOctColumnLabel)}
                    </div>
                    {isPendingOctEditing && (
                      <div className="px-6 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Modo edición activo: ajusta cualquier celda como en Excel y usa "Salir de edición" para bloquear cambios.
                      </div>
                    )}
                    <div className={`overflow-x-auto ${pendingOctTableSizing.containerHeightClass}`}>
                      <table className={`w-full ${pendingOctTableSizing.tableTextClass} text-center`}>
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                          <tr className={pendingOctTableSizing.headerRowClass}>
                            <th className={`${pendingOctTableSizing.headerCellPadding} font-semibold whitespace-nowrap text-center ${pendingOctTableSizing.headerTextClass}`}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Registro</span>
                                {renderColumnFilterControl('pendingOct', 'created_at', 'Registro', procedureStatuses)}
                              </div>
                            </th>
                            <th className={`${pendingOctTableSizing.headerCellPadding} font-semibold whitespace-nowrap text-center ${pendingOctTableSizing.headerTextClass}`}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Contrato</span>
                                {renderColumnFilterControl('pendingOct', 'contrato', 'Contrato', procedureStatuses)}
                              </div>
                            </th>
                            <th className={`${pendingOctTableSizing.headerCellPadding} font-semibold text-center ${pendingOctTableSizing.headerTextClass}`}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Descripción del Servicio</span>
                                {renderColumnFilterControl('pendingOct', 'descripcion', 'Descripción del Servicio', procedureStatuses)}
                              </div>
                            </th>
                            <th className={`${pendingOctTableSizing.headerCellPadding} font-semibold text-center ${pendingOctTableSizing.headerTextClass}`}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Empresa</span>
                                {renderColumnFilterControl('pendingOct', 'empresa', 'Empresa', procedureStatuses)}
                              </div>
                            </th>
                            <th className={`${pendingOctTableSizing.headerCellPadding} font-semibold whitespace-nowrap text-center ${pendingOctTableSizing.headerTextClass}`}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Mes factura / nota</span>
                                {renderColumnFilterControl('pendingOct', 'mes_factura_nota', 'Mes factura / nota', procedureStatuses)}
                              </div>
                            </th>
                            <th className={`${pendingOctTableSizing.headerCellPadding} font-semibold text-center ${pendingOctTableSizing.headerTextClass}`}>
                              <div className="flex items-center justify-center gap-1">
                                <span>Observación de Pago</span>
                                {renderColumnFilterControl('pendingOct', 'observacion_pago', 'Observación de Pago', procedureStatuses)}
                              </div>
                            </th>
                            {canManageRecords && (
                              <th className={`${pendingOctTableSizing.headerCellPadding} font-semibold text-center ${pendingOctTableSizing.headerTextClass}`}>Acciones</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loadingData ? (
                            <tr><td colSpan={canManageRecords ? 7 : 6} className="text-center py-8">Cargando observaciones...</td></tr>
                          ) : procedureStatuses.length === 0 ? (
                            <tr><td colSpan={canManageRecords ? 7 : 6} className="text-center py-8 text-slate-500">No hay observaciones registradas.</td></tr>
                          ) : filteredPendingOctData.length === 0 ? (
                            <tr><td colSpan={canManageRecords ? 7 : 6} className="text-center py-8 text-slate-500">Sin coincidencias para el filtro aplicado.</td></tr>
                          ) : filteredPendingOctData.map((item, rowIndex) => {
                            const rowKey = item.id ?? `pending-oct-${rowIndex}`;
                            const zebraBackground = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                            const rowStyle = buildRowStyle(zebraBackground);
                            return (
                              <tr
                                key={rowKey}
                                className="transition-colors table-row"
                                style={rowStyle}
                              >
                                {[
                                  { key: 'created_at', value: formatDateTime(item.created_at), className: `${pendingOctTableSizing.textCellClass} font-mono text-slate-400 whitespace-nowrap` },
                                  { key: 'contrato', value: item.contrato || '-', className: `${pendingOctTableSizing.textCellClass} font-semibold` },
                                  { key: 'descripcion', value: item.descripcion || '-', className: `${pendingOctTableSizing.textCellClass}` },
                                  { key: 'empresa', value: item.empresa || '-', className: `${pendingOctTableSizing.textCellClass}` },
                                  { key: 'mes_factura_nota', value: normalizeWhitespace(item.mes_factura_nota), className: `${pendingOctTableSizing.textCellClass} text-slate-500` },
                                  { key: 'observacion_pago', value: normalizeWhitespace(item.observacion_pago), className: `${pendingOctTableSizing.textCellClass}` }
                                ].map((cell) => {
                                  const isCellEditable = isPendingOctEditing;
                                  const cellClasses = isCellEditable ? `${cell.className} cursor-text` : cell.className;
                                  
                                  let editingValue = '';
                                  const rawValue = (item as any)[cell.key];
                                  if (rawValue !== null && rawValue !== undefined) {
                                      if (cell.key === 'created_at') {
                                          if (rawValue instanceof Date) {
                                              editingValue = formatDateToDDMMYYYY(rawValue);
                                          } else if (typeof rawValue === 'string') {
                                              const parsed = parsePotentialDate(rawValue);
                                              editingValue = parsed ? formatDateToDDMMYYYY(parsed) : rawValue;
                                          } else {
                                              editingValue = String(rawValue);
                                          }
                                      } else {
                                          editingValue = String(rawValue);
                                      }
                                  }
                                  
                                  const isDateCol = cell.key === 'created_at'; // Only created_at is strictly a date here
                                  const isBooleanCol = false; 

                                  return (
                                    <td key={cell.key} className={cellClasses}>
                                      {isCellEditable ? (
                                        isDateCol ? (
                                            <input
                                                type="date"
                                              aria-label={`Fecha ${humanizeKey(cell.key)}`}
                                              title={`Fecha ${humanizeKey(cell.key)}`}
                                                className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                value={(() => {
                                                     // created_at comes as string ISO usually
                                                     if (rawValue instanceof Date) return rawValue.toISOString().split('T')[0];
                                                     if (typeof rawValue === 'string') {
                                                         const p = parsePotentialDate(rawValue);
                                                         return p ? p.toISOString().split('T')[0] : '';
                                                     }
                                                     return '';
                                                })()}
                                                onChange={(e) => handlePendingOctCellEdit(item as any, cell.key, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                        <div
                                          contentEditable
                                          suppressContentEditableWarning
                                          className={`inline-block w-full ${pendingOctTableSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                          onBlur={(event) => handlePendingOctCellEdit(item as any, cell.key, event.currentTarget.textContent ?? '')}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                              event.preventDefault();
                                              (event.currentTarget as HTMLDivElement).blur();
                                            }
                                          }}
                                        >
                                          {editingValue}
                                        </div>
                                        )
                                      ) : (
                                        cell.value
                                      )}
                                    </td>
                                  );
                                })}
                              {canManageRecords && (
                                <td className={`${pendingOctTableSizing.actionsCellPadding} text-center`}>
                                  <div className="flex justify-center gap-2">
                                    <button
                                      onClick={() => openRecordEditor('estatus_procedimiento', 'Observación de Pago', procedureFieldList, item as unknown as Record<string, any>)}
                                      className="p-1.5 rounded-md text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteGenericRecord('estatus_procedimiento', item as unknown as Record<string, any>, 'Observación de Pago')}
                                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                      title="Eliminar"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeContractSubTab === 'procedures' && (
                <div className="animate-fade-in space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Servicios en seguimiento</p>
                      <div className="flex items-end justify-between mt-3">
                        <h3 className="text-3xl font-bold text-slate-900">{proceduresTotalServices}</h3>
                        <span className="text-[11px] text-slate-400 text-right">
                          {proceduresLastUpdatedLabel ? (
                            <>
                              Última actualización
                              <br />
                              {proceduresLastUpdatedLabel}
                            </>
                          ) : 'Actualiza desde Supabase para sincronizar'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Responsables activos</p>
                      <div className="flex items-end justify-between mt-3">
                        <h3 className="text-3xl font-bold text-slate-900">{proceduresUniqueResponsibles}</h3>
                        <span className="text-[11px] text-slate-400 text-right">
                          {topProcedureResponsible ? `Mayor carga: ${topProcedureResponsible.responsible}` : 'Sin responsables detectados'}
                        </span>
                      </div>
                    </div>
                    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${proceduresUnassignedCount ? 'ring-1 ring-amber-200' : ''}`}>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sin responsable asignado</p>
                      <div className="flex items-end justify-between mt-3">
                        <h3 className={`text-3xl font-bold ${proceduresUnassignedCount ? 'text-amber-600' : 'text-slate-900'}`}>{proceduresUnassignedCount}</h3>
                        <span className="text-[11px] text-slate-400 text-right">
                          {proceduresUnassignedCount ? 'Asigna encargados para activar seguimiento.' : 'Todos los servicios tienen responsable.'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">Seguimiento por responsable GPyC</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {proceduresSummaries.length
                            ? `${proceduresSummaries.length} responsable${proceduresSummaries.length === 1 ? '' : 's'} monitorean ${proceduresTotalServices} servicio${proceduresTotalServices === 1 ? '' : 's'}.`
                            : 'Carga registros en Supabase para distribuir responsabilidades.'}
                        </p>
                        {!proceduresResponsibleKey && (
                          <p className="mt-2 text-xs text-amber-600 font-semibold">
                            No se detectó un campo "Responsable GPyC". Añádelo en la tabla para clasificar automáticamente.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>
                          Total servicios: <span className="font-semibold text-slate-700">{proceduresTotalServices}</span>
                        </span>
                        {canManageRecords && (
                          <button
                            onClick={() => openRecordEditor('procedimientos', 'Procedimiento', proceduresTableColumns, null, null, 'Define responsable, servicio y fechas clave con descripciones concisas.')}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#B38E5D] text-white font-semibold shadow hover:bg-[#9c7a4d] transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            Nuevo registro
                          </button>
                        )}
                      </div>
                    </div>
                    {proceduresSummaries.length ? (
                      selectedResponsibleSummary ? (
                        <div className="mt-6 rounded-xl border border-[#0F4C3A]/20 bg-[#0F4C3A]/5 px-4 py-3 text-xs font-semibold text-[#0F4C3A]">
                          Mostrando el detalle de {selectedResponsibleSummary.responsible}. Usa "Regresar a responsables" para volver a la lista completa.
                        </div>
                      ) : (
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {proceduresSummaries.map((summary) => {
                            const isActive = selectedResponsibleName === summary.responsible;
                            return (
                              <button
                                key={summary.responsible}
                                type="button"
                                onClick={() => setSelectedResponsibleName((current) => (current === summary.responsible ? null : summary.responsible))}
                                className={`text-left rounded-xl border transition-all p-5 bg-white ${isActive ? 'border-[#0F4C3A] shadow-lg ring-1 ring-[#0F4C3A]/20' : 'border-slate-200 hover:border-[#B38E5D] hover:shadow-md'}`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-semibold text-slate-800 leading-tight truncate">
                                    {summary.responsible}
                                  </span>
                                  <span className="text-xs font-semibold text-[#0F4C3A] bg-[#0F4C3A]/10 px-2 py-1 rounded-full whitespace-nowrap">
                                    {summary.total} servicio{summary.total === 1 ? '' : 's'}
                                  </span>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {summary.statusBreakdown.slice(0, 3).map((item) => (
                                    <span
                                      key={`${summary.responsible}-${item.label}`}
                                      className={`text-[11px] font-medium px-2 py-1 rounded-full ${isActive ? 'bg-[#0F4C3A]/10 text-[#0F4C3A]' : 'bg-slate-100 text-slate-600'}`}
                                    >
                                      {item.label} · {item.count}
                                    </span>
                                  ))}
                                  {!summary.statusBreakdown.length && (
                                    <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${isActive ? 'bg-[#0F4C3A]/10 text-[#0F4C3A]' : 'bg-slate-100 text-slate-500'}`}>
                                      Sin estatus capturado
                                    </span>
                                  )}
                                </div>
                                <p className="mt-4 text-xs text-slate-500">
                                  {isActive ? 'Selección activa · clic para ocultar detalle.' : `Clic para ver detalle de ${summary.services.length} servicio${summary.services.length === 1 ? '' : 's'}.`}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )
                    ) : (
                      <div className="mt-6 text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                        Aún no hay procedimientos registrados. Integra registros en Supabase para activar el seguimiento.
                      </div>
                    )}

                    {selectedResponsibleSummary && (
                      <div className="mt-8 bg-[#0F4C3A]/5 border border-[#0F4C3A]/20 rounded-xl p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-[#0F4C3A]">Detalle de carga</p>
                            <h4 className="mt-2 text-xl font-bold text-slate-900 leading-tight">
                              {selectedResponsibleSummary.responsible}
                            </h4>
                            <p className="text-xs text-slate-600 mt-2">
                              {selectedResponsibleSummary.total} servicio{selectedResponsibleSummary.total === 1 ? '' : 's'} en seguimiento asignados.
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedResponsibleName(null)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-transparent bg-white text-xs font-semibold text-slate-600 hover:text-[#0F4C3A] hover:border-[#0F4C3A]/40 transition-colors"
                          >
                            <ArrowLeft className="h-4 w-4" />
                            Regresar a responsables
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedResponsibleSummary.statusBreakdown.length ? (
                            selectedResponsibleSummary.statusBreakdown.map((item) => (
                              <span key={`${selectedResponsibleSummary.responsible}-chip-${item.label}`} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white text-[#0F4C3A] shadow-sm">
                                {item.label} · {item.count}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white text-slate-400 shadow-sm">
                              Sin estatus capturado
                            </span>
                          )}
                        </div>

                        <div className="mt-6 grid gap-4">
                          {selectedResponsibleSummary.services.map((service, index) => {
                            const highlightKeys = proceduresHighlightKeys;
                            const hasDetails = highlightKeys.some((key) => {
                              if (!key) return false;
                              if (!Object.prototype.hasOwnProperty.call(service.raw, key)) return false;
                              const value = service.raw[key];
                              return value !== null && value !== undefined && value !== '';
                            });

                            return (
                              <div key={String(service.id ?? index)} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Servicio</p>
                                    <h5 className="mt-1 text-base font-semibold text-slate-800 break-words max-w-xl">
                                      {service.label || `Servicio ${index + 1}`}
                                    </h5>
                                  </div>
                                  <div className="flex flex-col gap-2 items-end text-right">
                                    {service.statusLabel && (
                                      <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#0F4C3A]/10 text-xs font-semibold text-[#0F4C3A]">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        {service.statusLabel}
                                      </span>
                                    )}
                                    {service.deadlineLabel && (
                                      <span className="text-[11px] font-medium text-slate-500">
                                        Próximo hito: {service.deadlineLabel}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {hasDetails ? (
                                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
                                    {highlightKeys.map((key) => {
                                      if (!key) return null;
                                      if (!Object.prototype.hasOwnProperty.call(service.raw, key)) return null;
                                      const rawValue = service.raw[key];
                                      if (rawValue === null || rawValue === undefined || rawValue === '') return null;
                                      return (
                                        <div key={`${service.id}-${key}`}>
                                          <p className="font-semibold uppercase tracking-widest text-[11px] text-slate-400">{humanizeKey(key)}</p>
                                          <p className="mt-1 text-slate-700 whitespace-pre-wrap break-words">{formatTableValue(key, rawValue)}</p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="mt-4 text-xs text-slate-400 italic">
                                    Captura información adicional en Supabase para enriquecer este resumen.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">Procedimientos (tabla `procedimientos`)</h3>
                        <p className="text-xs text-slate-500 mt-1">Consulta y edita los registros capturados por GPyC.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <button
                          onClick={() => setIsProceduresCompact(!isProceduresCompact)}
                          className={`p-2 rounded-md transition-colors ${isProceduresCompact ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
                          title={isProceduresCompact ? "Vista normal" : "Vista compacta"}
                        >
                          {isProceduresCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                        </button>
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={() => setIsProceduresEditing((prev) => !prev)}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isProceduresEditing ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                          >
                            {isProceduresEditing ? (
                              <>
                                <Save className="h-4 w-4" />
                                Salir de edición
                              </>
                            ) : (
                              <>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </>
                            )}
                          </button>
                        )}
                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={handleAddProcedureRow}
                            disabled={!proceduresTableColumns.length}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${proceduresTableColumns.length ? 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                          >
                            <Plus className="h-4 w-4" />
                            Agregar fila
                          </button>
                        )}
                        <span>
                          Total registros: <span className="font-semibold text-slate-700">{proceduresTotalServices}</span>
                        </span>
                        {canManageRecords && (
                          <button
                            onClick={() => openRecordEditor('procedimientos', 'Procedimiento', proceduresTableColumns, null, null, 'Usa responsable, servicio y próximos hitos con la misma nomenclatura del equipo.')}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#B38E5D] text-white font-semibold shadow hover:bg-[#9c7a4d] transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            Nuevo registro
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50 border-b border-slate-100">
                      <div className="relative w-full md:w-96">
                        <Search className="table-filter-icon" aria-hidden="true" />
                        <input
                          type="text"
                          value={tableFilters.procedures}
                          onChange={(event) => updateTableFilter('procedures', event.target.value)}
                          placeholder="Filtra servicio, responsable o estatus"
                          className="table-filter-input"
                        />
                        {tableFilters.procedures && (
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                            onClick={() => updateTableFilter('procedures', '')}
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-2 text-[11px] font-semibold">
                        {proceduresColumnFiltersCount > 0 && (
                          <button
                            type="button"
                            className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                            onClick={() => clearColumnFilters('procedures')}
                          >
                            Limpiar filtros por columna
                          </button>
                        )}
                        <span className="text-slate-500">
                          {formatResultLabel(sortedProceduresData.length)}
                          {tableFilters.procedures.trim() ? ' · filtro general' : ''}
                          {proceduresColumnFiltersCount ? ` · ${formatColumnFilterLabel(proceduresColumnFiltersCount)}` : ''}
                        </span>
                      </div>
                      {renderActiveColumnFilterBadges('procedures')}
                    </div>
                    {isProceduresEditing && (
                      <div className="px-6 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Modo edición activo: ajusta cualquier celda como en Excel y usa "Salir de edición" para bloquear cambios.
                      </div>
                    )}
                    <div
                      className={`relative ${proceduresSizing.containerHeightClass} overflow-auto`}
                      
                    >
                      <table className={`min-w-full ${proceduresSizing.tableMinWidthClass} ${proceduresSizing.tableTextClass} text-center border-collapse`}>
                        <thead className={`uppercase tracking-wide text-white ${proceduresSizing.headerTextClass}`}>
                          <tr className={proceduresSizing.headerRowClass}>
                            {(proceduresColumnsToRender.length ? proceduresColumnsToRender : proceduresTableColumns.length ? proceduresTableColumns : ['sin_datos']).map((column) => {
                              if (column === '__actions') {
                                return (
                                  <th
                                    key="procedimientos-actions"
                                    className={`${proceduresSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center`}
                                    style={{ position: 'sticky', top: 0, zIndex: 45, backgroundColor: '#0F4C3A', color: '#fff', minWidth: `${proceduresSizing.actionsMinWidth}px` }}
                                  >
                                    Acciones
                                  </th>
                                );
                              }

                              if (!proceduresTableColumns.length && column === 'sin_datos') {
                                return (
                                  <th
                                    key="procedimientos-empty"
                                    className={`${proceduresSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center`}
                                    style={{ position: 'sticky', top: 0, backgroundColor: '#0F4C3A', color: '#fff' }}
                                  >
                                    Sin datos
                                  </th>
                                );
                              }

                              const stickyMeta = proceduresStickyInfo.meta.get(column);
                              const isSticky = Boolean(stickyMeta);
                              const minWidth = stickyMeta?.width ?? proceduresSizing.stickyFallbackWidth;
                              const headerStyle: React.CSSProperties = {
                                position: 'sticky',
                                top: 0,
                                zIndex: isSticky ? 60 : 50,
                                backgroundColor: '#0F4C3A',
                                color: '#fff',
                                minWidth: `${minWidth}px`,
                              };

                              if (isSticky && stickyMeta) {
                                headerStyle.left = stickyMeta.left;
                                if (column === proceduresLastStickyKey) {
                                  headerStyle.boxShadow = '6px 0 10px -4px rgba(15,76,58,0.2)';
                                }
                              }

                              return (
                                <th
                                  key={column}
                                  className={`${proceduresSizing.headerCellPadding} font-semibold whitespace-nowrap border-b border-white/20 text-center`}
                                  style={headerStyle}
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="truncate">{humanizeKey(column)}</span>
                                    {renderColumnFilterControl('procedures', column, humanizeKey(column), proceduresData)}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loadingData ? (
                            <tr>
                              <td colSpan={proceduresColumnCount} className="text-center py-10 text-slate-500">
                                Cargando procedimientos...
                              </td>
                            </tr>
                          ) : !proceduresData.length ? (
                            <tr>
                              <td colSpan={proceduresColumnCount} className="text-center py-10 text-slate-500">
                                No hay registros en la tabla `procedimientos`.
                              </td>
                            </tr>
                          ) : sortedProceduresData.length === 0 ? (
                            <tr>
                              <td colSpan={proceduresColumnCount} className="text-center py-10 text-slate-500">
                                Sin coincidencias para el filtro aplicado.
                              </td>
                            </tr>
                          ) : (
                            sortedProceduresData.map((row, rowIndex) => {
                              const rowKey = row.id ?? `procedimiento-row-${rowIndex}`;
                              const isStriped = rowIndex % 2 === 0;
                              const columns = proceduresColumnsToRender.length ? proceduresColumnsToRender : proceduresTableColumns;
                              const zebraBackground = isStriped ? '#ffffff' : '#f8fafc';
                              const rowStyle = buildRowStyle(zebraBackground);

                              return (
                                <tr
                                  key={rowKey}
                                  className="transition-colors table-row"
                                  style={rowStyle}
                                >
                                  {columns.map((column) => {
                                    if (column === '__actions') {
                                      return (
                                        <td
                                          key={`procedimientos-actions-${rowKey}`}
                                          className={`${proceduresSizing.actionsCellPadding} text-center`}
                                          style={{ minWidth: `${proceduresSizing.actionsMinWidth}px` }}
                                        >
                                          {canManageRecords ? (
                                            <div className="flex justify-center gap-2">
                                              <button
                                                onClick={() => openRecordEditor('procedimientos', 'Procedimiento', proceduresTableColumns, row as Record<string, any>) }
                                                className="p-1.5 rounded-md text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 transition-colors"
                                                title="Editar"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </button>
                                              <button
                                                onClick={() => handleDeleteGenericRecord('procedimientos', row as Record<string, any>, 'Procedimiento')}
                                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                title="Eliminar"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                            </div>
                                          ) : (
                                            <span className="text-xs uppercase text-slate-400 font-semibold tracking-wide">Solo lectura</span>
                                          )}
                                        </td>
                                      );
                                    }

                                    const rawValue = row[column];
                                    const stickyMeta = proceduresStickyInfo.meta.get(column);
                                    const isSticky = Boolean(stickyMeta);
                                    const minWidth = stickyMeta?.width ?? proceduresSizing.stickyFallbackWidth;
                                    const numeric = typeof rawValue === 'number' || shouldFormatAsCurrency(column);
                                    const baseClasses = numeric ? proceduresSizing.numericCellClass : proceduresSizing.textCellClass;
                                    const isCellEditable = isProceduresEditing && column !== '__actions';
                                    const cellClasses = isCellEditable ? `${baseClasses} cursor-text` : baseClasses;
                                    const stickyStyle: React.CSSProperties = {
                                      minWidth: `${minWidth}px`,
                                    };

                                    if (isSticky && stickyMeta) {
                                      stickyStyle.position = 'sticky';
                                      stickyStyle.left = stickyMeta.left;
                                      stickyStyle.backgroundColor = 'var(--row-bg, #ffffff)';
                                      stickyStyle.zIndex = 30;
                                      if (column === proceduresLastStickyKey) {
                                        stickyStyle.boxShadow = '6px 0 10px -4px rgba(15,76,58,0.18)';
                                      }
                                    }

                                    let editingValue = '';
                                    if (rawValue !== null && rawValue !== undefined) {
                                        if (typeof rawValue === 'number') {
                                            if (shouldFormatAsCurrency(column)) {
                                                editingValue = rawValue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                            } else {
                                                editingValue = String(rawValue);
                                            }
                                        } else if (rawValue instanceof Date) {
                                            editingValue = formatDateToDDMMYYYY(rawValue);
                                        } else if (typeof rawValue === 'string') {
                                            const parsedForEdit = parsePotentialDate(rawValue);
                                            if (parsedForEdit) {
                                                editingValue = formatDateToDDMMYYYY(parsedForEdit);
                                            } else {
                                                if (shouldFormatAsCurrency(column)) {
                                                    const sanitized = rawValue.replace(/,/g, '');
                                                    const num = parseFloat(sanitized);
                                                    if (!isNaN(num)) {
                                                        editingValue = num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                    } else {
                                                        editingValue = rawValue;
                                                    }
                                                } else {
                                                    editingValue = rawValue;
                                                }
                                            }
                                        } else if (typeof rawValue === 'object') {
                                            try {
                                                editingValue = JSON.stringify(rawValue);
                                            } catch (err) {
                                                console.error('Error serializing value for inline edit:', err);
                                                editingValue = String(rawValue);
                                            }
                                        } else {
                                            editingValue = String(rawValue);
                                        }
                                    }

                                    const lowerColumn = column.toLowerCase();
                                    const isDateCol = ['fecha', 'vigencia', 'fallo', 'apertura', 'publicacion', 'término', 'termino', 'inicio', 'visita', 'revision', 'revisión', 'diferimiento', 'updated'].some(f => lowerColumn.includes(f));
                                    const isBooleanCol = shouldTreatAsBooleanColumn(column, rawValue, ['confirmado']);
                                    
                                    const isChecked = isBooleanCol ? getBooleanChecked(rawValue) : false;

                                    return (
                                      <td key={column} className={`${cellClasses} ${isSticky ? 'sticky-cell' : ''}`.trim()} style={stickyStyle}>
                                        {isCellEditable ? (
                                          isBooleanCol ? (
                                              <div className="flex items-center justify-center h-full min-h-[1.5em]" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                      type="checkbox"
                                                      aria-label={`Alternar ${humanizeKey(column)}`}
                                                      title={`Alternar ${humanizeKey(column)}`}
                                                      className="w-5 h-5 text-[#0F4C3A] bg-gray-100 border-gray-300 rounded focus:ring-[#0F4C3A] cursor-pointer accent-[#2d3e50]"
                                                      checked={isChecked}
                                                      onChange={(e) => {
                                                            const newVal = e.target.checked;
                                                            const valToSave = getBooleanSaveValue(rawValue, column, newVal);
                                                            handleProcedureCellEdit(row, column, valToSave);
                                                      }}
                                                  />
                                              </div>
                                          ) : isDateCol ? (
                                            <input
                                                type="date"
                                              aria-label={`Fecha ${humanizeKey(column)}`}
                                              title={`Fecha ${humanizeKey(column)}`}
                                                className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer min-w-[140px]"
                                                value={(() => {
                                                     if (rawValue instanceof Date) return rawValue.toISOString().split('T')[0];
                                                     if (typeof rawValue === 'string') {
                                                         const p = parsePotentialDate(rawValue);
                                                         return p ? p.toISOString().split('T')[0] : '';
                                                     }
                                                     return '';
                                                })()}
                                                onChange={(e) => handleProcedureCellEdit(row, column, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                          ) : (
                                          <div
                                            contentEditable
                                            suppressContentEditableWarning
                                            className={`inline-block w-full ${proceduresSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                            onBlur={(event) => handleProcedureCellEdit(row, column, event.currentTarget.textContent ?? '')}
                                            onKeyDown={(event) => {
                                              if (event.key === 'Enter') {
                                                event.preventDefault();
                                                (event.currentTarget as HTMLDivElement).blur();
                                              }
                                            }}
                                          >
                                            {editingValue}
                                          </div>
                                          )
                                        ) : (
                                          isBooleanCol ? (
                                              <div className="flex items-center justify-center h-full min-h-[1.5em]">
                                                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${isChecked ? 'bg-[#2d3e50] border-[#2d3e50]' : 'bg-transparent border-slate-300'}`}>
                                                      {isChecked && (
                                                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                          </svg>
                                                      )}
                                                  </div>
                                              </div>
                                          ) :
                                          formatTableValue(column, rawValue)
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-3 bg-slate-50 text-xs text-slate-400 border-t border-slate-100 text-center">
                      Desliza horizontalmente o usa la búsqueda del navegador (Ctrl/Cmd + F) para ubicar un servicio específico.
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
      </main>

      {/* === MODAL PARA NUEVO/EDITAR REGISTRO PAAS === */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {editingId ? <Pencil className="h-5 w-5 text-[#B38E5D]" /> : <Plus className="h-5 w-5 text-[#B38E5D]" />}
                {editingId ? 'Editar Registro PAAS' : 'Nuevo Registro PAAS 2026'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Cerrar modal"
                title="Cerrar"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form onSubmit={handleSaveRecord} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">No.</label>
                  <input 
                    name="No." 
                    aria-label="No."
                    title="No."
                    value={formState["No."]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Clave CUCOP</label>
                  <input 
                    name="Clave cucop" 
                    aria-label="Clave CUCOP"
                    title="Clave CUCOP"
                    value={formState["Clave cucop"]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Servicio</label>
                  <input 
                    name="Nombre del Servicio." 
                    aria-label="Nombre del Servicio"
                    title="Nombre del Servicio"
                    value={formState["Nombre del Servicio."]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                    required
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Subdirección</label>
                  <input 
                    name="Subdirección" 
                    aria-label="Subdirección"
                    title="Subdirección"
                    value={formState["Subdirección"]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Gerencia</label>
                  <input 
                    name="Gerencia" 
                    aria-label="Gerencia"
                    title="Gerencia"
                    value={formState["Gerencia"]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Monto Solicitado (Anteproyecto)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                    <input 
                      type="number"
                      name="Monto solicitado anteproyecto 2026" 
                      aria-label="Monto Solicitado (Anteproyecto)"
                      title="Monto Solicitado (Anteproyecto)"
                      value={formState["Monto solicitado anteproyecto 2026"]} 
                      onChange={handleInputChange}
                      className="w-full pl-6 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                    />
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Monto Modificado</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                    <input 
                      type="number"
                      name="Modificado" 
                      aria-label="Monto Modificado"
                      title="Monto Modificado"
                      value={formState["Modificado"]} 
                      onChange={handleInputChange}
                      className="w-full pl-6 p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                    />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Justificación</label>
                  <textarea 
                    name="Justificación" 
                    aria-label="Justificación"
                    title="Justificación"
                    value={formState["Justificación"]} 
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-2 mt-4 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-[#B38E5D] hover:bg-[#9c7a4d] text-white font-bold rounded-lg shadow-lg transition-colors flex items-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editingId ? 'Guardar Cambios' : 'Guardar Registro'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {recordEditorConfig && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in"
          onClick={closeRecordEditor}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {recordEditorConfig.isNew ? 'Nuevo registro' : 'Editar registro'} · {recordEditorConfig.title}
                </h3>
                <div className="text-xs text-slate-500 space-y-1 mt-1">
                  <p>
                    Tabla Supabase: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{recordEditorConfig.table}</code>
                  </p>
                  {recordEditorConfig.primaryKey && (
                    <p>
                      Clave primaria detectada: <code className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">{recordEditorConfig.primaryKey}</code>
                    </p>
                  )}
                  {recordEditorConfig.note && (
                    <p className="text-slate-500">{recordEditorConfig.note}</p>
                  )}
                </div>
              </div>
              <button
                onClick={closeRecordEditor}
                className="text-slate-400 hover:text-slate-600"
                disabled={recordEditorSaving}
                aria-label="Cerrar editor de registro"
                title="Cerrar"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recordEditorConfig.fields.map((field) => {
                  const value = recordEditorConfig.formValues[field.key] ?? '';
                  const isPrimary = recordEditorConfig.primaryKey === field.key;
                  const isReadOnly = Boolean(isPrimary && !recordEditorConfig.isNew);
                  const label = field.label || humanizeKey(field.key);
                  const helper = field.helpText || (field.required ? 'Campo obligatorio.' : 'Deja vacío si no aplica.');

                  const isDateField = field.type === 'date';
                  const inputType = field.type === 'number' ? 'number' : 'text';
                  const inputMode = field.type === 'number' ? 'decimal' : isDateField ? 'numeric' : undefined;

                  return (
                    <div key={field.key} className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                        {label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          name={field.key}
                          aria-label={label}
                          title={label}
                          rows={4}
                          value={value}
                          onChange={(event) => updateRecordEditorValue(field.key, event.target.value)}
                          className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#B38E5D]/40 resize-none ${isReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                          placeholder={field.placeholder}
                          disabled={isReadOnly || recordEditorSaving}
                        />
                      ) : (
                        <input
                          name={field.key}
                          aria-label={label}
                          title={label}
                          type={inputType}
                          value={value}
                          onChange={(event) => updateRecordEditorValue(field.key, event.target.value)}
                          className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#B38E5D]/40 ${isReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                          placeholder={field.placeholder}
                          inputMode={inputMode}
                          pattern={isDateField ? '\\d{2}-\\d{2}-\\d{4}' : undefined}
                          disabled={isReadOnly || recordEditorSaving}
                        />
                      )}
                      <p className="text-[11px] text-slate-400">{helper}</p>
                    </div>
                  );
                })}
              </div>
              {recordEditorError && (
                <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                  {recordEditorError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-slate-500">
                Completa los campos con texto claro; los valores vacíos se guardan como "sin dato". Si aparece la clave primaria, respeta el valor sugerido.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={closeRecordEditor}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  disabled={recordEditorSaving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveGenericRecord}
                  disabled={recordEditorSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#B38E5D] text-white text-sm font-bold rounded-lg shadow hover:bg-[#9c7a4d] disabled:opacity-60 transition-colors"
                >
                  {recordEditorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
