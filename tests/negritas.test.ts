/**
 * Escritura de texto con formato propio.
 *
 * Lo normal es meter el texto en el `<w:t>` que ya existe y heredar el formato
 * del run. Para los párrafos que Kaori redacta enteros eso no sirve, y hay que
 * partir el run en varios. Estas pruebas vigilan que el XML resultante sea el
 * que Word espera, porque un run mal formado no da error: abre el documento
 * con el texto perdido.
 */

import { describe, it, expect } from 'vitest';
import {
  aplicarReemplazos,
  conNegrita,
  construirMapa,
  propiedadesDelRun,
  rangoDelRun,
  type Parte,
} from '../core/docx/mapaTexto';

const parte = (xml: string): Parte[] => [{ nombre: 'word/document.xml', xml }];
const salida = (partes: Parte[]) => partes[0].xml;

/** Runs del XML, como pares de (formato, texto). */
function runs(xml: string): { negrita: boolean; texto: string }[] {
  return [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => ({
    negrita: /<w:b\/>/.test(m[1]),
    texto: /<w:t[^>]*>([\s\S]*?)<\/w:t>/.exec(m[1])?.[1] ?? '',
  }));
}

describe('localizar el run', () => {
  it('encuentra el run que envuelve un <w:t>', () => {
    const xml = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>hola</w:t></w:r></w:p>';
    const r = rangoDelRun(xml, xml.indexOf('hola'));
    expect(xml.slice(r!.inicio, r!.fin)).toBe('<w:r><w:rPr><w:b/></w:rPr><w:t>hola</w:t></w:r>');
  });

  it('no confunde <w:rPr> ni <w:rFonts> con la apertura del run', () => {
    const xml = '<w:p><w:r w:rsidR="00A"><w:rPr><w:rFonts w:ascii="Arial"/></w:rPr><w:t>x</w:t></w:r></w:p>';
    const r = rangoDelRun(xml, xml.indexOf('>x<'));
    expect(xml.slice(r!.inicio).startsWith('<w:r w:rsidR')).toBe(true);
  });

  it('saca las propiedades del run', () => {
    expect(propiedadesDelRun('<w:r><w:rPr><w:i/></w:rPr><w:t>x</w:t></w:r>')).toBe(
      '<w:rPr><w:i/></w:rPr>',
    );
    expect(propiedadesDelRun('<w:r><w:t>x</w:t></w:r>')).toBe('');
  });
});

describe('poner y quitar la negrita', () => {
  it('crea las propiedades si el run no tenía', () => {
    expect(conNegrita('', true)).toBe('<w:rPr><w:b/><w:bCs/></w:rPr>');
  });

  it('conserva el resto del formato', () => {
    expect(conNegrita('<w:rPr><w:i/></w:rPr>', true)).toBe(
      '<w:rPr><w:b/><w:bCs/><w:i/></w:rPr>',
    );
  });

  it('va detrás de rFonts, que es lo que exige el esquema', () => {
    const r = conNegrita('<w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/></w:rPr>', true);
    expect(r).toBe('<w:rPr><w:rFonts w:ascii="Arial"/><w:b/><w:bCs/><w:sz w:val="24"/></w:rPr>');
  });

  it('apaga la negrita explícitamente, no borrándola', () => {
    // Si sólo se borrara, un párrafo con estilo en negrita la reimpondría.
    expect(conNegrita('<w:rPr><w:b/><w:bCs/></w:rPr>', false)).toBe(
      '<w:rPr><w:b w:val="0"/><w:bCs w:val="0"/></w:rPr>',
    );
  });

  it('no duplica la marca al volver a aplicarla', () => {
    expect(conNegrita(conNegrita('<w:rPr><w:i/></w:rPr>', false), true)).toBe(
      '<w:rPr><w:b/><w:bCs/><w:i/></w:rPr>',
    );
  });
});

describe('reemplazo con fragmentos', () => {
  const xml = '<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>ORIGINAL</w:t></w:r></w:p>';
  const mapa = construirMapa(parte(xml));

  it('parte el run en uno por tramo', () => {
    const r = aplicarReemplazos(parte(xml), mapa, [
      {
        inicio: 0,
        fin: 8,
        texto: 'paga DIEZ PESOS ya',
        fragmentos: [
          { texto: 'paga ' },
          { texto: 'DIEZ PESOS', negrita: true },
          { texto: ' ya' },
        ],
      },
    ]);

    expect(runs(salida(r))).toEqual([
      { negrita: false, texto: 'paga ' },
      { negrita: true, texto: 'DIEZ PESOS' },
      { negrita: false, texto: ' ya' },
    ]);
  });

  it('cada tramo hereda el resto del formato del run original', () => {
    const r = aplicarReemplazos(parte(xml), mapa, [
      { inicio: 0, fin: 8, texto: 'ab', fragmentos: [{ texto: 'a' }, { texto: 'b', negrita: true }] },
    ]);
    expect((salida(r).match(/<w:sz w:val="22"\/>/g) ?? []).length).toBe(2);
  });

  it('conserva los espacios de los extremos', () => {
    const r = aplicarReemplazos(parte(xml), mapa, [
      { inicio: 0, fin: 8, texto: ' x ', fragmentos: [{ texto: ' x ' }] },
    ]);
    expect(salida(r)).toContain('<w:t xml:space="preserve"> x </w:t>');
  });

  it('escapa los caracteres especiales', () => {
    const r = aplicarReemplazos(parte(xml), mapa, [
      { inicio: 0, fin: 8, texto: 'a & b', fragmentos: [{ texto: 'a & b', negrita: true }] },
    ]);
    expect(salida(r)).toContain('a &amp; b');
  });

  it('respeta el texto que quede fuera del rango en el mismo <w:t>', () => {
    const r = aplicarReemplazos(parte(xml), mapa, [
      { inicio: 0, fin: 4, texto: 'X', fragmentos: [{ texto: 'X', negrita: true }] },
    ]);
    expect(runs(salida(r)).map((x) => x.texto).join('')).toBe('XINAL');
  });

  it('sin fragmentos se comporta como siempre: un solo run', () => {
    const r = aplicarReemplazos(parte(xml), mapa, [{ inicio: 0, fin: 8, texto: 'NUEVO' }]);
    expect(salida(r)).toBe('<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>NUEVO</w:t></w:r></w:p>');
  });
});
