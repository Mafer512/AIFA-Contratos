-- ============================================================
-- Migración: Agregar columna Responsable a estatus_2026
--            y campo responsable a profiles
-- ============================================================

-- 1. Columna en la tabla de servicios
ALTER TABLE public.estatus_2026
  ADD COLUMN IF NOT EXISTS "Responsable" text DEFAULT NULL;

-- 2. Campo en profiles para ligar usuario ↔ responsable
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS responsable text DEFAULT NULL;

-- 3. Mapeo inicial usuario → responsable (ajusta los IDs si cambian)
--    Ejecuta primero: SELECT id, full_name FROM public.profiles ORDER BY full_name;
--    Luego actualiza cada fila con su responsable correspondiente.

UPDATE public.profiles SET responsable = 'ADRIANA PEREZ MALDONADO'
  WHERE full_name ILIKE '%adriana%perez%';

UPDATE public.profiles SET responsable = 'LILIÁN ELIZABETH PÉREZ GONZÁLEZ'
  WHERE full_name ILIKE '%lilian%' OR full_name ILIKE '%lilibeeth%';

UPDATE public.profiles SET responsable = 'GILBERTO AYALA RAMÍREZ'
  WHERE full_name ILIKE '%gilberto%ayala%';

UPDATE public.profiles SET responsable = 'DAYREN FLORICELA DE LEÓN GONZÁLEZ'
  WHERE full_name ILIKE '%dayren%';

UPDATE public.profiles SET responsable = 'ESMERALDA EMILY RODRÍGUEZ MARTÍNEZ'
  WHERE full_name ILIKE '%emily%' OR full_name ILIKE '%esmeralda%rodriguez%';

UPDATE public.profiles SET responsable = 'IRMA KARINA VARGAS GARCÍA'
  WHERE full_name ILIKE '%irma%' OR full_name ILIKE '%karina%vargas%';

UPDATE public.profiles SET responsable = 'MONSERRAT ALONSO MARTÍNEZ'
  WHERE full_name ILIKE '%monserrat%alonso%';

UPDATE public.profiles SET responsable = 'SANDY OSIRIS MENDONZA LEONÍDEZ'
  WHERE full_name ILIKE '%sandy%' OR full_name ILIKE '%osiris%';

-- 4. Super admin = responsable NULL → ve todos los servicios.
--    Para hacer a alguien super admin: UPDATE public.profiles SET responsable = NULL WHERE id = '...';
--    Para restricción normal:          UPDATE public.profiles SET responsable = 'NOMBRE' WHERE id = '...';

-- 5. Verificar resultado
SELECT full_name, role, responsable FROM public.profiles ORDER BY full_name;
