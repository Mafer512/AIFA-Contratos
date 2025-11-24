import { GoogleGenAI } from "@google/genai";

// Helper to get the API key from Vite env values
const getApiKey = (): string | undefined => {
  const value = import.meta.env?.VITE_GEMINI_API_KEY;
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const generateOperationalInsight = async (
  contextData: string,
  userQuery: string
): Promise<string> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return "Error: API Key no configurada.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Contexto: Eres un Asistente de Operaciones y Contratos con IA para el Aeropuerto Internacional Felipe Ángeles (AIFA).
Resumen de Datos del Dashboard: ${contextData}

Consulta del Usuario: ${userQuery}

Instrucciones: Proporciona una respuesta concisa, profesional y accionable en ESPAÑOL, adecuada para un gerente de contratos u operaciones. Mantén la respuesta bajo 50 palabras a menos que se pida un análisis detallado.`
            },
          ],
        },
      ],
    });

    return response.text ?? "No se pudo generar una respuesta.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "No se pueden generar insights en este momento. Verifique la conexión.";
  }
};