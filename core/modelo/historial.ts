/**
 * Historial de informes generados.
 *
 * El historial no crece sin fin: se conservan los doce últimos y los demás van
 * saliendo por abajo a medida que entran nuevos. Doce es un año de informes de
 * un contrato, que es el horizonte con el que se trabaja de verdad; más allá
 * la lista deja de servir para consultar y se convierte en un archivo que hay
 * que filtrar.
 *
 * Lo que se poda es el REGISTRO, no el documento: el .docx sigue en la carpeta
 * de salida. Lo que se pierde es la anotación de cuándo se generó y por cuánto.
 *
 * Un registro puede llevar además la planilla PILA del mes, que costó escanear
 * un documento. Por eso podar no borra el registro entero: le quita los datos
 * de generación y lo conserva si todavía tiene planilla que guardar.
 */

import type { BaseDeDatos, InformeMes } from './tipos';

/** Cuántos informes generados se conservan en el historial. */
export const MAXIMO_EN_HISTORIAL = 12;

/**
 * ¿Este registro corresponde a algún documento que llegó a producirse?
 *
 * Un contrato y un mes comparten registro, y de ese mes pueden haber salido el
 * informe, la cuenta de cobro o los dos. Basta con uno para que la fila tenga
 * sitio en el historial; mirar sólo el informe borraría los meses en que se
 * generó únicamente la cuenta.
 */
export function fueGenerado(i: InformeMes): boolean {
  return Boolean(i.generadoEn || i.cuentaGeneradaEn);
}

/** El más reciente de los dos documentos del mes: es lo que ordena la lista. */
function momento(i: InformeMes): number {
  const instantes = [i.generadoEn, i.cuentaGeneradaEn]
    .map((v) => new Date(v ?? '').getTime())
    .filter((t) => !Number.isNaN(t));
  return instantes.length === 0 ? 0 : Math.max(...instantes);
}

/**
 * Del más reciente al más antiguo.
 *
 * Cuando dos informes se generaron en el mismo instante —el caso normal, porque
 * un lote entero comparte marca de tiempo— desempata el periodo: entre enero y
 * marzo del mismo lote, el más antiguo es enero, y es el que debe caer primero.
 */
export function historialOrdenado(informes: InformeMes[]): InformeMes[] {
  return informes
    .filter(fueGenerado)
    .slice()
    .sort((a, b) => momento(b) - momento(a) || b.anio - a.anio || b.mes - a.mes);
}

/** Quita de un registro lo que lo hace parte del historial, de los dos documentos. */
function sinDatosDeGeneracion(i: InformeMes): InformeMes {
  const {
    generadoEn: _g,
    rutaArchivo: _r,
    nombreArchivo: _n,
    cuentaGeneradaEn: _cg,
    rutaCuenta: _cr,
    nombreCuenta: _cn,
    pagoDelMes: _p,
    ...resto
  } = i;
  return resto;
}

/** Clave de un registro: un contrato tiene como mucho un informe por mes. */
const clave = (i: InformeMes) => `${i.contratoId}|${i.anio}|${i.mes}`;

/**
 * Deja en el historial sólo los `maximo` más recientes.
 *
 * Los que sobran no desaparecen del todo si guardaban una planilla: se quedan
 * como registro del mes, sin los datos de generación.
 */
export function podarHistorial(
  base: BaseDeDatos,
  maximo = MAXIMO_EN_HISTORIAL,
): BaseDeDatos {
  const ordenados = historialOrdenado(base.informes);
  if (ordenados.length <= maximo) return base;

  const sobran = new Set(ordenados.slice(maximo).map(clave));

  const informes = base.informes
    .map((i) => (sobran.has(clave(i)) ? sinDatosDeGeneracion(i) : i))
    .filter((i) => fueGenerado(i) || i.planilla !== undefined);

  return { ...base, informes };
}

/** Vacía el historial entero, conservando las planillas ya leídas. */
export function limpiarHistorial(base: BaseDeDatos): BaseDeDatos {
  const informes = base.informes
    .map((i) => (fueGenerado(i) ? sinDatosDeGeneracion(i) : i))
    .filter((i) => i.planilla !== undefined);

  return { ...base, informes };
}

/** Cuántos informes generados hay anotados ahora mismo. */
export function tamanoDelHistorial(base: BaseDeDatos): number {
  return base.informes.filter(fueGenerado).length;
}
