import { describe, it, expect } from 'vitest';
import { llenarTablaObligaciones } from '../core/generar/tablas';
import type { Parte } from '../core/docx/mapaTexto';
import type { Contrato, Obligacion } from '../core/modelo/tipos';

const RPR = '<w:rPr><w:rFonts w:ascii="Arial"/></w:rPr>';
const TCPR = '<w:tcPr><w:tcW w:w="1000"/><w:tcBorders><w:top w:val="single"/></w:tcBorders></w:tcPr>';

const celda = (t: string) => `<w:tc>${TCPR}<w:p><w:r>${RPR}<w:t>${t}</w:t></w:r></w:p></w:tc>`;
const fila = (...celdas: string[]) => `<w:tr><w:trPr/>${celdas.join('')}</w:tr>`;

function tablaObligaciones(filasDatos: string[][]): string {
  return (
    '<w:tbl><w:tblPr><w:tblStyle w:val="Tabla"/></w:tblPr>' +
    fila(celda('No.'), celda('OBLIGACIONES ESPECIFICAS'), celda('ACTIVIDADES EJECUTADAS')) +
    filasDatos.map((f) => fila(...f.map(celda))).join('') +
    '</w:tbl>'
  );
}

function documento(cuerpo: string): Parte[] {
  return [
    {
      nombre: 'word/document.xml',
      xml: `<?xml version="1.0"?><w:document><w:body>${cuerpo}</w:body></w:document>`,
    },
  ];
}

function obligaciones(n: number): Obligacion[] {
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    texto: `Obligación número ${i + 1}`,
    actividad: `Actividad ejecutada ${i + 1}`,
  }));
}

function contratoCon(obl: Obligacion[], oblSup: Obligacion[] = []): Contrato {
  return {
    id: 'c1',
    contratistaId: 'k1',
    numero: '078-2025',
    anio: 2025,
    objeto: '',
    fechaInicio: '2025-01-07',
    fechaTerminacion: '2025-06-30',
    fechaFirma: '2025-01-07',
    valorInicial: 13_630_000,
    cuotas: [],
    adiciones: [],
    suspensiones: [],
    formaDePago: '',
    textoPlazo: '',
    contratante: '',
    nitContratante: '',
    municipio: 'Olaya Herrera',
    supervisor: { nombre: '', cargo: '' },
    cdp: { numero: '', fecha: '2025-01-02', valor: 0 },
    rp: { numero: '', fecha: '2025-01-07', valor: 0 },
    obligaciones: obl,
    obligacionesSupervision: oblSup,
    plantillaId: 'p1',
    activo: true,
  };
}

function textoDe(partes: Parte[]): string {
  // El `(?:\s[^>]*)?` es imprescindible: sin él, `<w:t` también casaría con
  // `<w:tc>`, `<w:tblStyle>` y demás etiquetas que empiezan igual.
  return partes
    .map((p) =>
      [...p.xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('|'),
    )
    .join('');
}

function contarFilas(xml: string): number {
  return (xml.match(/<w:tr>/g) ?? []).length;
}

describe('llenarTablaObligaciones', () => {
  it('expande la plantilla de 1 fila a las 12 obligaciones del contrato', () => {
    // La plantilla trae una sola fila de datos como molde.
    const partes = documento(tablaObligaciones([['1.', 'molde', 'molde']]));
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(12)));

    // 1 encabezado + 12 datos
    expect(contarFilas(r.partes[0].xml)).toBe(13);

    const texto = textoDe(r.partes);
    expect(texto).toContain('Obligación número 1');
    expect(texto).toContain('Obligación número 12');
    expect(texto).toContain('Actividad ejecutada 12');
    expect(texto).not.toContain('molde');
  });

  it('reduce la tabla cuando el contrato tiene menos obligaciones', () => {
    // Plantilla del contrato 078 (12 filas) reutilizada para el 084 (9).
    const partes = documento(
      tablaObligaciones(
        Array.from({ length: 12 }, (_, i) => [`${i + 1}.`, `vieja ${i + 1}`, `act ${i + 1}`]),
      ),
    );
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(9)));

    expect(contarFilas(r.partes[0].xml)).toBe(10); // 1 encabezado + 9
    const texto = textoDe(r.partes);
    expect(texto).toContain('Obligación número 9');
    expect(texto).not.toContain('Obligación número 10');
    expect(texto).not.toContain('vieja');
  });

  it('conserva el formato de la fila molde en todas las filas clonadas', () => {
    const partes = documento(tablaObligaciones([['1.', 'molde', 'molde']]));
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(5)));

    // Los bordes y anchos del molde se replican en cada fila nueva.
    const apariciones = (r.partes[0].xml.match(/<w:tcBorders>/g) ?? []).length;
    expect(apariciones).toBe(3 * 6); // 3 celdas × (1 encabezado + 5 datos)
    expect(r.partes[0].xml).toContain('<w:tblStyle w:val="Tabla"/>');
    expect(r.partes[0].xml).toContain('<w:trPr/>');
  });

  it('numera las filas con el número de la obligación', () => {
    const partes = documento(tablaObligaciones([['1.', 'molde', 'molde']]));
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(3)));
    const texto = textoDe(r.partes);
    expect(texto).toContain('1.|Obligación número 1');
    expect(texto).toContain('3.|Obligación número 3');
  });

  it('deja vacía la actividad cuando aún no se ha redactado', () => {
    const sinActividad: Obligacion[] = [{ n: 1, texto: 'Prestar colaboración' }];
    const partes = documento(tablaObligaciones([['1.', 'molde', 'molde']]));
    const r = llenarTablaObligaciones(partes, contratoCon(sinActividad));
    const texto = textoDe(r.partes);
    expect(texto).toContain('Prestar colaboración');
    expect(texto).not.toContain('molde');
  });

  it('llena las dos tablas: actividad y supervisión', () => {
    const partes = documento(
      tablaObligaciones([['1.', 'molde A', 'molde A']]) +
        '<w:p><w:r><w:t>ELEMENTOS DE ORDEN TÉCNICO</w:t></w:r></w:p>' +
        tablaObligaciones([['1.', 'molde B', 'molde B']]),
    );

    const contrato = contratoCon(
      [{ n: 1, texto: 'Obligación de actividad', actividad: 'Se hizo A' }],
      [{ n: 1, texto: 'Obligación de supervisión', actividad: 'Se hizo B' }],
    );

    const r = llenarTablaObligaciones(partes, contrato);
    const texto = textoDe(r.partes);

    expect(texto).toContain('Obligación de actividad');
    expect(texto).toContain('Obligación de supervisión');
    expect(texto).not.toContain('molde');
  });

  it('reutiliza las obligaciones de actividad si no hay de supervisión', () => {
    const partes = documento(
      tablaObligaciones([['1.', 'molde', 'molde']]) +
        tablaObligaciones([['1.', 'molde', 'molde']]),
    );
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(2), []));
    const texto = textoDe(r.partes);
    expect((texto.match(/Obligación número 1/g) ?? []).length).toBe(2);
  });

  it('no toca tablas que no son de obligaciones', () => {
    const tablaPagos =
      '<w:tbl>' +
      fila(celda('PAGO'), celda('FECHA'), celda('VALOR')) +
      fila(celda('1'), celda('31/01/2025'), celda('$1.880.000')) +
      '</w:tbl>';
    const partes = documento(tablaPagos);
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(5)));

    expect(r.partes[0].xml).toBe(partes[0].xml);
    expect(r.avisos.join(' ')).toMatch(/No se encontró ninguna tabla de obligaciones/);
  });

  it('avisa en vez de romper cuando la tabla no tiene filas de datos', () => {
    const soloEncabezado =
      '<w:tbl>' +
      fila(celda('No.'), celda('OBLIGACIONES ESPECIFICAS'), celda('ACTIVIDADES EJECUTADAS')) +
      '</w:tbl>';
    const partes = documento(soloEncabezado);
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(3)));

    expect(r.partes[0].xml).toBe(partes[0].xml);
    expect(r.avisos.join(' ')).toMatch(/No se encontraron filas de datos/);
  });

  it('escapa caracteres especiales del texto de la obligación', () => {
    const conAmpersand: Obligacion[] = [
      { n: 1, texto: 'Agua & saneamiento <básico>', actividad: 'Se ejecutó' },
    ];
    const partes = documento(tablaObligaciones([['1.', 'molde', 'molde']]));
    const r = llenarTablaObligaciones(partes, contratoCon(conAmpersand));
    expect(r.partes[0].xml).toContain('Agua &amp; saneamiento &lt;básico&gt;');
  });

  it('maneja una tabla anidada dentro de una celda sin confundirse', () => {
    const interna = '<w:tbl>' + fila(celda('interna')) + '</w:tbl>';
    const celdaConTabla = `<w:tc>${TCPR}<w:p><w:r>${RPR}<w:t>molde</w:t></w:r></w:p>${interna}</w:tc>`;
    const tabla =
      '<w:tbl>' +
      fila(celda('No.'), celda('OBLIGACIONES ESPECIFICAS'), celda('ACTIVIDADES EJECUTADAS')) +
      `<w:tr>${celda('1.')}${celdaConTabla}${celda('molde')}</w:tr>` +
      '</w:tbl>';

    const partes = documento(tabla);
    const r = llenarTablaObligaciones(partes, contratoCon(obligaciones(2)));

    // No debe explotar ni perder la tabla interna del molde.
    expect(r.partes[0].xml).toContain('interna');
    expect(textoDe(r.partes)).toContain('Obligación número 2');
  });
});
