/**
 * PNG mínimo: leer, escribir, redimensionar y empaquetar en .ico.
 *
 * Sólo cubre lo que hacen falta aquí — 8 bits por canal, RGB o RGBA, sin
 * entrelazado — porque el único insumo es el logo del programa. Se hace a mano
 * en vez de traer una librería de imágenes para no añadir una dependencia
 * nativa que habría que recompilar en cada equipo.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @typedef {{ ancho: number, alto: number, px: Buffer }} Imagen RGBA sin premultiplicar */

/** @returns {Imagen} */
export function leerPng(ruta) {
  const b = readFileSync(ruta);
  if (!b.subarray(0, 8).equals(FIRMA)) throw new Error(`${ruta} no es un PNG`);

  let off = 8;
  let ancho = 0;
  let alto = 0;
  let profundidad = 0;
  let tipoColor = 0;
  let entrelazado = 0;
  const trozos = [];

  while (off < b.length) {
    const largo = b.readUInt32BE(off);
    const tipo = b.toString('ascii', off + 4, off + 8);
    const datos = b.subarray(off + 8, off + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      profundidad = datos[8];
      tipoColor = datos[9];
      entrelazado = datos[12];
    } else if (tipo === 'IDAT') {
      trozos.push(Buffer.from(datos));
    } else if (tipo === 'IEND') {
      break;
    }
    off += 12 + largo;
  }

  if (profundidad !== 8) throw new Error(`Profundidad de ${profundidad} bits no soportada`);
  if (entrelazado !== 0) throw new Error('PNG entrelazado no soportado');
  const canales = tipoColor === 6 ? 4 : tipoColor === 2 ? 3 : 0;
  if (!canales) throw new Error(`Tipo de color ${tipoColor} no soportado`);

  const crudo = inflateSync(Buffer.concat(trozos));
  const paso = ancho * canales;
  const px = Buffer.alloc(alto * paso);

  // Deshacer los filtros por línea (§9 de la especificación PNG).
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (paso + 1)];
    const linea = crudo.subarray(y * (paso + 1) + 1, (y + 1) * (paso + 1));
    const fila = y * paso;
    const previa = fila - paso;
    for (let x = 0; x < paso; x++) {
      const izq = x >= canales ? px[fila + x - canales] : 0;
      const arriba = y > 0 ? px[previa + x] : 0;
      const diagonal = x >= canales && y > 0 ? px[previa + x - canales] : 0;
      let v = linea[x];
      switch (filtro) {
        case 0:
          break;
        case 1:
          v += izq;
          break;
        case 2:
          v += arriba;
          break;
        case 3:
          v += (izq + arriba) >> 1;
          break;
        case 4: {
          const p = izq + arriba - diagonal;
          const di = Math.abs(p - izq);
          const da = Math.abs(p - arriba);
          const dd = Math.abs(p - diagonal);
          v += di <= da && di <= dd ? izq : da <= dd ? arriba : diagonal;
          break;
        }
        default:
          throw new Error(`Filtro ${filtro} desconocido`);
      }
      px[fila + x] = v & 0xff;
    }
  }

  if (canales === 4) return { ancho, alto, px };

  const rgba = Buffer.alloc(ancho * alto * 4, 255);
  for (let i = 0; i < ancho * alto; i++) {
    rgba[i * 4] = px[i * 3];
    rgba[i * 4 + 1] = px[i * 3 + 1];
    rgba[i * 4 + 2] = px[i * 3 + 2];
  }
  return { ancho, alto, px: rgba };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** @param {Imagen} img */
export function codificarPng({ ancho, alto, px }) {
  const paso = ancho * 4;
  const crudo = Buffer.alloc(alto * (paso + 1));
  for (let y = 0; y < alto; y++) {
    // Filtro «up»: comprime bien en imágenes con zonas planas y es trivial.
    const destino = y * (paso + 1);
    crudo[destino] = y === 0 ? 0 : 2;
    for (let x = 0; x < paso; x++) {
      const v = px[y * paso + x];
      crudo[destino + 1 + x] = y === 0 ? v : (v - px[(y - 1) * paso + x]) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    FIRMA,
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {Imagen} img */
export function escribirPng(ruta, img) {
  writeFileSync(ruta, codificarPng(img));
}

/**
 * Reduce con media de área, sobre alfa premultiplicado.
 *
 * Premultiplicar importa: sin ello, los píxeles transparentes del borde
 * arrastran su color al promedio y aparece una orla clara alrededor del icono.
 *
 * @param {Imagen} img
 * @returns {Imagen}
 */
export function redimensionar({ ancho, alto, px }, nuevoAncho, nuevoAlto = nuevoAncho) {
  const salida = Buffer.alloc(nuevoAncho * nuevoAlto * 4);
  const escalaX = ancho / nuevoAncho;
  const escalaY = alto / nuevoAlto;

  for (let y = 0; y < nuevoAlto; y++) {
    const y0 = Math.floor(y * escalaY);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * escalaY));
    for (let x = 0; x < nuevoAncho; x++) {
      const x0 = Math.floor(x * escalaX);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * escalaX));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < Math.min(y1, alto); sy++) {
        for (let sx = x0; sx < Math.min(x1, ancho); sx++) {
          const i = (sy * ancho + sx) * 4;
          const alfa = px[i + 3] / 255;
          r += px[i] * alfa;
          g += px[i + 1] * alfa;
          b += px[i + 2] * alfa;
          a += px[i + 3];
          n++;
        }
      }

      const j = (y * nuevoAncho + x) * 4;
      const alfaMedia = a / n;
      salida[j + 3] = Math.round(alfaMedia);
      if (alfaMedia <= 0) continue;
      const factor = 255 / alfaMedia; // deshacer la premultiplicación
      salida[j] = Math.min(255, Math.round((r / n) * factor));
      salida[j + 1] = Math.min(255, Math.round((g / n) * factor));
      salida[j + 2] = Math.min(255, Math.round((b / n) * factor));
    }
  }

  return { ancho: nuevoAncho, alto: nuevoAlto, px: salida };
}

/** @param {Imagen} img */
export function recortar({ ancho, alto, px }, x0, y0, w, h) {
  const salida = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= ancho || sy >= alto) continue; // fuera: transparente
      px.copy(salida, (y * w + x) * 4, (sy * ancho + sx) * 4, (sy * ancho + sx) * 4 + 4);
    }
  }
  return { ancho: w, alto: h, px: salida };
}

/**
 * Empaqueta varias resoluciones en un .ico de Windows.
 *
 * Cada entrada va como PNG dentro del contenedor, que es lo que admite Windows
 * desde Vista y evita tener que escribir mapas de bits con su máscara AND.
 *
 * @param {Imagen[]} imagenes
 */
export function escribirIco(ruta, imagenes) {
  const cuerpos = imagenes.map((img) => codificarPng(img));
  const cabecera = Buffer.alloc(6 + imagenes.length * 16);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // 1 = icono
  cabecera.writeUInt16LE(imagenes.length, 4);

  let desplazamiento = cabecera.length;
  imagenes.forEach((img, i) => {
    const e = 6 + i * 16;
    cabecera[e] = img.ancho >= 256 ? 0 : img.ancho; // 0 significa 256
    cabecera[e + 1] = img.alto >= 256 ? 0 : img.alto;
    cabecera[e + 2] = 0; // paleta
    cabecera[e + 3] = 0; // reservado
    cabecera.writeUInt16LE(1, e + 4); // planos
    cabecera.writeUInt16LE(32, e + 6); // bits por píxel
    cabecera.writeUInt32LE(cuerpos[i].length, e + 8);
    cabecera.writeUInt32LE(desplazamiento, e + 12);
    desplazamiento += cuerpos[i].length;
  });

  writeFileSync(ruta, Buffer.concat([cabecera, ...cuerpos]));
}
