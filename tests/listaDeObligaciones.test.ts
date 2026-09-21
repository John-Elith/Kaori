/**
 * Pegar las obligaciones del contrato y que el programa las parta.
 *
 * Llegan copiadas de un Word o de un PDF, así que vienen de mil formas. Lo que
 * no puede pasar es pedirle a nadie que las limpie antes de pegarlas.
 */

import { describe, it, expect } from 'vitest';
import {
  partirEnObligaciones,
  renumerar,
} from '../core/extraccion/listaDeObligaciones';

describe('partir el texto pegado', () => {
  it('reconoce la numeración con punto', () => {
    expect(
      partirEnObligaciones('1. Realizar limpieza de redes.\n2. Informar al supervisor.'),
    ).toEqual(['Realizar limpieza de redes.', 'Informar al supervisor.']);
  });

  it('reconoce paréntesis, guiones y viñetas', () => {
    expect(partirEnObligaciones('1) Uno.\n2) Dos.')).toEqual(['Uno.', 'Dos.']);
    expect(partirEnObligaciones('- Uno.\n- Dos.')).toEqual(['Uno.', 'Dos.']);
    expect(partirEnObligaciones('• Uno.\n• Dos.')).toEqual(['Uno.', 'Dos.']);
    expect(partirEnObligaciones('a) Uno.\nb) Dos.')).toEqual(['Uno.', 'Dos.']);
  });

  it('sin numeración, cada línea es una obligación', () => {
    expect(partirEnObligaciones('Primera cosa.\nSegunda cosa.')).toEqual([
      'Primera cosa.',
      'Segunda cosa.',
    ]);
  });

  it('une las continuaciones de una obligación larga', () => {
    // El contrato del municipio parte las obligaciones largas en varias líneas.
    expect(
      partirEnObligaciones(
        '1. Realizar actividades de mantenimiento de las estructuras\n' +
          'del sistema de alcantarillado con el propósito de que opere\n' +
          'a su máxima eficiencia.\n' +
          '2. Informar al supervisor.',
      ),
    ).toEqual([
      'Realizar actividades de mantenimiento de las estructuras del sistema de alcantarillado con el propósito de que opere a su máxima eficiencia.',
      'Informar al supervisor.',
    ]);
  });

  it('se salta las líneas en blanco', () => {
    expect(partirEnObligaciones('1. Uno.\n\n\n2. Dos.\n')).toEqual(['Uno.', 'Dos.']);
  });

  it('no confunde un número dentro del texto con una numeración', () => {
    expect(partirEnObligaciones('Atender los 3 sectores asignados.')).toEqual([
      'Atender los 3 sectores asignados.',
    ]);
  });

  it('con el texto vacío devuelve una lista vacía', () => {
    expect(partirEnObligaciones('')).toEqual([]);
    expect(partirEnObligaciones('   \n  \n')).toEqual([]);
  });

  it('normaliza los espacios de sobra', () => {
    expect(partirEnObligaciones('1.   Uno    con    huecos.')).toEqual([
      'Uno con huecos.',
    ]);
  });
});

describe('renumerar', () => {
  it('numera desde uno y corrido', () => {
    expect(renumerar([{ texto: 'a' }, { texto: 'b' }, { texto: 'c' }]).map((o) => o.n)).toEqual([
      1, 2, 3,
    ]);
  });

  it('conserva el resto de los datos de cada obligación', () => {
    const r = renumerar([{ n: 7, texto: 'a', actividad: 'Se hizo.' }]);
    expect(r[0]).toEqual({ n: 1, texto: 'a', actividad: 'Se hizo.' });
  });

  it('con la lista vacía no revienta', () => {
    expect(renumerar([])).toEqual([]);
  });
});
