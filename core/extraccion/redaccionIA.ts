/**
 * Redactar obligaciones y actividades con la IA que esté configurada: Claude
 * o Gemini. Las instrucciones son las mismas para las dos
 * (ver instruccionesRedaccion.ts); aquí sólo se elige a quién mandarlas.
 */

import type { ProveedorIA } from '../modelo/tipos';
import {
  leerObligacionesConIA,
  proponerObligacionesConIA,
  redactarActividadesConIA,
} from './extraerIA';
import { generarJson } from './gemini';
import {
  instruccionesActividades,
  instruccionesLeerObligaciones,
  instruccionesObligaciones,
} from './instruccionesRedaccion';

export type RedactorIA = { proveedor: ProveedorIA; clave: string };

export const NOMBRE_PROVEEDOR: Record<ProveedorIA, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
};

export async function redactarActividades(
  r: RedactorIA,
  obligaciones: string[],
  impersonal: boolean,
): Promise<string[]> {
  if (r.proveedor === 'claude') return redactarActividadesConIA(r.clave, obligaciones, impersonal);
  const j = await generarJson<{ actividades?: string[] }>(
    r.clave,
    instruccionesActividades(obligaciones, impersonal),
  );
  return (j.actividades ?? []).map((a) => a.trim());
}

/** Tipo MIME de lo que se manda a Gemini. */
const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Transcribe las obligaciones específicas de la imagen o el PDF de un contrato. */
export async function leerObligaciones(
  r: RedactorIA,
  contenido: Buffer,
  extension: string,
): Promise<string[]> {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (r.proveedor === 'claude') return leerObligacionesConIA(r.clave, contenido, ext);
  const mime = MIME[ext];
  if (!mime) throw new Error(`No se puede leer un archivo .${ext}. Use PDF, PNG, JPG o WEBP.`);
  const j = await generarJson<{ obligaciones?: string[] }>(r.clave, {
    ...instruccionesLeerObligaciones(),
    archivo: { mime, datos: contenido.toString('base64') },
  });
  return (j.obligaciones ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
}

export async function proponerObligaciones(
  r: RedactorIA,
  indicacion: string,
  cuantas: number,
  objeto?: string,
): Promise<string[]> {
  if (r.proveedor === 'claude') return proponerObligacionesConIA(r.clave, indicacion, cuantas, objeto);
  const j = await generarJson<{ obligaciones?: string[] }>(
    r.clave,
    instruccionesObligaciones(indicacion, cuantas, objeto),
  );
  return (j.obligaciones ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
}
