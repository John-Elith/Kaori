/**
 * Fechas escritas en letras con las fórmulas exactas de los informes de contrato.
 *
 * Las frases se reproducen literalmente de los informes reales del Municipio de
 * Olaya Herrera. Donde los informes de ejemplo difieren entre sí (el periodo de
 * supervisión aparece con dos redacciones distintas), se ofrecen las dos y el
 * mapeo de la plantilla decide cuál usar.
 */

import { numeroALetras } from './numeroALetras';
import { type Fecha, nombreMes, dosDigitos } from './calendario';

/**
 * Día en letras acompañando al sustantivo "días" → forma apocopada.
 *   1 → "primero"   7 → "siete"   21 → "veintiún"   31 → "treinta y un"
 */
export function diaEnLetras(dia: number): string {
  if (dia === 1) return 'primero';
  return numeroALetras(dia, true);
}

/**
 * Día en letras como pronombre, sin apocopar.
 *   1 → "primero"   31 → "treinta y uno"
 * Se usa en la redacción "al treinta y uno (31) de enero".
 */
export function diaEnLetrasPleno(dia: number): string {
  if (dia === 1) return 'primero';
  return numeroALetras(dia, false);
}

/** 2025 → "dos mil veinticinco" */
export function anioEnLetras(anio: number): string {
  return numeroALetras(anio, false);
}

/** 2025 → "dos mil veinticinco (2025)" */
export function anioConCifra(anio: number): string {
  return `${anioEnLetras(anio)} (${anio})`;
}

/** 7 → "siete (07)" · 31 → "treinta y un (31)" · 1 → "primero (01)" */
export function diaConCifra(dia: number): string {
  return `${diaEnLetras(dia)} (${dosDigitos(dia)})`;
}

/** 31 → "treinta y uno (31)" — variante sin apócope */
export function diaConCifraPleno(dia: number): string {
  return `${diaEnLetrasPleno(dia)} (${dosDigitos(dia)})`;
}

/** "siete (07) de enero de dos mil veinticinco (2025)" */
export function fechaLarga(f: Fecha): string {
  return `${diaConCifra(f.dia)} de ${nombreMes(f.mes)} de ${anioConCifra(f.anio)}`;
}

/** "07 de enero de 2025" — formato de FECHA DE INICIO / FECHA DE TERMINACIÓN */
export function fechaSimple(f: Fecha): string {
  return `${dosDigitos(f.dia)} de ${nombreMes(f.mes)} de ${f.anio}`;
}

/**
 * Cierre del INFORME DE ACTIVIDAD CONTRACTUAL.
 *
 * "En constancia de lo anterior, se firma el presente informe a los treinta y
 *  un (31) días del mes de enero de dos mil veinticinco (2025)."
 */
export function fraseFirma(f: Fecha): string {
  return (
    'En constancia de lo anterior, se firma el presente informe a los ' +
    `${diaConCifra(f.dia)} días del mes de ${nombreMes(f.mes)} de ${anioConCifra(f.anio)}.`
  );
}

/**
 * Cierre del INFORME DE SUPERVISIÓN. Nótese "del año", que la frase de firma no lleva.
 *
 * "En constancia se expide en el Municipio de Olaya Herrera a los treinta y un
 *  (31) días del mes de enero del año dos mil veinticinco (2025)."
 */
export function fraseConstancia(f: Fecha, municipio: string): string {
  return (
    `En constancia se expide en el Municipio de ${municipio} a los ` +
    `${diaConCifra(f.dia)} días del mes de ${nombreMes(f.mes)} del año ${anioConCifra(f.anio)}.`
  );
}

/**
 * Dos redacciones del PERIODO DEL INFORME DE SUPERVISIÓN aparecen en los
 * informes de ejemplo. Ambas son válidas; la plantilla determina cuál se usa.
 *
 *  'dias' → "Desde el siete (07) de enero de dos mil veinticinco (2025) a los
 *            treinta y un (31) días de enero de dos mil veinticinco (2025)."
 *  'al'   → "Desde el siete (07) de enero de dos mil veinticinco (2025) al
 *            treinta y uno (31) de enero de dos mil veinticinco (2025)."
 */
export type VariantePeriodo = 'dias' | 'al';

export function frasePeriodoSupervision(
  desde: Fecha,
  hasta: Fecha,
  variante: VariantePeriodo = 'dias',
): string {
  const inicio = `Desde el ${fechaLarga(desde)}`;
  const fin =
    variante === 'dias'
      ? `a los ${diaConCifra(hasta.dia)} días de ${nombreMes(hasta.mes)} de ${anioConCifra(hasta.anio)}`
      : `al ${diaConCifraPleno(hasta.dia)} de ${nombreMes(hasta.mes)} de ${anioConCifra(hasta.anio)}`;
  return `${inicio} ${fin}.`;
}

/**
 * PLAZO / PLAZO DE EJECUCIÓN, en mayúsculas como en el documento.
 *
 * "DESDE EL DÍA SIETE (07) DE ENERO DEL AÑO DOS MIL VEINTICINCO (2025), HASTA
 *  EL DÍA TREINTA (30) DE JUNIO DEL MISMO AÑO."
 *
 * Los informes de ejemplo traen erratas aquí ("DIASIETE" sin espacio, "TREINTA
 * DE JUNIO (30)" con la cifra tras el mes). Esta función produce la forma
 * correcta; si se prefiere conservar la errata, el texto del contrato puede
 * escribirse a mano y el programa lo respeta tal cual.
 */
export function frasePlazo(inicio: Fecha, fin: Fecha): string {
  const cabeza = `DESDE EL DÍA ${diaConCifra(inicio.dia)} DE ${nombreMes(inicio.mes)} DEL AÑO ${anioConCifra(inicio.anio)}`;
  const cola =
    inicio.anio === fin.anio
      ? `HASTA EL DÍA ${diaConCifra(fin.dia)} DE ${nombreMes(fin.mes)} DEL MISMO AÑO`
      : `HASTA EL DÍA ${diaConCifra(fin.dia)} DE ${nombreMes(fin.mes)} DEL AÑO ${anioConCifra(fin.anio)}`;
  return `${cabeza}, ${cola}.`.toUpperCase();
}

/**
 * FECHA DE TERMINACIÓN DEL CONTRATO en la tabla administrativa.
 * "Treinta (30) de junio de dos mil veinticinco (2025)"
 */
export function fechaTerminacionLarga(f: Fecha): string {
  const dia = diaConCifraPleno(f.dia);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} de ${nombreMes(f.mes)} de ${anioConCifra(f.anio)}`;
}

/**
 * Pie de la cuenta de cobro: "OLAYA HERRERA ENERO 31 DEL 2025".
 *
 * Va en mayúsculas y con el día en cifra, no en letras, que es como lo escribe
 * el municipio. El día es el último del mes que se cobra.
 */
export function fechaDeCuentaDeCobro(municipio: string, f: Fecha): string {
  return `${municipio.toUpperCase()} ${nombreMes(f.mes).toUpperCase()} ${f.dia} DEL ${f.anio}`;
}

/**
 * Periodo que cubre el certificado de cumplimiento.
 *
 * "Entre el periodo comprendido desde el día siete (07) de enero hasta el día
 *  treinta (30) de junio del año dos mil veinticinco (2025)."
 *
 * El año se nombra una sola vez al final cuando ambas fechas caen en el mismo,
 * que es como está redactado el certificado real; si el contrato cruza de año,
 * se nombra en cada extremo para que no quede ambiguo.
 */
export function frasePeriodoCertificado(desde: Fecha, hasta: Fecha): string {
  const inicio =
    desde.anio === hasta.anio
      ? `desde el día ${diaConCifra(desde.dia)} de ${nombreMes(desde.mes)}`
      : `desde el día ${diaConCifra(desde.dia)} de ${nombreMes(desde.mes)} del año ${anioConCifra(desde.anio)}`;

  return (
    `Entre el periodo comprendido ${inicio} hasta el día ` +
    `${diaConCifra(hasta.dia)} de ${nombreMes(hasta.mes)} del año ${anioConCifra(hasta.anio)}.`
  );
}

/**
 * Cierre del certificado de cumplimiento.
 *
 * "Se expide en Olaya Herrera (Nariño), a los treinta (30) días del mes de
 *  junio del año dos mil veinticinco (2025)."
 *
 * El certificado del municipio dice «a los treinta (30) día»; se escribe
 * «días», que concuerda con «a los».
 */
export function fraseExpedicionCertificado(
  municipio: string,
  departamento: string,
  f: Fecha,
): string {
  const lugar = departamento.trim() ? `${municipio} (${departamento})` : municipio;
  return (
    `Se expide en ${lugar}, a los ${diaConCifra(f.dia)} días del mes de ` +
    `${nombreMes(f.mes)} del año ${anioConCifra(f.anio)}.`
  );
}
