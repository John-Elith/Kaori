import { describe, it, expect } from 'vitest';
import { DIAS_EN_PAPELERA } from '../core/modelo/tipos';
import {
  diasRestantes,
  haCaducado,
  ordenadas,
  type PlantillaEnPapelera,
} from '../core/modelo/papeleraPlantillas';
import { mapaVacio, agregarOcurrencia } from '../core/docx/mapaPlantilla';

const AHORA = new Date('2026-08-17T12:00:00.000Z');
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Una fecha ISO a `dias` días de distancia hacia atrás desde AHORA. */
function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * MS_POR_DIA).toISOString();
}

function entrada(id: string, dias: number): PlantillaEnPapelera {
  return { mapa: mapaVacio(id, `Plantilla ${id}`, `${id}.docx`), eliminadaEn: haceDias(dias) };
}

describe('días restantes', () => {
  it('una plantilla recién eliminada tiene los 30 días completos', () => {
    expect(diasRestantes(entrada('a', 0), AHORA)).toBe(DIAS_EN_PAPELERA);
  });

  it('descuenta los días transcurridos', () => {
    expect(diasRestantes(entrada('a', 3), AHORA)).toBe(27);
    expect(diasRestantes(entrada('a', 29), AHORA)).toBe(1);
  });

  it('nunca baja de cero, aunque haya pasado el plazo', () => {
    expect(diasRestantes(entrada('a', 45), AHORA)).toBe(0);
  });

  it('una fecha ilegible se trata como recién eliminada, no como caducada', () => {
    // Es preferible conservar de más que borrar por no saber leer una fecha.
    const rota: PlantillaEnPapelera = {
      mapa: mapaVacio('x', 'X', 'x.docx'),
      eliminadaEn: 'no es una fecha',
    };
    expect(diasRestantes(rota, AHORA)).toBe(DIAS_EN_PAPELERA);
    expect(haCaducado(rota, AHORA)).toBe(false);
  });
});

describe('caducidad', () => {
  it('sigue vigente el día 29', () => {
    expect(haCaducado(entrada('a', 29), AHORA)).toBe(false);
  });

  it('caduca justo al cumplirse los 30 días', () => {
    expect(haCaducado(entrada('a', DIAS_EN_PAPELERA), AHORA)).toBe(true);
  });

  it('caduca pasado el plazo', () => {
    expect(haCaducado(entrada('a', 31), AHORA)).toBe(true);
  });
});

describe('orden', () => {
  it('pone primero la más recién eliminada', () => {
    const lista = [entrada('vieja', 20), entrada('nueva', 1), entrada('media', 10)];
    expect(ordenadas(lista).map((e) => e.mapa.id)).toEqual(['nueva', 'media', 'vieja']);
  });

  it('no altera la lista original', () => {
    const lista = [entrada('a', 20), entrada('b', 1)];
    ordenadas(lista);
    expect(lista.map((e) => e.mapa.id)).toEqual(['a', 'b']);
  });
});

describe('lo que se conserva', () => {
  it('la entrada guarda el mapeo entero, que es lo caro de rehacer', () => {
    let mapa = mapaVacio('pl1', 'INFORME ENERO', 'pl1.docx');
    mapa = agregarOcurrencia(mapa, 'numeroContrato', {
      inicio: 10,
      fin: 18,
      textoOriginal: '078-2025',
    });
    mapa = agregarOcurrencia(mapa, 'nombreContratista', {
      inicio: 40,
      fin: 72,
      textoOriginal: 'ANDRES FELIPE MORALES ROJAS',
    });

    const e: PlantillaEnPapelera = { mapa, eliminadaEn: haceDias(2) };

    // El id sobrevive: es lo que permite que, al recuperarla, los contratos que
    // la tenían asignada vuelvan a reconocerla sin reasignar nada.
    expect(e.mapa.id).toBe('pl1');
    expect(e.mapa.campos).toHaveLength(2);
    expect(e.mapa.campos.flatMap((c) => c.ocurrencias)).toHaveLength(2);
  });
});
