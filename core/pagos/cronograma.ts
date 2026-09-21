/**
 * Motor de pagos: cuotas, acumulados y saldos por ejecutar.
 *
 * Verificado contra el contrato 078-2025:
 *   enero   → pagado 1.880.000, por ejecutar 11.750.000  (13.630.000 − 1.880.000)
 *   febrero → pagado 4.230.000, por ejecutar  9.400.000  (13.630.000 − 4.230.000)
 *
 * Corrige dos erratas de la plantilla original, por decisión del usuario:
 *   - VALOR EJECUTADO traía "3.000.000" en la columna VALOR TOTAL
 *   - VALOR POR EJECUTAR traía "6000000000666"
 * Ambos pasan a calcularse.
 */

import type { Contrato, Cuota, Suspension } from '../modelo/tipos';
import {
  type Fecha,
  desdeISO,
  aISO,
  comparar,
  ultimoDiaDelMes,
  primerDiaDelMes,
  estaEnRango,
  sumarDias,
  diferenciaEnDias,
  esAnterior,
  esPosterior,
} from '../espanol/calendario';

export type BalanceDelMes = {
  anio: number;
  mes: number;
  /** Rango efectivamente trabajado en el mes, descontando suspensiones. */
  desde: Fecha;
  hasta: Fecha;
  /** Cuota que se paga este mes. 0 si no hay pago. */
  pagoDelMes: number;
  /** Suma de todos los pagos hasta este mes, inclusive. */
  totalPagado: number;
  valorInicial: number;
  valorAdiciones: number;
  /** valorInicial + valorAdiciones */
  valorVigente: number;
  /** = totalPagado */
  valorEjecutado: number;
  /** valorVigente − totalPagado */
  valorPorEjecutar: number;
  /** = valorVigente, en ambas columnas de SUMAS IGUALES */
  sumasIguales: number;
  /** Fecha de terminación vigente, ya con prórrogas y suspensiones aplicadas. */
  fechaTerminacionVigente: Fecha;
};

/** Cronograma completo, con las cuotas de las adiciones ya intercaladas. */
export function cronogramaVigente(contrato: Contrato): Cuota[] {
  const todas = [
    ...contrato.cuotas,
    ...contrato.adiciones.flatMap((a) => a.cuotasAgregadas),
  ];
  return todas
    .slice()
    .sort((a, b) => comparar(desdeISO(a.fecha), desdeISO(b.fecha)))
    .map((c, i) => ({ ...c, n: i + 1 }));
}

export function valorAdiciones(contrato: Contrato): number {
  return contrato.adiciones.reduce((suma, a) => suma + a.valor, 0);
}

export function valorVigente(contrato: Contrato): number {
  return contrato.valorInicial + valorAdiciones(contrato);
}

/** Días totales que el contrato estuvo suspendido (cerrados). */
export function diasSuspendidos(suspensiones: Suspension[]): number {
  return suspensiones.reduce((suma, s) => {
    if (!s.hasta) return suma;
    return suma + diferenciaEnDias(desdeISO(s.desde), desdeISO(s.hasta)) + 1;
  }, 0);
}

/**
 * Fecha de terminación vigente: la original, corrida por las prórrogas de las
 * adiciones y por los días que el contrato estuvo suspendido.
 */
export function fechaTerminacionVigente(contrato: Contrato): Fecha {
  let fin = desdeISO(contrato.fechaTerminacion);

  // Una prórroga en un otrosí reemplaza la fecha; gana la más lejana.
  for (const a of contrato.adiciones) {
    if (a.nuevaFechaTerminacion) {
      const nueva = desdeISO(a.nuevaFechaTerminacion);
      if (esPosterior(nueva, fin)) fin = nueva;
    }
  }

  // Cada día suspendido corre la terminación un día hacia adelante.
  const dias = diasSuspendidos(contrato.suspensiones);
  if (dias > 0) fin = sumarDias(fin, dias);

  return fin;
}

/** ¿Este día quedó dentro de alguna suspensión? */
export function estaSuspendido(f: Fecha, suspensiones: Suspension[]): boolean {
  return suspensiones.some((s) => {
    const desde = desdeISO(s.desde);
    const hasta = s.hasta ? desdeISO(s.hasta) : null;
    if (!hasta) return comparar(f, desde) >= 0;
    return estaEnRango(f, desde, hasta);
  });
}

/**
 * Rango efectivamente trabajado en un mes.
 *
 * Devuelve `null` cuando no corresponde generar informe: el mes cae fuera de la
 * vigencia del contrato, o estuvo suspendido de principio a fin.
 */
export function rangoDelInforme(
  contrato: Contrato,
  anio: number,
  mes: number,
): { desde: Fecha; hasta: Fecha } | null {
  const inicioContrato = desdeISO(contrato.fechaInicio);
  const finContrato = fechaTerminacionVigente(contrato);

  // El rango arranca el 1 del mes, salvo el primer mes del contrato.
  let desde = primerDiaDelMes(anio, mes);
  if (esAnterior(desde, inicioContrato)) desde = inicioContrato;

  // Y termina el último día del mes, salvo el mes de terminación.
  let hasta = ultimoDiaDelMes(anio, mes);
  if (esPosterior(hasta, finContrato)) hasta = finContrato;

  if (esPosterior(desde, hasta)) return null; // el mes cae fuera de la vigencia

  // Recortar contra las suspensiones: se avanza el inicio y se retrocede el
  // fin mientras caigan en días suspendidos.
  const { suspensiones } = contrato;
  if (suspensiones.length > 0) {
    while (comparar(desde, hasta) <= 0 && estaSuspendido(desde, suspensiones)) {
      desde = sumarDias(desde, 1);
    }
    while (comparar(desde, hasta) <= 0 && estaSuspendido(hasta, suspensiones)) {
      hasta = sumarDias(hasta, -1);
    }
    if (esPosterior(desde, hasta)) return null; // mes suspendido por completo
  }

  return { desde, hasta };
}

/** Cuota que se paga en un mes dado. 0 si no hay pago programado. */
export function pagoDelMes(contrato: Contrato, anio: number, mes: number): number {
  return cronogramaVigente(contrato)
    .filter((c) => {
      const f = desdeISO(c.fecha);
      return f.anio === anio && f.mes === mes;
    })
    .reduce((suma, c) => suma + c.valor, 0);
}

/** Suma de todo lo pagado hasta el final del mes indicado, inclusive. */
export function totalPagadoHasta(contrato: Contrato, anio: number, mes: number): number {
  const corte = ultimoDiaDelMes(anio, mes);
  return cronogramaVigente(contrato)
    .filter((c) => comparar(desdeISO(c.fecha), corte) <= 0)
    .reduce((suma, c) => suma + c.valor, 0);
}

/** Balance completo del mes, listo para volcarse en el informe. */
export function balanceDelMes(
  contrato: Contrato,
  anio: number,
  mes: number,
): BalanceDelMes | null {
  const rango = rangoDelInforme(contrato, anio, mes);
  if (!rango) return null;

  const inicial = contrato.valorInicial;
  const adiciones = valorAdiciones(contrato);
  const vigente = inicial + adiciones;
  const pagado = totalPagadoHasta(contrato, anio, mes);

  return {
    anio,
    mes,
    desde: rango.desde,
    hasta: rango.hasta,
    pagoDelMes: pagoDelMes(contrato, anio, mes),
    totalPagado: pagado,
    valorInicial: inicial,
    valorAdiciones: adiciones,
    valorVigente: vigente,
    valorEjecutado: pagado,
    valorPorEjecutar: vigente - pagado,
    sumasIguales: vigente,
    fechaTerminacionVigente: fechaTerminacionVigente(contrato),
  };
}

/**
 * Construye el cronograma habitual: mensualidades vencidas pagaderas el último
 * día de cada mes, con una primera cuota distinta cuando el contrato empieza a
 * mitad de mes.
 *
 * Contrato 078-2025: primeraCuota 1.880.000 + 5 × 2.350.000 = 13.630.000
 * Contrato 084-2025: primeraCuota 1.298.400 + 5 × 1.623.000 =  9.413.400
 */
export function generarCronograma(opciones: {
  fechaInicio: string;
  fechaTerminacion: string;
  valorMensual: number;
  /** Si se omite, la primera cuota también vale `valorMensual`. */
  primeraCuota?: number;
  /**
   * Importes distintos para meses concretos, indexados por "AAAA-MM".
   * Tiene prioridad sobre `primeraCuota` y `valorMensual`.
   *
   * Sirve para el caso habitual: el contrato arranca el 7 de enero, así que
   * enero se paga proporcional y los demás meses completos. Y también para el
   * caso menos habitual de que un mes suelto tenga otro importe.
   */
  porMes?: Record<string, number>;
}): Cuota[] {
  const inicio = desdeISO(opciones.fechaInicio);
  const fin = desdeISO(opciones.fechaTerminacion);
  if (esPosterior(inicio, fin)) {
    throw new Error('La fecha de inicio no puede ser posterior a la de terminación');
  }

  const cuotas: Cuota[] = [];
  let anio = inicio.anio;
  let mes = inicio.mes;
  let n = 1;

  while (true) {
    let fechaPago = ultimoDiaDelMes(anio, mes);
    // El último pago no puede ir más allá de la terminación del contrato.
    if (esPosterior(fechaPago, fin)) fechaPago = fin;

    const clave = `${anio}-${String(mes).padStart(2, '0')}`;
    const especifico = opciones.porMes?.[clave];

    const valor =
      especifico !== undefined
        ? especifico
        : n === 1 && opciones.primeraCuota !== undefined
          ? opciones.primeraCuota
          : opciones.valorMensual;

    cuotas.push({ n, fecha: aISO(fechaPago), valor });

    if (comparar(fechaPago, fin) >= 0) break;

    n += 1;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
    if (n > 600) throw new Error('Cronograma demasiado largo; revise las fechas');
  }

  return cuotas;
}
