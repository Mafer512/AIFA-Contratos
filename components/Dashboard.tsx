
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plane, LayoutDashboard, Users, Bell, Search, 
  LogOut, AlertCircle,
  Sparkles, X, Send, FileText, Briefcase, Shield,
  DollarSign, Calendar, Store, PieChart as PieChartIcon,
  TrendingUp, BarChart2, Plus, Save, Loader2, Pencil, Trash2,
  CreditCard, Wallet
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { OperationData, User, Contract, CommercialSpace, PaasItem, PaymentControlItem, ProcedureStatusItem } from '../types';
import { generateOperationalInsight } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

// === COMPONENTE DE LOGO SVG PERSONALIZADO (VERSIÓN COMPACTA) ===
const AifaLogo = ({ className = "h-10 w-auto" }: { className?: string }) => (
  <svg viewBox="0 0 240 120" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="goldGradSmall" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#C5A065" />
        <stop offset="100%" stopColor="#997842" />
      </linearGradient>
      <linearGradient id="greenGradSmall" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#0F4C3A" />
        <stop offset="100%" stopColor="#082E23" />
      </linearGradient>
    </defs>

    {/* Documento/Contrato Base */}
    <path 
      d="M60 20 H 100 L 120 40 V 100 A 5 5 0 0 1 115 105 H 60 A 5 5 0 0 1 55 100 V 25 A 5 5 0 0 1 60 20" 
      fill="white" 
      stroke="url(#greenGradSmall)" 
      strokeWidth="4"
    />
    <path d="M100 20 V 40 H 120" fill="#E2E8F0" stroke="none" />
    
    {/* Avión Estilizado */}
    <path 
      d="M 90 90 C 110 90, 140 60, 160 50 L 190 45 L 180 55 L 165 60 L 195 75 L 185 85 L 150 75 C 130 85, 110 100, 90 90 Z" 
      fill="url(#goldGradSmall)" 
      stroke="white" 
      strokeWidth="2"
    />
    {/* Estela */}
    <path d="M 40 100 Q 80 100 110 80" fill="none" stroke="#9E1B32" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 4"/>
    
    {/* Texto minimalista para dashboard */}
    <text x="135" y="105" fontSize="24" fontWeight="800" fontFamily="Arial" fill="#334155">AIFA</text>
  </svg>
);

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

// Datos de Vuelos (Mock para Operaciones en tiempo real)
const FLIGHT_DATA: OperationData[] = [
  { id: '1', flightNumber: 'AM-492', status: 'On Time', destination: 'Cancún (CUN)', gate: 'B12', time: '14:30', passengerCount: 142 },
  { id: '2', flightNumber: 'VB-201', status: 'Delayed', destination: 'Monterrey (MTY)', gate: 'A04', time: '14:45', passengerCount: 189 },
  { id: '3', flightNumber: 'Y4-882', status: 'Boarding', destination: 'Tijuana (TIJ)', gate: 'C01', time: '15:00', passengerCount: 165 },
  { id: '4', flightNumber: 'DL-120', status: 'On Time', destination: 'Atlanta (ATL)', gate: 'B08', time: '15:15', passengerCount: 210 },
  { id: '5', flightNumber: 'AM-500', status: 'Cancelled', destination: 'Guadalajara (GDL)', gate: '-', time: '15:30', passengerCount: 0 },
  { id: '6', flightNumber: 'UA-773', status: 'Arrived', destination: 'Houston (IAH)', gate: 'B10', time: '14:10', passengerCount: 150 },
];

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [activeContractSubTab, setActiveContractSubTab] = useState<'general' | 'paas' | 'payments' | 'pendingOct'>('general'); 
  
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Database State
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [commercialSpaces, setCommercialSpaces] = useState<CommercialSpace[]>([]);
  const [paasData, setPaasData] = useState<PaasItem[]>([]);
  const [paymentsData, setPaymentsData] = useState<PaymentControlItem[]>([]);
  const [procedureStatuses, setProcedureStatuses] = useState<ProcedureStatusItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // === STATES FOR PAAS RECORD MODAL ===
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // ID si estamos editando, null si es nuevo

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

  // Fetch Data Function (Separated to allow refreshing)
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

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoadingData(true);
        
        // 1. Fetch Contracts
        const { data: contractsData } = await supabase
          .from('contracts')
          .select('*')
          .order('end_date', { ascending: true });
        
        if (contractsData) setContracts(contractsData);
        else setContracts(MOCK_CONTRACTS);

        // 2. Fetch Commercial Spaces
        const { data: spacesData } = await supabase
          .from('commercial_spaces')
          .select('*');

        if (spacesData) setCommercialSpaces(spacesData);
        else setCommercialSpaces(MOCK_SPACES);

        // 3. Fetch PAAS Data
        await fetchPaasData();

        // 4. Fetch Payments Data
        await fetchPaymentsData();

        // 5. Fetch Pending October Payments Observations
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
    setEditingId(null);
    setFormState(initialFormState);
    setIsModalOpen(true);
  };

  const openEditRecordModal = (item: PaasItem) => {
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

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col z-20">
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
           <AifaLogo className="h-10 w-auto mr-3" />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900 leading-tight">AIFA</span>
            <span className="text-xs font-bold text-[#B38E5D] tracking-wider">CONTRATOS</span>
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Resumen' },
            { id: 'contracts', icon: FileText, label: 'Gestión Contratos' },
            { id: 'commercial', icon: Store, label: 'Área Comercial' },
            { id: 'flights', icon: Plane, label: 'Operaciones Aéreas' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
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
      <main className="flex-1 flex flex-col h-full relative overflow-y-auto">
        
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10">
          <div className="flex items-center md:hidden">
            <AifaLogo className="h-8 w-auto mr-2" />
            <span className="font-bold text-slate-800">AIFA CONTRATOS</span>
          </div>

          <div className="hidden md:flex items-center max-w-md w-full bg-slate-100 rounded-lg px-3 py-2 border border-slate-200 focus-within:border-[#B38E5D] focus-within:ring-1 focus-within:ring-[#B38E5D] transition-all">
            <Search className="h-4 w-4 text-slate-400 mr-2" />
            <input 
              type="text" 
              placeholder="Buscar..." 
              className="bg-transparent border-none outline-none text-sm w-full text-slate-700 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-4">
             <button 
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
                  {activeContractSubTab === 'paas' && (
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
                    onClick={() => setActiveContractSubTab('general')}
                    className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'general' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    Listado General
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
                     onClick={() => setActiveContractSubTab('pendingOct')}
                     className={`px-6 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeContractSubTab === 'pendingOct' ? 'border-[#B38E5D] text-[#B38E5D]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      OBSERV A SERV PENDTE DE PAGO OCT.
                    </div>
                  </button>
               </div>
               
               {/* === CONTRACTS: GENERAL LIST === */}
               {activeContractSubTab === 'general' && (
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-4 font-semibold">Proveedor</th>
                            <th className="px-6 py-4 font-semibold">Concepto</th>
                            <th className="px-6 py-4 font-semibold">Monto (MXN)</th>
                            <th className="px-6 py-4 font-semibold">Vigencia</th>
                            <th className="px-6 py-4 font-semibold">Área</th>
                            <th className="px-6 py-4 font-semibold">Estatus</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loadingData ? (
                            <tr><td colSpan={6} className="text-center py-8">Cargando datos...</td></tr>
                          ) : contracts.map((contract) => (
                            <tr key={contract.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-900">{contract.provider_name}<br/><span className="text-xs text-slate-400 font-normal">{contract.contract_number}</span></td>
                              <td className="px-6 py-4 text-slate-600">{contract.service_concept}</td>
                              <td className="px-6 py-4 font-mono text-slate-700">{formatCurrency(contract.amount_mxn || 0)}</td>
                              <td className="px-6 py-4 text-slate-500">
                                  <div className="flex items-center gap-1"><Calendar className="h-3 w-3"/> {contract.end_date}</div>
                              </td>
                              <td className="px-6 py-4 text-slate-600">{contract.area}</td>
                              <td className="px-6 py-4">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                    ${contract.status === 'ACTIVO' ? 'bg-green-100 text-green-800' : 
                                      contract.status === 'POR VENCER' ? 'bg-orange-100 text-orange-800' :
                                      'bg-red-100 text-red-800'}`}>
                                    {contract.status}
                                  </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </div>
               )}

               {/* === CONTRACTS: PAAS 2026 === */}
               {activeContractSubTab === 'paas' && (
                 <div className="animate-fade-in space-y-6">
                    {/* PAAS Stats Header */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                           <div className="absolute right-0 top-0 p-4 opacity-10"><DollarSign className="h-16 w-16 text-slate-400"/></div>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Solicitado 2026</p>
                           <h3 className="text-2xl font-bold text-slate-900 mt-1">
                             {formatCurrency(paasData.reduce((a, b) => a + (b["Monto solicitado anteproyecto 2026"] || 0), 0))}
                           </h3>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                           <div className="absolute right-0 top-0 p-4 opacity-10"><Briefcase className="h-16 w-16 text-[#B38E5D]"/></div>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Modificado</p>
                           <h3 className="text-2xl font-bold text-[#B38E5D] mt-1">
                             {formatCurrency(paasData.reduce((a, b) => a + (b["Modificado"] || 0), 0))}
                           </h3>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                           <div className="absolute right-0 top-0 p-4 opacity-10"><FileText className="h-16 w-16 text-blue-400"/></div>
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Partidas Totales</p>
                           <h3 className="text-3xl font-bold text-slate-900 mt-1">
                              {paasData.length}
                           </h3>
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
                      
                      <div className="bg-slate-900 rounded-xl shadow-lg p-6 text-white flex flex-col justify-between">
                        <div>
                          <h3 className="text-lg font-bold mb-2">Control Presupuestal</h3>
                          <p className="text-slate-400 text-sm mb-6">Visualización basada en la tabla `balance_paas_2026`.</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                             <div className="text-xs text-slate-400">
                                Se muestran los montos solicitados para el anteproyecto 2026 desglosados por Clave Cucop y Servicio.
                             </div>
                        </div>
                      </div>
                    </div>

                    {/* Table Section */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                       <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                              <tr>
                                <th className="px-4 py-3 font-semibold w-16">No.</th>
                                <th className="px-4 py-3 font-semibold">Clave CUCOP</th>
                                <th className="px-4 py-3 font-semibold">Nombre del Servicio</th>
                                <th className="px-4 py-3 font-semibold">Gerencia</th>
                                <th className="px-4 py-3 font-semibold text-right">Monto Solicitado</th>
                                <th className="px-4 py-3 font-semibold text-right">Modificado</th>
                                <th className="px-4 py-3 font-semibold">Justificación</th>
                                <th className="px-4 py-3 font-semibold text-center">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {loadingData ? (
                                <tr><td colSpan={8} className="text-center py-8">Cargando PAAS...</td></tr>
                              ) : paasData.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-8 text-slate-500">No hay registros en el PAAS 2026.</td></tr>
                              ) : paasData.map((item) => (
                                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-slate-500">{item["No."]}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{item["Clave cucop"]}</td>
                                    <td className="px-4 py-3 text-slate-800 font-medium">{item["Nombre del Servicio."]}</td>
                                    <td className="px-4 py-3 text-slate-600 text-xs">{item["Gerencia"]}</td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                                       {formatCurrency(item["Monto solicitado anteproyecto 2026"])}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-500">
                                       {formatCurrency(item["Modificado"])}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-pre-wrap break-words max-w-xs">
                                       {item["Justificación"] || '-'}
                                    </td>
                                    <td className="px-4 py-3">
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
                                    </td>
                                  </tr>
                              ))}
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
                     {/* Contenedor con Scroll Horizontal y Altura Fija */}
                     <div className="overflow-auto h-[70vh] relative">
                       <table className="text-sm text-left w-max min-w-full border-collapse">
                         <thead className="text-white uppercase tracking-wider">
                           <tr className="h-14">
                             {/* COLUMNAS FIJAS - CORNER LOCKING (TOP & LEFT) */}
                             <th className="px-6 py-4 font-bold border-b border-white/20" style={{ position: 'sticky', left: 0, top: 0, width: '150px', minWidth: '150px', zIndex: 60, backgroundColor: '#1B4D3E' }}>No. Contrato</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20" style={{ position: 'sticky', left: '150px', top: 0, width: '350px', minWidth: '350px', zIndex: 60, backgroundColor: '#1B4D3E' }}>Objeto del Contrato</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.3)]" style={{ position: 'sticky', left: '500px', top: 0, width: '250px', minWidth: '250px', zIndex: 60, backgroundColor: '#1B4D3E' }}>Proveedor</th>
                             
                             {/* COLUMNAS EN ORDEN DE BASE DE DATOS - STICKY TOP ONLY */}
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Tipo de Contrato</th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Fecha Inicio</th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Fecha Término</th>
                             <th className="px-6 py-4 font-bold whitespace-nowrap border-b border-white/20" style={{ position: 'sticky', top: 0, minWidth: '150px', zIndex: 50, backgroundColor: '#1B4D3E' }}>Monto Máx.</th>
                             
                             {/* COLUMNAS MENSUALES (GENERADAS DINÁMICAMENTE) - STICKY TOP ONLY */}
                             {monthsConfig.map(m => (
                               <React.Fragment key={m.key}>
                                 <th className="px-4 py-4 font-bold text-white border-l border-white/20 text-center" style={{ position: 'sticky', top: 0, minWidth: '120px', zIndex: 50, backgroundColor: '#2D6A4F' }}>{m.label}</th>
                                 <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>Preventivos</th>
                                 <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>Correctivos</th>
                                 <th className="px-4 py-4 font-medium text-xs text-emerald-100 border-b border-white/20" style={{ position: 'sticky', top: 0, minWidth: '100px', zIndex: 50, backgroundColor: '#2D6A4F' }}>Nota C.</th>
                               </React.Fragment>
                             ))}

                             {/* TOTALES FINALES - STICKY TOP ONLY */}
                             <th className="px-6 py-4 font-bold border-l border-white/20 bg-[#1B4D3E]" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>Monto Máximo Contrato</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 bg-[#1B4D3E]" style={{ position: 'sticky', top: 0, minWidth: '180px', zIndex: 50 }}>Monto Ejercido</th>
                             <th className="px-6 py-4 font-bold text-center border-b border-white/20 bg-[#1B4D3E]" style={{ position: 'sticky', top: 0, minWidth: '200px', zIndex: 50 }}>Facturas Devengadas (%)</th>
                             <th className="px-6 py-4 font-bold border-b border-white/20 bg-[#1B4D3E]" style={{ position: 'sticky', top: 0, minWidth: '300px', zIndex: 50 }}>Observaciones</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-200 bg-white">
                           {loadingData ? (
                             <tr><td colSpan={60} className="text-center py-8">Cargando Pagos...</td></tr>
                           ) : paymentsData.length === 0 ? (
                              <tr><td colSpan={60} className="text-center py-8 text-slate-500">No hay registros de pagos.</td></tr>
                           ) : paymentsData.map((item, idx) => (
                             <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                               
                               {/* CELDAS FIJAS - 3 PRIMERAS COLUMNAS */}
                               <td className="px-6 py-4 font-bold text-slate-800 border-b border-slate-200" style={{ position: 'sticky', left: 0, width: '150px', minWidth: '150px', zIndex: 40, backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                                  {item.no_contrato || '-'}
                               </td>
                               <td className="px-6 py-4 text-slate-600 border-b border-slate-200 whitespace-pre-wrap break-words" style={{ position: 'sticky', left: '150px', width: '350px', minWidth: '350px', zIndex: 40, backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                                  {item.objeto_del_contrato || '-'}
                               </td>
                               <td className="px-6 py-4 text-slate-600 shadow-[6px_0_10px_-4px_rgba(0,0,0,0.1)] border-b border-slate-200 whitespace-pre-wrap break-words border-r border-slate-300" style={{ position: 'sticky', left: '500px', width: '250px', minWidth: '250px', zIndex: 40, backgroundColor: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                                  {item.proveedor || '-'}
                               </td>

                               {/* CELDAS GENERALES */}
                               <td className="px-6 py-4 text-slate-600 border-b border-slate-200">{item.tipo_de_contrato || '-'}</td>
                               <td className="px-6 py-4 font-mono text-xs border-b border-slate-200">{item.fecha_de_inicio || '-'}</td>
                               <td className="px-6 py-4 font-mono text-xs border-b border-slate-200">{item.fecha_de_termino || '-'}</td>
                               <td className="px-6 py-4 font-mono border-b border-slate-200">{formatCurrency(item.mont_max)}</td>

                               {/* CELDAS MENSUALES */}
                               {monthsConfig.map((m) => {
                                 const prefix = m.dbPrefix || m.key; 
                                 const row = item as any; 
                                 const baseVal = m.key === 'sep' ? row['sept'] : row[m.key];
                                 
                                 return (
                                  <React.Fragment key={m.key}>
                                    <td className="px-4 py-4 font-mono font-bold text-slate-700 border-l border-slate-200 bg-emerald-50/30">{formatCurrency(baseVal)}</td>
                                    <td className="px-4 py-4 font-mono text-xs text-slate-500 bg-emerald-50/30">{formatCurrency(row[`${prefix}_preventivos`])}</td>
                                    <td className="px-4 py-4 font-mono text-xs text-slate-500 bg-emerald-50/30">{formatCurrency(row[`${prefix}_correctivos`])}</td>
                                    <td className="px-4 py-4 font-mono text-xs text-red-400 bg-emerald-50/30">{formatCurrency(row[`${prefix}_nota_de_credito`])}</td>
                                  </React.Fragment>
                                 );
                               })}

                               {/* TOTALES */}
                               <td className="px-6 py-4 font-mono text-slate-500 border-l border-slate-300 bg-slate-100">{formatCurrency(item.monto_maximo_contrato)}</td>
                               <td className="px-6 py-4 font-mono font-bold text-slate-800 bg-slate-100">{formatCurrency(item.monto_ejercido)}</td>
                               <td className="px-6 py-4 bg-slate-100">
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
                               <td className="px-6 py-4 text-xs text-slate-500 whitespace-pre-wrap max-w-xs">{item.observaciones || '-'}</td>
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
                      <div className="text-xs text-slate-500">
                        Total registros: <span className="font-semibold text-slate-700">{procedureStatuses.length}</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap">Registro</th>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap">Contrato</th>
                            <th className="px-6 py-3 font-semibold">Descripción del Servicio</th>
                            <th className="px-6 py-3 font-semibold">Empresa</th>
                            <th className="px-6 py-3 font-semibold whitespace-nowrap">Mes factura / nota</th>
                            <th className="px-6 py-3 font-semibold">Observación de Pago</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {loadingData ? (
                            <tr><td colSpan={6} className="text-center py-8">Cargando observaciones...</td></tr>
                          ) : procedureStatuses.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-8 text-slate-500">No hay observaciones registradas.</td></tr>
                          ) : procedureStatuses.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 text-xs text-slate-400 font-mono whitespace-nowrap">{formatDateTime(item.created_at)}</td>
                              <td className="px-6 py-4 text-slate-700 font-semibold">{item.contrato || '-'}</td>
                              <td className="px-6 py-4 text-slate-600 text-sm whitespace-pre-wrap break-words">{item.descripcion || '-'}</td>
                              <td className="px-6 py-4 text-slate-600 text-sm whitespace-pre-wrap break-words">{item.empresa || '-'}</td>
                              <td className="px-6 py-4 text-slate-500 text-xs whitespace-pre-wrap break-words">{normalizeWhitespace(item.mes_factura_nota)}</td>
                              <td className="px-6 py-4 text-slate-600 text-sm whitespace-pre-wrap break-words">{normalizeWhitespace(item.observacion_pago)}</td>
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

          {/* Flights Tab (Fallback to static data for now) */}
          {activeTab === 'flights' && (
            <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-6">Operaciones del Día</h1>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-6 py-3">Vuelo</th>
                        <th className="px-6 py-3">Estado</th>
                        <th className="px-6 py-3">Destino</th>
                        <th className="px-6 py-3">Puerta</th>
                        <th className="px-6 py-3">Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {FLIGHT_DATA.map((flight) => (
                        <tr key={flight.id}>
                          <td className="px-6 py-4 font-medium">{flight.flightNumber}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium
                              ${flight.status === 'On Time' ? 'bg-green-100 text-green-700' : 
                                flight.status === 'Delayed' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>
                              {flight.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">{flight.destination}</td>
                          <td className="px-6 py-4">{flight.gate}</td>
                          <td className="px-6 py-4">{flight.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </div>
          )}

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

      {/* AI Chat Overlay */}
      {isAiChatOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end pointer-events-none">
          <div className="absolute inset-0 bg-black/20 pointer-events-auto backdrop-blur-sm" onClick={() => setIsAiChatOpen(false)}></div>
          <div className="w-full sm:w-96 bg-white h-[80vh] sm:h-[calc(100vh-2rem)] sm:mr-4 shadow-2xl rounded-t-2xl sm:rounded-2xl flex flex-col pointer-events-auto border border-slate-200">
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
