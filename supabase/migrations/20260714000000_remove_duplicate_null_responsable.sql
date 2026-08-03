-- ============================================================
-- Migración: Eliminar filas duplicadas en estatus_2026 donde
--            "Responsable" IS NULL pero existe otra fila con el
--            mismo "Nombre del Servicio." que SÍ tiene responsable.
-- ============================================================

-- 1) Ver cuántos duplicados existen antes de borrar:
SELECT "Nombre del Servicio.", COUNT(*) AS apariciones
FROM public.estatus_2026
GROUP BY "Nombre del Servicio."
HAVING COUNT(*) > 1
ORDER BY apariciones DESC;

-- 2) Elimina la copia sin responsable cuando ya existe una con responsable asignado.
DELETE FROM public.estatus_2026 a
USING public.estatus_2026 b
WHERE a."Responsable" IS NULL
  AND b."Responsable" IS NOT NULL
  AND TRIM(LOWER(a."Nombre del Servicio."::text)) = TRIM(LOWER(b."Nombre del Servicio."::text))
  AND a."ID" <> b."ID"
  AND a."Nombre del Servicio." IS NOT NULL
  AND TRIM(a."Nombre del Servicio."::text) <> '';

-- 3) Verificar resultado: debe devolver 0 filas si la limpieza fue completa.
SELECT "Nombre del Servicio.", COUNT(*) AS apariciones
FROM public.estatus_2026
GROUP BY "Nombre del Servicio."
HAVING COUNT(*) > 1
ORDER BY apariciones DESC;
