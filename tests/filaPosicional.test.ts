/**
 * Las filas del CDP y del RP se leen por posición.
 *
 * La fila es CONCEPTO | DD | MM | AAA | NÚMERO | VALOR | BENEFICIARIO. Si el
 * recorrido se salta las celdas vacías, un NÚMERO en blanco corre todo lo demás
 * una columna: el número acaba impreso en VALOR y el valor en letras en
 * BENEFICIARIO, tapando el nombre del contratista.
 */

import { describe, it, expect } from 'vitest';
import { detectarPorAnclas } from '../core/docx/anclas';
import { construirMapa } from '../core/docx/mapaTexto';
import type { CampoId } from '../core/docx/campos';
import type { Parte } from '../core/docx/mapaTexto';

/** Un documento con la fila del CDP, celda por celda. */
function documento(celdas: string[]): Parte[] {
  const p = (t: string) =>
    t.length === 0
      ? '<w:p><w:r><w:t></w:t></w:r></w:p>'
      : `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  return [
    {
      nombre: 'word/document.xml',
      xml: `<w:body>${p('CERTIFICADO DE DISPONIBILIDAD PRESUPUESTAL')}${celdas
        .map(p)
        .join('')}</w:body>`,
    },
  ];
}

/** Campo → texto detectado. */
function detectado(celdas: string[]): Map<CampoId, string> {
  const encontrados = new Map<CampoId, string>();
  for (const c of detectarPorAnclas(construirMapa(documento(celdas)))) {
    const campo = c.sugerencias[0];
    if (campo && !encontrados.has(campo)) encontrados.set(campo, c.texto);
  }
  return encontrados;
}

const FILA_COMPLETA = [
  '02', '01', '2025',
  '2025000022',
  'DIEZ MILLONES CUATROCIENTOS NOVENTA Y CUATRO MIL PESOS M/CTE ($10.494.000)',
  'PEDRO RAMIREZ LOPEZ',
];

describe('fila del CDP completa', () => {
  it('cada dato cae en su columna', () => {
    const c = detectado(FILA_COMPLETA);
    expect(c.get('cdpFechaDia')).toBe('02');
    expect(c.get('cdpFechaMes')).toBe('01');
    expect(c.get('cdpFechaAnio')).toBe('2025');
    expect(c.get('cdpNumero')).toBe('2025000022');
    expect(c.get('cdpValorLetras')).toContain('DIEZ MILLONES CUATROCIENTOS');
  });

  it('el beneficiario no se toca: es el contratista y lo pone el programa', () => {
    const marcados = [...detectado(FILA_COMPLETA).values()];
    expect(marcados).not.toContain('PEDRO RAMIREZ LOPEZ');
  });
});

describe('fila del CDP con el NÚMERO en blanco', () => {
  const conHueco = ['02', '01', '2025', '', 'DIEZ MILLONES … ($10.494.000)', 'PEDRO RAMIREZ LOPEZ'];

  it('no corre las demás columnas', () => {
    const c = detectado(conHueco);

    // La fecha sigue donde estaba.
    expect(c.get('cdpFechaDia')).toBe('02');
    expect(c.get('cdpFechaAnio')).toBe('2025');

    // Y el valor en letras se queda en la columna VALOR, no en BENEFICIARIO.
    expect(c.get('cdpValorLetras')).toContain('DIEZ MILLONES');
    expect(c.get('cdpValorLetras')).not.toBe('PEDRO RAMIREZ LOPEZ');
  });

  it('la celda vacía se queda sin mapear, en vez de robarle el sitio a la siguiente', () => {
    // Una celda sin texto no tiene dónde escribir: lo correcto es dejarla sin
    // mapear —y que salga vacía en el informe, a la vista— y no desplazar toda
    // la fila para rellenarla con el dato de al lado.
    const c = detectado(conHueco);
    expect(c.get('cdpNumero')).toBeUndefined();
  });

  it('el nombre del contratista nunca se marca como un campo', () => {
    expect([...detectado(conHueco).values()]).not.toContain('PEDRO RAMIREZ LOPEZ');
  });
});

describe('fila del RP', () => {
  it('sigue las mismas reglas', () => {
    const partes: Parte[] = [
      {
        nombre: 'word/document.xml',
        xml:
          '<w:body><w:p><w:r><w:t>REGISTRO PRESUPUESTAL</w:t></w:r></w:p>' +
          ['02', '01', '2025', '2025000024', 'DIEZ MILLONES CIENTO CUARENTA Y CUATRO MIL DOSCIENTOS PESOS M/CTE ($10.144.200)']
            .map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`)
            .join('') +
          '</w:body>',
      },
    ];

    const c = new Map<CampoId, string>();
    for (const x of detectarPorAnclas(construirMapa(partes))) {
      const campo = x.sugerencias[0];
      if (campo && !c.has(campo)) c.set(campo, x.texto);
    }

    expect(c.get('rpNumero')).toBe('2025000024');
    expect(c.get('rpValorLetras')).toContain('DIEZ MILLONES CIENTO CUARENTA');
  });
});
