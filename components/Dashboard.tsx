
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  LogOut, AlertCircle,
  X, FileText, Briefcase,
  DollarSign, PieChart as PieChartIcon,
  TrendingUp, BarChart2, Plus, Save, Loader2, Pencil, Trash2,
  CreditCard, Calendar as CalendarIcon, FileSpreadsheet, Menu, History, ArrowLeft, Maximize2, Minimize2,
  Search, Filter, Layers, Sparkles, CalendarDays
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
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

type TableFilterKey = 'annual2026' | 'servicios2026' | 'paas' | 'controlPagos' | 'invoices' | 'compranet' | 'procedures' | 'pendingOct';
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
}

const ColumnFilterControl: React.FC<ColumnFilterControlProps> = React.memo(({
  tableKey,
  columnKey,
  label,
  rows,
  selectedValues,
  onChange,
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
  }, [rows, columnKey]);

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
  const [activeContractSubTab, setActiveContractSubTab] = useState<'annual2026' | 'paas' | 'payments' | 'invoices' | 'compranet' | 'pendingOct' | 'procedures'>('annual2026'); 
  const [statusTab, setStatusTab] = useState<'dashboard' | 'calendar' | 'table'>('dashboard');
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Database State
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [commercialSpaces, setCommercialSpaces] = useState<CommercialSpace[]>([]);
  const [annual2026Data, setAnnual2026Data] = useState<Record<string, any>[]>([]);
  const [servicios2026Data, setServicios2026Data] = useState<Record<string, any>[]>([]);
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
  const [expandedServicioStatusId, setExpandedServicioStatusId] = useState<string | number | null>(null);
  const [tableFilters, setTableFilters] = useState<TableFilterMap>({
    annual2026: '',
    servicios2026: '',
    paas: '',
    controlPagos: '',
    invoices: '',
    compranet: '',
    procedures: '',
    pendingOct: '',
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
  });

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
    rowsSource: unknown[]
  ) => (
    <ColumnFilterControl
      tableKey={tableKey}
      columnKey={columnKey}
      label={label}
      rows={rowsSource}
      selectedValues={columnFilters[tableKey]?.[columnKey]}
      onChange={updateColumnFilter}
    />
  ), [columnFilters, updateColumnFilter]);

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

  const proceduresSizing = useMemo(() => {
    if (isProceduresCompact) {
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
  }, [isProceduresCompact]);

  const serviciosSizing = useMemo(() => {
    if (isServiciosCompact) {
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
  }, [isServiciosCompact]);

  const PRIMARY_KEY_HINTS: Record<string, string> = {
    'año_2026': 'id',
    'estatus_servicios_2026': 'id',
    'balance_paas_2026': 'id',
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
          return 'DD-MM-YYYY';
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
      .select('*');

    if (error) console.error('Error fetching año_2026:', error.message);

    if (annualData !== null) {
      setAnnual2026Data(annualData ?? []);
    }
  };

  const fetchServicios2026Data = async () => {
    const { data, error } = await supabase
      .from('estatus_servicios_2026')
      .select('*');

    if (error) console.error('Error fetching estatus_servicios_2026:', error.message);

    if (data !== null) {
      setServicios2026Data(data ?? []);
    }
  };

  const fetchInvoicesData = async () => {
    const { data: invoices, error } = await supabase
      .from('estatus_facturas')
      .select('*');

    if (error) console.error('Error fetching estatus_facturas:', error.message);

    if (invoices !== null) {
      setInvoicesData(invoices ?? []);
    }
  };

  const fetchPaasData = async () => {
    const { data: paasResults, error: paasError } = await supabase
      .from('balance_paas_2026')
      .select('*')
      .order('id', { ascending: false }); // Show newest first
    
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
      .select('*');

    if (compranetResults) setCompranetData(compranetResults);
    if (compranetError) console.error('Error fetching procedimientos_compranet:', compranetError.message);
  };

  const fetchProceduresData = async () => {
    const { data: proceduresResults, error: proceduresError } = await supabase
      .from('procedimientos')
      .select('*');

    if (proceduresResults) setProceduresData(proceduresResults as ProcedureRecord[]);
    if (proceduresError) console.error('Error fetching procedimientos:', proceduresError.message);
  };

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoadingData(true);
        
        await fetchContractsData();
        await fetchCommercialSpacesData();
        await fetchAnnual2026Data();
        await fetchServicios2026Data();
        await fetchPaasData();
        await fetchPaymentsData();
        await fetchInvoicesData();
        await fetchCompranetData();
        await fetchProceduresData();
        await fetchProcedureStatusData();
        await fetchChangeHistory();

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
    return ['monto', 'importe', 'total', 'presupuesto', 'costo', 'valor', 'ejercido', 'pagado'].some(fragment => normalized.includes(fragment));
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
    'dic': 'Diciembre'
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

  const humanizeKey = (rawKey: string) => {
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
    const normalizedFragments = fragments.map(fragment => fragment.toLowerCase());
    for (const column of columns) {
      const normalized = normalizeAnnualKey(column);
      if (normalizedFragments.some(fragment => normalized.includes(fragment))) {
        return column;
      }
    }
    return null;
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
    return canManageRecords ? [...serviciosTableColumns, '__actions'] : [...serviciosTableColumns];
  }, [serviciosTableColumns, canManageRecords]);

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
    findColumnByFragments(serviciosTableColumns, ['nombre del servicio', 'servicio', 'descripcion', 'concepto', 'objeto'])
  ), [serviciosTableColumns]);

  const serviciosClaveField = useMemo(() => (
    findColumnByFragments(serviciosTableColumns, ['clave cucop', 'clave servicio', 'clave'])
  ), [serviciosTableColumns]);

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

  const handleProcedureCellEdit = async (rowRef: ProcedureRecord, column: string, rawInput: string) => {
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

  const handleServicioCellEdit = async (rowRef: Record<string, any>, column: string, rawInput: string) => {
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

    if (normalizedCurrent === normalizedNext) return;

    const optimisticSnapshot = [...servicios2026Data];
    const updatedRecord = { ...rowRef, [column]: nextValue };

    // Helper to match the record
    const matchesTarget = (entry: Record<string, any>) => {
        const pk = resolvePrimaryKey(rowRef, 'estatus_servicios_2026');
        if (!pk) return false;
        return entry[pk] === rowRef[pk];
    };

    setServicios2026Data((prev) => prev.map((entry) => (matchesTarget(entry) ? updatedRecord : entry)));

    try {
      const primaryKey = resolvePrimaryKey(rowRef, 'estatus_servicios_2026');
      if (!primaryKey) throw new Error('No se pudo determinar la clave primaria.');

      const { error } = await supabase
        .from('estatus_servicios_2026')
        .update({ [column]: nextValue })
        .eq(primaryKey, rowRef[primaryKey]);

      if (error) throw error;

      await logChange({
        table: 'estatus_servicios_2026',
        action: 'UPDATE',
        recordId: rowRef[primaryKey],
        before: { [column]: currentValue },
        after: { [column]: nextValue },
      });
    } catch (error) {
      console.error('Error guardando cambio en estatus_servicios_2026:', error);
      alert('No se pudo guardar el cambio en Supabase. Se restauró el valor anterior.');
      setServicios2026Data(optimisticSnapshot);
    }
  };

  const handleAddServicioRow = useCallback(() => {
    if (!serviciosTableColumns.length) return;

    const template = generateTemplateFromColumns(serviciosTableColumns);
    const newRow: Record<string, any> = { ...template, id: null };

    setServicios2026Data((prev) => [...prev, newRow]);
    setIsServiciosEditing(true);
  }, [serviciosTableColumns]);

  const handleAddProcedureRow = useCallback(() => {
    if (!proceduresTableColumns.length) return;

    const template = generateTemplateFromColumns(proceduresTableColumns);
    const newRow: ProcedureRecord = { ...template, id: null };

    setProceduresData((prev) => [...prev, newRow]);
    setIsProceduresEditing(true);
  }, [proceduresTableColumns]);

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
        title: `${peakPaymentMonth.name} concentra el mayor flujo de pagos`,
        detail: `Se ejercieron ${formatCurrency(peakPaymentMonth.value)} durante ese mes.`,
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
          {[ 
            { id: 'overview', icon: LayoutDashboard, label: 'Resumen' },
            { id: 'serviciosStatus', icon: BarChart2, label: 'Estatus servicios' },
            { id: 'contracts', icon: FileText, label: 'Gestión Contratos' },
            { id: 'history', icon: History, label: 'Historial' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handleSidebarSelection(item.id)}
              className={`w-full flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeTab === item.id
                  ? 'bg-slate-100 text-[#B38E5D]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon className={`h-5 w-5 mr-3 ${activeTab === item.id ? 'text-[#B38E5D]' : 'text-slate-400'}`} />
              {item.label}
            </button>
          ))}
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
                                label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
                                    const RADIAN = Math.PI / 180;
                                    let radius = outerRadius + 50;

                                    // Ajuste específico para evitar superposición
                                    if (name.includes('Procedimiento de Contratación')) {
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
                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-4">
                          No hay datos suficientes para generar la gráfica.
                        </div>
                      )}
                  </div>
              </div>

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
                          type="button"
                          onClick={() => setIsServiciosCompact((prev) => !prev)}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isServiciosCompact ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                        >
                          {isServiciosCompact ? (
                            <>
                              <Minimize2 className="h-4 w-4" />
                              Vista estándar
                            </>
                          ) : (
                            <>
                              <Maximize2 className="h-4 w-4" />
                              Vista compacta
                            </>
                          )}
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
                          {formatResultLabel(filteredServicios2026Data.length)}
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
                            <tr><td colSpan={serviciosTableColumns.length + 1} className="text-center py-10 text-slate-500">Cargando...</td></tr>
                          ) : !filteredServicios2026Data.length ? (
                            <tr><td colSpan={serviciosTableColumns.length + 1} className="text-center py-10 text-slate-500">No hay datos.</td></tr>
                          ) : (
                            filteredServicios2026Data.map((row, rowIndex) => {
                              const rowKey = row.id ?? `servicio-row-${rowIndex}`;
                              const isStriped = rowIndex % 2 === 0;
                              const zebraBackground = isStriped ? '#ffffff' : '#f8fafc';
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

                                    const isBooleanCol = (() => {
                                        const norm = normalizeAnnualKey(column);
                                        if (norm.includes('fecha')) return false;
                                        if (['procedimiento de contratacion', 'plurianual', 'anticipo', 'convenio', 'suficiencia', 'investigacion', 'validado'].some(k => norm.includes(k))) return true;
                                        if (typeof rawValue === 'string') {
                                            const v = rawValue.trim().toUpperCase();
                                            return v === 'SI' || v === 'NO';
                                        }
                                        return false;
                                    })();

                                    return (
                                      <td key={column} className={cellClasses}>
                                        {isCellEditable ? (
                                          isBooleanCol ? (
                                            <select
                                                className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm py-0.5 cursor-pointer"
                                                value={['SI', 'NO'].includes(editingValue.toUpperCase()) ? editingValue.toUpperCase() : ''}
                                                onChange={(e) => handleServicioCellEdit(row, column, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <option value="">-</option>
                                                <option value="SI">SI</option>
                                                <option value="NO">NO</option>
                                            </select>
                                          ) : (
                                          <div
                                            contentEditable
                                            suppressContentEditableWarning
                                            className={`inline-block w-full ${serviciosSizing.editorMinHeightClass} whitespace-pre-wrap break-words px-0.5 py-0.5 text-center focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/40 rounded-sm`}
                                            onBlur={(event) => handleServicioCellEdit(row, column, event.currentTarget.textContent ?? '')}
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
                                          formatTableValue(column, rawValue)
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
                <button 
                  onClick={() => setActiveContractSubTab('annual2026')}
                  className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'annual2026' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  <div className="flex items-center gap-2">
                   <CalendarIcon className="h-4 w-4" />
                   Análisis Año 2026
                  </div>
                </button>
                  <button 
                     onClick={() => setActiveContractSubTab('paas')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'paas' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Balance PAAS 2026
                    </div>
                  </button>
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

               {/* === CONTRACTS: ANÁLISIS AÑO 2026 === */}
               {activeContractSubTab === 'annual2026' && (
                 <div className="animate-fade-in space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10">
                          <CalendarIcon className="h-16 w-16 text-slate-400" />
                        </div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Registros Totales</p>
                        <h3 className="text-3xl font-bold text-slate-900 mt-1">{loadingData ? '...' : annual2026Data.length}</h3>
                        <p className="text-xs text-slate-400 mt-2">Fuente: tabla `año_2026`.</p>
                      </div>
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10">
                          <PieChartIcon className="h-16 w-16 text-[#B38E5D]" />
                        </div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Campo Dominante</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">
                          {annualPrimaryMetric ? formatMetricValue(annualPrimaryMetric.key, annualPrimaryMetric.value) : '--'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-2">
                          {annualPrimaryMetric ? humanizeKey(annualPrimaryMetric.key) : 'Agrega valores numéricos para analizarlos.'}
                        </p>
                      </div>
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10">
                          <BarChart2 className="h-16 w-16 text-blue-400" />
                        </div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Columnas Numéricas</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{annualNumericTotals.length}</h3>
                        <p className="text-xs text-slate-400 mt-2">
                          {annualCategoryMetadata ? `Agrupación sugerida: ${humanizeKey(annualCategoryMetadata.key)} (${annualCategoryMetadata.uniqueCount} grupos)` : 'Añade un campo categórico para segmentar visualizaciones.'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[22rem]">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-800">
                              Distribución por {annualCategoryMetadata ? humanizeKey(annualCategoryMetadata.key) : 'categoría'}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                              {annualPrimaryMetric ? `Se muestra la suma de ${humanizeKey(annualPrimaryMetric.key)} por segmento.` : 'Conecta un valor numérico para graficar la distribución.'}
                            </p>
                          </div>
                          {annualCategoryMetadata && (
                            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                              {annualCategoryMetadata.uniqueCount} categorías
                            </span>
                          )}
                        </div>
                        <div className="flex-1">
                          <div style={{ height: annualSharedChartHeight }}>
                          {loadingData ? (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                              Cargando información...
                            </div>
                          ) : annualCategoryBreakdown.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={annualCategoryBreakdown} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 8 }} barCategoryGap={18}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" hide domain={[0, 'dataMax']} allowDecimals={false} />
                                <YAxis type="category" dataKey="name" width={240} tick={renderCompanyTick} />
                                <Tooltip formatter={(value: number | string) => {
                                  const numericValue = typeof value === 'number' ? value : Number(value);
                                  return annualPrimaryMetric ? formatMetricValue(annualPrimaryMetric.key, numericValue) : formatNumber(numericValue);
                                }} />
                                <Bar dataKey="value" fill="#B38E5D" radius={[0, 6, 6, 0]} barSize={26} />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center px-6">
                              Define un campo categórico (por ejemplo, área, proveedor o gerencia) en la tabla para visualizar su distribución.
                            </div>
                          )}
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col min-h-[22rem]">
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Composición de métricas numéricas</h3>
                        <p className="text-xs text-slate-500 mb-4">Comparativa de los principales campos cuantitativos cargados en Supabase.</p>
                        <div className="relative flex-1" style={{ minHeight: annualSharedChartHeight }}>
                          {loadingData ? (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                              Preparando gráfico...
                            </div>
                          ) : annualPieSlices.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 36 }}>
                                <Pie data={annualPieSlices} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={4}>
                                  {annualPieSlices.map((entry, index) => (
                                    <Cell key={entry.key} fill={chartPalette[index % chartPalette.length]} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(value: number | string, _name: string, payload: any) => {
                                  const numericValue = typeof value === 'number' ? value : Number(value);
                                  const key = payload?.payload?.key as string | undefined;
                                  const label = payload?.payload?.name as string | undefined;
                                  return [formatMetricValue(key ?? '', numericValue), label ?? ''];
                                }} />
                                <Legend
                                  layout="horizontal"
                                  verticalAlign="bottom"
                                  align="center"
                                  iconType="circle"
                                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm text-center px-6">
                              Añade columnas numéricas (por ejemplo, montos o porcentajes) para obtener una lectura visual instantánea.
                            </div>
                          )}
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
                          {annualSecondaryMetric ? `Segundo indicador: ${humanizeKey(annualSecondaryMetric.key)} — ${formatMetricValue(annualSecondaryMetric.key, annualSecondaryMetric.value)}` : 'Registra métricas adicionales para enriquecer este análisis.'}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-800">Detalle de Registros</h3>
                          <p className="text-sm text-slate-500 mt-1">Visualización directa de los campos almacenados en la tabla `año_2026` con navegación horizontal similar al módulo de Pagos.</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {annual2026Data.length > 0 && (
                            <span className="text-xs uppercase tracking-wider text-slate-400">Columnas detectadas: {annualTableColumns.length}</span>
                          )}
                          {canManageRecords && (
                            <button
                              onClick={() => openRecordEditor('año_2026', 'Registro año_2026', annualTableColumns, null, null, 'Revisa los campos clave y evita duplicar identificadores.')}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#B38E5D] text-white text-xs font-semibold shadow hover:bg-[#9c7a4d] transition-colors"
                            >
                              <Plus className="h-4 w-4" />
                              Nuevo registro
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <div className="relative w-full sm:w-80">
                          <Search className="table-filter-icon" aria-hidden="true" />
                          <input
                            type="text"
                            value={tableFilters.annual2026}
                            onChange={(event) => updateTableFilter('annual2026', event.target.value)}
                            placeholder="Filtra por proveedor, contrato o monto"
                            className="table-filter-input"
                          />
                          {tableFilters.annual2026 && (
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F4C3A] hover:text-[#0c3b2d]"
                              onClick={() => updateTableFilter('annual2026', '')}
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px] font-semibold">
                          {annualColumnFiltersCount > 0 && (
                            <button
                              type="button"
                              className="text-[#0F4C3A] hover:text-[#0c3b2d] underline-offset-2 hover:underline"
                              onClick={() => clearColumnFilters('annual2026')}
                            >
                              Limpiar filtros por columna
                            </button>
                          )}
                          <span className="text-slate-500">
                            {formatResultLabel(filteredAnnualData.length)}
                            {tableFilters.annual2026.trim() ? ' · filtro general' : ''}
                            {annualColumnFiltersCount ? ` · ${formatColumnFilterLabel(annualColumnFiltersCount)}` : ''}
                          </span>
                        </div>
                        {renderActiveColumnFilterBadges('annual2026')}
                      </div>
                      <div className="overflow-auto h-[68vh] relative">
                        <table className="text-xs sm:text-sm text-center w-max min-w-full border-collapse">
                          <thead className="uppercase tracking-wider text-white">
                            <tr className="h-14">
                              {(annualColumnsToRender.length ? annualColumnsToRender : annualTableColumns.length ? annualTableColumns : ['sin_datos']).map((column) => {
                                if (column === '__actions') {
                                  return (
                                    <th
                                      key="__actions"
                                      className="px-5 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center"
                                      style={{
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 45,
                                        backgroundColor: '#124836',
                                        color: '#fff',
                                        minWidth: '160px',
                                      }}
                                    >
                                      Acciones
                                    </th>
                                  );
                                }

                                if (!annualTableColumns.length && column === 'sin_datos') {
                                  return (
                                    <th
                                      key="sin_datos"
                                      className="px-5 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center"
                                      style={{ position: 'sticky', top: 0, backgroundColor: '#14532d', color: '#fff' }}
                                    >
                                      Sin datos
                                    </th>
                                  );
                                }

                                const stickyMeta = annualStickyInfo.meta.get(column);
                                const isSticky = Boolean(stickyMeta);
                                const isLastSticky = isSticky && annualLastStickyKey === column;
                                const baseColor = '#14532d';
                                const stickyColor = '#0F3F2E';
                                const headerStyle: React.CSSProperties = {
                                  position: 'sticky',
                                  top: 0,
                                  zIndex: isSticky ? 60 : 50,
                                  backgroundColor: isSticky ? stickyColor : baseColor,
                                  color: '#fff',
                                  minWidth: stickyMeta ? `${stickyMeta.width}px` : '200px',
                                };

                                if (stickyMeta) {
                                  headerStyle.left = stickyMeta.left;
                                  headerStyle.width = `${stickyMeta.width}px`;
                                }

                                if (isLastSticky) {
                                  headerStyle.boxShadow = '6px 0 10px -4px rgba(0,0,0,0.3)';
                                }

                                return (
                                  <th
                                    key={column}
                                    className="px-5 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center"
                                    style={headerStyle}
                                  >
                                    <div className="flex items-center justify-center gap-1 text-white">
                                      <span className="truncate">{humanizeKey(column)}</span>
                                      {renderColumnFilterControl('annual2026', column, humanizeKey(column), annual2026Data)}
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {loadingData ? (
                              <tr>
                                <td colSpan={Math.max(annualColumnsToRender.length || annualTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">Cargando registros...</td>
                              </tr>
                            ) : annual2026Data.length === 0 ? (
                              <tr>
                                <td colSpan={Math.max(annualColumnsToRender.length || annualTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">Conecta registros en la tabla `año_2026` para mostrarlos aquí.</td>
                              </tr>
                            ) : !filteredAnnualData.length ? (
                              <tr>
                                <td colSpan={Math.max(annualColumnsToRender.length || annualTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">Sin coincidencias para el filtro aplicado.</td>
                              </tr>
                            ) : (
                              filteredAnnualData.map((row, rowIndex) => {
                                const rowKey = row.id ?? row.ID ?? row.Id ?? `annual-row-${rowIndex}`;
                                const zebraBackground = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                                const rowStyle = buildRowStyle(zebraBackground);
                                return (
                                  <tr
                                    key={rowKey}
                                    className="group table-row transition-colors"
                                    style={rowStyle}
                                  >
                                    {(annualColumnsToRender.length ? annualColumnsToRender : annualTableColumns).map((column) => {
                                      if (column === '__actions') {
                                        return (
                                          <td
                                            key={`actions-${rowKey}`}
                                            className="px-4 py-3 text-center"
                                            style={{ minWidth: '160px' }}
                                          >
                                            {canManageRecords ? (
                                              <div className="flex justify-center gap-2">
                                                <button
                                                  onClick={() => openRecordEditor('año_2026', 'Registro año_2026', annualTableColumns, row)}
                                                  className="p-1.5 rounded-md text-slate-400 hover:text-[#B38E5D] hover:bg-[#B38E5D]/10 transition-colors"
                                                  title="Editar"
                                                >
                                                  <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteGenericRecord('año_2026', row, 'Registro año_2026')}
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

                                      const stickyMeta = annualStickyInfo.meta.get(column);
                                      const isSticky = Boolean(stickyMeta);
                                      const isLastSticky = isSticky && annualLastStickyKey === column;
                                      const cellStyle: React.CSSProperties = {
                                        minWidth: stickyMeta ? `${stickyMeta.width}px` : '200px',
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

                                      const normalizedColumn = normalizeAnnualKey(column);
                                      const rawValue = row[column];
                                      const isNumericCell = typeof rawValue === 'number';
                                      const isCurrencyColumn = normalizedColumn.includes('monto') || normalizedColumn.includes('importe') || normalizedColumn.includes('total');
                                      const alignmentClass = 'text-center';
                                      const fontClass = isNumericCell || isCurrencyColumn ? 'font-mono' : '';

                                      return (
                                        <td
                                          key={column}
                                          className={`px-5 py-4 text-slate-600 align-top whitespace-pre-wrap break-words ${alignmentClass} ${fontClass} ${isSticky ? 'sticky-cell' : ''}`}
                                          style={cellStyle}
                                        >
                                          {formatTableValue(column, rawValue)}
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
                        Desplázate horizontalmente para revisar todas las columnas del anteproyecto 2026. Las tres primeras permanecen fijas para mantener el contexto.
                      </div>
                    </div>
                 </div>
               )}

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
                        </div>
                        <div className="overflow-auto max-h-[70vh] relative">
                          <table className="min-w-full text-sm text-center border-collapse">
                            <thead>
                              <tr className="uppercase tracking-wider text-white">
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
                                        className="px-5 py-4 text-xs font-semibold border-b border-white/10 text-center"
                                        style={headerStyle}
                                      >
                                        {column.label}
                                      </th>
                                    );
                                  }

                                  return (
                                    <th
                                      key={column.key}
                                      className="px-5 py-4 text-xs font-semibold border-b border-white/10 text-center"
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
                                        const cellClasses = ['px-4', 'py-3', 'text-sm', 'align-top', alignClass, 'transition-colors'];
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

                                        return (
                                          <td
                                            key={column.key}
                                            className={cellClasses.join(' ')}
                                            style={cellStyle}
                                          >
                                            {displayValue}
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
                                       onClick={() => openRecordEditor('control_pagos', 'Control de Pagos', paymentsFieldList, null, null, 'Captura montos con números válidos y respeta el formato de fechas.')}
                           className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#B38E5D] text-white text-xs font-semibold shadow hover:bg-[#9c7a4d] transition-colors"
                         >
                           <Plus className="h-4 w-4" />
                           Nuevo registro
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
                     </div>
                     {/* Contenedor con Scroll Horizontal y Altura Fija */}
                     <div className="overflow-auto h-[70vh] relative">
                       <table className="text-sm text-center w-max min-w-full border-collapse">
                         <thead className="text-white uppercase tracking-wider">
                           <tr className="h-14">
                             {/* COLUMNAS FIJAS - CORNER LOCKING (TOP & LEFT) */}
                             <th className="px-6 py-4 font-bold border-b border-white/20 text-center" style={{ position: 'sticky', left: 0, top: 0, width: '150px', minWidth: '150px', zIndex: 60, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>No. Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'no_contrato', 'No. Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 text-center" style={{ position: 'sticky', left: '150px', top: 0, width: '350px', minWidth: '350px', zIndex: 60, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Objeto del Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'objeto_del_contrato', 'Objeto del Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.3)] text-center" style={{ position: 'sticky', left: '500px', top: 0, width: '250px', minWidth: '250px', zIndex: 60, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Proveedor</span>
                                 {renderColumnFilterControl('controlPagos', 'proveedor', 'Proveedor', paymentsData)}
                               </div>
                             </th>
                             
                             {/* COLUMNAS EN ORDEN DE BASE DE DATOS - STICKY TOP ONLY */}
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Tipo de Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'tipo_de_contrato', 'Tipo de Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Fecha Inicio</span>
                                 {renderColumnFilterControl('controlPagos', 'fecha_de_inicio', 'Fecha Inicio', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Fecha Término</span>
                                 {renderColumnFilterControl('controlPagos', 'fecha_de_termino', 'Fecha Término', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '150px', zIndex: 50, backgroundColor: '#1B4D3E' }}>
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
                                   <th className="px-4 py-4 font-bold text-white border-l border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>{m.label}</span>
                                       {renderColumnFilterControl('controlPagos', baseKey, `Monto ${m.label}`, paymentsData)}
                                     </div>
                                   </th>
                                   <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>Preventivos</span>
                                       {renderColumnFilterControl('controlPagos', `${prefix}_preventivos`, `${m.label} · Preventivos`, paymentsData)}
                                     </div>
                                   </th>
                                   <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>Correctivos</span>
                                       {renderColumnFilterControl('controlPagos', `${prefix}_correctivos`, `${m.label} · Correctivos`, paymentsData)}
                                     </div>
                                   </th>
                                   <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>
                                     <div className="flex items-center justify-center gap-1">
                                       <span>Nota C.</span>
                                       {renderColumnFilterControl('controlPagos', `${prefix}_nota_de_credito`, `${m.label} · Nota de Crédito`, paymentsData)}
                                     </div>
                                   </th>
                                 </React.Fragment>
                               );
                             })}

                             {/* TOTALES FINALES - STICKY TOP ONLY */}
                             <th className="px-6 py-4 font-bold border-l border-white/20 bg-[#1B4D3E] text-center" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Monto Máximo Contrato</span>
                                 {renderColumnFilterControl('controlPagos', 'monto_maximo_contrato', 'Monto Máximo Contrato', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 bg-[#1B4D3E] text-center" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Monto Ejercido</span>
                                 {renderColumnFilterControl('controlPagos', 'monto_ejercido', 'Monto Ejercido', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold text-center border-b border-white/20 bg-[#1B4D3E]" style={{ position: 'sticky', top: 0, minWidth: '200px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Facturas Devengadas (%)</span>
                                 {renderColumnFilterControl('controlPagos', 'facturas_devengadas', 'Facturas Devengadas', paymentsData)}
                               </div>
                             </th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 bg-[#1B4D3E] text-center" style={{ position: 'sticky', top: 0, minWidth: '300px', zIndex: 50 }}>
                               <div className="flex items-center justify-center gap-1">
                                 <span>Observaciones</span>
                                 {renderColumnFilterControl('controlPagos', 'observaciones', 'Observaciones', paymentsData)}
                               </div>
                             </th>
                             {canManageRecords && (
                               <th className="px-6 py-4 font-bold border-b border-white/20 bg-[#1B4D3E] text-center" style={{ position: 'sticky', top: 0, minWidth: '160px', zIndex: 50 }}>Acciones</th>
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
                               <td className="px-6 py-4 font-bold text-slate-800 border-b border-slate-200 text-center sticky-cell" style={{ position: 'sticky', left: 0, width: '150px', minWidth: '150px', zIndex: 40, backgroundColor: 'var(--row-bg, #ffffff)' }}>
                                  {item.no_contrato || '-'}
                               </td>
                               <td className="px-6 py-4 text-slate-600 border-b border-slate-200 whitespace-pre-wrap break-words text-center sticky-cell" style={{ position: 'sticky', left: '150px', width: '350px', minWidth: '350px', zIndex: 40, backgroundColor: 'var(--row-bg, #ffffff)' }}>
                                  {item.objeto_del_contrato || '-'}
                               </td>
                               <td className="px-6 py-4 text-slate-600 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.1)] border-b border-slate-200 whitespace-pre-wrap break-words border-r border-slate-300 text-center sticky-cell" style={{ position: 'sticky', left: '500px', width: '250px', minWidth: '250px', zIndex: 40, backgroundColor: 'var(--row-bg, #ffffff)' }}>
                                  {item.proveedor || '-'}
                               </td>

                               {/* CELDAS GENERALES */}
                               <td className="px-6 py-4 text-slate-600 border-b border-slate-200 text-center">{item.tipo_de_contrato || '-'}</td>
                               <td className="px-6 py-4 font-mono text-xs border-b border-slate-200 text-center">{item.fecha_de_inicio || '-'}</td>
                               <td className="px-6 py-4 font-mono text-xs border-b border-slate-200 text-center">{item.fecha_de_termino || '-'}</td>
                               <td className="px-6 py-4 font-mono border-b border-slate-200 text-center">{formatCurrency(item.mont_max)}</td>

                               {/* CELDAS MENSUALES */}
                               {monthsConfig.map((m) => {
                                 const prefix = m.dbPrefix || m.key; 
                                 const row = item as any; 
                                 const baseVal = m.key === 'sep' ? row['sept'] : row[m.key];
                                 
                                 return (
                                  <React.Fragment key={m.key}>
                                    <td className="px-4 py-4 font-mono font-bold text-slate-700 border-l border-slate-200 bg-emerald-50/30 text-center">{formatCurrency(baseVal)}</td>
                                    <td className="px-4 py-4 font-mono text-xs text-slate-500 bg-emerald-50/30 text-center">{formatCurrency(row[`${prefix}_preventivos`])}</td>
                                    <td className="px-4 py-4 font-mono text-xs text-slate-500 bg-emerald-50/30 text-center">{formatCurrency(row[`${prefix}_correctivos`])}</td>
                                    <td className="px-4 py-4 font-mono text-xs text-red-400 bg-emerald-50/30 text-center">{formatCurrency(row[`${prefix}_nota_de_credito`])}</td>
                                  </React.Fragment>
                                 );
                               })}

                               {/* TOTALES */}
                               <td className="px-6 py-4 font-mono text-slate-500 border-l border-slate-300 bg-slate-100 text-center">{formatCurrency(item.monto_maximo_contrato)}</td>
                               <td className="px-6 py-4 font-mono font-bold text-slate-800 bg-slate-100 text-center">{formatCurrency(item.monto_ejercido)}</td>
                               <td className="px-6 py-4 bg-slate-100 text-center">
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
                               </td>
                               <td className="px-6 py-4 text-xs text-slate-500 whitespace-pre-wrap max-w-xs text-center">{item.observaciones || '-'}</td>
                               {canManageRecords && (
                                 <td className="px-6 py-4 text-center" style={{ minWidth: '160px' }}>
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
                          {canManageRecords && (
                            <button
                              onClick={() => openRecordEditor('estatus_facturas', 'Registro estatus_facturas', invoicesTableColumns, null, null, 'Registra folios, montos y estatus tal como aparecen en los registros existentes.')}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#B38E5D] text-white text-xs font-semibold shadow hover:bg-[#9c7a4d] transition-colors"
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
                      <div className="overflow-auto h-[68vh] relative">
                        <table className="text-xs sm:text-sm text-center w-max min-w-full border-collapse">
                          <thead className="uppercase tracking-wider text-white">
                            <tr className="h-14">
                              {(invoicesColumnsToRender.length ? invoicesColumnsToRender : invoicesTableColumns.length ? invoicesTableColumns : ['sin_datos']).map((column) => {
                                if (column === '__actions') {
                                  return (
                                    <th
                                      key="invoice-actions"
                                      className="px-5 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center"
                                      style={{ position: 'sticky', top: 0, zIndex: 45, backgroundColor: '#14532d', color: '#fff', minWidth: '160px' }}
                                    >
                                      Acciones
                                    </th>
                                  );
                                }

                                if (!invoicesTableColumns.length && column === 'sin_datos') {
                                  return (
                                    <th
                                      key="invoice-empty"
                                      className="px-5 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center"
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
                                    className="px-5 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center"
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
                                            className="px-5 py-4 text-center"
                                            style={{ minWidth: '160px' }}
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

                                      return (
                                        <td
                                          key={column}
                                          className={`px-5 py-4 text-slate-600 align-top whitespace-pre-wrap break-words border-b border-slate-100 ${alignmentClass} ${fontClass} ${isSticky ? 'sticky-cell' : ''}`}
                                          style={cellStyle}
                                        >
                                          {formatTableValue(column, rawValue)}
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
                          {canManageRecords && (
                            <button
                              onClick={() => openRecordEditor('procedimientos_compranet', 'Procedimiento Compranet', compranetTableColumns, null, null, 'Revisa las claves y conserva el identificador único cuando aplique.')}
                              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#B38E5D] text-white text-xs font-semibold shadow hover:bg-[#9c7a4d] transition-colors"
                            >
                              <Plus className="h-4 w-4" />
                              Nuevo registro
                            </button>
                          )}
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
                        <div className="overflow-auto max-h-[70vh] relative">
                          <table className="min-w-full text-sm text-center border-collapse">
                            <thead className="uppercase tracking-wider text-white">
                              <tr className="h-14">
                                {(compranetColumnsToRender.length ? compranetColumnsToRender : compranetTableColumns.length ? compranetTableColumns : ['sin_datos']).map((column, index) => {
                                  if (column === '__actions') {
                                    return (
                                      <th
                                        key="compranet-actions"
                                        className="px-5 py-4 font-semibold whitespace-nowrap border-b border-white/20 text-center"
                                        style={{ position: 'sticky', top: 0, zIndex: 45, backgroundColor: '#0F4C3A', color: '#fff', minWidth: '160px' }}
                                      >
                                        Acciones
                                      </th>
                                    );
                                  }

                                  if (!compranetTableColumns.length && column === 'sin_datos') {
                                    return (
                                      <th
                                        key="compranet-empty"
                                        className="px-5 py-4 font-semibold whitespace-nowrap border-b border-white/20 text-center"
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
                                      className="px-5 py-4 font-semibold whitespace-nowrap border-b border-white/20 text-center"
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
                                              className="px-5 py-3 text-center"
                                              style={{ minWidth: '160px' }}
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
                                        const cellClasses = numeric
                                          ? 'px-5 py-3 text-center font-mono text-slate-600 align-top'
                                          : 'px-5 py-3 text-center text-slate-700 align-top whitespace-pre-wrap break-words';
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

                                        return (
                                          <td key={column} className={`${cellClasses} ${isSticky ? 'sticky-cell' : ''}`.trim()} style={stickyStyle}>
                                            {formatTableValue(column, value)}
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-center">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>Registro</span>
                                {renderColumnFilterControl('pendingOct', 'created_at', 'Registro', procedureStatuses)}
                              </div>
                            </th>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>Contrato</span>
                                {renderColumnFilterControl('pendingOct', 'contrato', 'Contrato', procedureStatuses)}
                              </div>
                            </th>
                            <th className="px-6 py-3 font-semibold text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>Descripción del Servicio</span>
                                {renderColumnFilterControl('pendingOct', 'descripcion', 'Descripción del Servicio', procedureStatuses)}
                              </div>
                            </th>
                            <th className="px-6 py-3 font-semibold text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>Empresa</span>
                                {renderColumnFilterControl('pendingOct', 'empresa', 'Empresa', procedureStatuses)}
                              </div>
                            </th>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>Mes factura / nota</span>
                                {renderColumnFilterControl('pendingOct', 'mes_factura_nota', 'Mes factura / nota', procedureStatuses)}
                              </div>
                            </th>
                            <th className="px-6 py-3 font-semibold text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>Observación de Pago</span>
                                {renderColumnFilterControl('pendingOct', 'observacion_pago', 'Observación de Pago', procedureStatuses)}
                              </div>
                            </th>
                            {canManageRecords && (
                              <th className="px-6 py-3 font-semibold text-center">Acciones</th>
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
                              <td className="px-6 py-4 text-xs text-slate-400 font-mono whitespace-nowrap text-center">{formatDateTime(item.created_at)}</td>
                              <td className="px-6 py-4 text-slate-700 font-semibold text-center">{item.contrato || '-'}</td>
                              <td className="px-6 py-4 text-slate-600 text-sm whitespace-pre-wrap break-words text-center">{item.descripcion || '-'}</td>
                              <td className="px-6 py-4 text-slate-600 text-sm whitespace-pre-wrap break-words text-center">{item.empresa || '-'}</td>
                              <td className="px-6 py-4 text-slate-500 text-xs whitespace-pre-wrap break-words text-center">{normalizeWhitespace(item.mes_factura_nota)}</td>
                              <td className="px-6 py-4 text-slate-600 text-sm whitespace-pre-wrap break-words text-center">{normalizeWhitespace(item.observacion_pago)}</td>
                              {canManageRecords && (
                                <td className="px-6 py-4 text-center">
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
                                aria-pressed={isActive}
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
                          type="button"
                          onClick={() => setIsProceduresCompact((prev) => !prev)}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md font-semibold transition-colors ${isProceduresCompact ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f31]' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#0F4C3A] hover:text-[#0F4C3A]'}`}
                        >
                          {isProceduresCompact ? (
                            <>
                              <Minimize2 className="h-4 w-4" />
                              Vista estándar
                            </>
                          ) : (
                            <>
                              <Maximize2 className="h-4 w-4" />
                              Vista compacta
                            </>
                          )}
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

                                    return (
                                      <td key={column} className={`${cellClasses} ${isSticky ? 'sticky-cell' : ''}`.trim()} style={stickyStyle}>
                                        {isCellEditable ? (
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
                                        ) : (
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
                    value={formState["No."]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Clave CUCOP</label>
                  <input 
                    name="Clave cucop" 
                    value={formState["Clave cucop"]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Servicio</label>
                  <input 
                    name="Nombre del Servicio." 
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
                    value={formState["Subdirección"]} 
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#B38E5D]/50 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Gerencia</label>
                  <input 
                    name="Gerencia" 
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
