/**
 * El orden de los contratos dentro de cada mes de «Generar mes»: primero el
 * último con el que se trabajó, luego los demás del más reciente al más
 * antiguo.
 */

import { describe, it, expect } from 'vitest';
import { porActividad, ultimaActividad, type ConActividad } from '../core/modelo/actividad';
import type { Contrato } from '../core/modelo/tipos';

const contrato = (id: string, actualizadoEn?: string) =>
  ({ id, actualizadoEn }) as unknown as Contrato;

describe('la última actividad de un contrato', () => {
  it('es lo más reciente entre editarlo y generarle documentos', () => {
    const base = {
      informes: [
        { contratoId: 'a', anio: 2025, mes: 1, generadoEn: '2026-09-20T10:00:00Z' },
        { contratoId: 'a', anio: 2025, mes: 2, generadoEn: '2026-09-21T09:00:00Z' },
        { contratoId: 'b', anio: 2025, mes: 2, generadoEn: '2026-09-21T12:00:00Z' },
      ],
      certificados: [{ contratoId: 'a', generadoEn: '2026-09-19T08:00:00Z', rutaArchivo: '', nombreArchivo: '' }],
    };
    expect(ultimaActividad(contrato('a', '2026-09-01T00:00:00Z'), base)).toBe('2026-09-21T09:00:00Z');
    expect(ultimaActividad(contrato('a', '2026-09-22T00:00:00Z'), base)).toBe('2026-09-22T00:00:00Z');
  });

  it('una planilla anotada sin informe generado no cuenta por sí sola', () => {
    // La planilla deja rastro en el contrato (actualizadoEn), no aquí.
    const base = { informes: [{ contratoId: 'a', anio: 2025, mes: 1 }], certificados: [] };
    expect(ultimaActividad(contrato('a'), base)).toBeUndefined();
  });
});

describe('el orden dentro de cada mes', () => {
  const fila = (numero: string, fechaInicio: string, actividad?: string): ConActividad => ({
    numero,
    fechaInicio,
    actividad,
  });

  it('el último trabajado primero, y los demás del más reciente al más antiguo', () => {
    const filas = [
      fila('344-2025', '2025-07-01', '2026-09-10T08:00:00Z'),
      fila('509-2025', '2025-10-01', '2026-09-21T11:26:00Z'),
      fila('234-2026', '2026-07-01'),
      fila('342-2025', '2025-07-01', '2026-09-15T08:00:00Z'),
      fila('508-2025', '2025-10-01'),
    ].sort(porActividad);

    expect(filas.map((f) => f.numero)).toEqual([
      '509-2025', // el último trabajado
      '342-2025',
      '344-2025',
      '234-2026', // nunca tocados: el contrato más nuevo primero
      '508-2025',
    ]);
  });

  it('con la misma fecha de inicio y sin actividad, por número', () => {
    const filas = [fila('10-2025', '2025-01-01'), fila('9-2025', '2025-01-01')].sort(porActividad);
    expect(filas.map((f) => f.numero)).toEqual(['9-2025', '10-2025']);
  });
});
