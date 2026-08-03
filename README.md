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

## Node.js local sin privilegios de administrador

Si no puedes instalar Node.js globalmente, el repositorio ya incluye una versión portátil en `.node/node-v20.18.0-win-x64/`. Ejecuta los comandos de npm con la ruta completa:

```powershell
.\.node\node-v20.18.0-win-x64\npm.cmd install
.\.node\node-v20.18.0-win-x64\npm.cmd run dev
```

Opcionalmente, abre una consola temporal con las variables configuradas ejecutando `.\.node\node-v20.18.0-win-x64\nodevars.bat` y después usa `npm`/`node` de forma normal dentro de esa ventana.

## Provision required Supabase tables

Si Supabase responde con 404 para `/rest/v1/contracts` o `/rest/v1/commercial_spaces`, ejecuta las migraciones incluidas en este repo:

```bash
supabase db push
```

El comando anterior aplica `supabase/migrations/20251203123000_create_contracts_and_spaces.sql`, que define ambas tablas y las llena con datos de referencia. También puedes copiar ese archivo en el editor SQL de Supabase si prefieres aplicar los cambios manualmente.

## Historial de cambios de registros

- En la aplicación encontrarás la pestaña **Historial**, donde se listan las acciones de creación, actualización y eliminación realizadas por los administradores, con detalle de los campos que cambiaron.
- Para habilitarla, ejecuta en tu proyecto de Supabase el script `scripts/create_change_history_table.sql`. Esto crea la tabla `change_history` y los índices necesarios.
- Verifica que los usuarios con rol `ADMIN` tengan permisos de inserción sobre `public.change_history` para que el dashboard pueda registrar cada operación.
