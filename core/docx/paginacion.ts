/**
 * Hojas en blanco que no pidió nadie.
 *
 * Las plantillas separan un informe del siguiente con renglones vacíos y, al
 * final, un salto de página. Los renglones vacíos no se ven —lo que sigue al
 * salto empieza en hoja nueva igual—, pero ocupan: cuando el informe de arriba
 * crece unas líneas (más actividades, un objeto más largo), esos renglones ya
 * no caben, pasan a la hoja siguiente y el salto los deja solos en una hoja en
 * blanco. Lo mismo con los renglones vacíos del final del documento.
 *
 * Aquí se quitan esos renglones. Sólo los que no pueden verse nunca: los que
 * van justo antes de un salto de página y los del final del cuerpo. Ninguno
 * lleva texto, imagen, marca de sección ni campo.
 */

/** Un párrafo sin nada visible: sólo propiedades y, a lo sumo, runs vacíos. */
const PARRAFO_VACIO =
  '<w:p(?:\\s[^>]*)?\\/>|<w:p(?:\\s[^>]*)?>(?:<w:pPr\\/>|<w:pPr>(?:(?!<\\/w:pPr>|<w:sectPr)[\\s\\S])*<\\/w:pPr>)?(?:<w:r(?:\\s[^>]*)?>(?:<w:rPr>(?:(?!<\\/w:rPr>)[\\s\\S])*<\\/w:rPr>)?<\\/w:r>|<w:proofErr[^>]*\\/>)*<\\/w:p>';

/** Un párrafo que no lleva más que un salto de página. */
const PARRAFO_SALTO =
  '<w:p(?:\\s[^>]*)?>(?:<w:pPr>(?:(?!<\\/w:pPr>|<w:sectPr)[\\s\\S])*<\\/w:pPr>)?<w:r(?:\\s[^>]*)?>(?:<w:rPr>(?:(?!<\\/w:rPr>)[\\s\\S])*<\\/w:rPr>)?(?:<w:lastRenderedPageBreak\\/>)?<w:br w:type="page"\\/><\\/w:r><\\/w:p>';

const VACIOS_ANTES_DE_SALTO = new RegExp(`(?:${PARRAFO_VACIO})+(?=${PARRAFO_SALTO})`, 'g');
const VACIOS_AL_FINAL = new RegExp(`((?:<\\/w:tbl>)?)((?:${PARRAFO_VACIO})+)(<w:sectPr[\\s\\S]*<\\/w:sectPr>\\s*<\\/w:body>)`);
const SALTO_SUELTO = new RegExp(`(<\\/w:p>)(${PARRAFO_SALTO})`, 'g');

export function quitarHojasEnBlanco(xml: string): string {
  let s = xml.replace(VACIOS_ANTES_DE_SALTO, '');

  // El salto, al final del párrafo anterior en vez de en uno propio: si ese
  // párrafo acaba justo al pie de la hoja, un párrafo sólo con el salto caería
  // en la hoja siguiente y la dejaría en blanco; dentro del anterior, no.
  s = s.replace(SALTO_SUELTO, (entero, cierre: string, salto: string, pos: number) => {
    const inicio = inicioDelParrafo(s, pos);
    if (inicio < 0) return entero;
    const anterior = s.slice(inicio, pos);
    // Con otro párrafo dentro (un cuadro de texto) o marca de sección, no se toca.
    if (/<w:sectPr|<w:txbxContent|<w:tbl|<\/w:p>/.test(anterior)) return entero;
    const run = salto.match(/<w:r(?:\s[^>]*)?>[\s\S]*<\/w:r>/)![0];
    return `${run}${cierre}`;
  });

  // Al final del cuerpo. Tras una tabla, Word exige un párrafo: se deja uno.
  s = s.replace(VACIOS_AL_FINAL, (_e, tabla: string, vacios: string, fin: string) => {
    if (!tabla) return fin;
    const primero = vacios.match(new RegExp(PARRAFO_VACIO))![0];
    return `${tabla}${primero}${fin}`;
  });
  return s;
}

/** Dónde empieza el párrafo que se cierra en `fin`, o -1 si no es seguro. */
function inicioDelParrafo(xml: string, fin: number): number {
  const a = xml.lastIndexOf('<w:p>', fin);
  const b = xml.lastIndexOf('<w:p ', fin);
  return Math.max(a, b);
}

/** Lo mismo, sobre las partes del documento: sólo el cuerpo. */
export function sinHojasEnBlanco<P extends { nombre: string; xml: string }>(partes: P[]): P[] {
  return partes.map((p) =>
    p.nombre === 'word/document.xml' ? { ...p, xml: quitarHojasEnBlanco(p.xml) } : p,
  );
}
