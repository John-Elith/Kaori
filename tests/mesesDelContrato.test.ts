/**
 * Los meses de un contrato en un año: lo que marca «Solo un contrato» en
 * Generar mes.
 */

import { describe, it, expect } from 'vitest';
import { aniosDelContrato, mesesDelContratoEn } from '../core/modelo/actividad';
import type { Contrato } from '../core/modelo/tipos';

const contrato = (parcial: Partial<Contrato>): Contrato =>
  ({
    fechaInicio: '2025-07-01',
    fechaTerminacion: '2025-12-30',
    adiciones: [],
    suspensiones: [],
    ...parcial,
  }) as Contrato;

describe('meses de un contrato', () => {
  it('de julio a diciembre', () => {
    expect(mesesDelContratoEn(contrato({}), 2025)).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('un inicio a mitad de mes cuenta ese mes', () => {
    expect(mesesDelContratoEn(contrato({ fechaInicio: '2025-01-08', fechaTerminacion: '2025-06-30' }), 2025)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('en otro año, ninguno', () => {
    expect(mesesDelContratoEn(contrato({}), 2026)).toEqual([]);
  });

  it('un contrato que cruza el año se parte por años', () => {
    const c = contrato({ fechaInicio: '2025-10-01', fechaTerminacion: '2026-03-31' });
    expect(mesesDelContratoEn(c, 2025)).toEqual([10, 11, 12]);
    expect(mesesDelContratoEn(c, 2026)).toEqual([1, 2, 3]);
    expect(aniosDelContrato(c)).toEqual([2025, 2026]);
  });

  it('una prórroga añade sus meses', () => {
    const c = contrato({
      adiciones: [
        { id: 'a', fecha: '2025-12-01', valor: 0, nuevaFechaTerminacion: '2026-02-28', cuotasAgregadas: [] },
      ],
    });
    expect(mesesDelContratoEn(c, 2026)).toEqual([1, 2]);
    expect(aniosDelContrato(c)).toEqual([2025, 2026]);
  });

  it('con las fechas al revés no inventa meses', () => {
    const c = contrato({ fechaInicio: '2026-07-01', fechaTerminacion: '2025-12-30' });
    expect(mesesDelContratoEn(c, 2025)).toEqual([]);
    expect(mesesDelContratoEn(c, 2026)).toEqual([]);
  });
});
