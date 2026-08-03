-- Migración: Asegurar que usuarios autenticados puedan eliminar registros de la tabla pagos
--
-- Problema detectado: Los registros eliminados reaparecen al volver a la vista de Pagos 2026.
-- Causa probable: Si RLS (Row Level Security) está habilitado en la tabla "pagos" sin una
-- política de DELETE, Supabase silenciosamente no elimina ninguna fila (sin error).
--
-- Solución: Agregar políticas permisivas para usuarios autenticados en la tabla pagos.
-- Si RLS no está habilitado, estas políticas no tienen efecto y no rompen nada.

-- Habilitar RLS solo si aún no está habilitado (esto permite que las políticas apliquen)
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

-- Política SELECT: usuarios autenticados pueden leer todos los registros
DROP POLICY IF EXISTS "Authenticated users can read pagos" ON public.pagos;
CREATE POLICY "Authenticated users can read pagos"
  ON public.pagos FOR SELECT
  TO authenticated
  USING (true);

-- Política INSERT: usuarios autenticados pueden insertar registros
DROP POLICY IF EXISTS "Authenticated users can insert pagos" ON public.pagos;
CREATE POLICY "Authenticated users can insert pagos"
  ON public.pagos FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Política UPDATE: usuarios autenticados pueden actualizar registros
DROP POLICY IF EXISTS "Authenticated users can update pagos" ON public.pagos;
CREATE POLICY "Authenticated users can update pagos"
  ON public.pagos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Política DELETE: usuarios autenticados pueden eliminar registros
DROP POLICY IF EXISTS "Authenticated users can delete pagos" ON public.pagos;
CREATE POLICY "Authenticated users can delete pagos"
  ON public.pagos FOR DELETE
  TO authenticated
  USING (true);
