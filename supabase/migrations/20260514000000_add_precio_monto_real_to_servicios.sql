-- Migración: Añadir columnas Método Cálculo Monto Máximo, Precio Prevaleciente
-- y Monto Real Ejecutado a las tablas estatus_servicios_2026 y estatus_2026

ALTER TABLE IF EXISTS public.estatus_servicios_2026
  ADD COLUMN IF NOT EXISTS "Método Cálculo Monto Máximo" text,
  ADD COLUMN IF NOT EXISTS precio_prevaleciente double precision,
  ADD COLUMN IF NOT EXISTS monto_real_ejecutado double precision;

ALTER TABLE IF EXISTS public.estatus_2026
  ADD COLUMN IF NOT EXISTS "Método Cálculo Monto Máximo" text,
  ADD COLUMN IF NOT EXISTS precio_prevaleciente double precision,
  ADD COLUMN IF NOT EXISTS monto_real_ejecutado double precision;
