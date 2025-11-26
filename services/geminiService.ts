const resolveProxyEndpoint = (): string => {
  const configured = import.meta.env?.VITE_AI_PROXY_URL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }
  return '/api/gemini-insight';
};

export const generateOperationalInsight = async (
  contextData: string,
  userQuery: string
): Promise<string> => {
  try {
    const endpoint = resolveProxyEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contextData, userQuery }),
    });

    if (!response.ok) {
      let errorMessage = 'No se pueden generar insights en este momento. Verifique la conexión.';
      try {
        const errorPayload = await response.json();
        if (errorPayload?.error) {
          errorMessage = typeof errorPayload.error === 'string'
            ? errorPayload.error
            : errorPayload.error.message ?? errorMessage;
        }
      } catch (parseError) {
        console.error('AI proxy error payload parse', parseError);
      }
      return errorMessage;
    }

    const payload = await response.json();
    if (payload?.result && typeof payload.result === 'string') {
      return payload.result;
    }
    return 'No se pudo generar una respuesta.';
  } catch (error) {
    console.error("AI proxy request error:", error);
    return "No se pueden generar insights en este momento. Verifique la conexión.";
  }
};