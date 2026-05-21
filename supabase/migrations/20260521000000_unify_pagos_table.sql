-- Migración: Unificar tabla pagos_2026 en una tabla histórica "pagos"
--
-- Objetivo: En lugar de crear una tabla separada por año (pagos_2026, pagos_2027...),
-- usamos una sola tabla "pagos" con una columna "anio" que identifica el año del registro.
-- Esto evita duplicación de estructura y facilita el histórico multi-año en la aplicación.
--
-- Pasos:
--   1. Agregar columna "anio" a pagos_2026 con valor por defecto 2026
--   2. Asegurarse de que todos los registros existentes tengan anio = 2026
--   3. Renombrar la tabla de pagos_2026 a pagos

-- Paso 1: Agregar columna anio
ALTER TABLE pagos_2026
  ADD COLUMN IF NOT EXISTS anio integer NOT NULL DEFAULT 2026;

-- Paso 2: Marcar todos los registros existentes como año 2026 (por si acaso)
UPDATE pagos_2026 SET anio = 2026 WHERE anio IS NULL OR anio != 2026;

-- Paso 3: Renombrar la tabla
ALTER TABLE pagos_2026 RENAME TO pagos;

-- Nota: Para agregar datos de un año nuevo (ej. 2027), simplemente inserta filas
-- en la tabla "pagos" con anio = 2027. No es necesario crear una nueva tabla.
