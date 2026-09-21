/**
 * Traduce los datos del contrato y del mes a los valores textuales que van
 * dentro del informe.
 *
 * Aquí es donde el motor de español y el de pagos se encuentran: cada campo del
 * catálogo recibe exactamente el texto que debe aparecer en el documento.
 */

import type { CampoId } from '../docx/campos';
import type { Contrato, Contratista, Planilla } from '../modelo/tipos';
import type { VariantePeriodo } from '../espanol/fechaEnLetras';
import { montoALetras, formatoMoneda } from '../espanol/numeroALetras';
import {
  desdeISO,
  nombreMes,
  dosDigitos,
  formatoCorto,
  type Fecha,
} from '../espanol/calendario';
import {
  fraseFirma,
  fraseConstancia,
  frasePeriodoSupervision,
  fechaSimple,
  fechaTerminacionLarga,
} from '../espanol/fechaEnLetras';
import { balanceDelMes, type BalanceDelMes } from '../pagos/cronograma';
import { redactarFormaDePago } from './formaDePago';
import { nombreDeDocumento } from './nombreArchivo';

export type DatosDelInforme = {
  contrato: Contrato;
  contratista: Contratista;
  anio: number;
  /** 1–12 */
  mes: number;
  planilla?: Planilla;
  variantePeriodo?: VariantePeriodo;
};

export type ResultadoValores = {
  valores: Partial<Record<CampoId, string>>;
  balance: BalanceDelMes;
};

/**
 * Devuelve el texto de cada campo. Lanza si el mes no corresponde a este
 * contrato (fuera de vigencia o suspendido por completo), porque en ese caso no
 * debe generarse informe alguno.
 */
/**
 * El párrafo de FORMA DE PAGO que va al informe.
 *
 * Un contrato recién creado lo trae vacío, y una cadena vacía SÍ es un valor:
 * se escribía sobre el párrafo de la plantilla y lo dejaba en blanco, con la
 * tabla de pagos debajo colgando sola. Perder ese párrafo es peor que
 * cualquiera de las alternativas, así que:
 *
 *   - si está escrito, manda lo escrito;
 *   - si está vacío pero hay cronograma, se redacta desde el cronograma, que
 *     es exactamente lo que hace el botón de la pestaña Datos;
 *   - si está vacío y no hay cronograma, se devuelve `undefined` para que el
 *     informe conserve el texto de la plantilla. No es el correcto —es el de
 *     otro contrato— pero el generador ya avisa de los campos que quedaron sin
 *     dato, y un párrafo ajeno se ve y se corrige; uno en blanco pasa
 *     desapercibido hasta que el documento está firmado.
 */
function textoDeFormaDePago(contrato: Contrato): string | undefined {
  if (contrato.formaDePago.trim().length > 0) return contrato.formaDePago;
  if (contrato.cuotas.length === 0) return undefined;

  return redactarFormaDePago({
    valorTotal: contrato.valorInicial,
    cuotas: contrato.cuotas,
    fechaInicio: contrato.fechaInicio,
  });
}

export function calcularValores(datos: DatosDelInforme): ResultadoValores {
  const { contrato, contratista, anio, mes } = datos;
  const variante = datos.variantePeriodo ?? 'dias';

  const balance = balanceDelMes(contrato, anio, mes);
  if (!balance) {
    throw new Error(
      `El contrato ${contrato.numero} no tiene actividad en ${nombreMes(mes)} de ${anio}: ` +
        'está fuera de vigencia o suspendido durante todo el mes.',
    );
  }

  const inicio = desdeISO(contrato.fechaInicio);
  const terminacion = balance.fechaTerminacionVigente;
  const firma = desdeISO(contrato.fechaFirma);
  const cdpFecha = desdeISO(contrato.cdp.fecha);
  const rpFecha = desdeISO(contrato.rp.fecha);

  const valores: Partial<Record<CampoId, string>> = {
    // Identificación
    numeroContrato: contrato.numero,
    numeroContratoCD: `CD ${contrato.numero}`,
    anio: String(contrato.anio),
    nombreContratista: contratista.nombre,
    cedula: contratista.cedula,
    cedulaExpedidaEn: contratista.expedidaEn,
    objeto: contrato.objeto,

    // Plazos
    textoPlazo: contrato.textoPlazo,
    fechaInicio: fechaSimple(inicio),
    fechaTerminacion: fechaSimple(terminacion),
    fechaFirmaContrato: formatoCorto(firma),
    fechaInicioCorta: formatoCorto(inicio),
    fechaTerminacionCorta: formatoCorto(terminacion),
    fechaTerminacionLarga: fechaTerminacionLarga(terminacion),

    // Periodo del informe
    periodoDesdeDia: dosDigitos(balance.desde.dia),
    periodoDesdeMes: dosDigitos(balance.desde.mes),
    periodoDesdeAnio: String(balance.desde.anio),
    periodoHastaDia: dosDigitos(balance.hasta.dia),
    periodoHastaMes: dosDigitos(balance.hasta.mes),
    periodoHastaAnio: String(balance.hasta.anio),

    // Partes
    contratante: contrato.contratante,
    nitContratante: contrato.nitContratante,
    municipio: contrato.municipio,
    supervisorNombre: contrato.supervisor.nombre,
    supervisorCargo: contrato.supervisor.cargo,

    // Valores
    valorContratoLetras: montoALetras(balance.valorVigente),
    formaDePago: textoDeFormaDePago(contrato),

    // Datos de pago. Nacieron para la cuenta de cobro, pero algunos informes
    // también los llevan; si el documento no los tiene, nadie los mapea y no
    // pasa nada. Sin registrar se dejan sin dato, para no borrar lo que traiga
    // la plantilla con una cadena vacía.
    telefono: contrato.telefono?.trim() || undefined,
    numeroDeCuenta: contrato.numeroDeCuenta?.trim() || undefined,

    // Presupuesto
    cdpNumero: contrato.cdp.numero,
    cdpFechaDia: dosDigitos(cdpFecha.dia),
    cdpFechaMes: dosDigitos(cdpFecha.mes),
    cdpFechaAnio: String(cdpFecha.anio),
    cdpValorLetras: montoALetras(contrato.cdp.valor),
    rpNumero: contrato.rp.numero,
    rpFechaDia: dosDigitos(rpFecha.dia),
    rpFechaMes: dosDigitos(rpFecha.mes),
    rpFechaAnio: String(rpFecha.anio),
    rpValorLetras: montoALetras(contrato.rp.valor),

    // Balance del mes
    descripcionPagoMes: `Pago realizado, mes de ${nombreMes(mes)}`,
    pagoMesAnio: String(anio),
    pagoMesValor: formatoMoneda(balance.pagoDelMes),
    totalPagado: formatoMoneda(balance.totalPagado),
    valorInicialContrato: formatoMoneda(balance.valorInicial),
    valorAdicionesTotal: formatoMoneda(balance.valorAdiciones),
    valorAdiciones: formatoMoneda(balance.valorAdiciones),
    valorEjecutado: formatoMoneda(balance.valorEjecutado),
    valorPorEjecutar: formatoMoneda(balance.valorPorEjecutar),
    sumasIguales: formatoMoneda(balance.sumasIguales),

    // Las dos celdas erróneas de la columna VALOR TOTAL se vacían.
    // La columna izquierda ya cuadra sin ellas: valor inicial + adiciones =
    // SUMAS IGUALES. Dejarlas con "3.000.000" y "6000000000666" descuadraba
    // la tabla y no correspondía a ningún dato real del contrato.
    valorEjecutadoTotal: '',
    valorPorEjecutarTotal: '',

    // Frases en letras
    fraseFirma: fraseFirma(balance.hasta),
    fraseConstancia: fraseConstancia(balance.hasta, contrato.municipio),
    frasePeriodoSupervision: frasePeriodoSupervision(
      balance.desde,
      balance.hasta,
      variante,
    ),
  };

  if (datos.planilla) {
    const fp = desdeISO(datos.planilla.fecha);
    valores.planillaNumero = datos.planilla.numero;
    valores.planillaDia = dosDigitos(fp.dia);
    valores.planillaMes = dosDigitos(fp.mes);
    valores.planillaAnio = String(fp.anio);
    valores.planillaMesAcreditado = datos.planilla.mesAcreditado;
  }

  return { valores, balance };
}

/** "PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx" */
export function nombreArchivo(
  contrato: Contrato,
  contratista: Contratista,
  _anio: number,
  mes: number,
): string {
  return nombreDeDocumento(contrato, contratista, mes);
}

/** Campos con dato disponible que la plantilla no tiene mapeados. */
export function camposNoAprovechados(
  valores: Partial<Record<CampoId, string>>,
  mapeados: CampoId[],
): CampoId[] {
  return (Object.keys(valores) as CampoId[]).filter((id) => !mapeados.includes(id));
}

/** Fecha en que se cierra el informe: el último día efectivamente trabajado. */
export function fechaDeCierre(balance: BalanceDelMes): Fecha {
  return balance.hasta;
}
