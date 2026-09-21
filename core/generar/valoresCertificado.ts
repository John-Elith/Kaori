/**
 * Los valores de un certificado de cumplimiento.
 *
 * A diferencia del informe y de la cuenta de cobro, el certificado no es
 * mensual: hay uno por contrato, y va fechado el último día de su vigencia.
 * Por eso aquí no aparece ningún mes.
 *
 * Redacción literal del certificado del contrato 084-2025:
 *
 *   Qué; JUAN PEREZ GOMEZ, identificado con Cedula No 10.123.456
 *   de Olaya Herrera – Nariño. Cumplió satisfactoriamente con las siguientes
 *   actividades: […]
 *   Dentro del contrato de Prestación de servicios No. C.D 084-2025 de fecha,
 *   07/01/2025 y que tiene por objeto "…" Entre el periodo comprendido desde
 *   el día siete (07) de enero hasta el día treinta (30) de junio del año dos
 *   mil veinticinco (2025).
 *   Se expide en Olaya Herrera (Nariño), a los treinta (30) días del mes de
 *   junio del año dos mil veinticinco (2025).
 */

import type { CampoId } from '../docx/campos';
import type { Contrato, Contratista } from '../modelo/tipos';
import {
  aISO,
  desdeISO,
  formatoCorto,
  ultimoDiaDelMes,
  type Fecha,
} from '../espanol/calendario';
import {
  frasePeriodoCertificado,
  fraseExpedicionCertificado,
} from '../espanol/fechaEnLetras';
import { fechaTerminacionVigente } from '../pagos/cronograma';
import { nombreDeCertificado } from './nombreArchivo';

export type DatosDelCertificado = {
  contrato: Contrato;
  contratista: Contratista;
  /** Departamento por defecto, cuando el contrato no trae el suyo. */
  departamentoPorDefecto?: string;
  /**
   * Hasta cuándo certifica, en ISO. Sin esto, hasta el final del contrato.
   *
   * Se puede expedir un certificado parcial —«cumplió hasta marzo»— cuando el
   * contrato sigue en curso y hay que acreditar lo hecho hasta la fecha. El
   * periodo y la frase de expedición se ajustan juntos: certificar hasta marzo
   * con fecha de junio no querría decir nada.
   */
  hasta?: string;
};

export type ResultadoValoresCertificado = {
  valores: Partial<Record<CampoId, string>>;
  /** Las actividades ya listas para la lista numerada. */
  actividades: string[];
  /** Último día de vigencia: la fecha que lleva el certificado. */
  fechaExpedicion: Fecha;
  avisos: string[];
};

export function calcularValoresCertificado(
  datos: DatosDelCertificado,
): ResultadoValoresCertificado {
  const { contrato, contratista } = datos;
  const avisos: string[] = [];

  const inicio = desdeISO(contrato.fechaInicio);
  // Por defecto, la fecha de terminación vigente: si hubo prórroga o
  // suspensión, el certificado se expide cuando el contrato terminó de verdad.
  // Si se pidió un cierre anterior, manda ese.
  const fin = datos.hasta ? desdeISO(datos.hasta) : fechaTerminacionVigente(contrato);

  const departamento =
    contrato.departamento?.trim() || datos.departamentoPorDefecto?.trim() || '';
  if (!departamento) {
    avisos.push(
      'El contrato no tiene departamento registrado, así que la frase de ' +
        'expedición sale sin él. Se escribe en Contratos → Datos.',
    );
  }

  // Las actividades del certificado son las obligaciones del contrato. Se
  // ordenan por su número, que es el orden en que las trae el contrato.
  const actividades = [...contrato.obligaciones]
    .sort((a, b) => a.n - b.n)
    .map((o) => o.texto.trim())
    .filter((t) => t.length > 0);

  if (actividades.length === 0) {
    avisos.push(
      'El contrato no tiene obligaciones registradas: el certificado saldrá con ' +
        'las actividades que traiga la plantilla, que son las de otro contrato. ' +
        'Se registran en Contratos → Obligaciones.',
    );
  }

  const valores: Partial<Record<CampoId, string>> = {
    nombreContratista: contratista.nombre,
    cedula: contratista.cedula,
    cedulaExpedidaEn: contratista.expedidaEn,
    numeroContrato: contrato.numero,
    numeroContratoCD: `CD ${contrato.numero}`,
    objeto: contrato.objeto,
    fechaInicioCorta: formatoCorto(inicio),
    certificadoPeriodo: frasePeriodoCertificado(inicio, fin),
    certificadoExpedicion: fraseExpedicionCertificado(
      contrato.municipio,
      departamento,
      fin,
    ),
    supervisorNombre: contrato.supervisor.nombre,
    supervisorCargo: contrato.supervisor.cargo,
  };

  return { valores, actividades, fechaExpedicion: fin, avisos };
}

/** "CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025.docx" */
export function nombreArchivoCertificado(
  contrato: Contrato,
  contratista: Contratista,
  /** Mes de cierre, si no es el último del contrato. */
  mesParcial?: number,
): string {
  return nombreDeCertificado(contrato, contratista, mesParcial);
}

/**
 * Los cierres posibles de un certificado: un mes del contrato cada uno.
 *
 * El último es el corriente —el certificado del contrato entero— y es el que
 * la interfaz ofrece por defecto. Los anteriores sirven para acreditar lo
 * cumplido hasta la fecha mientras el contrato sigue en curso.
 */
export function cierresDelCertificado(
  contrato: Contrato,
): { anio: number; mes: number; hasta: string }[] {
  const inicio = desdeISO(contrato.fechaInicio);
  const fin = fechaTerminacionVigente(contrato);

  const cierres: { anio: number; mes: number; hasta: string }[] = [];
  let anio = inicio.anio;
  let mes = inicio.mes;

  while (anio < fin.anio || (anio === fin.anio && mes <= fin.mes)) {
    const ultimo = ultimoDiaDelMes(anio, mes);
    // El mes de terminación cierra el día que termine el contrato, no el 30.
    const cierra = anio === fin.anio && mes === fin.mes ? fin : ultimo;
    cierres.push({ anio, mes, hasta: aISO(cierra) });

    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
    if (cierres.length > 240) break; // contrato absurdo: no colgarse
  }

  return cierres;
}
