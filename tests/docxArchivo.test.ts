/**
 * Prueba de fidelidad del ciclo completo abrir → modificar → guardar.
 *
 * Lo que se demuestra aquí es la afirmación central del diseño: al clonar el
 * ZIP y tocar sólo el texto, TODO lo demás (logos, estilos, fuentes, relaciones)
 * sobrevive byte por byte. Si esta prueba pasa, los informes generados
 * conservan el diseño original exactamente.
 */

import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { abrirDocx, normalizarDocumento, guardarDocx, textoPlano } from '../core/docx/leerDocx';
import { construirMapa, aplicarReemplazos, buscarTodas } from '../core/docx/mapaTexto';

const RPR = '<w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr>';

/** Bytes que simulan un logo incrustado. Deben sobrevivir intactos. */
const LOGO = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0xff, 0xfe, 0xfd, 0xfc, 0x01, 0x02, 0x03, 0x04,
]);

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>
<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

/** Arma un .docx mínimo pero estructuralmente válido. */
function construirDocxDePrueba(): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="png" ContentType="image/png"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const p = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
  const r = (t: string) => `<w:r>${RPR}<w:t>${t}</w:t></w:r>`;

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p(r('INFORME DE ACTIVIDAD CONTRACTUAL'))}
${p(r('CONTRATO DE PRESTACIÓN DE SERVICIOS No:'), r('07'), r('8-2'), r('025'))}
${p(r('CONTRATISTA:'), r('ANDRES '), r('FELIPE MORALES ROJAS'))}
${p(r('C.C. No. 10.345.678 DE OLAYA HERRERA'))}
${p(r('En constancia de lo anterior, se firma el presente informe a los treinta y un (31) días del mes de enero de dos mil veinticinco (2025).'))}
${p(`<w:r>${RPR}<w:drawing><wp:inline><logo/></wp:inline></w:drawing></w:r>`)}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
</w:body></w:document>`,
  );

  zip.file('word/styles.xml', STYLES);
  zip.file('word/media/logo.png', LOGO);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

describe('ciclo completo sobre un archivo .docx', () => {
  it('rechaza archivos que no son .docx', () => {
    const zip = new PizZip();
    zip.file('hola.txt', 'no soy un documento');
    const basura = zip.generate({ type: 'nodebuffer' }) as Buffer;
    expect(() => abrirDocx(basura)).toThrow(/no parece ser un \.docx/i);
  });

  it('abre el documento y encuentra sus partes de contenido', () => {
    const doc = abrirDocx(construirDocxDePrueba());
    expect(doc.partes.map((p) => p.nombre)).toEqual(['word/document.xml']);
    expect(textoPlano(doc)).toContain('INFORME DE ACTIVIDAD CONTRACTUAL');
  });

  it('genera el informe del mes siguiente conservando todo el diseño', () => {
    const original = construirDocxDePrueba();
    const doc = normalizarDocumento(abrirDocx(original));

    const mapa = construirMapa(doc.partes);

    // Tras normalizar, el número partido en tres runs ya es buscable.
    expect(mapa.texto).toContain('078-2025');
    expect(mapa.texto).toContain('ANDRES FELIPE MORALES ROJAS');

    const cambios = [
      { aguja: '078-2025', nuevo: '084-2025' },
      { aguja: 'ANDRES FELIPE MORALES ROJAS', nuevo: 'JUAN PEREZ GOMEZ' },
      { aguja: '10.345.678', nuevo: '10.123.456' },
      {
        aguja:
          'a los treinta y un (31) días del mes de enero de dos mil veinticinco (2025)',
        nuevo:
          'a los veintiocho (28) días del mes de febrero de dos mil veinticinco (2025)',
      },
    ].flatMap(({ aguja, nuevo }) =>
      buscarTodas(mapa, aguja).map((x) => ({ ...x, texto: nuevo })),
    );

    const partesNuevas = aplicarReemplazos(doc.partes, mapa, cambios);
    const salida = guardarDocx(doc, partesNuevas);

    // --- El texto cambió como se esperaba ---
    const regenerado = abrirDocx(salida);
    const texto = textoPlano(regenerado);

    expect(texto).toContain('084-2025');
    expect(texto).toContain('JUAN PEREZ GOMEZ');
    expect(texto).toContain('10.123.456');
    expect(texto).toContain(
      'a los veintiocho (28) días del mes de febrero de dos mil veinticinco (2025)',
    );
    expect(texto).not.toContain('ANDRES');
    expect(texto).not.toContain('078-2025');
    expect(texto).not.toContain('treinta y un (31)');

    // --- Y nada más cambió: ésta es la prueba de fidelidad ---
    const zipOriginal = new PizZip(original);
    const zipNuevo = new PizZip(salida);

    // El logo sobrevive byte por byte.
    const logoOriginal = zipOriginal.file('word/media/logo.png')!.asUint8Array();
    const logoNuevo = zipNuevo.file('word/media/logo.png')!.asUint8Array();
    expect(Array.from(logoNuevo)).toEqual(Array.from(logoOriginal));
    expect(Array.from(logoNuevo)).toEqual(Array.from(LOGO));

    // Los estilos y las fuentes no se tocan.
    expect(zipNuevo.file('word/styles.xml')!.asText()).toBe(STYLES);

    // Las relaciones y los tipos de contenido tampoco.
    expect(zipNuevo.file('_rels/.rels')!.asText()).toBe(
      zipOriginal.file('_rels/.rels')!.asText(),
    );
    expect(zipNuevo.file('[Content_Types].xml')!.asText()).toBe(
      zipOriginal.file('[Content_Types].xml')!.asText(),
    );

    // Ninguna parte se perdió ni se agregó.
    expect(Object.keys(zipNuevo.files).sort()).toEqual(
      Object.keys(zipOriginal.files).sort(),
    );
  });

  it('la imagen incrustada en el cuerpo del documento no se altera', () => {
    const doc = normalizarDocumento(abrirDocx(construirDocxDePrueba()));
    const mapa = construirMapa(doc.partes);
    const cambios = buscarTodas(mapa, '078-2025').map((x) => ({ ...x, texto: '999-9999' }));
    const salida = guardarDocx(doc, aplicarReemplazos(doc.partes, mapa, cambios));

    const xml = new PizZip(salida).file('word/document.xml')!.asText();
    expect(xml).toContain('<w:drawing><wp:inline><logo/></wp:inline></w:drawing>');
    // Y la configuración de página tampoco.
    expect(xml).toContain('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>');
  });

  it('el documento generado se puede volver a usar como plantilla', () => {
    // Encadenar generaciones no debe degradar el archivo.
    let actual = construirDocxDePrueba();

    for (const [viejo, nuevo] of [
      ['078-2025', '079-2025'],
      ['079-2025', '080-2025'],
      ['080-2025', '081-2025'],
    ]) {
      const doc = normalizarDocumento(abrirDocx(actual));
      const mapa = construirMapa(doc.partes);
      const cambios = buscarTodas(mapa, viejo).map((x) => ({ ...x, texto: nuevo }));
      actual = guardarDocx(doc, aplicarReemplazos(doc.partes, mapa, cambios));
    }

    const zip = new PizZip(actual);
    expect(textoPlano(abrirDocx(actual))).toContain('081-2025');
    // Tras tres generaciones encadenadas, el logo sigue intacto.
    expect(Array.from(zip.file('word/media/logo.png')!.asUint8Array())).toEqual(
      Array.from(LOGO),
    );
    expect(zip.file('word/styles.xml')!.asText()).toBe(STYLES);
  });
});
