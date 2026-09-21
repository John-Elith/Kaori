/**
 * Con qué contrato se está trabajando.
 *
 * En «Generar mes», cada mes muestra primero el último contrato tocado y luego
 * los demás, del más reciente al más antiguo. «Tocado» es cualquier cosa que
 * deja rastro: editar el contrato, anotarle la planilla de un mes o generarle
 * un documento.
 */

import type { BaseDeDatos, Contrato } from './tipos';

/** El último momento en que se hizo algo con el contrato, en ISO. */
export function ultimaActividad(
  contrato: Contrato,
  base: Pick<BaseDeDatos, 'informes' | 'certificados'>,
): string | undefined {
  let ultima = contrato.actualizadoEn;
  const considerar = (t?: string) => {
    if (t && (!ultima || t > ultima)) ultima = t;
  };
  for (const i of base.informes) if (i.contratoId === contrato.id) considerar(i.generadoEn);
  for (const c of base.certificados ?? []) if (c.contratoId === contrato.id) considerar(c.generadoEn);
  return ultima;
}

export type ConActividad = {
  /** Última actividad, en ISO; sin ella, nunca se ha tocado. */
  actividad?: string;
  /** Inicio del contrato, en ISO: desempata a los que nunca se tocaron. */
  fechaInicio: string;
  numero: string;
};

/**
 * Del más reciente al más antiguo. Los que nunca se tocaron van al final,
 * ordenados por su fecha de inicio (el contrato más nuevo primero) y, si
 * empatan, por número.
 */
export function porActividad(a: ConActividad, b: ConActividad): number {
  if (a.actividad && b.actividad) return b.actividad.localeCompare(a.actividad);
  if (a.actividad) return -1;
  if (b.actividad) return 1;
  if (a.fechaInicio !== b.fechaInicio) return b.fechaInicio.localeCompare(a.fechaInicio);
  return a.numero.localeCompare(b.numero, 'es', { numeric: true });
}
