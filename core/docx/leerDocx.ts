/**
 * Apertura y escritura de archivos .docx.
 *
 * Un .docx es un ZIP. La estrategia del programa es clonar ese ZIP entero y
 * tocar únicamente el texto de las partes de contenido. Todo lo demás — logos,
 * imágenes incrustadas, estilos, fuentes, numeración, márgenes, encabezados —
 * viaja intacto porque nunca se abre ni se vuelve a serializar.
 */

import PizZip from 'pizzip';
import type { Parte } from './mapaTexto';
import { normalizarRuns } from './normalizarRuns';

export type DocumentoDocx = {
  zip: PizZip;
  /** Partes de contenido con texto editable */
  partes: Parte[];
};

/** Partes que pueden contener texto variable del informe. */
function esParteDeContenido(nombre: string): boolean {
  return (
    nombre === 'word/document.xml' ||
    /^word\/header\d*\.xml$/.test(nombre) ||
    /^word\/footer\d*\.xml$/.test(nombre)
  );
}

export function abrirDocx(contenido: Buffer | Uint8Array | ArrayBuffer): DocumentoDocx {
  const zip = new PizZip(contenido as never);

  if (!zip.file('word/document.xml')) {
    throw new Error(
      'El archivo no parece ser un .docx válido: falta word/document.xml. ' +
        'Si es un .doc antiguo, ábralo en Word y guárdelo como .docx.',
    );
  }

  const partes: Parte[] = [];
  for (const nombre of Object.keys(zip.files)) {
    if (zip.files[nombre].dir) continue;
    if (!esParteDeContenido(nombre)) continue;
    partes.push({ nombre, xml: zip.file(nombre)!.asText() });
  }

  // document.xml primero; el resto en orden estable.
  partes.sort((a, b) => {
    if (a.nombre === 'word/document.xml') return -1;
    if (b.nombre === 'word/document.xml') return 1;
    return a.nombre.localeCompare(b.nombre);
  });

  return { zip, partes };
}

/**
 * Fusiona los runs partidos en todas las partes.
 *
 * Se ejecuta una sola vez, al registrar la plantilla, y el resultado se guarda.
 * Así las coordenadas del mapeo de campos apuntan siempre a un documento
 * estable, y no hay que renormalizar en cada generación.
 */
export function normalizarDocumento(doc: DocumentoDocx): DocumentoDocx {
  return {
    zip: doc.zip,
    partes: doc.partes.map((p) => ({ ...p, xml: normalizarRuns(p.xml) })),
  };
}

/** Vuelca las partes modificadas al ZIP y devuelve el .docx resultante. */
export function guardarDocx(doc: DocumentoDocx, partes: Parte[]): Buffer {
  for (const parte of partes) {
    doc.zip.file(parte.nombre, parte.xml);
  }
  return doc.zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    // Word rechaza el archivo si el mimetype no coincide; PizZip lo conserva
    // porque estamos reescribiendo el mismo ZIP, no creando uno nuevo.
  }) as Buffer;
}

/** Texto plano de todo el documento, útil para diagnóstico y pruebas. */
export function textoPlano(doc: DocumentoDocx): string {
  return doc.partes
    .map((p) =>
      [...p.xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1])
        .join(''),
    )
    .join('\n');
}
