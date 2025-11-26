
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  LogOut, AlertCircle,
  X, FileText, Briefcase,
  DollarSign, PieChart as PieChartIcon,
  TrendingUp, BarChart2, Plus, Save, Loader2, Pencil, Trash2,
  CreditCard, Calendar, FileSpreadsheet, Menu, History
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
import { User, Contract, CommercialSpace, PaasItem, PaymentControlItem, ProcedureStatusItem, UserRole, ChangeLogEntry, ChangeDiff } from '../types';
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

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [activeContractSubTab, setActiveContractSubTab] = useState<'annual2026' | 'paas' | 'payments' | 'invoices' | 'compranet' | 'pendingOct'>('annual2026'); 
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Database State
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [commercialSpaces, setCommercialSpaces] = useState<CommercialSpace[]>([]);
  const [annual2026Data, setAnnual2026Data] = useState<Record<string, any>[]>([]);
  const [paasData, setPaasData] = useState<PaasItem[]>([]);
  const [paymentsData, setPaymentsData] = useState<PaymentControlItem[]>([]);
  const [invoicesData, setInvoicesData] = useState<Record<string, any>[]>([]);
  const [compranetData, setCompranetData] = useState<Record<string, any>[]>([]);
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

  const PRIMARY_KEY_HINTS: Record<string, string> = {
    'año_2026': 'id',
    'balance_paas_2026': 'id',
    'control_pagos': 'id',
    'estatus_facturas': 'id',
    'procedimientos_compranet': 'id',
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
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
      const parsed = parsePotentialDate(trimmed);
      return parsed ? parsed.toISOString().slice(0, 10) : trimmed;
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
      return trimmed;
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

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoadingData(true);
        
        await fetchContractsData();
        await fetchCommercialSpacesData();
        await fetchAnnual2026Data();
        await fetchPaasData();
        await fetchPaymentsData();
        await fetchInvoicesData();
        await fetchCompranetData();
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

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '-';
    try {
      return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
    } catch (err) {
      console.error('Error formatting date:', err);
      return value;
    }
  };

  const formatDateOnly = (value: string | Date | null | undefined) => {
    if (!value) return '-';
    try {
      const dateValue = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(dateValue.getTime())) return typeof value === 'string' ? value : '-';
      return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(dateValue);
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
          return normalizeWhitespace(String(item));
        })
        .filter((item): item is string => Boolean(item && item.trim().length));

      return printableItems.length ? printableItems.join('\n') : '-';
    }
    if (value instanceof Date) return formatDateTime(value.toISOString());
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (err) {
        console.error('Error stringifying value:', err);
        return String(value);
      }
    }
    return normalizeWhitespace(String(value));
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
      case 'balance_paas_2026':
        return paasData as unknown as Record<string, any>[];
      case 'control_pagos':
        return paymentsData as unknown as Record<string, any>[];
      case 'estatus_facturas':
        return invoicesData as Record<string, any>[];
      case 'procedimientos_compranet':
        return compranetData as Record<string, any>[];
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
      if (typeof value === 'string') return normalizeWhitespace(value);
      if (typeof value === 'number') {
        return shouldFormatAsCurrency(key) ? formatCurrency(value) : formatNumber(value);
      }
      if (value instanceof Date) return value.toISOString().slice(0, 10);
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
          return 'AAAA-MM-DD';
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

    if ((!insights || !insights.sampleText) && type === 'date') {
      message = `${message} Usa formato AAAA-MM-DD.`.trim();
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

    return [...paasData]
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
  }, [paasData]);

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
      icon: Calendar,
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
        icon: Calendar,
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
  ]);

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
                    <Calendar className="h-4 w-4 text-[#0F4C3A]" />
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
                                      {diffList.map((change) => (
                                        <tr key={`${entry.id}-${change.field}`} className="border-t border-slate-100">
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
                                      ))}
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
                   <Calendar className="h-4 w-4" />
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
               </div>

               {/* === CONTRACTS: ANÁLISIS AÑO 2026 === */}
               {activeContractSubTab === 'annual2026' && (
                 <div className="animate-fade-in space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10">
                          <Calendar className="h-16 w-16 text-slate-400" />
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
                                    {humanizeKey(column)}
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
                            ) : !annual2026Data.length ? (
                              <tr>
                                <td colSpan={Math.max(annualColumnsToRender.length || annualTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">Conecta registros en la tabla `año_2026` para mostrarlos aquí.</td>
                              </tr>
                            ) : (
                              annual2026Data.map((row, rowIndex) => {
                                const rowKey = row.id ?? row.ID ?? row.Id ?? `annual-row-${rowIndex}`;
                                const zebraBackground = rowIndex % 2 === 0 ? 'white' : '#f8fafc';
                                return (
                                  <tr key={rowKey} className={`group transition-colors ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-emerald-50/60`}>
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
                                        cellStyle.backgroundColor = zebraBackground;
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
                                          className={`px-5 py-4 text-slate-600 align-top whitespace-pre-wrap break-words ${alignmentClass} ${fontClass}`}
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

                                  return (
                                    <th
                                      key={column.key}
                                      className="px-5 py-4 text-xs font-semibold border-b border-white/10 text-center"
                                      style={headerStyle}
                                    >
                                      {column.label}
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
                              ) : paasOrderedRows.length === 0 ? (
                                <tr>
                                  <td colSpan={paasTableConfig.columns.length} className="py-8 text-center text-slate-500">No hay registros en el PAAS 2026.</td>
                                </tr>
                              ) : (
                                <>
                                  {paasOrderedRows.map((item, rowIndex) => {
                                  const isStriped = rowIndex % 2 === 0;
                                  const rowBackground = isStriped ? '#ffffff' : '#f8fafc';

                                  return (
                                    <tr
                                      key={item.id}
                                      className={`${isStriped ? 'bg-white' : 'bg-slate-50'} hover:bg-[#B38E5D]/10 transition-colors`}
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
                                          cellStyle.position = 'sticky';
                                          cellStyle.left = stickyInfo.left;
                                          cellStyle.width = `${stickyInfo.width}px`;
                                          cellStyle.zIndex = 30;
                                          cellStyle.backgroundColor = rowBackground;
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
                     {/* Contenedor con Scroll Horizontal y Altura Fija */}
                     <div className="overflow-auto h-[70vh] relative">
                       <table className="text-sm text-center w-max min-w-full border-collapse">
                         <thead className="text-white uppercase tracking-wider">
                           <tr className="h-14">
                             {/* COLUMNAS FIJAS - CORNER LOCKING (TOP & LEFT) */}
                             <th className="px-6 py-4 font-bold border-b border-white/20 text-center" style={{ position: 'sticky', left: 0, top: 0, width: '150px', minWidth: '150px', zIndex: 60, backgroundColor: '#1B4D3E' }}>No. Contrato</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 text-center" style={{ position: 'sticky', left: '150px', top: 0, width: '350px', minWidth: '350px', zIndex: 60, backgroundColor: '#1B4D3E' }}>Objeto del Contrato</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.3)] text-center" style={{ position: 'sticky', left: '500px', top: 0, width: '250px', minWidth: '250px', zIndex: 60, backgroundColor: '#1B4D3E' }}>Proveedor</th>
                             
                             {/* COLUMNAS EN ORDEN DE BASE DE DATOS - STICKY TOP ONLY */}
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Tipo de Contrato</th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Fecha Inicio</th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Fecha Término</th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '150px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Monto Máx.</th>
                             
                             {/* COLUMNAS MENSUALES (GENERADAS DINÁMICAMENTE) - STICKY TOP ONLY */}
                             {monthsConfig.map(m => (
                               <React.Fragment key={m.key}>
                                 <th className="px-4 py-4 font-bold text-white border-l border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#2D6A4F' }}>{m.label}</th>
                                 <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>Preventivos</th>
                                 <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>Correctivos</th>
                                 <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>Nota C.</th>
                               </React.Fragment>
                             ))}

                             {/* TOTALES FINALES - STICKY TOP ONLY */}
                             <th className="px-6 py-4 font-bold border-l border-white/20 bg-[#1B4D3E] text-center" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>Monto Máximo Contrato</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 bg-[#1B4D3E] text-center" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>Monto Ejercido</th>
                             <th className="px-6 py-4 font-bold text-center border-b border-white/20 bg-[#1B4D3E]" style={{ position: 'sticky', top: 0, minWidth: '200px', zIndex: 50 }}>Facturas Devengadas (%)</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 bg-[#1B4D3E] text-center" style={{ position: 'sticky', top: 0, minWidth: '300px', zIndex: 50 }}>Observaciones</th>
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
                           ) : paymentsData.map((item, idx) => (
                             <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                               
                               {/* CELDAS FIJAS - 3 PRIMERAS COLUMNAS */}
                               <td className="px-6 py-4 font-bold text-slate-800 border-b border-slate-200 text-center" style={{ position: 'sticky', left: 0, width: '150px', minWidth: '150px', zIndex: 40, backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                                  {item.no_contrato || '-'}
                               </td>
                               <td className="px-6 py-4 text-slate-600 border-b border-slate-200 whitespace-pre-wrap break-words text-center" style={{ position: 'sticky', left: '150px', width: '350px', minWidth: '350px', zIndex: 40, backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                                  {item.objeto_del_contrato || '-'}
                               </td>
                               <td className="px-6 py-4 text-slate-600 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.1)] border-b border-slate-200 whitespace-pre-wrap break-words border-r border-slate-300 text-center" style={{ position: 'sticky', left: '500px', width: '250px', minWidth: '250px', zIndex: 40, backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
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
                           ))}
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

                                return (
                                  <th
                                    key={column}
                                    className="px-5 py-4 font-bold whitespace-nowrap border-b border-white/20 text-center"
                                    style={headerStyle}
                                  >
                                    {humanizeKey(column)}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {loadingData ? (
                              <tr>
                                <td colSpan={Math.max(invoicesColumnsToRender.length || invoicesTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">Cargando registros...</td>
                              </tr>
                            ) : !invoicesData.length ? (
                              <tr>
                                <td colSpan={Math.max(invoicesColumnsToRender.length || invoicesTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">Conecta datos en `estatus_facturas` para mostrarlos aquí.</td>
                              </tr>
                            ) : (
                              invoicesData.map((row, rowIndex) => {
                                const rowKey = row.id ?? row.ID ?? row.Id ?? row.numero ?? `invoice-row-${rowIndex}`;
                                const zebraBackground = rowIndex % 2 === 0 ? 'white' : '#f8fafc';
                                return (
                                  <tr key={rowKey} className={`group transition-colors ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-emerald-50/60`}>
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
                                        cellStyle.backgroundColor = zebraBackground;
                                      }

                                      if (isLastSticky) {
                                        cellStyle.boxShadow = '6px 0 8px -4px rgba(15,60,40,0.25)';
                                      }

                                      return (
                                        <td
                                          key={column}
                                          className={`px-5 py-4 text-slate-600 align-top whitespace-pre-wrap break-words border-b border-slate-100 ${alignmentClass} ${fontClass}`}
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

                                  return (
                                    <th
                                      key={column}
                                      className="px-5 py-4 font-semibold whitespace-nowrap border-b border-white/20 text-center"
                                      style={headerStyle}
                                    >
                                      {humanizeKey(column)}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {loadingData ? (
                                <tr>
                                  <td colSpan={Math.max(compranetColumnsToRender.length || compranetTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">
                                    Cargando procedimientos...
                                  </td>
                                </tr>
                              ) : !compranetData.length ? (
                                <tr>
                                  <td colSpan={Math.max(compranetColumnsToRender.length || compranetTableColumns.length || 1, 1)} className="text-center py-10 text-slate-500">
                                    No hay registros de procedimientos en Compranet.
                                  </td>
                                </tr>
                              ) : (
                                compranetData.map((row, rowIndex) => {
                                  const rowKey = row.id ?? `compranet-row-${rowIndex}`;
                                  const isStriped = rowIndex % 2 === 0;
                                  return (
                                    <tr key={rowKey} className={isStriped ? 'bg-white hover:bg-emerald-50/40 transition-colors' : 'bg-slate-50 hover:bg-emerald-50/40 transition-colors'}>
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
                                          stickyStyle.backgroundColor = isStriped ? '#ffffff' : '#f8fafc';
                                          stickyStyle.zIndex = 30;
                                          if (colIndex === compranetStickyWidths.length - 1) {
                                            stickyStyle.boxShadow = '6px 0 10px -4px rgba(15,76,58,0.18)';
                                          }
                                        }

                                        return (
                                          <td key={column} className={cellClasses} style={stickyStyle}>
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
                                padAngle={3}
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-center">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap text-center">Registro</th>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap text-center">Contrato</th>
                            <th className="px-6 py-3 font-semibold text-center">Descripción del Servicio</th>
                            <th className="px-6 py-3 font-semibold text-center">Empresa</th>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap text-center">Mes factura / nota</th>
                            <th className="px-6 py-3 font-semibold text-center">Observación de Pago</th>
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
                          ) : procedureStatuses.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
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
                          ))}
                        </tbody>
                      </table>
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
                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                          value={value}
                          onChange={(event) => updateRecordEditorValue(field.key, event.target.value)}
                          className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#B38E5D]/40 ${isReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                          placeholder={field.placeholder}
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
