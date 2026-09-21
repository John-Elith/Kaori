/**
 * Detección de campos por rótulo, sobre documentos sintéticos.
 *
 * La comprobación contra un informe real está en tests/locales/, que no se
 * publica porque ese documento lleva datos personales.
 */

import { describe, it, expect } from 'vitest';
import { construirMapa, type Parte } from '../core/docx/mapaTexto';
import { detectar } from '../core/docx/detectarCampos';
import { detectarPorAnclas, lineasDe, zonasIgnoradas } from '../core/docx/anclas';
import type { CampoId } from '../core/docx/campos';

/** Arma un documento sintético a partir de líneas de texto. */
function documentoDe(lineas: string[]): Parte[] {
  const p = (t: string) =>
    `<w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  return [
    {
      nombre: 'word/document.xml',
      xml: `<?xml version="1.0"?><w:document><w:body>${lineas.map(p).join('')}</w:body></w:document>`,
    },
  ];
}

function detectarEn(lineas: string[]) {
  return detectarPorAnclas(construirMapa(documentoDe(lineas)));
}

/** Texto detectado para un campo, o undefined. */
function valorDe(
  candidatos: { texto: string; sugerencias: CampoId[] }[],
  campo: CampoId,
): string | undefined {
  return candidatos.find((c) => c.sugerencias[0] === campo)?.texto;
}

describe('anclas por rótulo', () => {
  it('toma el valor de la celda siguiente al rótulo', () => {
    const c = detectarEn([
      'CONTRATISTA:',
      'JUAN PEREZ GOMEZ',
      'OBJETO',
      'PRESTACIÓN DE SERVICIOS DE APOYO EN EL CUIDO Y CUSTODIA.',
    ]);
    expect(valorDe(c, 'nombreContratista')).toBe('JUAN PEREZ GOMEZ');
    expect(valorDe(c, 'objeto')).toBe(
      'PRESTACIÓN DE SERVICIOS DE APOYO EN EL CUIDO Y CUSTODIA.',
    );
  });

  it('exige los dos puntos en "Año:" para no confundirlo con el encabezado', () => {
    // "Año" a secas es el encabezado de la tabla del periodo; sólo "Año:" es el
    // rótulo del año del contrato.
    const conRotulo = detectarEn([' Año:', '2025']);
    expect(valorDe(conRotulo, 'anio')).toBe('2025');

    const soloEncabezado = detectarEn(['Día', 'Mes', 'Año', '07']);
    expect(valorDe(soloEncabezado, 'anio')).toBeUndefined();
  });

  it('no confunde el rótulo "Contratista" de la firma con la celda de datos', () => {
    // Bajo la firma del informe aparece "Contratista" sin dos puntos, y lo que
    // le sigue es el encabezado del informe de supervisión.
    const c = detectarEn([
      'JUAN PEREZ GOMEZ',
      'Contratista ',
      '  INFORME DE SUPERVISIÓN CONTRATO NO.  CD 084-2025',
    ]);
    const nombres = c.filter((x) => x.sugerencias[0] === 'nombreContratista');
    expect(nombres.every((n) => !n.texto.includes('INFORME DE SUPERVISIÓN'))).toBe(true);
  });

  it('distingue el VALOR del contrato del encabezado de la tabla de pagos', () => {
    const c = detectarEn([
      'VALOR',
      'NUEVE MILLONES CUATROCIENTOS TRECE MIL PESOS M/CTE ($9.413.400).',
    ]);
    expect(valorDe(c, 'valorContratoLetras')).toContain('NUEVE MILLONES');

    const tabla = detectarEn(['PAGO', 'FECHA', 'VALOR', '1', '31/01/2025', '$1.298.400']);
    expect(valorDe(tabla, 'valorContratoLetras')).toBeUndefined();
  });

  it('separa la cédula del lugar de expedición', () => {
    const c = detectarEn(['C.C. No. ', '10.123.456 OLAYA HERRERA']);
    expect(valorDe(c, 'cedula')).toBe('10.123.456');
    expect(valorDe(c, 'cedulaExpedidaEn')).toBe('OLAYA HERRERA');
  });

  it('lee la cédula aunque comparta línea con el rótulo', () => {
    const c = detectarEn(['C.C. No. 10.345.678 DE OLAYA HERRERA']);
    expect(valorDe(c, 'cedula')).toBe('10.345.678');
    expect(valorDe(c, 'cedulaExpedidaEn')).toBe('OLAYA HERRERA');
  });

  it('lee las seis casillas de la tabla del periodo', () => {
    const c = detectarEn([
      'PERIODO DEL INFORME:',
      'Desde:', 'Día', 'Mes', 'Año', 'Hasta:', 'Día', 'Mes', 'Año',
      '07', '01', '2025', '31', '01', '2025',
    ]);
    expect(valorDe(c, 'periodoDesdeDia')).toBe('07');
    expect(valorDe(c, 'periodoDesdeMes')).toBe('01');
    expect(valorDe(c, 'periodoHastaDia')).toBe('31');
    expect(valorDe(c, 'periodoHastaAnio')).toBe('2025');
  });

  it('lee la fila completa del CDP', () => {
    const c = detectarEn([
      'CERTIFICADO DE DISPONIBILIDAD PRESUPUESTAL',
      '02', '01', '2025', '2025000027',
      'NUEVE MILLONES CUATROCIENTOS TRECE MIL PESOS M/CTE ($9.413.400)',
    ]);
    expect(valorDe(c, 'cdpFechaDia')).toBe('02');
    expect(valorDe(c, 'cdpNumero')).toBe('2025000027');
    expect(valorDe(c, 'cdpValorLetras')).toContain('NUEVE MILLONES');
  });

  it('separa las dos columnas del balance', () => {
    const c = detectarEn([
      'VALOR EJECUTADO', '3.000.000', '$1.298.400',
      'VALOR POR EJECUTAR', '6000000000666', '$8.115.000',
    ]);
    // La columna izquierda es la que traía las erratas.
    expect(valorDe(c, 'valorEjecutadoTotal')).toBe('3.000.000');
    expect(valorDe(c, 'valorEjecutado')).toBe('$1.298.400');
    expect(valorDe(c, 'valorPorEjecutarTotal')).toBe('6000000000666');
    expect(valorDe(c, 'valorPorEjecutar')).toBe('$8.115.000');
  });

  it('lee el bloque de la planilla PILA', () => {
    const c = detectarEn([
      'NÚMERO DE PLANILLA', 'FECHA', 'MES DE PAGO',
      'dd', 'mm', 'aaa',
      '9000000002', '04', '02', '2025', 'enero',
    ]);
    expect(valorDe(c, 'planillaNumero')).toBe('9000000002');
    expect(valorDe(c, 'planillaDia')).toBe('04');
    expect(valorDe(c, 'planillaMesAcreditado')).toBe('enero');
  });
});

describe('zonas ignoradas', () => {
  it('excluye la tabla del cronograma de pagos', () => {
    const lineas = [
      'PAGO', 'FECHA', 'VALOR',
      '1', '31/01/2025', '$1.298.400',
      '2', '28/02/2025', '$ 1.623.000',
      'PLAZO DE EJECUCIÓN',
    ];
    const mapa = construirMapa(documentoDe(lineas));
    const zonas = zonasIgnoradas(lineasDe(mapa));
    expect(zonas).toHaveLength(1);

    // Ningún candidato debe caer dentro de esa tabla: se regenera entera.
    const candidatos = detectar(mapa);
    const dentro = candidatos.filter((c) =>
      zonas.some((z) => c.inicio < z.hasta && c.fin > z.desde),
    );
    expect(dentro).toHaveLength(0);
  });
});

describe('propagación de los valores ya resueltos', () => {
  it('marca todas las apariciones del nombre, no sólo la primera', () => {
    const mapa = construirMapa(
      documentoDe([
        'CONTRATISTA:',
        'JUAN PEREZ GOMEZ',
        'Otra sección',
        'JUAN PEREZ GOMEZ',
        'Y una tercera',
        'JUAN PEREZ GOMEZ',
      ]),
    );
    const c = detectar(mapa);
    const nombres = c.filter((x) => x.sugerencias[0] === 'nombreContratista');
    expect(nombres).toHaveLength(3);
  });
});
