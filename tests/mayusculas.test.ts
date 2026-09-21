/**
 * Los botones de MAYÚSCULAS y minúsculas del OBJETO y del PLAZO.
 *
 * Lo delicado es el paso a minúsculas: bajarlo todo dejaría el párrafo
 * empezando en minúscula, que nunca es lo que se quiere.
 */

import { describe, it, expect } from 'vitest';
import { aMinusculasConFrases } from '../src/componentes/Ui';

describe('a minúsculas conservando las frases', () => {
  it('baja el texto pero deja mayúscula la primera letra', () => {
    expect(aMinusculasConFrases('PRESTACIÓN DE SERVICIOS DE APOYO.')).toBe(
      'Prestación de servicios de apoyo.',
    );
  });

  it('pone mayúscula después de cada punto', () => {
    expect(aMinusculasConFrases('UNA COSA. OTRA COSA. Y UNA MÁS.')).toBe(
      'Una cosa. Otra cosa. Y una más.',
    );
  });

  it('también después de un salto de línea', () => {
    expect(aMinusculasConFrases('PRIMERA LÍNEA\nSEGUNDA LÍNEA')).toBe(
      'Primera línea\nSegunda línea',
    );
  });

  it('respeta las tildes y la eñe del español', () => {
    expect(aMinusculasConFrases('OLAYA HERRERA (NARIÑO)')).toBe('Olaya herrera (nariño)');
    expect(aMinusculasConFrases('EJECUCIÓN')).toBe('Ejecución');
  });

  it('no toca los números ni los signos', () => {
    expect(aMinusculasConFrases('CONTRATO No. CD 084-2025')).toBe(
      'Contrato no. Cd 084-2025',
    );
  });

  it('con el texto vacío devuelve vacío', () => {
    expect(aMinusculasConFrases('')).toBe('');
  });

  it('es estable: aplicarlo dos veces da lo mismo', () => {
    const una = aMinusculasConFrases('PRESTACIÓN DE SERVICIOS. APOYO A LA GESTIÓN.');
    expect(aMinusculasConFrases(una)).toBe(una);
  });
});
