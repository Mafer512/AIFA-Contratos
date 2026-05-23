-- Migration: create servicios_historicos table
-- Stores historical service records per year, entered manually by users.

CREATE TABLE IF NOT EXISTS public.servicios_historicos (
  id               SERIAL PRIMARY KEY,
  anio             INTEGER NOT NULL,
  no_contrato      TEXT,
  objeto_contrato  TEXT,
  proveedor        TEXT,
  tipo_contrato    TEXT,
  subdirección     TEXT,
  gerencia         TEXT,
  fecha_inicio     TEXT,
  fecha_termino    TEXT,
  monto_maximo     NUMERIC(18,2) DEFAULT 0,
  ene              NUMERIC(18,2) DEFAULT 0,
  feb              NUMERIC(18,2) DEFAULT 0,
  mar              NUMERIC(18,2) DEFAULT 0,
  abr              NUMERIC(18,2) DEFAULT 0,
  may              NUMERIC(18,2) DEFAULT 0,
  jun              NUMERIC(18,2) DEFAULT 0,
  jul              NUMERIC(18,2) DEFAULT 0,
  ago              NUMERIC(18,2) DEFAULT 0,
  sep              NUMERIC(18,2) DEFAULT 0,
  oct              NUMERIC(18,2) DEFAULT 0,
  nov              NUMERIC(18,2) DEFAULT 0,
  dic              NUMERIC(18,2) DEFAULT 0,
  observaciones    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.servicios_historicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read servicios_historicos"
  ON public.servicios_historicos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert servicios_historicos"
  ON public.servicios_historicos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update servicios_historicos"
  ON public.servicios_historicos FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete servicios_historicos"
  ON public.servicios_historicos FOR DELETE
  USING (auth.role() = 'authenticated');
