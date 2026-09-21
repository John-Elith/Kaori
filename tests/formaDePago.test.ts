/**
 * El texto esperado está copiado de los contratos reales 078-2025 y 084-2025.
 */

import { describe, it, expect } from 'vitest';
import {
  redactarFormaDePago,
  diasDelPrimerMes,
  COLETILLA_REQUISITOS,
} from '../core/generar/formaDePago';
import { generarCronograma } from '../core/pagos/cronograma';
import { fecha } from '../core/espanol/calendario';

const CUOTAS_078 = generarCronograma({
  fechaInicio: '2025-01-07',
  fechaTerminacion: '2025-06-30',
  valorMensual: 2_350_000,
  porMes: { '2025-01': 1_880_000 },
});

const CUOTAS_084 = generarCronograma({
  fechaInicio: '2025-01-07',
  fechaTerminacion: '2025-06-30',
  valorMensual: 1_623_000,
  porMes: { '2025-01': 1_298_400 },
});

describe('diasDelPrimerMes', () => {
  it('cuenta como lo hacen los contratos reales', () => {
    // El contrato arranca el 7 y paga el 31: el documento dice «veinticuatro
    // (24) días», que es la diferencia, no los días trabajados contando el 7.
    expect(diasDelPrimerMes(fecha(2025, 1, 7))).toBe(24);
    expect(diasDelPrimerMes(fecha(2025, 2, 1))).toBe(27);
    expect(diasDelPrimerMes(fecha(2024, 2, 10))).toBe(19); // febrero bisiesto
  });
});

describe('redactarFormaDePago', () => {
  it('reproduce el párrafo del contrato 078-2025', () => {
    const texto = redactarFormaDePago({
      valorTotal: 13_630_000,
      cuotas: CUOTAS_078,
      fechaInicio: '2025-01-07',
    });

    expect(texto).toBe(
      'El Municipio cancelará al contratista la suma de TRECE MILLONES SEISCIENTOS ' +
        'TREINTA MIL PESOS M/CTE ($13.630.000), por medio seis (06) mensualidades ' +
        'vencidas una primera mensualidad por el valor de UN MILLÓN OCHOCIENTOS ' +
        'OCHENTA MIL PESOS M/CTE ($1.880.000) correspondientes a los veinticuatro ' +
        '(24) días del mes de enero del dos mil veinticinco (2025) y cinco ' +
        'mensualidades por un valor de DOS MILLONES TRESCIENTOS CINCUENTA MIL PESOS ' +
        'M/CTE ($2.350.000) correspondientes a los meses de febrero a junio del año ' +
        'dos mil veinticinco (2025), en los que el contratista deberá prestar sus ' +
        'servicios al Municipio.',
    );
  });

  it('reproduce el párrafo del contrato 084-2025', () => {
    const texto = redactarFormaDePago({
      valorTotal: 9_413_400,
      cuotas: CUOTAS_084,
      fechaInicio: '2025-01-07',
    });

    expect(texto).toContain(
      'la suma de NUEVE MILLONES CUATROCIENTOS TRECE MIL CUATROCIENTOS PESOS M/CTE ($9.413.400)',
    );
    expect(texto).toContain('por medio seis (06) mensualidades vencidas');
    expect(texto).toContain(
      'una primera mensualidad por el valor de UN MILLÓN DOSCIENTOS NOVENTA Y OCHO MIL ' +
        'CUATROCIENTOS PESOS M/CTE ($1.298.400)',
    );
    expect(texto).toContain('a los veinticuatro (24) días del mes de enero');
    expect(texto).toContain(
      'cinco mensualidades por un valor de UN MILLÓN SEISCIENTOS VEINTITRÉS MIL PESOS ' +
        'M/CTE ($1.623.000)',
    );
    expect(texto).toContain('de febrero a junio del año dos mil veinticinco (2025)');
  });

  it('añade la coletilla de requisitos cuando se pide', () => {
    const con = redactarFormaDePago({
      valorTotal: 9_413_400,
      cuotas: CUOTAS_084,
      fechaInicio: '2025-01-07',
      incluirRequisitos: true,
    });
    const sin = redactarFormaDePago({
      valorTotal: 9_413_400,
      cuotas: CUOTAS_084,
      fechaInicio: '2025-01-07',
    });

    expect(con).toContain(COLETILLA_REQUISITOS);
    expect(sin).not.toContain(COLETILLA_REQUISITOS);
    expect(con.startsWith(sin)).toBe(true);
  });

  it('si el contrato arranca el día 1, no habla de días sueltos', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-03-01',
      fechaTerminacion: '2025-05-31',
      valorMensual: 1_000_000,
    });
    const texto = redactarFormaDePago({
      valorTotal: 3_000_000,
      cuotas,
      fechaInicio: '2025-03-01',
    });

    expect(texto).not.toContain('días del mes');
    expect(texto).toContain('por un valor de UN MILLÓN DE PESOS M/CTE ($1.000.000) cada una');
    expect(texto).toContain('de marzo a mayo del año dos mil veinticinco (2025)');
  });

  it('enumera las cuotas cuando los importes son irregulares', () => {
    const cuotas = [
      { n: 1, fecha: '2025-01-31', valor: 500_000 },
      { n: 2, fecha: '2025-02-28', valor: 800_000 },
      { n: 3, fecha: '2025-03-31', valor: 1_200_000 },
    ];
    const texto = redactarFormaDePago({
      valorTotal: 2_500_000,
      cuotas,
      fechaInicio: '2025-01-15',
    });

    // No inventa un importe único que no corresponde a ninguna cuota.
    expect(texto).toContain('las siguientes mensualidades así:');
    expect(texto).toContain('febrero por OCHOCIENTOS MIL PESOS M/CTE ($800.000)');
    expect(texto).toContain('marzo por UN MILLÓN DOSCIENTOS MIL PESOS M/CTE ($1.200.000)');
  });

  it('maneja un cronograma que cruza de año', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-11-10',
      fechaTerminacion: '2026-02-28',
      valorMensual: 1_000_000,
      porMes: { '2025-11': 600_000 },
    });
    const texto = redactarFormaDePago({
      valorTotal: 3_600_000,
      cuotas,
      fechaInicio: '2025-11-10',
    });

    expect(texto).toContain('días del mes de noviembre del dos mil veinticinco (2025)');
    expect(texto).toContain(
      'de diciembre del año dos mil veinticinco (2025) a febrero del año dos mil veintiséis (2026)',
    );
  });

  it('no se rompe si aún no hay cronograma', () => {
    const texto = redactarFormaDePago({
      valorTotal: 5_000_000,
      cuotas: [],
      fechaInicio: '2025-01-07',
    });
    expect(texto).toContain('CINCO MILLONES DE PESOS M/CTE ($5.000.000)');
    expect(texto).toContain('en los términos pactados en el contrato');
  });
});
