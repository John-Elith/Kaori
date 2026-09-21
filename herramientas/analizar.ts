/**
 * Herramienta de diagnóstico: vuelca la estructura de un .docx.
 *
 *   npx vite-node herramientas/analizar.ts "ruta/al/informe.docx"
 *
 * Sirve para entender cómo está armado un informe antes de mapearlo, y para
 * comprobar qué encuentra la detección automática.
 */

import { readFileSync } from 'node:fs';
import { abrirDocx, normalizarDocumento } from '../core/docx/leerDocx';
import { construirMapa } from '../core/docx/mapaTexto';
import { detectar, contexto } from '../core/docx/detectarCampos';
import { contarFusiones } from '../core/docx/normalizarRuns';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: npx vite-node herramientas/analizar.ts "informe.docx"');
  process.exit(1);
}

const bruto = abrirDocx(readFileSync(ruta));
console.log('=== PARTES ===');
for (const p of bruto.partes) {
  console.log(`  ${p.nombre}  (${p.xml.length} bytes, ${contarFusiones(p.xml)} runs a fusionar)`);
}

const doc = normalizarDocumento(bruto);
const mapa = construirMapa(doc.partes);

console.log('\n=== PÁRRAFOS (los que tienen texto) ===');
mapa.texto.split('\n').forEach((linea, i) => {
  if (linea.trim().length > 0) console.log(`${String(i).padStart(4)} │ ${linea}`);
});

const candidatos = detectar(mapa);
console.log(`\n=== DETECCIÓN AUTOMÁTICA (${candidatos.length} candidatos) ===`);
for (const c of candidatos) {
  const txt = c.texto.length > 60 ? `${c.texto.slice(0, 60)}…` : c.texto;
  console.log(
    `[${c.confianza.padEnd(5)}] ${(c.sugerencias[0] ?? '?').padEnd(26)} « ${txt} »`,
  );
  if (c.confianza === 'baja') console.log(`          ctx: ${contexto(mapa, c, 30)}`);
}
