-- Migración: Cambiar columnas numéricas de pagos_2026 de float4 (real) a double precision
-- Problema: float4 solo tiene ~7 dígitos significativos. Montos como $12,424,719.58
-- se redondeaban a $12,424,700 porque exceden la precisión de float4.
-- Solución: double precision (float8) soporta hasta 15 dígitos significativos.

ALTER TABLE pagos_2026
  ALTER COLUMN "Mont. Max."          TYPE double precision,
  ALTER COLUMN "Monto ejercido"      TYPE double precision,
  ALTER COLUMN "Facturas devengadas" TYPE double precision,

  -- Enero
  ALTER COLUMN "Ene."                TYPE double precision,
  ALTER COLUMN "Ene. Preventivos"    TYPE double precision,
  ALTER COLUMN "Ene. Correctivos"    TYPE double precision,
  ALTER COLUMN "Ene. Nota de Crédito" TYPE double precision,

  -- Febrero
  ALTER COLUMN "Feb."                TYPE double precision,
  ALTER COLUMN "Feb. Preventivos"    TYPE double precision,
  ALTER COLUMN "Feb. Correctivos"    TYPE double precision,
  ALTER COLUMN "Feb. Nota de Crédito" TYPE double precision,

  -- Marzo
  ALTER COLUMN "Mar."                TYPE double precision,
  ALTER COLUMN "Mar. Preventivos"    TYPE double precision,
  ALTER COLUMN "Mar. Correctivos"    TYPE double precision,
  ALTER COLUMN "Mar. Nota de Crédito" TYPE double precision,

  -- Abril
  ALTER COLUMN "Abr."                TYPE double precision,
  ALTER COLUMN "Abr. Preventivos"    TYPE double precision,
  ALTER COLUMN "Abr. Correctivos"    TYPE double precision,
  ALTER COLUMN "Abr. Nota de Crédito" TYPE double precision,

  -- Mayo
  ALTER COLUMN "May."                TYPE double precision,
  ALTER COLUMN "May. Preventivos"    TYPE double precision,
  ALTER COLUMN "May. Correctivos"    TYPE double precision,
  ALTER COLUMN "May. Nota de Crédito" TYPE double precision,

  -- Junio
  ALTER COLUMN "Jun."                TYPE double precision,
  ALTER COLUMN "Jun. Preventivos"    TYPE double precision,
  ALTER COLUMN "Jun. Correctivos"    TYPE double precision,
  ALTER COLUMN "Jun. Nota de Crédito" TYPE double precision,

  -- Julio
  ALTER COLUMN "Jul."                TYPE double precision,
  ALTER COLUMN "Jul. Preventivos"    TYPE double precision,
  ALTER COLUMN "Jul. Correctivos"    TYPE double precision,
  ALTER COLUMN "Jul. Nota de Crédito" TYPE double precision,

  -- Agosto
  ALTER COLUMN "Ago."                TYPE double precision,
  ALTER COLUMN "Ago. Preventivos"    TYPE double precision,
  ALTER COLUMN "Ago. Correctivos"    TYPE double precision,
  ALTER COLUMN "Ago. Nota de Crédito" TYPE double precision,

  -- Septiembre
  ALTER COLUMN "Sept."               TYPE double precision,
  ALTER COLUMN "Sep. Preventivos"    TYPE double precision,
  ALTER COLUMN "Sep. Correctivos"    TYPE double precision,
  ALTER COLUMN "Sep. Nota de Crédito" TYPE double precision,

  -- Octubre
  ALTER COLUMN "Oct."                TYPE double precision,
  ALTER COLUMN "Oct. Preventivos"    TYPE double precision,
  ALTER COLUMN "Oct. Correctivos"    TYPE double precision,
  ALTER COLUMN "Oct. Nota de Crédito" TYPE double precision,

  -- Noviembre
  ALTER COLUMN "Nov."                TYPE double precision,
  ALTER COLUMN "Nov. Preventivos"    TYPE double precision,
  ALTER COLUMN "Nov. Correctivos"    TYPE double precision,
  ALTER COLUMN "Nov. Nota de Crédito" TYPE double precision,

  -- Diciembre
  ALTER COLUMN "Dic."                TYPE double precision,
  ALTER COLUMN "Dic. Preventivos"    TYPE double precision,
  ALTER COLUMN "Dic. Correctivos"    TYPE double precision,
  ALTER COLUMN "Dic. Nota de Crédito" TYPE double precision;
