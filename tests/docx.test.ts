import { describe, it, expect } from 'vitest';
import { normalizarRuns } from '../core/docx/normalizarRuns';
import {
  construirMapa,
  aplicarReemplazos,
  buscarTodas,
  type Parte,
} from '../core/docx/mapaTexto';
import { decodificarXml, codificarXml } from '../core/docx/xml';

const RPR = '<w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr>';
const RPR_NEGRITA = '<w:rPr><w:b/><w:rFonts w:ascii="Arial"/></w:rPr>';

function run(texto: string, rPr = RPR): string {
  return `<w:r>${rPr}<w:t>${texto}</w:t></w:r>`;
}

function parrafo(...runs: string[]): string {
  return `<w:p>${runs.join('')}</w:p>`;
}

function documento(...parrafos: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document><w:body>${parrafos.join('')}</w:body></w:document>`;
}

describe('entidades XML', () => {
  it('decodifica y codifica de forma consistente', () => {
    expect(decodificarXml('Olaya &amp; Herrera')).toBe('Olaya & Herrera');
    expect(decodificarXml('&lt;tag&gt;')).toBe('<tag>');
    expect(decodificarXml('&#241;')).toBe('ñ');
    expect(codificarXml('Olaya & Herrera')).toBe('Olaya &amp; Herrera');
    // No debe re-codificar un ampersand ya codificado dos veces
    expect(decodificarXml(codificarXml('a & <b>'))).toBe('a & <b>');
  });
});

describe('normalizarRuns', () => {
  it('fusiona runs partidos con el mismo formato', () => {
    // Es exactamente como Word guarda "078-2025" tras una corrección de tipeo.
    const xml = documento(parrafo(run('078'), run('-20'), run('25')));
    const norm = normalizarRuns(xml);

    expect(norm).toContain('078-2025');
    expect((norm.match(/<w:r>/g) ?? []).length).toBe(1);
  });

  it('NO fusiona runs con formato distinto', () => {
    const xml = documento(parrafo(run('CONTRATISTA: '), run('ANDRES', RPR_NEGRITA)));
    const norm = normalizarRuns(xml);
    expect((norm.match(/<w:r>/g) ?? []).length).toBe(2);
    expect(norm).toContain(RPR_NEGRITA);
  });

  it('NO fusiona a través de párrafos distintos', () => {
    const xml = documento(parrafo(run('31')), parrafo(run('01')));
    const norm = normalizarRuns(xml);
    expect((norm.match(/<w:r>/g) ?? []).length).toBe(2);
  });

  it('NO fusiona runs que contienen saltos de línea', () => {
    const conSalto = `<w:r>${RPR}<w:br/><w:t>texto</w:t></w:r>`;
    const xml = documento(parrafo(conSalto, run('mas')));
    const norm = normalizarRuns(xml);
    expect(norm).toContain('<w:br/>');
    expect((norm.match(/<w:r>/g) ?? []).length).toBe(2);
  });

  it('NO fusiona runs que contienen imágenes', () => {
    const conImagen = `<w:r>${RPR}<w:drawing><logo/></w:drawing></w:r>`;
    const xml = documento(parrafo(conImagen, run('texto')));
    const norm = normalizarRuns(xml);
    expect(norm).toContain('<w:drawing><logo/></w:drawing>');
  });

  it('preserva el rPr del primer run al fusionar', () => {
    const xml = documento(parrafo(run('a'), run('b'), run('c')));
    const norm = normalizarRuns(xml);
    expect(norm).toContain(RPR);
    expect(norm).toContain('>abc<');
  });

  it('no altera un documento que ya está normalizado', () => {
    const xml = documento(parrafo(run('texto completo')));
    expect(normalizarRuns(xml)).toBe(xml);
  });

  it('conserva los espacios al fusionar', () => {
    const xml = documento(parrafo(run('ANDRES '), run('FELIPE '), run('MORALES')));
    const norm = normalizarRuns(xml);
    expect(norm).toContain('ANDRES FELIPE MORALES');
    expect(norm).toContain('xml:space="preserve"');
  });
});

describe('mapaTexto', () => {
  function partesDe(xml: string): Parte[] {
    return [{ nombre: 'word/document.xml', xml }];
  }

  it('construye el texto plano con separadores entre párrafos', () => {
    const partes = partesDe(documento(parrafo(run('31')), parrafo(run('01'))));
    const mapa = construirMapa(partes);
    // El separador impide que "31" y "01" se lean como "3101".
    expect(mapa.texto).toBe('31\n01\n');
    expect(mapa.texto).not.toContain('3101');
  });

  it('localiza texto repartido entre varios runs sin normalizar', () => {
    const partes = partesDe(documento(parrafo(run('078'), run('-2025'))));
    const mapa = construirMapa(partes);
    expect(mapa.texto).toContain('078-2025');
  });

  it('reemplaza dentro de un solo segmento conservando el entorno', () => {
    const partes = partesDe(
      documento(parrafo(run('CONTRATO No: 078-2025 vigente'))),
    );
    const mapa = construirMapa(partes);
    const i = mapa.texto.indexOf('078-2025');

    const nuevas = aplicarReemplazos(partes, mapa, [
      { inicio: i, fin: i + '078-2025'.length, texto: '112-2025' },
    ]);

    expect(nuevas[0].xml).toContain('CONTRATO No: 112-2025 vigente');
    expect(nuevas[0].xml).not.toContain('078-2025');
  });

  it('reemplaza texto repartido entre varios runs', () => {
    const partes = partesDe(documento(parrafo(run('078'), run('-20'), run('25'))));
    const mapa = construirMapa(partes);
    const i = mapa.texto.indexOf('078-2025');

    const nuevas = aplicarReemplazos(partes, mapa, [
      { inicio: i, fin: i + '078-2025'.length, texto: '112-2026' },
    ]);

    const mapaNuevo = construirMapa(nuevas);
    expect(mapaNuevo.texto).toContain('112-2026');
    expect(mapaNuevo.texto).not.toContain('078');
  });

  it('aplica varios reemplazos sin correr los offsets entre sí', () => {
    const partes = partesDe(
      documento(
        parrafo(run('Contrato 078-2025')),
        parrafo(run('Cédula 10.345.678')),
        parrafo(run('Valor $13.630.000')),
      ),
    );
    const mapa = construirMapa(partes);

    const reemplazos = [
      { aguja: '078-2025', nuevo: '090-2026' },
      { aguja: '10.345.678', nuevo: '10.123.456' },
      { aguja: '$13.630.000', nuevo: '$9.413.400' },
    ].map(({ aguja, nuevo }) => {
      const i = mapa.texto.indexOf(aguja);
      return { inicio: i, fin: i + aguja.length, texto: nuevo };
    });

    const nuevas = aplicarReemplazos(partes, mapa, reemplazos);
    const texto = construirMapa(nuevas).texto;

    expect(texto).toContain('Contrato 090-2026');
    expect(texto).toContain('Cédula 10.123.456');
    expect(texto).toContain('Valor $9.413.400');
  });

  it('reemplaza en encabezados igual que en el cuerpo', () => {
    const partes: Parte[] = [
      { nombre: 'word/document.xml', xml: documento(parrafo(run('cuerpo 078-2025'))) },
      { nombre: 'word/header1.xml', xml: documento(parrafo(run('pie 078-2025'))) },
    ];
    const mapa = construirMapa(partes);
    const reemplazos = buscarTodas(mapa, '078-2025').map((r) => ({
      ...r,
      texto: '999-2030',
    }));

    const nuevas = aplicarReemplazos(partes, mapa, reemplazos);
    expect(nuevas[0].xml).toContain('cuerpo 999-2030');
    expect(nuevas[1].xml).toContain('pie 999-2030');
  });

  it('escapa correctamente el texto insertado', () => {
    const partes = partesDe(documento(parrafo(run('NOMBRE'))));
    const mapa = construirMapa(partes);
    const nuevas = aplicarReemplazos(partes, mapa, [
      { inicio: 0, fin: 6, texto: 'AGUA & LUZ <S.A.>' },
    ]);

    expect(nuevas[0].xml).toContain('AGUA &amp; LUZ &lt;S.A.&gt;');
    // Y al releerlo vuelve al texto original.
    expect(construirMapa(nuevas).texto).toContain('AGUA & LUZ <S.A.>');
  });

  it('buscarTodas encuentra cada aparición', () => {
    const partes = partesDe(
      documento(
        parrafo(run('ANDRES FELIPE MORALES')),
        parrafo(run('Contratista: ANDRES FELIPE MORALES')),
        parrafo(run('Firma ANDRES FELIPE MORALES')),
      ),
    );
    const mapa = construirMapa(partes);
    expect(buscarTodas(mapa, 'ANDRES FELIPE MORALES')).toHaveLength(3);
  });

  it('reemplaza todas las apariciones de un nombre a la vez', () => {
    const partes = partesDe(
      documento(
        parrafo(run('CONTRATISTA: ANDRES FELIPE MORALES ROJAS')),
        parrafo(run('ANDRES FELIPE MORALES ROJAS')),
      ),
    );
    const mapa = construirMapa(partes);
    const reemplazos = buscarTodas(mapa, 'ANDRES FELIPE MORALES ROJAS').map(
      (r) => ({ ...r, texto: 'JUAN PEREZ GOMEZ' }),
    );

    const texto = construirMapa(aplicarReemplazos(partes, mapa, reemplazos)).texto;
    expect(texto).not.toContain('ANDRES');
    expect((texto.match(/JUAN PEREZ GOMEZ/g) ?? []).length).toBe(2);
  });

  it('protesta si un reemplazo no cae sobre texto real', () => {
    const partes = partesDe(documento(parrafo(run('corto'))));
    const mapa = construirMapa(partes);
    expect(() =>
      aplicarReemplazos(partes, mapa, [{ inicio: 500, fin: 510, texto: 'x' }]),
    ).toThrow();
  });
});

describe('normalización + mapeo trabajando juntos', () => {
  it('el flujo completo sobre un fragmento realista', () => {
    // Fragmento con la estructura de la tabla del informe, con runs partidos
    // como los deja Word.
    const xml = documento(
      parrafo(run('CONTRATO DE PRESTACIÓN DE SERVICIOS No:')),
      parrafo(run('07'), run('8-'), run('2025')),
      parrafo(run('CONTRATISTA:')),
      parrafo(run('ANDRES '), run('FELIPE '), run('MORALES ROJAS')),
      parrafo(run('C.C. No. ')),
      parrafo(run('10.345.678'), run(' DE OLAYA HERRERA')),
    );

    const partes: Parte[] = [{ nombre: 'word/document.xml', xml: normalizarRuns(xml) }];
    const mapa = construirMapa(partes);

    expect(mapa.texto).toContain('078-2025');
    expect(mapa.texto).toContain('ANDRES FELIPE MORALES ROJAS');
    expect(mapa.texto).toContain('10.345.678 DE OLAYA HERRERA');

    const cambios = [
      { aguja: '078-2025', nuevo: '084-2025' },
      { aguja: 'ANDRES FELIPE MORALES ROJAS', nuevo: 'JUAN PEREZ GOMEZ' },
      { aguja: '10.345.678', nuevo: '10.123.456' },
    ].flatMap(({ aguja, nuevo }) =>
      buscarTodas(mapa, aguja).map((r) => ({ ...r, texto: nuevo })),
    );

    const resultado = construirMapa(aplicarReemplazos(partes, mapa, cambios)).texto;

    expect(resultado).toContain('084-2025');
    expect(resultado).toContain('JUAN PEREZ GOMEZ');
    expect(resultado).toContain('10.123.456 DE OLAYA HERRERA');
    expect(resultado).not.toContain('ANDRES');
    expect(resultado).not.toContain('10.345.678');
  });
});
