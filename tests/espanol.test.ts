/**
 * Las expectativas de este archivo están copiadas LITERALMENTE de los tres
 * informes reales que entregó el usuario (contratos 078-2025 y 084-2025).
 * Son el criterio objetivo de que el motor de español es correcto.
 */

import { describe, it, expect } from 'vitest';
import { numeroALetras, formatoMoneda, montoALetras } from '../core/espanol/numeroALetras';
import {
  fecha,
  ultimoDiaDelMes,
  esBisiesto,
  nombreMes,
  diasInclusive,
  sumarDias,
  sumarMeses,
  formatoCorto,
  desdeISO,
  aISO,
} from '../core/espanol/calendario';
import {
  fraseFirma,
  fraseConstancia,
  frasePeriodoSupervision,
  fechaSimple,
  fechaLarga,
  diaConCifra,
  anioConCifra,
  fechaTerminacionLarga,
} from '../core/espanol/fechaEnLetras';

describe('numeroALetras', () => {
  it('cubre los casos básicos', () => {
    expect(numeroALetras(0)).toBe('cero');
    expect(numeroALetras(1)).toBe('uno');
    expect(numeroALetras(15)).toBe('quince');
    expect(numeroALetras(16)).toBe('dieciséis');
    expect(numeroALetras(20)).toBe('veinte');
    expect(numeroALetras(21)).toBe('veintiuno');
    expect(numeroALetras(28)).toBe('veintiocho');
    expect(numeroALetras(30)).toBe('treinta');
    expect(numeroALetras(31)).toBe('treinta y uno');
    expect(numeroALetras(100)).toBe('cien');
    expect(numeroALetras(101)).toBe('ciento uno');
    expect(numeroALetras(500)).toBe('quinientos');
    expect(numeroALetras(1000)).toBe('mil');
    expect(numeroALetras(2025)).toBe('dos mil veinticinco');
  });

  it('aplica la apócope cuando acompaña a un sustantivo masculino', () => {
    expect(numeroALetras(1, true)).toBe('un');
    expect(numeroALetras(21, true)).toBe('veintiún');
    expect(numeroALetras(31, true)).toBe('treinta y un');
    expect(numeroALetras(41, true)).toBe('cuarenta y un');
    expect(numeroALetras(28, true)).toBe('veintiocho');
  });

  it('no escribe "un mil"', () => {
    expect(numeroALetras(1000, true)).toBe('mil');
    expect(numeroALetras(21000, true)).toBe('veintiún mil');
    expect(numeroALetras(31000, true)).toBe('treinta y un mil');
  });

  it('distingue millón de millones', () => {
    expect(numeroALetras(1_000_000, true)).toBe('un millón');
    expect(numeroALetras(2_000_000, true)).toBe('dos millones');
    expect(numeroALetras(21_000_000, true)).toBe('veintiún millones');
  });

  // Valores tomados de los informes reales.
  it('reproduce los montos de los contratos 078-2025 y 084-2025', () => {
    expect(numeroALetras(13_630_000, true)).toBe(
      'trece millones seiscientos treinta mil',
    );
    expect(numeroALetras(1_880_000, true)).toBe(
      'un millón ochocientos ochenta mil',
    );
    expect(numeroALetras(2_350_000, true)).toBe(
      'dos millones trescientos cincuenta mil',
    );
    expect(numeroALetras(14_100_000, true)).toBe('catorce millones cien mil');
    expect(numeroALetras(9_413_400, true)).toBe(
      'nueve millones cuatrocientos trece mil cuatrocientos',
    );
    expect(numeroALetras(1_298_400, true)).toBe(
      'un millón doscientos noventa y ocho mil cuatrocientos',
    );
    expect(numeroALetras(1_623_000, true)).toBe(
      'un millón seiscientos veintitrés mil',
    );
  });

  it('rechaza entradas inválidas', () => {
    expect(() => numeroALetras(-1)).toThrow();
    expect(() => numeroALetras(1.5)).toThrow();
  });
});

describe('formatoMoneda', () => {
  it('usa el punto como separador de miles', () => {
    expect(formatoMoneda(13_630_000)).toBe('$13.630.000');
    expect(formatoMoneda(1_880_000)).toBe('$1.880.000');
    expect(formatoMoneda(9_413_400)).toBe('$9.413.400');
    expect(formatoMoneda(0)).toBe('$0');
    expect(formatoMoneda(999)).toBe('$999');
    expect(formatoMoneda(1000)).toBe('$1.000');
  });
});

describe('montoALetras', () => {
  // Comparado contra el campo VALOR de los informes reales.
  it('reproduce el VALOR del contrato 078-2025', () => {
    expect(montoALetras(13_630_000)).toBe(
      'TRECE MILLONES SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)',
    );
  });

  it('reproduce el VALOR del contrato 084-2025', () => {
    expect(montoALetras(9_413_400)).toBe(
      'NUEVE MILLONES CUATROCIENTOS TRECE MIL CUATROCIENTOS PESOS M/CTE ($9.413.400)',
    );
  });

  it('reproduce los valores de CDP y mensualidades', () => {
    expect(montoALetras(14_100_000)).toBe(
      'CATORCE MILLONES CIEN MIL PESOS M/CTE ($14.100.000)',
    );
    expect(montoALetras(1_880_000)).toBe(
      'UN MILLÓN OCHOCIENTOS OCHENTA MIL PESOS M/CTE ($1.880.000)',
    );
    expect(montoALetras(2_350_000)).toBe(
      'DOS MILLONES TRESCIENTOS CINCUENTA MIL PESOS M/CTE ($2.350.000)',
    );
    expect(montoALetras(1_298_400)).toBe(
      'UN MILLÓN DOSCIENTOS NOVENTA Y OCHO MIL CUATROCIENTOS PESOS M/CTE ($1.298.400)',
    );
  });
});

describe('calendario', () => {
  it('identifica años bisiestos', () => {
    expect(esBisiesto(2024)).toBe(true);
    expect(esBisiesto(2025)).toBe(false);
    expect(esBisiesto(2000)).toBe(true);
    expect(esBisiesto(1900)).toBe(false);
  });

  it('calcula el último día de cada mes', () => {
    expect(ultimoDiaDelMes(2025, 1).dia).toBe(31);
    expect(ultimoDiaDelMes(2025, 2).dia).toBe(28);
    expect(ultimoDiaDelMes(2024, 2).dia).toBe(29);
    expect(ultimoDiaDelMes(2025, 4).dia).toBe(30);
    expect(ultimoDiaDelMes(2025, 6).dia).toBe(30);
    expect(ultimoDiaDelMes(2025, 12).dia).toBe(31);
  });

  it('nombra los meses en minúscula', () => {
    expect(nombreMes(1)).toBe('enero');
    expect(nombreMes(2)).toBe('febrero');
    expect(nombreMes(6)).toBe('junio');
    expect(nombreMes(12)).toBe('diciembre');
    expect(() => nombreMes(13)).toThrow();
  });

  it('cuenta días inclusive como lo hace el informe', () => {
    // El contrato 078-2025 habla de "los veinticuatro (24) días del mes de enero",
    // contando del 7 al 31 sin incluir el día de inicio.
    expect(diasInclusive(fecha(2025, 1, 7), fecha(2025, 1, 31))).toBe(25);
    expect(diasInclusive(fecha(2025, 2, 1), fecha(2025, 2, 28))).toBe(28);
    expect(diasInclusive(fecha(2025, 1, 1), fecha(2025, 1, 1))).toBe(1);
  });

  it('suma días cruzando meses y años', () => {
    expect(sumarDias(fecha(2025, 1, 31), 1)).toEqual(fecha(2025, 2, 1));
    expect(sumarDias(fecha(2025, 12, 31), 1)).toEqual(fecha(2026, 1, 1));
    expect(sumarDias(fecha(2024, 2, 28), 1)).toEqual(fecha(2024, 2, 29));
    expect(sumarDias(fecha(2025, 2, 28), 1)).toEqual(fecha(2025, 3, 1));
    expect(sumarDias(fecha(2025, 3, 1), -1)).toEqual(fecha(2025, 2, 28));
  });

  it('suma meses ajustando el día al mes más corto', () => {
    expect(sumarMeses(fecha(2025, 1, 31), 1)).toEqual(fecha(2025, 2, 28));
    expect(sumarMeses(fecha(2025, 1, 15), 5)).toEqual(fecha(2025, 6, 15));
    expect(sumarMeses(fecha(2025, 12, 15), 1)).toEqual(fecha(2026, 1, 15));
  });

  it('convierte a ISO y de vuelta', () => {
    expect(aISO(fecha(2025, 1, 7))).toBe('2025-01-07');
    expect(desdeISO('2025-01-07')).toEqual(fecha(2025, 1, 7));
    expect(() => desdeISO('07/01/2025')).toThrow();
  });

  it('usa el formato corto de las tablas de pago', () => {
    expect(formatoCorto(fecha(2025, 1, 31))).toBe('31/01/2025');
    expect(formatoCorto(fecha(2025, 2, 28))).toBe('28/02/2025');
    expect(formatoCorto(fecha(2025, 6, 30))).toBe('30/06/2025');
  });
});

describe('fechas en letras', () => {
  it('escribe el día con su cifra', () => {
    expect(diaConCifra(1)).toBe('primero (01)');
    expect(diaConCifra(7)).toBe('siete (07)');
    expect(diaConCifra(28)).toBe('veintiocho (28)');
    expect(diaConCifra(30)).toBe('treinta (30)');
    expect(diaConCifra(31)).toBe('treinta y un (31)');
  });

  it('escribe el año con su cifra', () => {
    expect(anioConCifra(2025)).toBe('dos mil veinticinco (2025)');
    expect(anioConCifra(2026)).toBe('dos mil veintiséis (2026)');
  });

  it('escribe FECHA DE INICIO y FECHA DE TERMINACIÓN', () => {
    expect(fechaSimple(fecha(2025, 1, 7))).toBe('07 de enero de 2025');
    expect(fechaSimple(fecha(2025, 6, 30))).toBe('30 de junio de 2025');
  });

  it('escribe la fecha larga', () => {
    expect(fechaLarga(fecha(2025, 1, 7))).toBe(
      'siete (07) de enero de dos mil veinticinco (2025)',
    );
  });

  it('escribe FECHA DE TERMINACIÓN DEL CONTRATO', () => {
    expect(fechaTerminacionLarga(fecha(2025, 6, 30))).toBe(
      'Treinta (30) de junio de dos mil veinticinco (2025)',
    );
  });
});

describe('frases completas de los informes', () => {
  // INFORME 1 — contrato 078-2025, enero
  it('reproduce la firma de enero', () => {
    expect(fraseFirma(fecha(2025, 1, 31))).toBe(
      'En constancia de lo anterior, se firma el presente informe a los treinta y un (31) días del mes de enero de dos mil veinticinco (2025).',
    );
  });

  it('reproduce la constancia de enero', () => {
    expect(fraseConstancia(fecha(2025, 1, 31), 'Olaya Herrera')).toBe(
      'En constancia se expide en el Municipio de Olaya Herrera a los treinta y un (31) días del mes de enero del año dos mil veinticinco (2025).',
    );
  });

  it('reproduce el periodo de supervisión de enero (variante "días")', () => {
    expect(frasePeriodoSupervision(fecha(2025, 1, 7), fecha(2025, 1, 31), 'dias')).toBe(
      'Desde el siete (07) de enero de dos mil veinticinco (2025) a los treinta y un (31) días de enero de dos mil veinticinco (2025).',
    );
  });

  // INFORME 2 — contrato 078-2025, febrero
  it('reproduce la firma de febrero', () => {
    expect(fraseFirma(fecha(2025, 2, 28))).toBe(
      'En constancia de lo anterior, se firma el presente informe a los veintiocho (28) días del mes de febrero de dos mil veinticinco (2025).',
    );
  });

  it('reproduce la constancia de febrero', () => {
    expect(fraseConstancia(fecha(2025, 2, 28), 'Olaya Herrera')).toBe(
      'En constancia se expide en el Municipio de Olaya Herrera a los veintiocho (28) días del mes de febrero del año dos mil veinticinco (2025).',
    );
  });

  it('reproduce el periodo de supervisión de febrero', () => {
    expect(frasePeriodoSupervision(fecha(2025, 2, 1), fecha(2025, 2, 28), 'dias')).toBe(
      'Desde el primero (01) de febrero de dos mil veinticinco (2025) a los veintiocho (28) días de febrero de dos mil veinticinco (2025).',
    );
  });

  // INFORME 3 — contrato 084-2025, enero, redacción alterna del periodo
  it('reproduce el periodo de supervisión en la variante "al"', () => {
    expect(frasePeriodoSupervision(fecha(2025, 1, 7), fecha(2025, 1, 31), 'al')).toBe(
      'Desde el siete (07) de enero de dos mil veinticinco (2025) al treinta y uno (31) de enero de dos mil veinticinco (2025).',
    );
  });
});

describe('la preposición «de» en los montos', () => {
  it('la lleva cuando la cifra termina en millón o millones', () => {
    expect(montoALetras(1_000_000)).toBe('UN MILLÓN DE PESOS M/CTE ($1.000.000)');
    expect(montoALetras(3_000_000)).toBe('TRES MILLONES DE PESOS M/CTE ($3.000.000)');
    expect(montoALetras(20_000_000)).toBe('VEINTE MILLONES DE PESOS M/CTE ($20.000.000)');
  });

  it('NO la lleva cuando después de los millones viene algo más', () => {
    // Es el caso de todos los contratos reales del usuario.
    expect(montoALetras(13_630_000)).toContain('TREINTA MIL PESOS M/CTE');
    expect(montoALetras(13_630_000)).not.toContain('DE PESOS');
    expect(montoALetras(1_880_000)).not.toContain('DE PESOS');
    expect(montoALetras(9_413_400)).not.toContain('DE PESOS');
  });

  it('tampoco la llevan los miles ni las unidades', () => {
    expect(montoALetras(2_000)).toBe('DOS MIL PESOS M/CTE ($2.000)');
    expect(montoALetras(500)).toBe('QUINIENTOS PESOS M/CTE ($500)');
  });
});
