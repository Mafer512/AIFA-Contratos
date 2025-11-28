/**
 * Minimal Deno typing so the repo's Node-focused TS tooling stops flagging this file.
 * The actual Edge runtime provides the real implementations.
 */
declare const Deno:
  | {
      env: { get(key: string): string | undefined };
      serve?: (handler: (req: Request) => Response | Promise<Response>) => void;
    }
  | undefined;

interface FetchEvent extends Event {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

const serve = (handler: (req: Request) => Response | Promise<Response>) => {
  if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
    Deno.serve(handler);
    return;
  }

  if (typeof addEventListener === "function") {
    addEventListener("fetch", (event: FetchEvent) => {
      event.respondWith(Promise.resolve(handler(event.request)));
    });
    return;
  }

  throw new Error("Edge runtime no disponible para servir la función");
};

const RESEND_API_KEY = typeof Deno !== "undefined" ? Deno.env.get("RESEND_API_KEY") : undefined;
const DEFAULT_TARGET_EMAIL = "isaacazhael161f@gmail.com";

const sendResendEmail = async ({
  targetEmail,
  subject,
  body,
}: {
  targetEmail: string;
  subject: string;
  body: string;
}) => {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY no configurada; se omite el envío real.");
    return { status: "skipped" } as const;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AIFA Contratos <no-reply@aifa-contratos.mx>",
      to: [targetEmail],
      subject,
      text: body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error enviando correo: ${response.status} ${errorText}`);
  }

  return await response.json();
};

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método no permitido" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const name = String(payload?.name ?? "Anónimo");
    const email = String(payload?.email ?? "sin-correo");
    const phone = payload?.phone ? String(payload.phone) : null;
    const message = String(payload?.message ?? "");
    const source = payload?.source ? String(payload.source) : "sin_origen";
    const targetEmail = String(payload?.targetEmail ?? DEFAULT_TARGET_EMAIL);
    const targetPhone = payload?.targetPhone ? String(payload.targetPhone) : "sin teléfono";

    if (!message.trim() || !email.trim()) {
      return new Response(JSON.stringify({ error: "Correo y mensaje son obligatorios." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const subject = "Nueva sugerencia desde AIFA Contratos";
    const body = [
      `Nueva sugerencia capturada en el tablero (${source})`,
      "",
      `Nombre: ${name}`,
      `Correo remitente: ${email}`,
      phone ? `Teléfono: ${phone}` : null,
      "",
      "Mensaje:",
      message,
      "",
      `Contacto preferido: ${targetPhone}`,
    ]
      .filter(Boolean)
      .join("\n");

    const emailResult = await sendResendEmail({ targetEmail, subject, body });

    return new Response(
      JSON.stringify({ message: "Sugerencia procesada", emailResult }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error en send-feedback-email:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
