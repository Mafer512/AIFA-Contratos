<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1a03pCclDdCeABd3RfBFYyn2E6E9yyrzF

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Start the development server:
   `npm run dev`
3. Abre la aplicación en: [http://localhost:3000](http://localhost:3000)

## Historial de cambios de registros

- En la aplicación encontrarás la pestaña **Historial**, donde se listan las acciones de creación, actualización y eliminación realizadas por los administradores, con detalle de los campos que cambiaron.
- Para habilitarla, ejecuta en tu proyecto de Supabase el script `scripts/create_change_history_table.sql`. Esto crea la tabla `change_history` y los índices necesarios.
- Verifica que los usuarios con rol `ADMIN` tengan permisos de inserción sobre `public.change_history` para que el dashboard pueda registrar cada operación.
