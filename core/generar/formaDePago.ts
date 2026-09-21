/**
 * Redacción del párrafo de FORMA DE PAGO.
 *
 * Es el texto que va encima de la tabla PAGO / FECHA / VALOR, y prácticamente
 * todas sus cifras cambian de un contrato a otro: el valor total en letras y en
 * números, cuántas mensualidades son, el importe de la primera —que suele ser
 * distinta porque el contrato arranca a mitad de mes— y el de las demás.
 *
 * Redactado literal del contrato 078-2025:
 *
 *   «El Municipio cancelará al contratista la suma de TRECE MILLONES
 *   SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000), por medio seis (06)
 *   mensualidades vencidas una primera mensualidad por el valor de UN MILLÓN
 *   OCHOCIENTOS OCHENTA MIL PESOS M/CTE ($1.880.000) correspondientes a los
 *   veinticuatro (24) días del mes de enero del dos mil veinticinco (2025) y
 *   cinco mensualidades por un valor de DOS MILLONES TRESCIENTOS CINCUENTA MIL
 *   PESOS M/CTE ($2.350.000) correspondientes a los meses de febrero a junio
 *   del año dos mil veinticinco (2025), en los que el contratista deberá
 *   prestar sus servicios al Municipio.»
 */

import type { Cuota } from '../modelo/tipos';
import { montoALetras, numeroALetras } from '../espanol/numeroALetras';
import {
  desdeISO,
  nombreMes,
  dosDigitos,
  diferenciaEnDias,
  ultimoDiaDelMes,
  type Fecha,
} from '../espanol/calendario';
import { anioConCifra } from '../espanol/fechaEnLetras';

/** Coletilla que traen algunos contratos al final del párrafo. */
export const COLETILLA_REQUISITOS =
  'Cada pago se realizará por parte del Municipio al Contratista previo ' +
  'cumplimiento de la totalidad de requisitos establecidos por la normatividad ' +
  'vigente del objeto contractual pactado y el certificado de cumplimiento del ' +
  'objeto contractual expedida por el Supervisor del contrato además del ' +
  'cumplimiento los trámites administrativos reglamentarios requeridos por el ' +
  'ente territorial.';

export type OpcionesFormaDePago = {
  /** Valor total del contrato */
  valorTotal: number;
  cuotas: Cuota[];
  /** Fecha de inicio, ISO. Determina si el primer mes es parcial. */
  fechaInicio: string;
  /** Añade la coletilla sobre los requisitos previos a cada pago. */
  incluirRequisitos?: boolean;
};

/** "seis (06)" — el número en letras seguido de su cifra a dos dígitos. */
function conteoConCifra(n: number): string {
  return `${numeroALetras(n, true)} (${dosDigitos(n)})`;
}

/**
 * Días que se pagan del primer mes.
 *
 * Los informes reales cuentan «los veinticuatro (24) días del mes de enero»
 * para un contrato que arranca el 7 y paga el 31: es la diferencia entre ambas
 * fechas, no el número de días trabajados contando el primero.
 */
export function diasDelPrimerMes(fechaInicio: Fecha): number {
  return diferenciaEnDias(fechaInicio, ultimoDiaDelMes(fechaInicio.anio, fechaInicio.mes));
}

/** "de febrero a junio del año dos mil veinticinco (2025)" */
function rangoDeMeses(desde: Fecha, hasta: Fecha): string {
  if (desde.anio === hasta.anio) {
    if (desde.mes === hasta.mes) {
      return `del mes de ${nombreMes(desde.mes)} del año ${anioConCifra(desde.anio)}`;
    }
    return (
      `de ${nombreMes(desde.mes)} a ${nombreMes(hasta.mes)} ` +
      `del año ${anioConCifra(desde.anio)}`
    );
  }
  return (
    `de ${nombreMes(desde.mes)} del año ${anioConCifra(desde.anio)} ` +
    `a ${nombreMes(hasta.mes)} del año ${anioConCifra(hasta.anio)}`
  );
}

/** ¿Todas las cuotas de la lista valen lo mismo? */
function todasIguales(cuotas: Cuota[]): boolean {
  return cuotas.every((c) => c.valor === cuotas[0].valor);
}

export function redactarFormaDePago(opciones: OpcionesFormaDePago): string {
  const { valorTotal, cuotas } = opciones;

  if (cuotas.length === 0) {
    return (
      `El Municipio cancelará al contratista la suma de ${montoALetras(valorTotal)}, ` +
      'en los términos pactados en el contrato.'
    );
  }

  const inicio = desdeISO(opciones.fechaInicio);
  const partes: string[] = [
    `El Municipio cancelará al contratista la suma de ${montoALetras(valorTotal)}, ` +
      `por medio ${conteoConCifra(cuotas.length)} mensualidades vencidas`,
  ];

  const primera = cuotas[0];
  const resto = cuotas.slice(1);
  const primeraEsDistinta = resto.length > 0 && primera.valor !== resto[0].valor;
  const restoUniforme = resto.length > 0 && todasIguales(resto);
  const arrancaAMitadDeMes = inicio.dia > 1;

  // Caso simple: todas las mensualidades valen igual.
  if (!primeraEsDistinta && todasIguales(cuotas)) {
    const desde = desdeISO(cuotas[0].fecha);
    const hasta = desdeISO(cuotas[cuotas.length - 1].fecha);
    partes.push(
      ` por un valor de ${montoALetras(primera.valor)} cada una, ` +
        `correspondientes a los meses ${rangoDeMeses(desde, hasta)}`,
    );
  } else {
    // La primera mensualidad va aparte.
    partes.push(` una primera mensualidad por el valor de ${montoALetras(primera.valor)}`);

    if (arrancaAMitadDeMes) {
      const dias = diasDelPrimerMes(inicio);
      partes.push(
        ` correspondientes a los ${conteoConCifra(dias)} días del mes de ` +
          `${nombreMes(inicio.mes)} del ${anioConCifra(inicio.anio)}`,
      );
    } else {
      partes.push(
        ` correspondiente al mes de ${nombreMes(inicio.mes)} del ` +
          `${anioConCifra(inicio.anio)}`,
      );
    }

    if (resto.length > 0) {
      const desde = desdeISO(resto[0].fecha);
      const hasta = desdeISO(resto[resto.length - 1].fecha);
      const cuantas = numeroALetras(resto.length, true);

      if (restoUniforme) {
        partes.push(
          ` y ${cuantas} mensualidad${resto.length === 1 ? '' : 'es'} por un valor de ` +
            `${montoALetras(resto[0].valor)} correspondientes a los meses ` +
            `${rangoDeMeses(desde, hasta)}`,
        );
      } else {
        // Importes irregulares: se enumeran uno por uno en vez de inventar un
        // valor único que no correspondería a ninguna cuota.
        const detalle = resto
          .map(
            (c) =>
              `${nombreMes(desdeISO(c.fecha).mes)} por ${montoALetras(c.valor)}`,
          )
          .join(', ');
        partes.push(` y las siguientes mensualidades así: ${detalle}`);
      }
    }
  }

  partes.push(', en los que el contratista deberá prestar sus servicios al Municipio.');

  if (opciones.incluirRequisitos) partes.push(` ${COLETILLA_REQUISITOS}`);

  return partes.join('');
}
