/**
 * El balance de recursos del informe.
 *
 * Se rellena por posición de celda y no por el mapeo de campos, porque esas
 * casillas pueden venir **vacías** en la plantilla: sin texto que reemplazar,
 * el mapeo no tenía dónde escribir y VALOR EJECUTADO y VALOR POR EJECUTAR
 * salían en blanco.
 */

import { describe, it, expect } from 'vitest';
import { llenarTablaBalance } from '../core/generar/tablas';
import { balanceDelMes } from '../core/pagos/cronograma';
import type { Contrato, Cuota } from '../core/modelo/tipos';
import type { Parte } from '../core/docx/mapaTexto';

const CUOTAS: Cuota[] = [
  { n: 1, fecha: '2025-01-31', valor: 1_339_200 },
  { n: 2, fecha: '2025-02-28', valor: 1_761_000 },
  { n: 3, fecha: '2025-03-31', valor: 1_761_000 },
  { n: 4, fecha: '2025-04-30', valor: 1_761_000 },
  { n: 5, fecha: '2025-05-31', valor: 1_761_000 },
  { n: 6, fecha: '2025-06-30', valor: 1_761_000 },
];

const contrato = {
  numero: '079-2025',
  fechaInicio: '2025-01-07',
  fechaTerminacion: '2025-06-30',
  valorInicial: 10_144_200,
  cuotas: CUOTAS,
  adiciones: [],
  suspensiones: [],
} as unknown as Contrato;

/** Una tabla de balance con las casillas de cifras VACÍAS, como la real. */
function tabla(celdasVacias = true): Parte[] {
  const celda = (t: string) =>
    t.length === 0 && celdasVacias
      ? '<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr></w:p></w:tc>'
      : `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const fila = (a: string, b: string, c: string) =>
    `<w:tr>${celda(a)}${celda(b)}${celda(c)}</w:tr>`;

  return [
    {
      nombre: 'word/document.xml',
      xml:
        '<w:body><w:tbl>' +
        fila('CONCEPTO', 'valor total', 'recursos ejecutados y por ejecutar') +
        fila('VALOR (INICIAL) DEL CONTRATO', '', '') +
        fila('VALOR ADICIONES (Si aplica)', '', '') +
        fila('VALOR EJECUTADO', '', '') +
        fila('VALOR POR EJECUTAR', '', '') +
        fila('SALDO A LIBERAR (Si aplica)', 'N/A', 'N/A') +
        fila('SUMAS IGUALES', '', '') +
        '</w:tbl></w:body>',
    },
  ];
}

/** Las celdas de cada fila del resultado, en orden. */
function filasDe(xml: string): string[][] {
  return [...xml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((f) =>
    [...f[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) =>
      [...c[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join(''),
    ),
  );
}

const balanceDe = (mes: number) => balanceDelMes(contrato, 2025, mes)!;

describe('con las casillas vacías en la plantilla', () => {
  it('escribe lo ejecutado y lo que falta, aunque no hubiera dónde', () => {
    // Marzo: 1.339.200 + 1.761.000 + 1.761.000 = 4.861.200
    const r = llenarTablaBalance(tabla(), balanceDe(3));
    const filas = filasDe(r.partes[0].xml);

    const ejecutado = filas.find((f) => f[0] === 'VALOR EJECUTADO')!;
    const porEjecutar = filas.find((f) => f[0] === 'VALOR POR EJECUTAR')!;

    expect(ejecutado[2]).toBe('$4.861.200');
    expect(porEjecutar[2]).toBe('$5.283.000'); // 10.144.200 − 4.861.200
    expect(r.avisos).toEqual([]);
  });

  it('en el último mes no queda nada por ejecutar', () => {
    const r = llenarTablaBalance(tabla(), balanceDe(6));
    const filas = filasDe(r.partes[0].xml);

    expect(filas.find((f) => f[0] === 'VALOR EJECUTADO')![2]).toBe('$10.144.200');
    expect(filas.find((f) => f[0] === 'VALOR POR EJECUTAR')![2]).toBe('$0');
  });

  it('el valor inicial y las sumas iguales cuadran la columna izquierda', () => {
    const filas = filasDe(llenarTablaBalance(tabla(), balanceDe(3)).partes[0].xml);

    expect(filas.find((f) => f[0].startsWith('VALOR (INICIAL)'))![1]).toBe('$10.144.200');
    expect(filas.find((f) => f[0] === 'SUMAS IGUALES')![1]).toBe('$10.144.200');
    expect(filas.find((f) => f[0] === 'SUMAS IGUALES')![2]).toBe('$10.144.200');
  });
});

describe('las dos erratas de la plantilla', () => {
  it('la columna VALOR TOTAL de esas dos filas se deja vacía', () => {
    // Esa columna ya cuadra sin ellas: valor inicial + adiciones = SUMAS
    // IGUALES. Poner cualquier cifra ahí descuadraría la tabla.
    const filas = filasDe(llenarTablaBalance(tabla(false), balanceDe(3)).partes[0].xml);

    expect(filas.find((f) => f[0] === 'VALOR EJECUTADO')![1]).toBe('');
    expect(filas.find((f) => f[0] === 'VALOR POR EJECUTAR')![1]).toBe('');
  });
});

describe('lo que no toca', () => {
  it('SALDO A LIBERAR se queda como esté: no sale del contrato', () => {
    const filas = filasDe(llenarTablaBalance(tabla(false), balanceDe(3)).partes[0].xml);
    const saldo = filas.find((f) => f[0].startsWith('SALDO A LIBERAR'))!;
    expect(saldo[1]).toBe('N/A');
    expect(saldo[2]).toBe('N/A');
  });

  it('conserva la alineación de la celda al crear el run', () => {
    const xml = llenarTablaBalance(tabla(), balanceDe(3)).partes[0].xml;
    expect(xml).toContain('<w:jc w:val="right"/>');
  });

  it('avisa si la plantilla no trae esa tabla', () => {
    const r = llenarTablaBalance(
      [{ nombre: 'word/document.xml', xml: '<w:body><w:p/></w:body>' }],
      balanceDe(3),
    );
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain('balance de recursos');
  });
});
