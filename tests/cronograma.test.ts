/**
 * Las cifras esperadas provienen de los informes reales de los contratos
 * 078-2025 (Andres Felipe Morales Rojas) y 084-2025 (Juan Perez
 * Gomez), enero y febrero de 2025.
 */

import { describe, it, expect } from 'vitest';
import type { Contrato } from '../core/modelo/tipos';
import {
  balanceDelMes,
  pagoDelMes,
  totalPagadoHasta,
  rangoDelInforme,
  generarCronograma,
  cronogramaVigente,
  valorVigente,
  fechaTerminacionVigente,
  diasSuspendidos,
} from '../core/pagos/cronograma';
import { fecha } from '../core/espanol/calendario';

/** Contrato 078-2025, tal como aparece en los informes. */
function contrato078(): Contrato {
  return {
    id: 'c078',
    contratistaId: 'k1',
    numero: '078-2025',
    anio: 2025,
    objeto:
      'PRESTACIÓN DE SERVICIOS DE APOYO EN LA EJECUCIÓN DEL PLAN DE ACCIÓN DE LA OFICINA DE SERVICIOS PÚBLICOS…',
    fechaInicio: '2025-01-07',
    fechaTerminacion: '2025-06-30',
    fechaFirma: '2025-01-07',
    valorInicial: 13_630_000,
    cuotas: [
      { n: 1, fecha: '2025-01-31', valor: 1_880_000 },
      { n: 2, fecha: '2025-02-28', valor: 2_350_000 },
      { n: 3, fecha: '2025-03-31', valor: 2_350_000 },
      { n: 4, fecha: '2025-04-30', valor: 2_350_000 },
      { n: 5, fecha: '2025-05-31', valor: 2_350_000 },
      { n: 6, fecha: '2025-06-30', valor: 2_350_000 },
    ],
    adiciones: [],
    suspensiones: [],
    formaDePago: '',
    textoPlazo: '',
    contratante: 'MUNICIPIO OLAYA HERRERA',
    nitContratante: '800099113-1',
    municipio: 'Olaya Herrera',
    supervisor: { nombre: 'MANUEL ENRIQUE SALAZAR PEREZ', cargo: '' },
    cdp: { numero: '2025000021', fecha: '2025-01-02', valor: 14_100_000 },
    rp: { numero: '2025000023', fecha: '2025-01-07', valor: 13_630_000 },
    obligaciones: [],
    obligacionesSupervision: [],
    plantillaId: 'p1',
    activo: true,
  };
}

/** Contrato 084-2025. */
function contrato084(): Contrato {
  return {
    ...contrato078(),
    id: 'c084',
    contratistaId: 'k2',
    numero: '084-2025',
    valorInicial: 9_413_400,
    cuotas: [
      { n: 1, fecha: '2025-01-31', valor: 1_298_400 },
      { n: 2, fecha: '2025-02-28', valor: 1_623_000 },
      { n: 3, fecha: '2025-03-31', valor: 1_623_000 },
      { n: 4, fecha: '2025-04-30', valor: 1_623_000 },
      { n: 5, fecha: '2025-05-31', valor: 1_623_000 },
      { n: 6, fecha: '2025-06-30', valor: 1_623_000 },
    ],
    cdp: { numero: '2025000027', fecha: '2025-01-02', valor: 9_413_400 },
    rp: { numero: '2025000029', fecha: '2025-01-07', valor: 9_413_400 },
  };
}

describe('contrato 078-2025', () => {
  it('las cuotas suman el valor del contrato', () => {
    const c = contrato078();
    const suma = c.cuotas.reduce((s, q) => s + q.valor, 0);
    expect(suma).toBe(13_630_000);
  });

  it('enero: pago 1.880.000 y saldo 11.750.000', () => {
    const b = balanceDelMes(contrato078(), 2025, 1)!;
    expect(b.pagoDelMes).toBe(1_880_000);
    expect(b.totalPagado).toBe(1_880_000);
    expect(b.valorEjecutado).toBe(1_880_000);
    expect(b.valorPorEjecutar).toBe(11_750_000); // ← cifra del informe real
    expect(b.valorInicial).toBe(13_630_000);
    expect(b.valorAdiciones).toBe(0);
    expect(b.sumasIguales).toBe(13_630_000);
  });

  it('febrero: acumulado 4.230.000 y saldo 9.400.000', () => {
    const b = balanceDelMes(contrato078(), 2025, 2)!;
    expect(b.pagoDelMes).toBe(2_350_000);
    expect(b.totalPagado).toBe(4_230_000); // ← cifra del informe real
    expect(b.valorPorEjecutar).toBe(9_400_000); // ← cifra del informe real
  });

  it('el saldo llega a cero en el último mes', () => {
    const b = balanceDelMes(contrato078(), 2025, 6)!;
    expect(b.totalPagado).toBe(13_630_000);
    expect(b.valorPorEjecutar).toBe(0);
  });

  it('enero va del 7 al 31 porque el contrato arranca el 7', () => {
    const r = rangoDelInforme(contrato078(), 2025, 1)!;
    expect(r.desde).toEqual(fecha(2025, 1, 7));
    expect(r.hasta).toEqual(fecha(2025, 1, 31));
  });

  it('febrero va del 1 al 28', () => {
    const r = rangoDelInforme(contrato078(), 2025, 2)!;
    expect(r.desde).toEqual(fecha(2025, 2, 1));
    expect(r.hasta).toEqual(fecha(2025, 2, 28));
  });

  it('junio termina el 30, día de terminación del contrato', () => {
    const r = rangoDelInforme(contrato078(), 2025, 6)!;
    expect(r.hasta).toEqual(fecha(2025, 6, 30));
  });

  it('no hay informe fuera de la vigencia', () => {
    expect(rangoDelInforme(contrato078(), 2024, 12)).toBeNull();
    expect(rangoDelInforme(contrato078(), 2025, 7)).toBeNull();
  });
});

describe('contrato 084-2025', () => {
  it('las cuotas suman el valor del contrato', () => {
    const suma = contrato084().cuotas.reduce((s, q) => s + q.valor, 0);
    expect(suma).toBe(9_413_400);
  });

  it('enero: pago 1.298.400 y saldo 8.115.000', () => {
    const b = balanceDelMes(contrato084(), 2025, 1)!;
    expect(b.pagoDelMes).toBe(1_298_400);
    expect(b.totalPagado).toBe(1_298_400); // ← cifra del informe real
    expect(b.valorPorEjecutar).toBe(8_115_000); // ← cifra del informe real
    expect(b.sumasIguales).toBe(9_413_400);
  });
});

describe('generarCronograma', () => {
  it('reconstruye el cronograma del contrato 078-2025', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-01-07',
      fechaTerminacion: '2025-06-30',
      valorMensual: 2_350_000,
      primeraCuota: 1_880_000,
    });
    expect(cuotas).toHaveLength(6);
    expect(cuotas.map((c) => c.fecha)).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
      '2025-05-31',
      '2025-06-30',
    ]);
    expect(cuotas.reduce((s, c) => s + c.valor, 0)).toBe(13_630_000);
  });

  it('reconstruye el cronograma del contrato 084-2025', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-01-07',
      fechaTerminacion: '2025-06-30',
      valorMensual: 1_623_000,
      primeraCuota: 1_298_400,
    });
    expect(cuotas.reduce((s, c) => s + c.valor, 0)).toBe(9_413_400);
  });

  it('sin primera cuota especial, todas valen igual', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-01-01',
      fechaTerminacion: '2025-03-31',
      valorMensual: 1_000_000,
    });
    expect(cuotas).toHaveLength(3);
    expect(cuotas.every((c) => c.valor === 1_000_000)).toBe(true);
  });
});

describe('adiciones', () => {
  it('aumentan el valor vigente y el saldo por ejecutar', () => {
    const c = contrato078();
    c.adiciones = [
      {
        id: 'a1',
        fecha: '2025-06-15',
        valor: 4_700_000,
        nuevaFechaTerminacion: '2025-08-31',
        cuotasAgregadas: [
          { n: 7, fecha: '2025-07-31', valor: 2_350_000 },
          { n: 8, fecha: '2025-08-31', valor: 2_350_000 },
        ],
      },
    ];

    expect(valorVigente(c)).toBe(18_330_000);

    // En junio ya se pagaron las 6 cuotas originales, pero quedan las 2 nuevas.
    const junio = balanceDelMes(c, 2025, 6)!;
    expect(junio.totalPagado).toBe(13_630_000);
    expect(junio.valorAdiciones).toBe(4_700_000);
    expect(junio.valorPorEjecutar).toBe(4_700_000);
    expect(junio.sumasIguales).toBe(18_330_000);

    // Agosto cierra el contrato prorrogado.
    const agosto = balanceDelMes(c, 2025, 8)!;
    expect(agosto.totalPagado).toBe(18_330_000);
    expect(agosto.valorPorEjecutar).toBe(0);
  });

  it('la prórroga corre la fecha de terminación', () => {
    const c = contrato078();
    c.adiciones = [
      {
        id: 'a1',
        fecha: '2025-06-15',
        valor: 0,
        nuevaFechaTerminacion: '2025-08-31',
        cuotasAgregadas: [],
      },
    ];
    expect(fechaTerminacionVigente(c)).toEqual(fecha(2025, 8, 31));
    // Julio ya cae dentro de la vigencia prorrogada.
    expect(rangoDelInforme(c, 2025, 7)).not.toBeNull();
  });

  it('el cronograma intercala las cuotas de la adición en orden de fecha', () => {
    const c = contrato078();
    c.adiciones = [
      {
        id: 'a1',
        fecha: '2025-03-10',
        valor: 500_000,
        cuotasAgregadas: [{ n: 99, fecha: '2025-03-31', valor: 500_000 }],
      },
    ];
    const cron = cronogramaVigente(c);
    expect(cron).toHaveLength(7);
    expect(cron.map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6, 7]); // renumeradas
    // Marzo ahora paga la cuota original más la de la adición.
    expect(pagoDelMes(c, 2025, 3)).toBe(2_850_000);
    expect(totalPagadoHasta(c, 2025, 3)).toBe(7_080_000);
  });
});

describe('suspensiones', () => {
  it('cuentan los días suspendidos de forma inclusiva', () => {
    expect(
      diasSuspendidos([{ id: 's1', desde: '2025-03-01', hasta: '2025-03-31' }]),
    ).toBe(31);
    expect(
      diasSuspendidos([{ id: 's1', desde: '2025-03-10', hasta: '2025-03-10' }]),
    ).toBe(1);
    // Una suspensión aún vigente no tiene duración conocida.
    expect(diasSuspendidos([{ id: 's1', desde: '2025-03-01', hasta: null }])).toBe(0);
  });

  it('un mes suspendido por completo no genera informe', () => {
    const c = contrato078();
    c.suspensiones = [{ id: 's1', desde: '2025-03-01', hasta: '2025-03-31' }];
    expect(rangoDelInforme(c, 2025, 3)).toBeNull();
  });

  it('una suspensión parcial recorta el rango del informe', () => {
    const c = contrato078();
    c.suspensiones = [{ id: 's1', desde: '2025-03-01', hasta: '2025-03-10' }];
    const r = rangoDelInforme(c, 2025, 3)!;
    expect(r.desde).toEqual(fecha(2025, 3, 11));
    expect(r.hasta).toEqual(fecha(2025, 3, 31));
  });

  it('una suspensión al final del mes recorta por el otro extremo', () => {
    const c = contrato078();
    c.suspensiones = [{ id: 's1', desde: '2025-03-20', hasta: '2025-04-05' }];
    const marzo = rangoDelInforme(c, 2025, 3)!;
    expect(marzo.hasta).toEqual(fecha(2025, 3, 19));
    const abril = rangoDelInforme(c, 2025, 4)!;
    expect(abril.desde).toEqual(fecha(2025, 4, 6));
  });

  it('los días suspendidos corren la fecha de terminación', () => {
    const c = contrato078();
    c.suspensiones = [{ id: 's1', desde: '2025-03-01', hasta: '2025-03-31' }];
    // 31 días suspendidos: del 30 de junio pasa al 31 de julio.
    expect(fechaTerminacionVigente(c)).toEqual(fecha(2025, 7, 31));
  });
});

describe('cronograma con importes por mes', () => {
  it('permite que el primer mes se pague proporcional y el resto completo', () => {
    // Es el caso de los contratos reales: arrancan el 7 de enero, así que enero
    // no se paga completo pero febrero a junio sí.
    const cuotas = generarCronograma({
      fechaInicio: '2025-01-07',
      fechaTerminacion: '2025-06-30',
      valorMensual: 1_623_000,
      porMes: { '2025-01': 1_298_400 },
    });

    expect(cuotas).toHaveLength(6);
    expect(cuotas[0].valor).toBe(1_298_400);
    expect(cuotas.slice(1).every((c) => c.valor === 1_623_000)).toBe(true);
    expect(cuotas.reduce((s, c) => s + c.valor, 0)).toBe(9_413_400);
  });

  it('admite varias excepciones, no sólo la del primer mes', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-01-01',
      fechaTerminacion: '2025-04-30',
      valorMensual: 1_000_000,
      porMes: { '2025-02': 500_000, '2025-04': 250_000 },
    });

    expect(cuotas.map((c) => c.valor)).toEqual([1_000_000, 500_000, 1_000_000, 250_000]);
  });

  it('la excepción manda sobre la primera cuota', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-01-01',
      fechaTerminacion: '2025-03-31',
      valorMensual: 1_000_000,
      primeraCuota: 700_000,
      porMes: { '2025-01': 123_456 },
    });
    expect(cuotas[0].valor).toBe(123_456);
  });

  it('sin excepciones se comporta igual que antes', () => {
    const cuotas = generarCronograma({
      fechaInicio: '2025-01-07',
      fechaTerminacion: '2025-06-30',
      valorMensual: 2_350_000,
      primeraCuota: 1_880_000,
      porMes: {},
    });
    expect(cuotas.reduce((s, c) => s + c.valor, 0)).toBe(13_630_000);
  });
});
