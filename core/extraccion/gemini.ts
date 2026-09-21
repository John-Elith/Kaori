/**
 * Google Gemini, para redactar obligaciones y actividades.
 *
 * Se habla directamente con su API REST, sin librería: son dos llamadas
 * (listar modelos y generar) y así el instalador no carga con otro paquete.
 *
 * **El modelo se elige solo.** Google retira modelos cada pocos meses; con uno
 * fijado a mano, Kaori dejaría de redactar un día cualquiera con un error que
 * nadie entendería. Se pregunta a la API qué modelos ofrece esa clave y se usa
 * el «Flash» estable más reciente, que es el rápido y barato —el que tiene
 * cuota gratuita—, sobrado para redactar párrafos de una a tres líneas.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta';

/** Si la lista de modelos no dice nada útil. */
export const MODELO_POR_DEFECTO = 'gemini-2.5-flash';

type Fetch = typeof fetch;

/** Esquema JSON sencillo, como el que se le da a Claude. */
export type Esquema = {
  type: string;
  properties?: Record<string, Esquema>;
  items?: Esquema;
  required?: readonly string[];
  description?: string;
  additionalProperties?: boolean;
};

export type PedidoGemini = { sistema: string; usuario: string; esquema: Esquema };

/**
 * El esquema en el dialecto de Gemini: los tipos en mayúsculas y sin
 * `additionalProperties`, que su API no acepta.
 */
export function aEsquemaGemini(e: Esquema): Record<string, unknown> {
  const r: Record<string, unknown> = { type: e.type.toUpperCase() };
  if (e.description) r.description = e.description;
  if (e.items) r.items = aEsquemaGemini(e.items);
  if (e.properties) {
    r.properties = Object.fromEntries(
      Object.entries(e.properties).map(([k, v]) => [k, aEsquemaGemini(v)]),
    );
  }
  if (e.required) r.required = [...e.required];
  return r;
}

/**
 * De los modelos de la cuenta, el «gemini-X.Y-flash» estable de versión más
 * alta. Se descartan las variantes (lite, preview, exp, tts, imagen…) porque
 * cambian o desaparecen sin aviso.
 */
export function mejorModelo(nombres: string[]): string {
  let mejor: { nombre: string; version: number } | null = null;
  for (const completo of nombres) {
    const nombre = completo.replace(/^models\//, '');
    const m = /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(nombre);
    if (!m) continue;
    const version = Number(m[1]);
    if (!mejor || version > mejor.version) mejor = { nombre, version };
  }
  return mejor?.nombre ?? MODELO_POR_DEFECTO;
}

/** Traduce los errores de la API a algo que se pueda leer y resolver. */
function errorLegible(estado: number, mensaje: string): Error {
  if (/api key not valid|API_KEY_INVALID/i.test(mensaje) || estado === 401) {
    return new Error(
      'La clave de Gemini no es válida. Cópiela otra vez desde Google AI Studio ' +
        '(aistudio.google.com → Get API key) y guárdela en Ajustes.',
    );
  }
  if (estado === 403) {
    return new Error(
      'Google no deja usar Gemini con esa clave. Compruebe en Google AI Studio que la ' +
        'clave esté activa y que la API de Gemini esté habilitada para su proyecto.',
    );
  }
  if (estado === 429) {
    return new Error(
      'Se agotó por ahora la cuota de Gemini de esa clave. Espere un minuto y vuelva a ' +
        'intentarlo; si pasa a menudo, la cuota gratuita se queda corta para este uso.',
    );
  }
  return new Error(`Gemini respondió con un error (${estado}): ${mensaje}`);
}

async function llamar(fetchImpl: Fetch, url: string, clave: string, cuerpo?: unknown) {
  let r: Response;
  try {
    r = await fetchImpl(url, {
      method: cuerpo ? 'POST' : 'GET',
      headers: {
        // En cabecera y no en la dirección: así la clave no queda escrita en
        // ningún registro de direcciones visitadas.
        'x-goog-api-key': clave,
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new Error('No hay conexión con Gemini. Compruebe la conexión a internet.');
  }
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!r.ok) throw errorLegible(r.status, j.error?.message ?? r.statusText);
  return j;
}

/** Un modelo elegido por clave, para no preguntar en cada redacción. */
const elegidos = new Map<string, Promise<string>>();

export function elegirModelo(clave: string, fetchImpl: Fetch = fetch): Promise<string> {
  let p = elegidos.get(clave);
  if (!p) {
    p = (async () => {
      const j = (await llamar(fetchImpl, `${API}/models?pageSize=1000`, clave)) as {
        models?: { name: string; supportedGenerationMethods?: string[] }[];
      };
      const utiles = (j.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name);
      return mejorModelo(utiles);
    })();
    // Un fallo —clave mala, sin conexión— no se queda guardado: se reintentará.
    p.catch(() => elegidos.delete(clave));
    elegidos.set(clave, p);
  }
  return p;
}

/** Pide a Gemini un JSON con la forma del esquema y lo devuelve ya leído. */
export async function generarJson<T>(
  clave: string,
  pedido: PedidoGemini,
  fetchImpl: Fetch = fetch,
): Promise<T> {
  const modelo = await elegirModelo(clave, fetchImpl);
  const j = (await llamar(fetchImpl, `${API}/models/${modelo}:generateContent`, clave, {
    systemInstruction: { parts: [{ text: pedido.sistema }] },
    contents: [{ role: 'user', parts: [{ text: pedido.usuario }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: aEsquemaGemini(pedido.esquema),
      temperature: 0.4,
    },
  })) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };

  const rechazo = () =>
    new Error(
      'Gemini no quiso redactar este texto. Pruebe a reformular la indicación o use la otra IA.',
    );
  if (j.promptFeedback?.blockReason) throw rechazo();

  const c = j.candidates?.[0];
  if (c?.finishReason && ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(c.finishReason)) {
    throw rechazo();
  }
  if (c?.finishReason === 'MAX_TOKENS') {
    throw new Error('La respuesta de Gemini quedó incompleta. Pida menos obligaciones de una vez.');
  }

  const texto = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!texto) throw new Error('Gemini no devolvió texto.');
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error('La respuesta de Gemini no tenía el formato esperado.');
  }
}
