/** Utilidades mínimas de XML. */

/** Decodifica las entidades XML de un texto extraído de un `<w:t>`. */
export function decodificarXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    // `&amp;` debe resolverse al final para no re-decodificar lo anterior.
    .replace(/&amp;/g, '&');
}

/** Codifica un texto para insertarlo dentro de un `<w:t>`. */
export function codificarXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
