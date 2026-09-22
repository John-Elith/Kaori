import { describe, expect, it } from 'vitest';
import { quitarHojasEnBlanco, sinHojasEnBlanco } from '../core/docx/paginacion';

const vacio = '<w:p w:rsidR="1"><w:pPr><w:ind w:left="-567"/><w:jc w:val="center"/></w:pPr></w:p>';
const vacioConRun = '<w:p><w:pPr></w:pPr><w:r><w:rPr><w:b/></w:rPr></w:r></w:p>';
const salto = '<w:p w:rsidR="2"><w:r><w:br w:type="page"/></w:r></w:p>';
const texto = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const tabla = (t: string) => `<w:tbl><w:tr><w:tc>${texto(t)}</w:tc></w:tr></w:tbl>`;
const fin = '<w:sectPr><w:pgSz w:w="12240"/></w:sectPr></w:body>';
const cuerpo = (s: string) => `<w:document><w:body>${s}${fin}</w:document>`;

describe('quitarHojasEnBlanco', () => {
  it('quita el relleno antes del salto y deja el salto tras la tabla', () => {
    const xml = cuerpo(tabla('firma') + vacio + vacio + vacioConRun + salto + tabla('SUPERVISIÓN') + texto('fin'));
    expect(quitarHojasEnBlanco(xml)).toBe(cuerpo(tabla('firma') + salto + tabla('SUPERVISIÓN') + texto('fin')));
  });

  it('mete el salto en el párrafo de texto anterior', () => {
    const xml = cuerpo(texto('uno') + vacio + salto + texto('dos'));
    expect(quitarHojasEnBlanco(xml)).toBe(
      cuerpo('<w:p><w:r><w:t>uno</w:t></w:r><w:r><w:br w:type="page"/></w:r></w:p>' + texto('dos')),
    );
  });

  it('quita los renglones vacíos del final, dejando uno tras una tabla', () => {
    expect(quitarHojasEnBlanco(cuerpo(texto('a') + vacio + vacio))).toBe(cuerpo(texto('a')));
    expect(quitarHojasEnBlanco(cuerpo(tabla('a') + vacio + vacio + vacio))).toBe(cuerpo(tabla('a') + vacio));
  });

  it('no toca renglones con texto, imágenes o marca de sección', () => {
    const seccion = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:pPr></w:p>';
    const imagen = '<w:p><w:r><w:drawing>x</w:drawing></w:r></w:p>';
    const xml = cuerpo(tabla('a') + seccion + imagen + salto + tabla('b') + texto('c'));
    expect(quitarHojasEnBlanco(xml)).toBe(
      cuerpo(
        tabla('a') +
          seccion +
          '<w:p><w:r><w:drawing>x</w:drawing></w:r><w:r><w:br w:type="page"/></w:r></w:p>' +
          tabla('b') +
          texto('c'),
      ),
    );
    // Tras una marca de sección, el salto se queda en su párrafo.
    const trasSeccion = cuerpo(tabla('a') + seccion + salto + tabla('b') + texto('c'));
    expect(quitarHojasEnBlanco(trasSeccion)).toBe(trasSeccion);
  });

  it('no toca los vacíos que no van antes de un salto', () => {
    const xml = cuerpo(texto('a') + vacio + vacio + texto('b'));
    expect(quitarHojasEnBlanco(xml)).toBe(xml);
  });

  it('sólo cambia el cuerpo, no encabezados ni pies', () => {
    const partes = [
      { nombre: 'word/document.xml', xml: cuerpo(texto('a') + vacio) },
      { nombre: 'word/footer1.xml', xml: `<w:ftr>${vacio}</w:ftr>` },
    ];
    const [doc, pie] = sinHojasEnBlanco(partes);
    expect(doc.xml).toBe(cuerpo(texto('a')));
    expect(pie).toBe(partes[1]);
  });
});
