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
2. Crea un archivo `.env.local` (o usa tus variables de entorno preferidas) con la configuración del proxy seguro:

   ```bash
   GEMINI_API_KEY=tu_llave_privada
   AI_PROXY_PORT=8787          # opcional
   VITE_AI_PROXY_URL=/api/gemini-insight
   AI_PROXY_TARGET=http://localhost:8787
   ```

   - `GEMINI_API_KEY` **solo la consumirá el proxy**; nunca se expone en el bundle del frontend.
   - `VITE_AI_PROXY_URL` indica al cliente cuál endpoint consumir.
   - `AI_PROXY_TARGET` permite que Vite proxyee las solicitudes al servidor Express durante el desarrollo.

3. En una terminal inicia el proxy seguro:
   `npm run ai-proxy`

4. En otra terminal arranca el frontend:
   `npm run dev`

5. Abre la aplicación en: [http://localhost:3000](http://localhost:3000)
