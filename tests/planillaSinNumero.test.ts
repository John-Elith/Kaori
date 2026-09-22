/**
 * La fila de la planilla PILA cuando el mes no tiene planilla anotada.
 *
 * El número y la fecha no se saben y quedan en blanco para escribirlos a mano;
 * el mes de pago sí se sabe —es el del informe— y se escribe. Lo que nunca
 * debe quedar es la planilla que traía la plantilla, que es la de otra persona.
 */

import { describe, it, expect } from 'vitest';
import { llenarTablaPlanilla } from '../core/generar/tablas';
import type { Parte } from '../core/docx/mapaTexto';

/** Una tabla de planilla con la fila de datos ya rellena, como en la plantilla. */
function tabla(datos = ['9000000009', '04', '02', '2025', 'enero']): Parte[] {
  const celda = (t: string) =>
    t.length === 0 ? '<w:tc><w:p/></w:tc>' : `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const fila = (cs: string[]) => `<w:tr>${cs.map(celda).join('')}</w:tr>`;
  return [
    {
      nombre: 'word/document.xml',
      xml:
        '<w:body><w:tbl>' +
        fila(['NÚMERO DE PLANILLA', 'FECHA', 'MES DE PAGO']) +
        fila(['DD', 'MM', 'AAA']) +
        fila(datos) +
        '</w:tbl></w:body>',
    },
  ];
}

/** Las celdas de la fila de datos del resultado. */
function datosDe(xml: string): string[] {
  const ultima = [...xml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].at(-1)!;
  return [...ultima[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) =>
    [...c[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join(''),
  );
}

describe('sin número de planilla', () => {
  it('escribe el mes de pago, que es el del informe', () => {
    const r = llenarTablaPlanilla(tabla(), undefined, 1);
    expect(datosDe(r.partes[0].xml)).toEqual(['', '', '', '', 'enero']);
  });

  it('el mes que toque, no el que traía la plantilla', () => {
    const r = llenarTablaPlanilla(tabla(), undefined, 9);
    expect(datosDe(r.partes[0].xml)).toEqual(['', '', '', '', 'septiembre']);
  });

  it('también si esa casilla venía vacía en la plantilla', () => {
    const r = llenarTablaPlanilla(tabla(['', '', '', '', '']), undefined, 3);
    expect(datosDe(r.partes[0].xml)).toEqual(['', '', '', '', 'marzo']);
  });

  it('el número y la fecha de la plantilla no se cuelan', () => {
    const xml = llenarTablaPlanilla(tabla(), undefined, 1).partes[0].xml;
    expect(xml).not.toContain('9000000009');
    expect(datosDe(xml).slice(0, 4)).toEqual(['', '', '', '']);
  });
});

describe('con planilla anotada', () => {
  it('manda el mes acreditado de la planilla, no el del informe', () => {
    const r = llenarTablaPlanilla(
      tabla(),
      { numero: '9000000010', fecha: '2025-03-10', mesAcreditado: 'febrero' },
      2,
    );
    expect(datosDe(r.partes[0].xml)).toEqual(['9000000010', '10', '03', '2025', 'febrero']);
  });
});
