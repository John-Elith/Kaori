/**
 * Regenera el ícono de la aplicación a partir del logo.
 *
 *   node herramientas/icono.mjs
 *
 * El logo original es vertical —el símbolo arriba y la palabra «Kaori» debajo—
 * y viene sobre fondo blanco opaco. A 32 píxeles, que es como se ve en la barra
 * de tareas, la palabra sería ilegible y el fondo blanco recorta un cuadrado
 * claro sobre la barra. Así que este script hace tres cosas:
 *
 *   1. Convierte el fondo blanco en transparencia, respetando la sombra suave
 *      del documento en vez de dejarla como un halo gris.
 *   2. Recorta sólo el símbolo, midiendo su contorno real: si algún día cambia
 *      el logo, el ícono se regenera sin volver a medir nada a ojo.
 *   3. Escribe icono.png (512×512) e icono.ico con las resoluciones que Windows
 *      pide, cada una reducida aquí y no por el sistema, que a 16 y 32 píxeles
 *      se nota.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  escribirIco,
  escribirPng,
  leerPng,
  recortar,
  redimensionar,
} from './imagen.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Resoluciones que Windows escoge según el sitio donde dibuja el icono. */
const TAMANOS_ICO = [16, 24, 32, 48, 64, 128, 256];

/** Fracción superior del logo donde vive el símbolo, sin la palabra. */
const ALTURA_DEL_SIMBOLO = 0.66;

/** Margen alrededor del símbolo, en fracción de su lado. */
const MARGEN = 0.06;

const luminancia = (px, i) => (px[i] + px[i + 1] + px[i + 2]) / 3;
const neutro = (px, i) =>
  Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);

/**
 * Convierte el fondo blanco en transparencia.
 *
 * Se hace en dos pasadas porque el papel del documento es casi tan blanco como
 * el fondo (252,250,249 contra 254,254,254): un umbral global se comería el
 * documento entero.
 *
 * La primera pasada rellena desde los bordes sólo lo francamente blanco y
 * neutro. La segunda avanza hacia adentro por la sombra, y ahí está la clave:
 * sólo sigue mientras el píxel siguiente sea igual o más oscuro que el actual.
 * Entrando desde fuera, la sombra se oscurece hasta tocar el objeto; el papel,
 * en cambio, vuelve a aclararse. Esa inversión es lo que detiene el avance
 * justo en el borde, sin necesidad de acertar con ningún umbral.
 *
 * A la sombra se le quita el blanco de debajo: lo observado es sombra sobre
 * blanco, así que el alfa que le corresponde es cuánto se apartó del blanco.
 * Sin este paso la sombra quedaría gris opaca y sobre la barra de tareas
 * oscura se vería como un cerco.
 */
function quitarFondoBlanco({ ancho, alto, px }) {
  const salida = Buffer.from(px);
  const fondo = new Uint8Array(ancho * alto);
  const pila = [];

  const esFondo = (i) => px[i] >= 248 && px[i + 1] >= 248 && px[i + 2] >= 248 && neutro(px, i) <= 4;

  for (let x = 0; x < ancho; x++) {
    pila.push(x, (alto - 1) * ancho + x);
  }
  for (let y = 0; y < alto; y++) {
    pila.push(y * ancho, y * ancho + ancho - 1);
  }

  // Pasada 1: el blanco liso, desde los bordes hacia adentro.
  while (pila.length > 0) {
    const p = pila.pop();
    if (fondo[p]) continue;
    if (!esFondo(p * 4)) continue;
    fondo[p] = 1;
    salida[p * 4 + 3] = 0;
    const x = p % ancho;
    const y = (p / ancho) | 0;
    if (x > 0) pila.push(p - 1);
    if (x < ancho - 1) pila.push(p + 1);
    if (y > 0) pila.push(p - ancho);
    if (y < alto - 1) pila.push(p + ancho);
  }

  // Pasada 2: la sombra, siguiendo la pendiente hacia lo oscuro.
  const frente = [];
  for (let p = 0; p < ancho * alto; p++) {
    if (fondo[p]) frente.push(p);
  }

  while (frente.length > 0) {
    const p = frente.pop();
    const x = p % ancho;
    const y = (p / ancho) | 0;
    const luzActual = fondo[p] === 1 ? 255 : luminancia(px, p * 4);

    for (const q of [
      x > 0 ? p - 1 : -1,
      x < ancho - 1 ? p + 1 : -1,
      y > 0 ? p - ancho : -1,
      y < alto - 1 ? p + ancho : -1,
    ]) {
      if (q < 0 || fondo[q]) continue;
      const i = q * 4;
      const luz = luminancia(px, i);
      // Neutro, claro, y no más claro que por donde se vino: sigue siendo
      // sombra. En cuanto vuelve a aclararse, es el objeto y se para.
      if (neutro(px, i) > 10 || luz < 190 || luz > luzActual + 1.5) continue;
      fondo[q] = 2;
      salida[i] = 0;
      salida[i + 1] = 0;
      salida[i + 2] = 0;
      salida[i + 3] = Math.round(255 - luz);
      frente.push(q);
    }
  }

  return { ancho, alto, px: salida };
}

/** Contorno del contenido visible dentro de la franja superior del logo. */
function contornoDelSimbolo({ ancho, alto, px }) {
  const hasta = Math.round(alto * ALTURA_DEL_SIMBOLO);
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < hasta; y++) {
    for (let x = 0; x < ancho; x++) {
      // Umbral alto a propósito: la sombra difusa no debe estirar el contorno.
      if (px[(y * ancho + x) * 4 + 3] < 48) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  if (x1 < 0) throw new Error('El logo no tiene contenido visible en su mitad superior');
  return { x0, y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

function principal() {
  const logo = leerPng(join(RAIZ, 'recursos', 'logo.png'));
  const sinFondo = quitarFondoBlanco(logo);
  const c = contornoDelSimbolo(sinFondo);

  // Cuadrado centrado sobre el contorno: el icono se dibuja siempre en una
  // casilla cuadrada, y encajar el lado mayor evita que se deforme.
  const lado = Math.round(Math.max(c.ancho, c.alto) * (1 + MARGEN * 2));
  const cuadro = recortar(
    sinFondo,
    Math.round(c.x0 + c.ancho / 2 - lado / 2),
    Math.round(c.y0 + c.alto / 2 - lado / 2),
    lado,
    lado,
  );

  const icono = redimensionar(cuadro, 512);
  escribirPng(join(RAIZ, 'recursos', 'icono.png'), icono);
  escribirIco(
    join(RAIZ, 'recursos', 'icono.ico'),
    TAMANOS_ICO.map((t) => (t === 512 ? icono : redimensionar(icono, t))),
  );

  // El renderer usa su propia copia para que Vite la empaquete con hash.
  escribirPng(join(RAIZ, 'src', 'recursos', 'icono.png'), icono);
  escribirPng(join(RAIZ, 'src', 'recursos', 'logo.png'), sinFondo);

  const opacos = [...Array(icono.ancho * icono.alto).keys()].filter(
    (i) => icono.px[i * 4 + 3] > 0,
  ).length;

  console.log(
    `Símbolo detectado en ${c.ancho}×${c.alto} px del logo; recorte cuadrado de ${lado} px.\n` +
      `icono.png 512×512 · icono.ico con ${TAMANOS_ICO.join(', ')} px · ` +
      `${Math.round((opacos / (icono.ancho * icono.alto)) * 100)} % del lienzo con contenido.`,
  );
}

principal();
