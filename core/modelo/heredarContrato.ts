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
 * Tampoco el dinero: el valor del contrato y sus cuotas quedan vacíos. El
 * sueldo cambia de un contrato al siguiente más de lo que parece —y una cifra
 * heredada sin querer va a parar a un documento que se firma—, así que se
 * escribe a mano en Pagos y de ahí sale el cronograma. Sin cuotas no hay
 * forma de pago que redactar, y también queda vacía.
 *
 * **Se copia tal cual**: el objeto, las obligaciones con sus actividades, las
 * de supervisión, el supervisor, el contratante, el municipio, el teléfono, la
 * cuenta y las tres plantillas.
 *
 * **Se recalcula con las fechas del contrato nuevo** el texto del plazo:
 * copiado tal cual diría las fechas del contrato anterior, así que se redacta
 * de nuevo, igual que con el botón de «Redactar».
 *
 * `mensualidadHabitual` y `cuotasProrrateadas` siguen aquí: reparten un sueldo
 * entre dos fechas, con los meses a medias en proporción sobre un mes
 * comercial de 30 días, que es como se pagan estos contratos.
 */

import type { Contrato, Cuota } from './tipos';
import { desdeISO, ultimoDiaDelMes } from '../espanol/calendario';
import { frasePlazo } from '../espanol/fechaEnLetras';
import { generarCronograma } from '../pagos/cronograma';

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

/** Si las fechas del contrato permiten repartir el sueldo y redactar el plazo. */
export function fechasCoherentes(c: Pick<Contrato, 'fechaInicio' | 'fechaTerminacion'>): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicio) &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.fechaTerminacion) &&
    c.fechaInicio <= c.fechaTerminacion;
}

export function heredarDeContrato(nuevo: Contrato, anterior: Contrato): Contrato {
  // Con las fechas al revés —un año mal escrito— no hay plazo que redactar. Se
  // copia todo lo demás y eso se deja para cuando se corrijan.
  const coherentes = fechasCoherentes(nuevo);

  let textoPlazo = '';
  if (anterior.textoPlazo.trim() && coherentes) {
    const frase = frasePlazo(desdeISO(nuevo.fechaInicio), desdeISO(nuevo.fechaTerminacion));
    // Se respeta cómo lo escribía: en mayúsculas o en frase normal.
    textoPlazo = enMayusculas(anterior.textoPlazo)
      ? frase
      : frase.charAt(0) + frase.slice(1).toLocaleLowerCase('es');
  }

  return {
    ...nuevo,
    objeto: anterior.objeto,
    textoPlazo,
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
