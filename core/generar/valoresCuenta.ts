/**
 * Los valores de una cuenta de cobro.
 *
 * La cuenta es el recibo mensual con el que se le paga al contratista. Casi
 * todo sale del contrato, que ya está registrado; lo único propio de la cuenta
 * es el teléfono y la cuenta bancaria a la que se consigna.
 *
 * Redacción literal de la cuenta de enero del contrato 084-2025:
 *
 *   LA SUMA DE _$ 1.298.400
 *   VALOR EN LETRAS: UN MILLÓN DOSCIENTOS NOVENTA Y OCHO MIL CUATROCIENTOS.
 *   POR CONCEPTO DE: PAGO MES DE ENERO DEL CONTRATO No. CD 084-2025 CON OBJETO: …
 *   CIUDAD Y FECHA: OLAYA HERRERA ENERO 31 DEL 2025
 *
 * La cuenta del municipio escribe «NOVEINTA»; aquí sale «NOVENTA», que es lo
 * correcto y lo que produce el motor de números.
 */

import type { CampoId } from '../docx/campos';
import type { Contrato, Contratista } from '../modelo/tipos';
import { formatoMoneda, montoEnLetrasSolo } from '../espanol/numeroALetras';
import { nombreMes } from '../espanol/calendario';
import { fechaDeCuentaDeCobro } from '../espanol/fechaEnLetras';
import { balanceDelMes, type BalanceDelMes } from '../pagos/cronograma';
import { nombreDeDocumento } from './nombreArchivo';

export type DatosDeLaCuenta = {
  contrato: Contrato;
  contratista: Contratista;
  anio: number;
  /** 1–12 */
  mes: number;
};

export type ResultadoValoresCuenta = {
  valores: Partial<Record<CampoId, string>>;
  balance: BalanceDelMes;
  avisos: string[];
};

/**
 * El párrafo de «POR CONCEPTO DE».
 *
 * Va entero como un solo campo, y no troceado en mes, contrato y objeto,
 * porque en la plantilla es un único párrafo corrido: mapearlo por trozos
 * obligaría a marcar tres rangos dentro de la misma frase y a acertar con los
 * conectores que van entre ellos.
 */
export function conceptoDeLaCuenta(contrato: Contrato, mes: number): string {
  return (
    `PAGO MES DE ${nombreMes(mes).toUpperCase()} DEL CONTRATO No. CD ` +
    `${contrato.numero} CON OBJETO: ${contrato.objeto}`
  );
}

export function calcularValoresCuenta(
  datos: DatosDeLaCuenta,
): ResultadoValoresCuenta {
  const { contrato, contratista, anio, mes } = datos;
  const avisos: string[] = [];

  const balance = balanceDelMes(contrato, anio, mes);
  if (!balance) {
    throw new Error(
      `El contrato ${contrato.numero} no tiene actividad en ${nombreMes(mes)} de ${anio}: ` +
        'está fuera de vigencia o suspendido durante todo el mes.',
    );
  }

  // Sin estos dos la cuenta sale con el teléfono y la cuenta de la plantilla,
  // que son los de otra persona. Es lo peor que puede pasar en este documento,
  // así que se avisa en vez de dejarlo correr en silencio.
  if (!contrato.telefono?.trim()) {
    avisos.push(
      'El contrato no tiene teléfono registrado: la cuenta de cobro conserva el ' +
        'que traiga la plantilla. Se escribe en Contratos → Datos.',
    );
  }
  if (!contrato.numeroDeCuenta?.trim()) {
    avisos.push(
      'El contrato no tiene número de cuenta registrado: la cuenta de cobro ' +
        'conserva el que traiga la plantilla. Se escribe en Contratos → Datos.',
    );
  }

  const valores: Partial<Record<CampoId, string>> = {
    nombreContratista: contratista.nombre,
    cedula: contratista.cedula,
    cedulaExpedidaEn: contratista.expedidaEn,
    numeroContrato: contrato.numero,

    cuentaValorNumero: formatoMoneda(balance.pagoDelMes),
    cuentaValorLetras: montoEnLetrasSolo(balance.pagoDelMes),
    cuentaConcepto: conceptoDeLaCuenta(contrato, mes),

    // La fecha es el cierre del periodo del mes, no el 31 a secas: en el mes de
    // terminación el contrato cierra antes, y con una suspensión también.
    cuentaCiudadYFecha: fechaDeCuentaDeCobro(contrato.municipio, balance.hasta),
  };

  // Los que no están registrados se dejan sin valor a propósito: un campo sin
  // dato conserva el texto de la plantilla en vez de escribir una cadena vacía.
  if (contrato.telefono?.trim()) valores.telefono = contrato.telefono.trim();
  if (contrato.numeroDeCuenta?.trim()) {
    valores.numeroDeCuenta = contrato.numeroDeCuenta.trim();
  }

  return { valores, balance, avisos };
}

/** "CUENTA DE COBRO PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx" */
export function nombreArchivoCuenta(
  contrato: Contrato,
  contratista: Contratista,
  _anio: number,
  mes: number,
): string {
  return nombreDeDocumento(contrato, contratista, mes, 'CUENTA DE COBRO');
}
