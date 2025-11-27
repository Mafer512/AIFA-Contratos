export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface OperationData {
  id: string;
  flightNumber: string;
  status: 'On Time' | 'Delayed' | 'Boarding' | 'Arrived' | 'Cancelled';
  destination: string;
  gate: string;
  time: string;
  passengerCount: number;
}

export interface Contract {
  id: string;
  provider_name: string;
  service_concept: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  amount_mxn: number;
  status: 'ACTIVO' | 'POR VENCER' | 'VENCIDO' | 'CANCELADO';
  area: string;
}

export interface CommercialSpace {
  id: string;
  space_code: string;
  tenant_name: string | null;
  category: string;
  monthly_rent: number;
  occupancy_status: 'OCUPADO' | 'DISPONIBLE' | 'MANTENIMIENTO';
}

export interface PaasItem {
  id: number; 
  "No.": string | null;
  "Clave cucop": string | null;
  "Nombre del Servicio.": string | null; 
  "Subdirección": string | null;
  "Gerencia": string | null;
  "Monto solicitado anteproyecto 2026": number | null;
  "Modificado": number | null;
  "Justificación": string | null;
}

// Interfaz Completa basada en la tabla SQL control_pagos
export interface PaymentControlItem {
  id: number;
  no_contrato: string | null;
  objeto_del_contrato: string | null;
  proveedor: string | null;
  tipo_de_contrato: string | null;
  fecha_de_inicio: string | null;
  fecha_de_termino: string | null;
  mont_max: number | null;
  
  // Enero
  ene: number | null;
  ene_preventivos: number | null;
  ene_correctivos: number | null;
  ene_nota_de_credito: number | null;
  
  // Febrero
  feb: number | null;
  feb_preventivos: number | null;
  feb_correctivos: number | null;
  feb_nota_de_credito: number | null;

  // Marzo
  mar: number | null;
  mar_preventivos: number | null;
  mar_correctivos: number | null;
  mar_nota_de_credito: number | null;

  // Abril
  abr: number | null;
  abr_preventivos: number | null;
  abr_correctivos: number | null;
  abr_nota_de_credito: number | null;

  // Mayo
  may: number | null;
  may_preventivos: number | null;
  may_correctivos: number | null;
  may_nota_de_credito: number | null;

  // Junio
  jun: number | null;
  jun_preventivos: number | null;
  jun_correctivos: number | null;
  jun_nota_de_credito: number | null;

  // Julio
  jul: number | null;
  jul_preventivos: number | null;
  jul_correctivos: number | null;
  jul_nota_de_credito: number | null;

  // Agosto
  ago: number | null;
  ago_preventivos: number | null;
  ago_correctivos: number | null;
  ago_nota_de_credito: number | null;

  // Septiembre (Nota: SQL usa 'sept' para base y 'sep_' para resto)
  sept: number | null; 
  sep_preventivos: number | null;
  sep_correctivos: number | null;
  sep_nota_de_credito: number | null;

  // Octubre
  oct: number | null;
  oct_preventivos: number | null;
  oct_correctivos: number | null;
  oct_nota_de_credito: number | null;

  // Noviembre
  nov: number | null;
  nov_preventivos: number | null;
  nov_correctivos: number | null;
  nov_nota_de_credito: number | null;

  // Diciembre
  dic: number | null;
  dic_preventivos: number | null;
  dic_correctivos: number | null;
  dic_nota_de_credito: number | null;

  // Totales
  monto_maximo_contrato: number | null;
  monto_ejercido: number | null;
  facturas_devengadas: number | null; // Porcentaje
  observaciones: string | null;
}

export interface ProcedureStatusItem {
  id: number;
  created_at: string;
  contrato: string | null;
  descripcion: string | null;
  empresa: string | null;
  mes_factura_nota: string | null;
  observacion_pago: string | null;
}

export enum Screen {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD'
}

export interface KPIData {
  label: string;
  value: string;
  trend: number; // Percentage change
  icon: string; // Lucide icon name
}

export interface ChangeDiff {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ChangeLogEntry {
  id: number;
  table_name: string;
  record_id: string | number | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_by: string | null;
  changed_by_name: string | null;
  changed_by_role?: string | null;
  changes: ChangeDiff[] | null;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}
