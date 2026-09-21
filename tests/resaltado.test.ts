import { describe, it, expect } from 'vitest';
import { resaltarImportes, tieneImportes } from '../core/generar/resaltado';
import { redactarFormaDePago } from '../core/generar/formaDePago';
import { montoALetras } from '../core/espanol/numeroALetras';

/** Sólo el texto de los tramos marcados en negrita. */
const negritas = (texto: string) =>
  resaltarImportes(texto)
    .filter((f) => f.negrita)
    .map((f) => f.texto);

describe('qué se marca en negrita', () => {
  it('marca un importe con su cifra', () => {
    expect(negritas('la suma de ' + montoALetras(13_630_000) + ', por medio')).toEqual([
      'TRECE MILLONES SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)',
    ]);
  });

  it('no marca mayúsculas sueltas sin cifra', () => {
    expect(tieneImportes('EL MUNICIPIO DE OLAYA HERRERA PAGARÁ AL CONTRATISTA')).toBe(false);
  });

  it('no marca una cifra suelta sin las letras', () => {
    expect(tieneImportes('el valor de ($2.350.000) mensuales')).toBe(false);
  });

  it('sin importes devuelve el texto entero en un solo tramo', () => {
    const f = resaltarImportes('texto corriente');
    expect(f).toEqual([{ texto: 'texto corriente' }]);
  });

  it('con el texto vacío no revienta', () => {
    expect(resaltarImportes('').map((f) => f.texto).join('')).toBe('');
  });
});

describe('sobre el párrafo real de FORMA DE PAGO', () => {
  // Las tres cifras que aparecen en negrita en el informe del 078-2025.
  const texto = redactarFormaDePago({
    valorTotal: 13_630_000,
    cuotas: [
      { n: 1, fecha: '2025-01-31', valor: 1_880_000 },
      { n: 2, fecha: '2025-02-28', valor: 2_350_000 },
      { n: 3, fecha: '2025-03-31', valor: 2_350_000 },
      { n: 4, fecha: '2025-04-30', valor: 2_350_000 },
      { n: 5, fecha: '2025-05-31', valor: 2_350_000 },
      { n: 6, fecha: '2025-06-30', valor: 2_350_000 },
    ],
    fechaInicio: '2025-01-07',
  });

  it('marca los tres importes, y sólo esos', () => {
    expect(negritas(texto)).toEqual([
      'TRECE MILLONES SEISCIENTOS TREINTA MIL PESOS M/CTE ($13.630.000)',
      'UN MILLÓN OCHOCIENTOS OCHENTA MIL PESOS M/CTE ($1.880.000)',
      'DOS MILLONES TRESCIENTOS CINCUENTA MIL PESOS M/CTE ($2.350.000)',
    ]);
  });

  it('no deja en negrita lo que va entre medias', () => {
    const normales = resaltarImportes(texto).filter((f) => !f.negrita).map((f) => f.texto);
    expect(normales[0]).toBe('El Municipio cancelará al contratista la suma de ');
    expect(normales.some((t) => t.includes('mensualidades vencidas'))).toBe(true);
  });

  it('los tramos reconstruyen el texto exacto, sin perder ni un espacio', () => {
    expect(resaltarImportes(texto).map((f) => f.texto).join('')).toBe(texto);
  });
});
