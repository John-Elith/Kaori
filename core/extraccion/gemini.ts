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

export type PedidoGemini = {
  sistema: string;
  usuario: string;
  esquema: Esquema;
  /** Un documento que leer: la imagen o el PDF de un contrato, en base64. */
  archivo?: { mime: string; datos: string };
};

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
 * Los modelos de la cuenta que sirven para redactar, del preferido al último:
 * los «gemini-X.Y-flash» estables de versión más alta primero, después los
 * «flash-lite». Se descartan las variantes (preview, exp, tts, imagen…) porque
 * cambian o desaparecen sin aviso.
 *
 * Hace falta más de uno: cuando un modelo está saturado, Google responde 503
 * «high demand» durante minutos seguidos, y el de al lado suele estar libre.
 */
export function modelosCandidatos(nombres: string[]): string[] {
  const flash: { nombre: string; version: number }[] = [];
  const lite: { nombre: string; version: number }[] = [];
  for (const completo of nombres) {
    const nombre = completo.replace(/^models\//, '');
    const m = /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/.exec(nombre);
    if (!m) continue;
    (m[2] ? lite : flash).push({ nombre, version: Number(m[1]) });
  }
  const orden = (a: { version: number }, b: { version: number }) => b.version - a.version;
  const lista = [...flash.sort(orden), ...lite.sort(orden)].map((x) => x.nombre);
  if (!lista.includes(MODELO_POR_DEFECTO)) lista.push(MODELO_POR_DEFECTO);
  return lista;
}

/** El modelo preferido: el primero de los candidatos. */
export function mejorModelo(nombres: string[]): string {
  return modelosCandidatos(nombres)[0];
}

/** Un error de Gemini, con el estado HTTP para saber si merece reintentar. */
export class ErrorGemini extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
  }

  /**
   * Pasajero: saturación (503), cuota por minuto (429), fallos del servidor
   * o que tardó demasiado. Lo demás —clave mala, permiso— no se arregla
   * insistiendo.
   */
  get pasajero(): boolean {
    return [429, 500, 502, 503, 504, 408].includes(this.estado);
  }
}

/** Traduce los errores de la API a algo que se pueda leer y resolver. */
function errorLegible(estado: number, mensaje: string): ErrorGemini {
  if (/api key not valid|API_KEY_INVALID/i.test(mensaje) || estado === 401) {
    return new ErrorGemini(
      'La clave de Gemini no es válida. Cópiela otra vez desde Google AI Studio ' +
        '(aistudio.google.com → Get API key) y guárdela en Ajustes.',
      401,
    );
  }
  if (estado === 403) {
    return new ErrorGemini(
      'Google no deja usar Gemini con esa clave. Compruebe en Google AI Studio que la ' +
        'clave esté activa y que la API de Gemini esté habilitada para su proyecto.',
      403,
    );
  }
  if (estado === 429) {
    return new ErrorGemini(
      'Se agotó por ahora la cuota de Gemini de esa clave. Espere un minuto y vuelva a ' +
        'intentarlo; si pasa a menudo, la cuota gratuita se queda corta para este uso.',
      429,
    );
  }
  if (estado === 404) {
    return new ErrorGemini('Ese modelo de Gemini ya no está disponible.', 404);
  }
  if (estado === 503 || /high demand|overloaded|unavailable/i.test(mensaje)) {
    return new ErrorGemini(
      'Gemini está saturado en este momento (Google responde «alta demanda»). Suele ' +
        'pasar en pocos minutos.',
      503,
    );
  }
  return new ErrorGemini(`Gemini respondió con un error (${estado}): ${mensaje}`, estado);
}

/** Lo que tarda como mucho una respuesta de un modelo. */
const LIMITE_POR_MODELO_MS = 30_000;
/** Lo que tarda como mucho una redacción entera, probando modelos. */
const LIMITE_TOTAL_MS = 90_000;

async function llamar(
  fetchImpl: Fetch,
  url: string,
  clave: string,
  cuerpo?: unknown,
  limiteMs = LIMITE_POR_MODELO_MS,
) {
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
      signal: AbortSignal.timeout(limiteMs),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new ErrorGemini('Gemini tardó demasiado en responder.', 408);
    }
    throw new ErrorGemini('No hay conexión con Gemini. Compruebe la conexión a internet.', 0);
  }
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!r.ok) throw errorLegible(r.status, j.error?.message ?? r.statusText);
  return j;
}

/** Los modelos candidatos de cada clave, para no preguntar en cada redacción. */
const candidatosPorClave = new Map<string, Promise<string[]>>();

export function candidatos(clave: string, fetchImpl: Fetch = fetch): Promise<string[]> {
  let p = candidatosPorClave.get(clave);
  if (!p) {
    p = (async () => {
      const j = (await llamar(fetchImpl, `${API}/models?pageSize=1000`, clave)) as {
        models?: { name: string; supportedGenerationMethods?: string[] }[];
      };
      const utiles = (j.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name);
      return modelosCandidatos(utiles);
    })();
    // Un fallo —clave mala, sin conexión— no se queda guardado: se reintentará.
    p.catch(() => candidatosPorClave.delete(clave));
    candidatosPorClave.set(clave, p);
  }
  return p;
}

/** El modelo que se probará primero con esta clave. */
export async function elegirModelo(clave: string, fetchImpl: Fetch = fetch): Promise<string> {
  return (await candidatos(clave, fetchImpl))[0];
}

/**
 * Modelos apartados por un rato, por clave, y hasta cuándo.
 *
 * Cada fallo dice algo distinto: sin cuota (429) no se arregla en segundos;
 * saturado (503) suele pasar en un par de minutos; retirado (404) no vuelve.
 * Probado con una cuenta real: el modelo más nuevo daba 429, el siguiente 503
 * y el de detrás respondía en un segundo.
 */
const apartados = new Map<string, Map<string, number>>();

function apartar(clave: string, modelo: string, estado: number, ahora: number) {
  const ms = estado === 404 ? Number.POSITIVE_INFINITY : estado === 429 ? 10 * 60_000 : 2 * 60_000;
  let m = apartados.get(clave);
  if (!m) apartados.set(clave, (m = new Map()));
  m.set(modelo, ahora + ms);
}

export type OpcionesGemini = {
  fetchImpl?: Fetch;
  /** Para las pruebas: el reloj. */
  ahora?: () => number;
};

/**
 * Pide a Gemini un JSON con la forma del esquema y lo devuelve ya leído.
 *
 * Prueba los modelos de uno en uno: si uno está saturado, sin cuota o
 * retirado, pasa al siguiente sin insistir, y lo aparta un rato para no
 * volver a perder tiempo con él. El que responde queda el primero para la
 * próxima vez. Sólo si fallan todos —o se pasa el tiempo máximo— da error.
 */
export async function generarJson<T>(
  clave: string,
  pedido: PedidoGemini,
  opciones: OpcionesGemini | Fetch = {},
): Promise<T> {
  const { fetchImpl = fetch, ahora = Date.now } =
    typeof opciones === 'function' ? { fetchImpl: opciones } : opciones;

  const inicio = ahora();
  const todos = await candidatos(clave, fetchImpl);
  const fuera = apartados.get(clave) ?? new Map<string, number>();
  const libres = todos.filter((m) => (fuera.get(m) ?? 0) <= inicio);
  // Si están todos apartados, se prueban igual —salvo los retirados— antes
  // que no intentar nada.
  const orden = libres.length > 0 ? libres : todos.filter((m) => fuera.get(m) !== Number.POSITIVE_INFINITY);

  let ultimo: unknown;
  let probados = 0;
  for (const modelo of orden) {
    const queda = LIMITE_TOTAL_MS - (ahora() - inicio);
    if (queda < 3_000) break;
    probados++;
    try {
      const j = await generarCon<T>(fetchImpl, clave, modelo, pedido, Math.min(LIMITE_POR_MODELO_MS, queda));
      // El que respondió pasa a ser el primero la próxima vez.
      candidatosPorClave.set(clave, Promise.resolve([modelo, ...todos.filter((x) => x !== modelo)]));
      return j;
    } catch (e) {
      ultimo = e;
      if (!(e instanceof ErrorGemini)) throw e;
      // Lo que falla por la clave o por el pedido no mejora con otro modelo.
      if (!e.pasajero && e.estado !== 404) throw e;
      apartar(clave, modelo, e.estado, ahora());
    }
  }

  const base = ultimo instanceof Error ? ultimo.message : 'Gemini no respondió.';
  throw new ErrorGemini(
    `${base} Se ${probados === 1 ? 'probó 1 modelo' : `probaron ${probados} modelos`} de Gemini sin ` +
      'suerte; vuelva a intentarlo en unos minutos.',
    ultimo instanceof ErrorGemini ? ultimo.estado : 0,
  );
}

/** Una petición a un modelo concreto, ya interpretada. */
async function generarCon<T>(
  fetchImpl: Fetch,
  clave: string,
  modelo: string,
  pedido: PedidoGemini,
  limiteMs: number,
): Promise<T> {
  const j = (await llamar(fetchImpl, `${API}/models/${modelo}:generateContent`, clave, {
    systemInstruction: { parts: [{ text: pedido.sistema }] },
    contents: [
      {
        role: 'user',
        parts: [
          ...(pedido.archivo
            ? [{ inlineData: { mimeType: pedido.archivo.mime, data: pedido.archivo.datos } }]
            : []),
          { text: pedido.usuario },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: aEsquemaGemini(pedido.esquema),
      temperature: 0.4,
    },
  }, limiteMs)) as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };

  const rechazo = () =>
    new ErrorGemini(
      'Gemini no quiso redactar este texto. Pruebe a reformular la indicación o use la otra IA.',
      400,
    );
  if (j.promptFeedback?.blockReason) throw rechazo();

  const c = j.candidates?.[0];
  if (c?.finishReason && ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(c.finishReason)) {
    throw rechazo();
  }
  if (c?.finishReason === 'MAX_TOKENS') {
    throw new ErrorGemini('La respuesta de Gemini quedó incompleta. Pida menos obligaciones de una vez.', 400);
  }

  const texto = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!texto) throw new ErrorGemini('Gemini no devolvió texto.', 502);
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErrorGemini('La respuesta de Gemini no tenía el formato esperado.', 502);
  }
}
