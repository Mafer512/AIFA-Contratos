import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.AI_PROXY_PORT || 8787;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

if (!GEMINI_API_KEY) {
  console.warn('[gemini-proxy] GEMINI_API_KEY no está configurada. Las peticiones fallarán hasta que definas esta variable.');
}

app.post('/gemini-insight', async (req, res) => {
  try {
    const { contextData, userQuery } = req.body ?? {};

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'El proxy de IA no tiene configurada la variable GEMINI_API_KEY.' });
    }

    if (!contextData || !userQuery) {
      return res.status(400).json({ error: 'contextData y userQuery son requeridos.' });
    }

    const prompt = `Contexto: Eres un Asistente de Operaciones y Contratos con IA para el Aeropuerto Internacional Felipe Ángeles (AIFA).
Resumen de Datos del Dashboard: ${contextData}

Consulta del Usuario: ${userQuery}

Instrucciones: Proporciona una respuesta concisa, profesional y accionable en ESPAÑOL, adecuada para un gerente de contratos u operaciones. Mantén la respuesta bajo 50 palabras a menos que se pida un análisis detallado.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      const message = payload?.error?.message ?? 'Error inesperado al invocar Gemini.';
      return res.status(response.status).json({ error: message });
    }

    const textParts = payload?.candidates?.[0]?.content?.parts ?? [];
    const result = textParts
      .map((part) => part?.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    return res.json({ result: result || 'No se pudo generar una respuesta.' });
  } catch (error) {
    console.error('[gemini-proxy] Error inesperado', error);
    return res.status(500).json({ error: 'Error interno en el proxy de IA.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[gemini-proxy] Servidor escuchando en http://localhost:${PORT}`);
});
