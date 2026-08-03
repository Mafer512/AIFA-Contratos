-- ============================================================
-- Migración: Añadir columnas de fechas por estatus a estatus_2026
-- para construcción de Diagrama de Gantt por servicio y general.
--
-- Cada estatus tiene 2 fechas: inicio (remisión/envío) y fin (recepción/término).
-- La diferencia entre ambas = duración de esa etapa del proceso.
-- ============================================================

ALTER TABLE IF EXISTS public.estatus_2026

  -- --------------------------------------------------------
  -- 1. Elaboración de anexo técnico, administrativo y apéndices
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha inicio elaboración anexo técnico"      DATE,
  ADD COLUMN IF NOT EXISTS "Fecha término elaboración anexo técnico"     DATE,

  -- --------------------------------------------------------
  -- 2. En IM
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha remisión IM"                           DATE,
  ADD COLUMN IF NOT EXISTS "Fecha recepción IM"                          DATE,

  -- --------------------------------------------------------
  -- 3. Recepción de IM
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha recepción IM área técnica"             DATE,
  ADD COLUMN IF NOT EXISTS "Fecha remisión área técnica"                 DATE,

  -- --------------------------------------------------------
  -- 4. Validación de IM por el área técnica
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha inicio validación IM"                  DATE,
  ADD COLUMN IF NOT EXISTS "Fecha término validación IM"                 DATE,

  -- --------------------------------------------------------
  -- 5. Envío de carpeta validada a RM
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha recepción carpeta validada"            DATE,
  ADD COLUMN IF NOT EXISTS "Fecha remisión carpeta RM"                   DATE,

  -- --------------------------------------------------------
  -- 6. En revisión DEFENSA
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha envío revisión DEFENSA"                DATE,
  ADD COLUMN IF NOT EXISTS "Fecha recepción revisión DEFENSA"            DATE,

  -- --------------------------------------------------------
  -- 7. Atención de observaciones DEFENSA
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha inicio atención observaciones"         DATE,
  ADD COLUMN IF NOT EXISTS "Fecha remisión observaciones"                DATE,

  -- --------------------------------------------------------
  -- 8. Documentación actualizada para publicación
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha inicio documentación publicación"      DATE,
  ADD COLUMN IF NOT EXISTS "Fecha remisión documentación publicación"    DATE,

  -- --------------------------------------------------------
  -- 9. Publicado Compras MX
  -- --------------------------------------------------------
  ADD COLUMN IF NOT EXISTS "Fecha inicio publicación"                    DATE,
  ADD COLUMN IF NOT EXISTS "Fecha fallo"                                 DATE;

-- ============================================================
-- Comentarios de columnas (referencia para el Gantt)
-- ============================================================
COMMENT ON COLUMN public.estatus_2026."Fecha inicio elaboración anexo técnico"   IS 'Gantt E1 inicio — Elaboración de anexo técnico';
COMMENT ON COLUMN public.estatus_2026."Fecha término elaboración anexo técnico"  IS 'Gantt E1 fin — Elaboración de anexo técnico';
COMMENT ON COLUMN public.estatus_2026."Fecha remisión IM"                         IS 'Gantt E2 inicio — En IM';
COMMENT ON COLUMN public.estatus_2026."Fecha recepción IM"                        IS 'Gantt E2 fin — En IM';
COMMENT ON COLUMN public.estatus_2026."Fecha recepción IM área técnica"           IS 'Gantt E3 inicio — Recepción de IM';
COMMENT ON COLUMN public.estatus_2026."Fecha remisión área técnica"               IS 'Gantt E3 fin — Recepción de IM';
COMMENT ON COLUMN public.estatus_2026."Fecha inicio validación IM"                IS 'Gantt E4 inicio — Validación de IM por el área técnica';
COMMENT ON COLUMN public.estatus_2026."Fecha término validación IM"               IS 'Gantt E4 fin — Validación de IM por el área técnica';
COMMENT ON COLUMN public.estatus_2026."Fecha recepción carpeta validada"          IS 'Gantt E5 inicio — Envío de carpeta validada a RM';
COMMENT ON COLUMN public.estatus_2026."Fecha remisión carpeta RM"                 IS 'Gantt E5 fin — Envío de carpeta validada a RM';
COMMENT ON COLUMN public.estatus_2026."Fecha envío revisión DEFENSA"              IS 'Gantt E6 inicio — En revisión DEFENSA';
COMMENT ON COLUMN public.estatus_2026."Fecha recepción revisión DEFENSA"          IS 'Gantt E6 fin — En revisión DEFENSA';
COMMENT ON COLUMN public.estatus_2026."Fecha inicio atención observaciones"       IS 'Gantt E7 inicio — Atención de observaciones DEFENSA';
COMMENT ON COLUMN public.estatus_2026."Fecha remisión observaciones"              IS 'Gantt E7 fin — Atención de observaciones DEFENSA';
COMMENT ON COLUMN public.estatus_2026."Fecha inicio documentación publicación"    IS 'Gantt E8 inicio — Documentación actualizada para publicación';
COMMENT ON COLUMN public.estatus_2026."Fecha remisión documentación publicación"  IS 'Gantt E8 fin — Documentación actualizada para publicación';
COMMENT ON COLUMN public.estatus_2026."Fecha inicio publicación"                  IS 'Gantt E9 inicio — Publicado Compras MX';
COMMENT ON COLUMN public.estatus_2026."Fecha fallo"                               IS 'Gantt E9 fin — Publicado Compras MX (fecha de fallo)';
