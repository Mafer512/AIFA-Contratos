
import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, Bell,
  LogOut, AlertCircle,
  Sparkles, X, Send, FileText, Briefcase,
  DollarSign, PieChart as PieChartIcon,
  TrendingUp, BarChart2, Plus, Save, Loader2, Pencil, Trash2,
  CreditCard, Calendar, FileSpreadsheet, Menu
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
import { User, Contract, CommercialSpace, PaasItem, PaymentControlItem, ProcedureStatusItem, UserRole } from '../types';
import { generateOperationalInsight } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

const chartPalette = ['#B38E5D', '#2563EB', '#0F4C3A', '#9E1B32', '#7C3AED', '#F97316', '#14B8A6', '#64748B'];
const invoicesPalette = ['#0F4C3A', '#B38E5D', '#2563EB', '#F97316', '#9E1B32', '#7C3AED', '#14B8A6', '#64748B'];

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
  
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
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

  // === STATES FOR PAAS RECORD MODAL ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // ID si estamos editando, null si es nuevo

  type GenericRecordEditorConfig = {
    table: string;
    title: string;
    isNew: boolean;
    primaryKey?: string | null;
    editorValue: string;
    note?: string;
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

    setRecordEditorError(null);
    setRecordEditorConfig({
      table,
      title,
      isNew: !row,
      primaryKey: resolvedKey,
      editorValue: JSON.stringify(payload, null, 2),
      note,
    });
  };

  const handleSaveGenericRecord = async () => {
    if (!recordEditorConfig) return;
    if (!requireManagePermission()) return;

    try {
      setRecordEditorSaving(true);
      setRecordEditorError(null);

      const parsed = JSON.parse(recordEditorConfig.editorValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Proporcione un objeto JSON válido para guardar el registro.');
      }

      const table = recordEditorConfig.table;

      if (recordEditorConfig.isNew) {
        const { error } = await supabase.from(table).insert([parsed]);
        if (error) throw error;
      } else {
        const resolvedKey = resolvePrimaryKey(parsed, table, recordEditorConfig.primaryKey);
        if (!resolvedKey) {
          throw new Error('No se encontró un campo de clave primaria en el objeto (por ejemplo "id").');
        }
        const resolvedValue = parsed[resolvedKey];
        if (resolvedValue === undefined || resolvedValue === null || resolvedValue === '') {
          throw new Error('El valor de la clave primaria no puede estar vacío.');
        }

        const { error } = await supabase
          .from(table)
          .update(parsed)
          .eq(resolvedKey, resolvedValue);
        if (error) throw error;
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

    const { error } = await supabase
      .from(table)
      .delete()
      .eq(resolvedKey, resolvedValue);

    if (error) {
      alert(`Error al eliminar: ${error.message}`);
      return;
    }

    await refreshTable(table);
  };

  const closeRecordEditor = () => {
    if (recordEditorSaving) return;
    setRecordEditorConfig(null);
  };

  const updateRecordEditorValue = (value: string) => {
    setRecordEditorError(null);
    setRecordEditorConfig((prev) => (prev ? { ...prev, editorValue: value } : prev));
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

      } catch (e) {
        console.error("Exception fetching data", e);
      } finally {
        setLoadingData(false);
      }
    };

    fetchAllData();
  }, []);

  const handleAiQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;

    setIsAiThinking(true);
    setAiResponse(''); 

    // Totales basados en las columnas nuevas
    const totalSolicitadoPaas = paasData.reduce((acc, curr) => acc + (curr["Monto solicitado anteproyecto 2026"] || 0), 0);
    const totalModificadoPaas = paasData.reduce((acc, curr) => acc + (curr["Modificado"] || 0), 0);
    // Usar monto_maximo_contrato para pagos si está disponible
    const totalPagado = paymentsData.reduce((acc, curr) => acc + (curr.monto_ejercido || 0), 0);
    const pendingProcedureRecords = procedureStatuses.length;

    const context = `
      Resumen de Base de Datos AIFA:
      - Contratos Activos: ${contracts.filter(c => c.status === 'ACTIVO').length}
      - Presupuesto PAAS 2026 Solicitado Total: $${totalSolicitadoPaas.toLocaleString()} MXN
      - Presupuesto PAAS 2026 Modificado: $${totalModificadoPaas.toLocaleString()} MXN
      - Total Pagado (Control Pagos): $${totalPagado.toLocaleString()} MXN
      - Número de Partidas en PAAS: ${paasData.length}
      - Locales Comerciales Ocupados: ${commercialSpaces.filter(s => s.occupancy_status === 'OCUPADO').length}
      - Servicios con observaciones de pago (Octubre): ${pendingProcedureRecords}
    `;

    const response = await generateOperationalInsight(context, aiQuery);
    setAiResponse(response);
    setIsAiThinking(false);
  };

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
      let error;
      
      if (editingId) {
        // UPDATE EXISTING RECORD
        const { error: updateError } = await supabase
          .from('balance_paas_2026')
          .update(formState)
          .eq('id', editingId);
        error = updateError;
      } else {
        // CREATE NEW RECORD
        const { error: insertError } = await supabase
          .from('balance_paas_2026')
          .insert([formState]);
        error = insertError;
      }

      if (error) throw error;

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
      const { error } = await supabase
        .from('balance_paas_2026')
        .delete()
        .eq('id', id);

      if (error) throw error;

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

  // Total Ejecutado vs Total Contratado
  const totalContratado = paymentsData.reduce((acc, item) => acc + (item.mont_max || 0), 0);
  const totalEjercido = paymentsData.reduce((acc, item) => acc + (item.monto_ejercido || 0), 0);
  const budgetExecutionData = [
    { name: 'Ejercido', value: totalEjercido },
    { name: 'Restante', value: Math.max(0, totalContratado - totalEjercido) }
  ];

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

  const formatMetricValue = (key: string, value: number | null | undefined) => {
    if (value === null || value === undefined) return '--';
    return shouldFormatAsCurrency(key) ? formatCurrency(value) : formatNumber(value);
  };

  const formatPercent = (value: number) => {
    const normalized = Number.isFinite(value) ? Math.max(-1, value) : 0;
    return new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 }).format(normalized);
  };

  const humanizeKey = (rawKey: string) => (
    rawKey
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );

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
    return Sparkles;
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
            { id: 'contracts', icon: FileText, label: 'Gestión Contratos' }
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
            <button 
              type="button"
              onClick={() => setIsAiChatOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-full shadow hover:bg-slate-800 transition-all"
            >
              <Sparkles className="h-4 w-4 text-[#B38E5D]" />
              <span className="hidden sm:inline">Asistente IA</span>
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-600 relative">
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-8 space-y-8">
          
          {/* === CONTENIDO DINÁMICO SEGÚN TAB === */}
          
          {activeTab === 'overview' && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Resumen Ejecutivo</h1>
                <p className="text-slate-500 mt-1">Panorama general de contratos y operaciones.</p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Contratos Activos', value: contracts.filter(c => c.status === 'ACTIVO').length.toString(), trend: '+2', icon: Briefcase, color: 'blue' },
                  { label: 'Monto PAAS 2026', value: '$' + (paasData.reduce((acc, c) => acc + (c["Monto solicitado anteproyecto 2026"] || 0), 0) / 1000000).toFixed(1) + 'M', trend: 'Anteproyecto', icon: DollarSign, color: 'green' },
                  { label: 'Partidas PAAS', value: paasData.length.toString(), trend: 'Total', icon: FileText, color: 'orange' },
                  { label: 'Pagado (Control)', value: '$' + (paymentsData.reduce((acc, c) => acc + (c.monto_ejercido || 0), 0) / 1000000).toFixed(1) + 'M', trend: 'Total', icon: CreditCard, color: 'purple' },
                ].map((kpi, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">{kpi.value}</h3>
                      </div>
                      <div className={`p-2 rounded-lg bg-${kpi.color}-50`}>
                        <kpi.icon className={`h-5 w-5 text-${kpi.color}-600`} />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                        <span className="font-medium text-slate-600">{kpi.trend}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Estatus de Contratos Vigentes</h3>
                    <div className="h-64 w-full flex items-center justify-center">
                        {loadingData ? <p>Cargando...</p> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={contractStatusData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {contractStatusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#22c55e' : index === 1 ? '#f59e0b' : '#ef4444'} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800">Top Partidas (Mayor Monto)</h3>
                    </div>
                    <div className="overflow-y-auto max-h-80">
                        {loadingData ? <div className="p-4">Cargando...</div> : (
                            <div className="divide-y divide-slate-100">
                                {[...paasData]
                                   .sort((a, b) => (b["Monto solicitado anteproyecto 2026"] || 0) - (a["Monto solicitado anteproyecto 2026"] || 0))
                                   .slice(0, 5)
                                   .map((item, idx) => (
                                    <div key={idx} className="p-4 hover:bg-slate-50">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-semibold text-sm text-slate-800 truncate w-2/3">{item["Nombre del Servicio."]}</span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                                                {formatCurrency(item["Monto solicitado anteproyecto 2026"])}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 truncate">{item["Gerencia"]}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
              </div>
            </>
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
                              onClick={() => openRecordEditor('año_2026', 'Registro año_2026', annualTableColumns, null, null, 'Utiliza JSON válido y respeta los nombres de las columnas existentes.')}
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
                           onClick={() => openRecordEditor('control_pagos', 'Control de Pagos', paymentsFieldList, null, null, 'Asegúrate de incluir campos numéricos con valores válidos.')} 
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
                              onClick={() => openRecordEditor('estatus_facturas', 'Registro estatus_facturas', invoicesTableColumns, null, null, 'Incluye los campos requeridos para seguimiento de facturas.')} 
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
                              onClick={() => openRecordEditor('procedimientos_compranet', 'Procedimiento Compranet', compranetTableColumns, null, null, 'Revisa los campos de clave y conserva el identificador único si aplica.')} 
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
                            onClick={() => openRecordEditor('estatus_procedimiento', 'Observación de Pago', procedureFieldList, null, null, 'Agrega contratos, empresa y observación en formato JSON válido.')}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in"
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
              <textarea
                value={recordEditorConfig.editorValue}
                onChange={(event) => updateRecordEditorValue(event.target.value)}
                spellCheck={false}
                className="w-full h-full min-h-[320px] bg-white border border-slate-200 rounded-xl p-4 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#B38E5D]/40 resize-vertical"
                placeholder={'{\n  "campo": "valor"\n}'}
              />
              {recordEditorError && (
                <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                  {recordEditorError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-slate-500">
                Ajusta el contenido en formato JSON válido. Mantén las claves existentes para evitar errores de base de datos.
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

      {/* AI Chat Overlay */}
      {isAiChatOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsAiChatOpen(false)}
          ></div>
          <div className="relative w-full sm:w-96 bg-white h-[80vh] sm:h-[calc(100vh-2rem)] sm:mr-4 shadow-2xl rounded-t-2xl sm:rounded-2xl flex flex-col border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center rounded-t-2xl">
              <h3 className="font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#B38E5D]"/> Asistente</h3>
              <button onClick={() => setIsAiChatOpen(false)}><X className="h-5 w-5"/></button>
            </div>
            <div className="flex-1 p-4 bg-slate-50 overflow-y-auto">
              {aiResponse ? (
                <div className="bg-white p-3 rounded-lg shadow-sm text-sm">{aiResponse}</div>
              ) : (
                <p className="text-center text-slate-400 text-sm mt-10">
                   Soy tu analista de contratos inteligente.<br/>
                   Pregúntame: "¿Qué contratos vencen este mes?" o "¿Cuál es la ocupación comercial actual?"
                </p>
              )}
            </div>
            <div className="p-4 bg-white border-t">
              <form onSubmit={handleAiQuery} className="flex gap-2">
                <input 
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  placeholder="Escribe tu consulta..."
                  className="flex-1 bg-slate-100 border-none rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-[#B38E5D] outline-none"
                />
                <button 
                  type="submit" 
                  disabled={isAiThinking}
                  className="bg-[#B38E5D] text-white p-2 rounded-lg hover:bg-[#9c7a4d] disabled:opacity-50"
                >
                  {isAiThinking ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"/> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
