/**
 * La fecha que se propone al escribir una planilla a mano.
 *
 * La planilla de un mes se paga al principio del siguiente: la de enero de
 * 2025 del informe real lleva fecha del 4 de febrero. Proponer esa fecha
 * ahorra corregirla casi siempre, y quien la tenga delante puede cambiarla.
 */

import { describe, it, expect } from 'vitest';
import { fechaDePagoPorDefecto } from '../src/paginas/GenerarMes';
import { desdeISO } from '../core/espanol/calendario';

describe('fecha de pago propuesta', () => {
  it('cae en el mes siguiente al del informe', () => {
    expect(fechaDePagoPorDefecto(2025, 1)).toBe('2025-02-01');
    expect(fechaDePagoPorDefecto(2025, 6)).toBe('2025-07-01');
  });

  it('diciembre pasa a enero del año siguiente', () => {
    expect(fechaDePagoPorDefecto(2025, 12)).toBe('2026-01-01');
  });

  it('siempre devuelve una fecha ISO válida', () => {
    for (let mes = 1; mes <= 12; mes++) {
      expect(() => desdeISO(fechaDePagoPorDefecto(2025, mes))).not.toThrow();
    }
  });
});
