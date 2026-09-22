/**
 * Lectura y redacción con IA (opcional).
 *
 * Se usa sólo si el usuario configuró una clave de API. Aporta dos cosas que el
 * camino sin conexión no puede dar:
 *
 *   1. Leer escaneos torcidos, con sombras o de baja calidad — y, sobre todo,
 *      ENTENDER qué es cada dato ("este número de diez dígitos es el CDP, aquel
 *      es la planilla"), en vez de adivinar por su forma.
 *   2. Redactar las ACTIVIDADES EJECUTADAS con el registro administrativo de
 *      los informes reales.
 *
 * En ambos casos el resultado se muestra para revisión: la IA propone, la
 * persona aprueba.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CamposContratoDetectados } from './camposContrato';
import {
  ESQUEMA_ACTIVIDADES,
  ESQUEMA_OBLIGACIONES,
  instruccionesActividades,
  instruccionesLeerObligaciones,
  instruccionesObligaciones,
} from './instruccionesRedaccion';

const MODELO = 'claude-opus-5';

function cliente(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

/** Tipos de archivo que la API acepta como imagen. */
const TIPOS_IMAGEN: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function tipoImagen(extension: string): string | undefined {
  return TIPOS_IMAGEN[extension.toLowerCase().replace(/^\./, '')];
}

type BloqueDocumento =
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

export function bloqueDesdeArchivo(
  contenido: Buffer,
  extension: string,
): BloqueDocumento {
  const ext = extension.toLowerCase().replace(/^\./, '');
  const datos = contenido.toString('base64');

  if (ext === 'pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: datos },
    };
  }

  const media = tipoImagen(ext);
  if (!media) {
    throw new Error(
      `No se puede leer un archivo .${ext}. Use PDF, PNG, JPG, GIF o WEBP.`,
    );
  }

  return {
    type: 'image',
    source: { type: 'base64', media_type: media, data: datos },
  };
}

const ESQUEMA_CONTRATO = {
  type: 'object',
  properties: {
    numero: { type: 'string', description: 'Número del contrato, formato NNN-AAAA' },
    anio: { type: 'integer' },
    nombreContratista: { type: 'string', description: 'En MAYÚSCULAS, como aparece' },
    cedula: { type: 'string', description: 'Con puntos de miles, p. ej. 10.345.678' },
    cedulaExpedidaEn: { type: 'string' },
    objeto: { type: 'string' },
    valorInicial: { type: 'integer', description: 'Valor total en pesos, sin puntos' },
    fechaInicio: { type: 'string', description: 'AAAA-MM-DD' },
    fechaTerminacion: { type: 'string', description: 'AAAA-MM-DD' },
    fechaFirma: { type: 'string', description: 'AAAA-MM-DD' },
    contratante: { type: 'string' },
    nitContratante: { type: 'string' },
    supervisorNombre: { type: 'string' },
    supervisorCargo: { type: 'string' },
    formaDePago: { type: 'string', description: 'Texto completo de la forma de pago' },
    textoPlazo: { type: 'string', description: 'Texto completo del plazo, en mayúsculas' },
    cdpNumero: { type: 'string' },
    cdpFecha: { type: 'string', description: 'AAAA-MM-DD' },
    cdpValor: { type: 'integer' },
    rpNumero: { type: 'string' },
    rpFecha: { type: 'string', description: 'AAAA-MM-DD' },
    rpValor: { type: 'integer' },
    valorPrimeraCuota: {
      type: 'integer',
      description: 'Valor de la primera mensualidad si es distinta de las demás',
    },
    valorMensual: { type: 'integer', description: 'Valor de las mensualidades ordinarias' },
    obligaciones: {
      type: 'array',
      items: { type: 'string' },
      description: 'Obligaciones específicas, en orden y textuales',
    },
  },
  required: ['numero'],
  additionalProperties: false,
} as const;

export type ContratoExtraido = CamposContratoDetectados & {
  fechaFirma?: string;
  supervisorCargo?: string;
  formaDePago?: string;
  textoPlazo?: string;
  cdpFecha?: string;
  rpFecha?: string;
  valorPrimeraCuota?: number;
  valorMensual?: number;
};

/** Lee un contrato (PDF o imagen) y devuelve los campos estructurados. */
export async function extraerContratoConIA(
  apiKey: string,
  contenido: Buffer,
  extension: string,
): Promise<ContratoExtraido> {
  const respuesta = await cliente(apiKey).messages.create({
    model: MODELO,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: ESQUEMA_CONTRATO },
    },
    messages: [
      {
        role: 'user',
        content: [
          bloqueDesdeArchivo(contenido, extension) as never,
          {
            type: 'text',
            text:
              'Extrae los datos de este contrato de prestación de servicios de una alcaldía ' +
              'colombiana. Transcribe los textos largos (objeto, plazo, forma de pago, ' +
              'obligaciones) tal como aparecen, sin resumirlos ni corregirlos. Las fechas van ' +
              'en formato AAAA-MM-DD y los valores en pesos como número entero sin puntos. ' +
              'Si un dato no aparece en el documento, omite el campo en vez de inventarlo.',
          },
        ],
      },
    ],
  });

  return leerJson<ContratoExtraido>(respuesta);
}

const ESQUEMA_PLANILLA = {
  type: 'object',
  properties: {
    numero: { type: 'string', description: 'Número de la planilla' },
    fecha: { type: 'string', description: 'Fecha de pago, AAAA-MM-DD' },
    mesAcreditado: {
      type: 'string',
      description: 'Mes que se acredita, en minúscula: enero, febrero…',
    },
  },
  required: [],
  additionalProperties: false,
} as const;

export async function extraerPlanillaConIA(
  apiKey: string,
  contenido: Buffer,
  extension: string,
): Promise<{ numero?: string; fecha?: string; mesAcreditado?: string }> {
  const respuesta = await cliente(apiKey).messages.create({
    model: MODELO,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ESQUEMA_PLANILLA },
    },
    messages: [
      {
        role: 'user',
        content: [
          bloqueDesdeArchivo(contenido, extension) as never,
          {
            type: 'text',
            text:
              'Esta es una planilla de aportes a seguridad social (PILA) de Colombia. ' +
              'Extrae el número de la planilla, la fecha de pago y el mes que se acredita. ' +
              'Si algún dato no se distingue con claridad, omítelo en vez de adivinarlo.',
          },
        ],
      },
    ],
  });

  return leerJson(respuesta);
}

/**
 * Redacta las ACTIVIDADES EJECUTADAS con Claude. Las instrucciones son las
 * mismas que recibe Gemini (ver instruccionesRedaccion.ts).
 */
export async function redactarActividadesConIA(
  apiKey: string,
  obligaciones: string[],
  impersonal: boolean,
): Promise<string[]> {
  const i = instruccionesActividades(obligaciones, impersonal);
  const respuesta = await cliente(apiKey).messages.create({
    model: MODELO,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ESQUEMA_ACTIVIDADES },
    },
    system: i.sistema,
    messages: [{ role: 'user', content: i.usuario }],
  });

  const r = leerJson<{ actividades: string[] }>(respuesta);
  return r.actividades ?? [];
}

/**
 * Propone las OBLIGACIONES ESPECÍFICAS con Claude a partir de una indicación.
 *
 * Devuelve `cuantas` obligaciones incluyendo las que ya se dieron, para que la
 * numeración del certificado y de las tablas del informe salga corrida.
 */
export async function proponerObligacionesConIA(
  apiKey: string,
  indicacion: string,
  cuantas: number,
  objeto?: string,
): Promise<string[]> {
  const i = instruccionesObligaciones(indicacion, cuantas, objeto);
  const respuesta = await cliente(apiKey).messages.create({
    model: MODELO,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ESQUEMA_OBLIGACIONES },
    },
    system: i.sistema,
    messages: [{ role: 'user', content: i.usuario }],
  });

  const r = leerJson<{ obligaciones: string[] }>(respuesta);
  return (r.obligaciones ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
}

/**
 * Lee las OBLIGACIONES ESPECÍFICAS de la imagen o el PDF de un contrato con
 * Claude. Las instrucciones son las mismas que recibe Gemini.
 */
export async function leerObligacionesConIA(
  apiKey: string,
  contenido: Buffer,
  extension: string,
): Promise<string[]> {
  const i = instruccionesLeerObligaciones();
  const respuesta = await cliente(apiKey).messages.create({
    model: MODELO,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ESQUEMA_OBLIGACIONES },
    },
    system: i.sistema,
    messages: [
      {
        role: 'user',
        content: [bloqueDesdeArchivo(contenido, extension) as never, { type: 'text', text: i.usuario }],
      },
    ],
  });
  const r = leerJson<{ obligaciones: string[] }>(respuesta);
  return (r.obligaciones ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
}

/** Lee el JSON del primer bloque de texto, comprobando antes el motivo de parada. */
function leerJson<T>(respuesta: {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}): T {
  if (respuesta.stop_reason === 'refusal') {
    throw new Error(
      'El servicio de IA no procesó este documento. Puede continuar en modo sin conexión ' +
        'o revisar el archivo e intentar de nuevo.',
    );
  }
  if (respuesta.stop_reason === 'max_tokens') {
    throw new Error(
      'El documento es demasiado extenso y la respuesta quedó incompleta. ' +
        'Intente con un archivo más corto o cargue los datos a mano.',
    );
  }

  const bloque = respuesta.content.find((b) => b.type === 'text');
  if (!bloque?.text) {
    throw new Error('El servicio de IA no devolvió datos legibles.');
  }

  try {
    return JSON.parse(bloque.text) as T;
  } catch {
    throw new Error('La respuesta del servicio de IA no tenía el formato esperado.');
  }
}
