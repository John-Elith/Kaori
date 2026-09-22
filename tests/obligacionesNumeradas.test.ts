/**
 * Sacar las obligaciones específicas del texto de un contrato.
 *
 * El texto de ejemplo es la cláusula 3 de un contrato real de apoyo a la
 * recolección de residuos (sin datos de ninguna persona), tal como sale bien
 * leída y tal como la deja el OCR de una foto.
 */

import { describe, it, expect } from 'vitest';
import {
  extraerObligacionesNumeradas,
  limpiarObligacion,
} from '../core/extraccion/obligacionesNumeradas';

const CLAUSULA =
  'desarrollar las actividades objeto del presente contrato. Cláusula 2 - Objeto del Contrato: El objeto del contrato es contratar la, "PRESTACIÓN DE SERVICIOS DE APOYO EN LAS ACTIVIDADES DE RECOLECCIÓN Y CLASIFICACIÓN DE RESIDUOS". Los Documentos del Proceso forman parte del presente contrato. Cláusula 3 – Actividades específicas del Contrato: Las actividades específicas a desarrollar para la prestación de los servicios de apoyo a la gestión son las siguientes: En los términos del presente contrato el Contratista se compromete a las siguientes actividades: ' +
  '1. Realizar la actividad de apoyo a la gestión barrido y limpieza en las siguientes zonas: La Pista, El Natal, El Camino. ' +
  '2. Ayudar a la recolección de los residuos sólidos de la cuadrilla de barrido en las siguientes zonas: La Pista, El Natal, El Camino, manteniendo limpias sus rutas. ' +
  '3. Realizar la actividad de reciclaje de vidrio, papel o cartón, plásticos, materiales peligrosos o da-\nñinos y reciclaje orgánico en las siguientes zonas: La Pista, El Natal, El Camino. ' +
  '4. Asistir al conductor de la unidad recolectora en las maniobras durante el recorrido y descarga de la unidad en el sitio de disposición final. ' +
  '5. Retirar los residuos de los cestos de basura en las siguientes zonas: La Pista, El Natal, El Camino. ' +
  '6. Dar mantenimiento y limpieza a los cestos de basura y reportar cualquier reparación o retiro que se requiera. ' +
  '7. Reportar al conductor de su ruta, las incidencias y problemas durante el recorrido. ' +
  '8. Apoyar al conductor en la limpieza y mantenimiento de la unidad asignada durante y después del recorrido. ' +
  '9. Lavar periódicamente las unidades utilizadas en la recolección de residuos sólidos. ' +
  '10. Cumplir durante la ejecución del contrato con los protocolos de bioseguridad. ' +
  '11. Realizar las Actividades que el supervisor le asigne para el cumplimiento del objeto contractual. ' +
  '12. Efectuar la devolución de los bienes que se le hayan suministrado, salvo la fuerza mayor o el caso fortuito. ' +
  '13. Realizar los pagos oportunamente Sistema de Seguridad Social (salud y pensiones) como trabajador(a) independiente. ' +
  '14. Presentar los documentos respectivos de los pagos de los aportes al Sistema de Seguridad Social en Salud y pensión. ' +
  '15. En todo caso el contratista efectuará acciones y actividades relacionadas con el objeto contractual. ' +
  'Parágrafo 1: Todas las obligaciones contractuales se ejecutarán por la contratista de manera independiente. Parágrafo 2: Serán de propiedad de la Entidad Estatal los resultados.';

describe('del texto de un contrato', () => {
  const r = extraerObligacionesNumeradas(CLAUSULA);

  it('las quince, una por número', () => {
    expect(r).toHaveLength(15);
    expect(r[0]).toBe(
      'Realizar la actividad de apoyo a la gestión barrido y limpieza en las siguientes zonas: La Pista, El Natal, El Camino.',
    );
    expect(r[14]).toBe(
      'En todo caso el contratista efectuará acciones y actividades relacionadas con el objeto contractual.',
    );
  });

  it('sin la numeración delante', () => {
    expect(r.every((o) => !/^\d/.test(o))).toBe(true);
  });

  it('la última acaba donde empieza el Parágrafo', () => {
    expect(r[14]).not.toMatch(/Parágrafo|independiente/);
  });

  it('no confunde «Cláusula 2» ni «Cláusula 3» con obligaciones', () => {
    expect(r.some((o) => o.includes('Objeto del Contrato'))).toBe(false);
  });

  it('recompone las palabras partidas con guion', () => {
    expect(r[2]).toContain('peligrosos o dañinos y reciclaje');
  });
});

describe('del texto de una foto, con los fallos del OCR', () => {
  // Así lo deja el OCR: basura al final de las líneas y el «10.» perdido.
  const OCR =
    'Cláusula 3 — Actividades específicas del Con a:\nLas actividades específicas a desarrollar son las siguientes: el Contratista *\n' +
    'compromete a las siguientes actividades: 1. Realizar la actividad de apoyo a la gest197\nbarrido y limpieza en las siguientes zonas: La Pista, El Natal, El Camino. 2. Ayudar e\n' +
    'la recolección de los residuos sólidos de la cuadrilla de barrido en las siguientes E.\nLa Pista, El Natal, El Camino, manteniendo limpias sus rutas. 3. Realizar la activi8\n' +
    'de reciclaje de vidrio, papel o cartón. 4. Asistir\nconductor de la unidad recolectora. 5. Retirar los residuos de los cestos de basura. ' +
    '6. Dar mantenimiento y limpieza a los cestos de basura y E“.\ncualquier reparación. 7. Reportar al conductor de su ruta, as\nincidencias. ' +
    '8. Apoyar al conductor en la limpieza. 9. Lavar\nperiódicamente las unidades. El e DL\nCumplir durante la ejecución del contrato con los protocolos. ' +
    '11. Realizar las Actividades que el supervisor le asigne para ;\ncumplimiento del objeto contractual. 12. Efectuar la devolución de los bienes. ' +
    'Parágrafo 1: Todas las obligaciones.';

  const r = extraerObligacionesNumeradas(OCR);

  it('aguanta que falte un número: la 10 queda pegada a la 9', () => {
    expect(r).toHaveLength(11);
    expect(r[8]).toMatch(/^Lavar periódicamente las unidades\. El e DL Cumplir/);
    expect(r[9]).toMatch(/^Realizar las Actividades que el supervisor/);
  });

  it('une las líneas en una sola obligación', () => {
    expect(r[0]).toBe(
      'Realizar la actividad de apoyo a la gest197 barrido y limpieza en las siguientes zonas: La Pista, El Natal, El Camino.',
    );
  });

  it('termina en el Parágrafo', () => {
    expect(r.at(-1)).toBe('Efectuar la devolución de los bienes.');
  });
});

describe('el final de la lista, aunque el OCR estropee «Parágrafo»', () => {
  it('«Parágrafo 1:» ilegible: corta en el «1:»', () => {
    const r = extraerObligacionesNumeradas(
      '1. Hacer A. 2. Hacer B. 3. En todo caso el contratista efectuará acciones de a rien 1: Todas las obligaciones contractuales se ejecutarán.',
    );
    expect(r.at(-1)).toBe('En todo caso el contratista efectuará acciones de a rien.');
  });

  it('corta en el pie de la página', () => {
    const r = extraerObligacionesNumeradas(
      '1. Hacer A. 2. Hacer B. 3. Hacer C del contrato. CENTRO ADMINISTRATIVO MUNICIPAL - Cel: 300 Página 2 de 6',
    );
    expect(r.at(-1)).toBe('Hacer C del contrato.');
  });

  it('quita los signos sueltos del OCR', () => {
    expect(limpiarObligacion('Realizar los pagos — te Sistema > de | Seguridad')).toBe(
      'Realizar los pagos te Sistema de Seguridad.',
    );
  });

  it('no corta por «zonas: La Pista», que no es un número', () => {
    const r = extraerObligacionesNumeradas(
      '1. Hacer A. 2. Hacer B. 3. Barrer en las siguientes zonas: La Pista, El Natal. Parágrafo 1: Otra cosa.',
    );
    expect(r.at(-1)).toBe('Barrer en las siguientes zonas: La Pista, El Natal.');
  });
});

describe('lo que no es una lista', () => {
  it('sin números no inventa nada', () => {
    expect(extraerObligacionesNumeradas('El contratista cumplirá con lo pactado.')).toEqual([]);
  });

  it('dos números sueltos tampoco son una lista', () => {
    expect(extraerObligacionesNumeradas('Ver cláusula 1. Primera parte. 2. Segunda parte.')).toEqual([]);
  });

  it('una lista sin cláusula reconocible, también sirve', () => {
    expect(
      extraerObligacionesNumeradas('1. Hacer A. 2. Hacer B. 3. Hacer C.'),
    ).toEqual(['Hacer A.', 'Hacer B.', 'Hacer C.']);
  });
});

describe('limpiar una obligación', () => {
  it('quita la basura del final y deja un punto', () => {
    expect(limpiarObligacion('Dar mantenimiento a los cestos. E“')).toBe('Dar mantenimiento a los cestos.');
    expect(limpiarObligacion('reportar incidencias,')).toBe('Reportar incidencias.');
  });
});
