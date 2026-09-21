import { describe, it, expect } from 'vitest';
import type { BaseDeDatos, InformeMes, Planilla } from '../core/modelo/tipos';
import { AJUSTES_INICIALES } from '../core/modelo/tipos';
import {
  MAXIMO_EN_HISTORIAL,
  fueGenerado,
  historialOrdenado,
  limpiarHistorial,
  podarHistorial,
  tamanoDelHistorial,
} from '../core/modelo/historial';

const PLANILLA: Planilla = {
  numero: '9000000001',
  fecha: '2026-02-01',
  mesAcreditado: 'enero',
};

/** Un informe generado el día `dia` de febrero de 2026. */
function generado(mes: number, dia: number, contratoId = 'c1'): InformeMes {
  return {
    contratoId,
    anio: 2026,
    mes,
    generadoEn: `2026-02-${String(dia).padStart(2, '0')}T10:00:00.000Z`,
    rutaArchivo: `C:\\Informes\\${contratoId}-${mes}.docx`,
    nombreArchivo: `${contratoId}-${mes}.docx`,
    pagoDelMes: 1_000_000 + mes,
  };
}

function baseCon(informes: InformeMes[]): BaseDeDatos {
  return {
    version: 1,
    contratistas: [],
    contratos: [],
    informes,
    certificados: [],
    papelera: [],
    ajustes: { ...AJUSTES_INICIALES, carpetaSalida: '' },
  };
}

describe('qué cuenta como historial', () => {
  it('un registro que sólo trae la planilla no es un informe generado', () => {
    const soloPlanilla: InformeMes = {
      contratoId: 'c1',
      anio: 2026,
      mes: 5,
      planilla: PLANILLA,
    };
    expect(fueGenerado(soloPlanilla)).toBe(false);
    expect(tamanoDelHistorial(baseCon([soloPlanilla]))).toBe(0);
  });

  it('cuenta sólo los que llegaron a producirse', () => {
    const base = baseCon([
      generado(1, 1),
      { contratoId: 'c2', anio: 2026, mes: 3, planilla: PLANILLA },
      generado(2, 2),
    ]);
    expect(tamanoDelHistorial(base)).toBe(2);
  });
});

describe('orden', () => {
  it('pone primero el más reciente', () => {
    const orden = historialOrdenado([generado(1, 3), generado(2, 10), generado(3, 7)]);
    expect(orden.map((i) => i.mes)).toEqual([2, 3, 1]);
  });

  it('a igual instante, el periodo más antiguo va al final', () => {
    // Un lote de enero, febrero y marzo comparte marca de tiempo: el que debe
    // caer primero al llegar al tope es enero.
    const mismoInstante = [generado(1, 5), generado(3, 5), generado(2, 5)];
    expect(historialOrdenado(mismoInstante).map((i) => i.mes)).toEqual([3, 2, 1]);
  });

  it('deja fuera lo que no se generó', () => {
    const orden = historialOrdenado([
      generado(1, 1),
      { contratoId: 'c9', anio: 2026, mes: 9, planilla: PLANILLA },
    ]);
    expect(orden).toHaveLength(1);
  });
});

describe('podar al llegar al tope', () => {
  const doce = Array.from({ length: MAXIMO_EN_HISTORIAL }, (_, i) => generado(i + 1, i + 1));

  it('con doce o menos no toca nada', () => {
    const base = baseCon(doce);
    expect(podarHistorial(base)).toBe(base); // misma referencia: no hubo cambio
  });

  it('con trece deja doce y cae el más antiguo', () => {
    const base = baseCon([...doce, generado(1, 20, 'c2')]);
    const podada = podarHistorial(base);

    expect(tamanoDelHistorial(podada)).toBe(MAXIMO_EN_HISTORIAL);
    // El más antiguo era el del día 1; ya no está.
    expect(podada.informes.some((i) => i.nombreArchivo === 'c1-1.docx')).toBe(false);
    // Y el recién llegado sí.
    expect(podada.informes.some((i) => i.nombreArchivo === 'c2-1.docx')).toBe(true);
  });

  it('conserva siempre los más recientes', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => generado(1, i + 1, `c${i}`));
    const podada = podarHistorial(baseCon(muchos));
    const quedan = historialOrdenado(podada.informes).map((i) => i.contratoId);

    expect(quedan).toHaveLength(MAXIMO_EN_HISTORIAL);
    expect(quedan[0]).toBe('c29'); // el del día 30
    expect(quedan.at(-1)).toBe('c18');
  });

  it('el registro podado que guardaba una planilla no se pierde entero', () => {
    // La planilla costó escanear un documento; sólo se van los datos de
    // generación, que es lo que ocupa sitio en el historial.
    const conPlanilla: InformeMes = { ...generado(1, 1), planilla: PLANILLA };
    const base = baseCon([conPlanilla, ...doce.slice(1), generado(6, 25, 'c3')]);
    const podada = podarHistorial(base);

    const superviviente = podada.informes.find(
      (i) => i.contratoId === 'c1' && i.mes === 1,
    );
    expect(superviviente).toBeDefined();
    expect(superviviente!.planilla).toEqual(PLANILLA);
    expect(superviviente!.generadoEn).toBeUndefined();
    expect(superviviente!.rutaArchivo).toBeUndefined();
    expect(superviviente!.pagoDelMes).toBeUndefined();
  });

  it('el tope se puede ajustar', () => {
    const podada = podarHistorial(baseCon(doce), 3);
    expect(tamanoDelHistorial(podada)).toBe(3);
  });

  it('no toca los registros que nunca fueron historial', () => {
    const soloPlanilla: InformeMes = {
      contratoId: 'cx',
      anio: 2026,
      mes: 7,
      planilla: PLANILLA,
    };
    const base = baseCon([soloPlanilla, ...doce, generado(2, 28, 'c4')]);
    const podada = podarHistorial(base);

    expect(podada.informes.find((i) => i.contratoId === 'cx')).toEqual(soloPlanilla);
  });
});

describe('limpiar el historial entero', () => {
  it('lo deja vacío', () => {
    const base = baseCon([generado(1, 1), generado(2, 2), generado(3, 3)]);
    const limpia = limpiarHistorial(base);

    expect(tamanoDelHistorial(limpia)).toBe(0);
    expect(limpia.informes).toHaveLength(0);
  });

  it('conserva las planillas ya leídas', () => {
    const base = baseCon([
      { ...generado(1, 1), planilla: PLANILLA },
      generado(2, 2),
      { contratoId: 'c5', anio: 2026, mes: 4, planilla: PLANILLA },
    ]);
    const limpia = limpiarHistorial(base);

    expect(tamanoDelHistorial(limpia)).toBe(0);
    expect(limpia.informes).toHaveLength(2);
    expect(limpia.informes.every((i) => i.planilla !== undefined)).toBe(true);
  });

  it('no altera la base original', () => {
    const base = baseCon([generado(1, 1)]);
    limpiarHistorial(base);
    expect(tamanoDelHistorial(base)).toBe(1);
  });
});
