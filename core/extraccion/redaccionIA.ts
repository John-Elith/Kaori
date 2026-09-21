/**
 * Redactar obligaciones y actividades con la IA que esté configurada: Claude
 * o Gemini. Las instrucciones son las mismas para las dos
 * (ver instruccionesRedaccion.ts); aquí sólo se elige a quién mandarlas.
 */

import type { ProveedorIA } from '../modelo/tipos';
import { proponerObligacionesConIA, redactarActividadesConIA } from './extraerIA';
import { generarJson } from './gemini';
import { instruccionesActividades, instruccionesObligaciones } from './instruccionesRedaccion';

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
