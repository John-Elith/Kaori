/**
 * Un contrato nuevo de la misma persona, con los datos de uno anterior.
 *
 * Lo corriente es que un contratista encadene contratos —enero a junio, julio
 * a diciembre— con el mismo objeto, las mismas obligaciones y el mismo sueldo.
 * Escribirlo todo otra vez es tedioso y deja errores; esto lo copia.
 *
 * **No se copia** lo que es propio de cada contrato: el número, las fechas de
 * inicio, terminación y firma, el CDP y el RP con sus valores, ni las adiciones
 * y suspensiones, que fueron novedades del contrato anterior.
 *
 * **Se copia tal cual**: el objeto, las obligaciones con sus actividades, las
 * de supervisión, el supervisor, el contratante, el municipio, el teléfono, la
 * cuenta y las tres plantillas.
 *
 * **Se recalcula con las fechas del contrato nuevo**:
 *
 * - El sueldo. Se toma la mensualidad del anterior —la cuota que más se
 *   repite— y se reparte en cuotas entre las fechas nuevas. Un mes empezado o
 *   terminado a medias se paga en proporción, sobre un mes comercial de 30
 *   días: así lo hacen los contratos del municipio (el 084-2025 empezó el 7 de
 *   enero y cobró 1.623.000 × 24/30 = 1.298.400).
 * - El texto del plazo y la forma de pago. Copiados tal cual dirían las fechas
 *   y las cifras del contrato anterior, en un documento que se firma; se
 *   redactan de nuevo, igual que con los botones de «Redactar».
 */

import type { Contrato, Cuota } from './tipos';
import { desdeISO, ultimoDiaDelMes } from '../espanol/calendario';
import { frasePlazo } from '../espanol/fechaEnLetras';
import { generarCronograma } from '../pagos/cronograma';
import { redactarFormaDePago } from '../generar/formaDePago';

/** La mensualidad de un contrato: la cuota que más se repite. */
export function mensualidadHabitual(cuotas: Cuota[]): number {
  const veces = new Map<number, number>();
  for (const c of cuotas) veces.set(c.valor, (veces.get(c.valor) ?? 0) + 1);
  let mejor = 0;
  let cuantas = 0;
  for (const [valor, n] of veces) {
    // A igualdad de veces gana la mayor: la menor suele ser un mes a medias.
    if (n > cuantas || (n === cuantas && valor > mejor)) {
      mejor = valor;
      cuantas = n;
    }
  }
  return mejor;
}

/**
 * Cuotas de una mensualidad entre dos fechas, con los meses a medias en
 * proporción a sus días sobre 30.
 */
export function cuotasProrrateadas(
  fechaInicio: string,
  fechaTerminacion: string,
  mensual: number,
): Cuota[] {
  const ini = desdeISO(fechaInicio);
  const fin = desdeISO(fechaTerminacion);
  const clave = (a: number, m: number) => `${a}-${String(m).padStart(2, '0')}`;
  const proporcion = (dias: number) => Math.round((mensual * Math.max(0, Math.min(30, dias))) / 30);

  const porMes: Record<string, number> = {};
  const mismoMes = ini.anio === fin.anio && ini.mes === fin.mes;
  const terminaAMedias = fin.dia < ultimoDiaDelMes(fin.anio, fin.mes).dia;

  if (mismoMes) {
    if (ini.dia > 1 || terminaAMedias) {
      porMes[clave(ini.anio, ini.mes)] = proporcion(Math.min(fin.dia, 30) - Math.min(ini.dia, 30) + 1);
    }
  } else {
    if (ini.dia > 1) porMes[clave(ini.anio, ini.mes)] = proporcion(30 - Math.min(ini.dia, 30) + 1);
    if (terminaAMedias) porMes[clave(fin.anio, fin.mes)] = proporcion(fin.dia);
  }

  return generarCronograma({ fechaInicio, fechaTerminacion, valorMensual: mensual, porMes });
}

/** Si un texto está escrito casi todo en mayúsculas. */
function enMayusculas(texto: string): boolean {
  const mayus = (texto.match(/\p{Lu}/gu) ?? []).length;
  const minus = (texto.match(/\p{Ll}/gu) ?? []).length;
  return mayus > minus;
}

export function heredarDeContrato(nuevo: Contrato, anterior: Contrato): Contrato {
  const mensual = mensualidadHabitual(anterior.cuotas);

  // Sin cuotas en el anterior no hay sueldo que repartir: se deja lo que haya.
  const cuotas =
    mensual > 0 ? cuotasProrrateadas(nuevo.fechaInicio, nuevo.fechaTerminacion, mensual) : nuevo.cuotas;
  const valorInicial = mensual > 0 ? cuotas.reduce((s, c) => s + c.valor, 0) : nuevo.valorInicial;

  let textoPlazo = '';
  if (anterior.textoPlazo.trim()) {
    const frase = frasePlazo(desdeISO(nuevo.fechaInicio), desdeISO(nuevo.fechaTerminacion));
    // Se respeta cómo lo escribía: en mayúsculas o en frase normal.
    textoPlazo = enMayusculas(anterior.textoPlazo)
      ? frase
      : frase.charAt(0) + frase.slice(1).toLocaleLowerCase('es');
  }

  const formaDePago =
    anterior.formaDePago.trim() && cuotas.length > 0
      ? redactarFormaDePago({ valorTotal: valorInicial, cuotas, fechaInicio: nuevo.fechaInicio })
      : '';

  return {
    ...nuevo,
    objeto: anterior.objeto,
    textoPlazo,
    formaDePago,
    valorInicial,
    cuotas,
    contratante: anterior.contratante,
    nitContratante: anterior.nitContratante,
    municipio: anterior.municipio,
    departamento: anterior.departamento,
    telefono: anterior.telefono,
    numeroDeCuenta: anterior.numeroDeCuenta,
    supervisor: { ...anterior.supervisor },
    // Copias, no referencias: cambiar una obligación del nuevo no debe tocar
    // el anterior.
    obligaciones: anterior.obligaciones.map((o) => ({ ...o })),
    obligacionesSupervision: anterior.obligacionesSupervision.map((o) => ({ ...o })),
    plantillaId: anterior.plantillaId,
    plantillaCuentaId: anterior.plantillaCuentaId,
    plantillaCertificadoId: anterior.plantillaCertificadoId,
  };
}
