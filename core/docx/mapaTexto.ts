/**
 * Mapa entre el texto legible del documento y su posición exacta en el XML.
 *
 * Permite buscar "078-2025" o una frase completa sobre un texto plano cómodo, y
 * luego escribir el reemplazo justo en el `<w:t>` que le corresponde, sin tocar
 * un solo byte del resto del documento.
 *
 * Los párrafos se separan con `\n` en el texto plano. Ese salto NO existe en el
 * XML: es un separador virtual que impide que una búsqueda cruce de una celda
 * de tabla a la siguiente y encuentre coincidencias falsas (por ejemplo, las
 * celdas "31" y "01" contiguas formando "3101").
 */

import { decodificarXml, codificarXml } from './xml';

export type Parte = {
  /** Ruta dentro del .docx, p. ej. "word/document.xml" */
  nombre: string;
  xml: string;
};

export type Segmento = {
  parte: string;
  /** Offset donde empieza este segmento dentro del texto plano */
  inicioTexto: number;
  /** Longitud del texto de este segmento */
  largo: number;
  /** Offset del contenido del `<w:t>` dentro del XML de la parte */
  inicioXml: number;
  finXml: number;
};

export type MapaTexto = {
  /** Todo el texto del documento, con `\n` entre párrafos */
  texto: string;
  segmentos: Segmento[];
};

/**
 * Un trozo de texto con su formato.
 *
 * Existe para los párrafos que Kaori compone enteros, como FORMA DE PAGO,
 * donde el formato no puede heredarse del original: el texto nuevo no se
 * parece al que había, así que hay que decir qué va en negrita.
 */
export type Fragmento = {
  texto: string;
  negrita?: boolean;
};

export type Reemplazo = {
  /** Offset inicial en `MapaTexto.texto`, inclusive */
  inicio: number;
  /** Offset final, exclusivo */
  fin: number;
  /** Texto nuevo, sin codificar */
  texto: string;
  /**
   * Si viene, el texto se escribe como varios runs con formato propio en vez
   * de como texto plano dentro del run que ya había. `texto` debe seguir
   * trayendo la concatenación de los fragmentos, que es lo que se usa cuando
   * el reemplazo no puede escribirse como runs.
   */
  fragmentos?: Fragmento[];
};

/** Recorre las partes y arma el texto plano con su mapa de posiciones. */
export function construirMapa(partes: Parte[]): MapaTexto {
  const segmentos: Segmento[] = [];
  const trozos: string[] = [];
  let offset = 0;

  for (const parte of partes) {
    const { xml } = parte;
    // Un `<w:t>` con contenido, o vacío autocerrado.
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m: RegExpExecArray | null;
    let ultimoFin = 0;
    let primeroDeLaParte = true;

    while ((m = re.exec(xml)) !== null) {
      const contenido = m[1];
      const inicioXml = m.index + m[0].length - '</w:t>'.length - contenido.length;
      const finXml = inicioXml + contenido.length;

      // ¿Se cerró algún párrafo entre el <w:t> anterior y este?
      const entreMedio = xml.slice(ultimoFin, m.index);
      const hayCortePárrafo = entreMedio.includes('</w:p>');

      if (!primeroDeLaParte && hayCortePárrafo) {
        trozos.push('\n');
        offset += 1;
      }

      const texto = decodificarXml(contenido);
      segmentos.push({
        parte: parte.nombre,
        inicioTexto: offset,
        largo: texto.length,
        inicioXml,
        finXml,
      });
      trozos.push(texto);
      offset += texto.length;

      ultimoFin = m.index + m[0].length;
      primeroDeLaParte = false;
    }

    // Separador entre partes distintas (documento, encabezados, pies).
    if (!primeroDeLaParte) {
      trozos.push('\n');
      offset += 1;
    }
  }

  return { texto: trozos.join(''), segmentos };
}

/** Segmentos que se solapan con el rango [inicio, fin) del texto plano. */
export function segmentosEnRango(
  mapa: MapaTexto,
  inicio: number,
  fin: number,
): Segmento[] {
  return mapa.segmentos.filter(
    (s) => s.inicioTexto < fin && s.inicioTexto + s.largo > inicio,
  );
}

/**
 * Aplica los reemplazos y devuelve las partes con el XML ya modificado.
 *
 * Cuando un reemplazo abarca varios `<w:t>` (porque el texto original quedó
 * repartido entre runs que no se pudieron fusionar), el texto nuevo se escribe
 * completo en el primer `<w:t>` y los demás se vacían. Word lo renderiza
 * idéntico, porque todos comparten el mismo formato.
 */
export function aplicarReemplazos(
  partes: Parte[],
  mapa: MapaTexto,
  reemplazos: Reemplazo[],
): Parte[] {
  /**
   * Una escritura sobre el XML.
   *
   * `xml` ya va codificado y listo para insertarse tal cual. Según el caso el
   * rango es el contenido de un `<w:t>` —lo normal— o el `<w:r>` entero, que
   * es lo que hace falta cuando el texto nuevo lleva varios formatos.
   */
  type EdicionXml = { parte: string; inicio: number; fin: number; xml: string };
  const ediciones: EdicionXml[] = [];
  const xmlPorParte = new Map(partes.map((p) => [p.nombre, p.xml]));

  for (const r of reemplazos) {
    if (r.fin <= r.inicio) continue;

    const tocados = segmentosEnRango(mapa, r.inicio, r.fin);
    if (tocados.length === 0) {
      throw new Error(
        `El reemplazo en [${r.inicio}, ${r.fin}) no cae sobre ningún texto del documento`,
      );
    }

    for (let i = 0; i < tocados.length; i++) {
      const s = tocados[i];
      const desdeLocal = Math.max(0, r.inicio - s.inicioTexto);
      const hastaLocal = Math.min(s.largo, r.fin - s.inicioTexto);

      // Conservar lo que quede fuera del rango dentro de este mismo segmento.
      const original = mapa.texto.slice(s.inicioTexto, s.inicioTexto + s.largo);
      const prefijo = original.slice(0, desdeLocal);
      const sufijo = original.slice(hastaLocal);

      // El texto nuevo va entero en el primer segmento tocado.
      const cuerpo = i === 0 ? r.texto : '';

      // Con fragmentos, el primer segmento deja de ser una edición de texto y
      // pasa a sustituir su run por la serie de runs con formato. Los demás
      // segmentos se vacían igual que siempre.
      if (i === 0 && r.fragmentos && r.fragmentos.length > 0) {
        const xmlParte = xmlPorParte.get(s.parte);
        const run = xmlParte ? rangoDelRun(xmlParte, s.inicioXml) : null;
        if (xmlParte && run) {
          const rPr = propiedadesDelRun(xmlParte.slice(run.inicio, run.fin));
          const piezas: Fragmento[] = [
            ...(prefijo ? [{ texto: prefijo }] : []),
            ...r.fragmentos,
            ...(sufijo ? [{ texto: sufijo }] : []),
          ];
          ediciones.push({
            parte: s.parte,
            inicio: run.inicio,
            fin: run.fin,
            xml: piezas.map((p) => runConTexto(rPr, p)).join(''),
          });
          continue;
        }
        // Sin run identificable se sigue por la vía normal: mejor el texto sin
        // negritas que un documento a medio escribir.
      }

      ediciones.push({
        parte: s.parte,
        inicio: s.inicioXml,
        fin: s.finXml,
        xml: codificarXml(prefijo + cuerpo + sufijo),
      });
    }
  }

  // Agrupar por parte y aplicar de atrás hacia adelante para no correr offsets.
  const porParte = new Map<string, EdicionXml[]>();
  for (const e of ediciones) {
    const lista = porParte.get(e.parte) ?? [];
    lista.push(e);
    porParte.set(e.parte, lista);
  }

  return partes.map((parte) => {
    const lista = porParte.get(parte.nombre);
    if (!lista || lista.length === 0) return parte;

    // Si dos reemplazos tocan el mismo <w:t>, gana el último resuelto.
    const unicos = new Map<number, EdicionXml>();
    for (const e of lista) unicos.set(e.inicio, e);

    const ordenadas = [...unicos.values()].sort((a, b) => b.inicio - a.inicio);
    let xml = parte.xml;
    for (const e of ordenadas) {
      xml = xml.slice(0, e.inicio) + e.xml + xml.slice(e.fin);
    }
    return { ...parte, xml };
  });
}

/**
 * Reemplaza todas las apariciones literales de un texto.
 * Devuelve los reemplazos listos para `aplicarReemplazos`.
 */
export function buscarTodas(mapa: MapaTexto, aguja: string): Reemplazo[] {
  if (aguja.length === 0) return [];
  const encontrados: Reemplazo[] = [];
  let desde = 0;
  while (true) {
    const i = mapa.texto.indexOf(aguja, desde);
    if (i === -1) break;
    encontrados.push({ inicio: i, fin: i + aguja.length, texto: '' });
    desde = i + aguja.length;
  }
  return encontrados;
}

// ── Runs con formato propio ─────────────────────────────────────────────────
//
// Lo normal es escribir texto dentro del `<w:t>` que ya existe y heredar el
// formato del run que lo envuelve. Pero cuando Kaori compone un párrafo entero
// —FORMA DE PAGO— no hay formato que heredar: el original decía otra cosa. Ahí
// hay que sustituir el run por varios, uno por tramo de formato.

/**
 * Rango del `<w:r>` que envuelve una posición del XML.
 *
 * Se apoya en que los runs no se anidan. Ni `<w:rPr>` ni `<w:rFonts>` casan con
 * `<w:r>` o `<w:r ` —hace falta un `>` o un espacio justo tras la `r`—, así que
 * la búsqueda hacia atrás encuentra la apertura del run y no una de sus
 * propiedades.
 */
export function rangoDelRun(
  xml: string,
  pos: number,
): { inicio: number; fin: number } | null {
  const inicio = Math.max(xml.lastIndexOf('<w:r>', pos), xml.lastIndexOf('<w:r ', pos));
  if (inicio === -1) return null;

  const cierre = xml.indexOf('</w:r>', pos);
  if (cierre === -1) return null;

  return { inicio, fin: cierre + '</w:r>'.length };
}

/** El bloque `<w:rPr>` de un run, o cadena vacía si no tiene. */
export function propiedadesDelRun(runXml: string): string {
  const m = /<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\s*\/>/.exec(runXml);
  return m ? m[0] : '';
}

/**
 * Las mismas propiedades con la negrita puesta o quitada.
 *
 * La marca se escribe siempre, también para quitarla (`w:val="0"`), en vez de
 * limitarse a borrar la etiqueta. Si sólo se borrara, el run heredaría la
 * negrita del estilo del párrafo y un tramo que debe ir normal saldría en
 * negrita según la plantilla. Diciéndolo explícitamente el resultado no
 * depende de con qué estilo venga el documento.
 *
 * `<w:b/>` va después de `<w:rStyle>` y `<w:rFonts>`: el esquema de OOXML fija
 * el orden de los hijos de `<w:rPr>` y Word se queja si no se respeta.
 */
export function conNegrita(rPr: string, negrita: boolean): string {
  const marcas = negrita
    ? '<w:b/><w:bCs/>'
    : '<w:b w:val="0"/><w:bCs w:val="0"/>';

  if (rPr === '' || /^<w:rPr\s*\/>$/.test(rPr)) return `<w:rPr>${marcas}</w:rPr>`;

  const limpio = rPr.replace(/<w:b(?:Cs)?(?:\s[^>]*)?\/>/g, '');
  const cabeza = /^<w:rPr>(?:<w:rStyle[^>]*\/>)?(?:<w:rFonts[^>]*\/>)?/.exec(limpio);
  if (!cabeza) return limpio.replace('<w:rPr>', `<w:rPr>${marcas}`);

  return limpio.slice(0, cabeza[0].length) + marcas + limpio.slice(cabeza[0].length);
}

/** Un `<w:r>` con el formato dado y el texto ya codificado. */
export function runConTexto(rPr: string, fragmento: Fragmento): string {
  // `xml:space="preserve"` es obligatorio: sin él Word se come los espacios de
  // los extremos y los tramos se pegarían unos con otros.
  return (
    `<w:r>${conNegrita(rPr, fragmento.negrita === true)}` +
    `<w:t xml:space="preserve">${codificarXml(fragmento.texto)}</w:t></w:r>`
  );
}
