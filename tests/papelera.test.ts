import { describe, it, expect } from 'vitest';
import type { BaseDeDatos, Contrato, InformeMes } from '../core/modelo/tipos';
import { DIAS_EN_PAPELERA, AJUSTES_INICIALES } from '../core/modelo/tipos';
import {
  enviarAPapelera,
  restaurarDePapelera,
  borrarDefinitivamente,
  vaciarPapelera,
  depurarPapelera,
  diasRestantes,
  haCaducado,
  papeleraOrdenada,
} from '../core/modelo/papelera';

function contrato(id: string, numero: string): Contrato {
  return {
    id,
    contratistaId: 'k1',
    numero,
    anio: 2025,
    objeto: '',
    fechaInicio: '2025-01-07',
    fechaTerminacion: '2025-06-30',
    fechaFirma: '2025-01-07',
    valorInicial: 1_000_000,
    cuotas: [],
    adiciones: [],
    suspensiones: [],
    formaDePago: '',
    textoPlazo: '',
    contratante: '',
    nitContratante: '',
    municipio: '',
    supervisor: { nombre: '', cargo: '' },
    cdp: { numero: '', fecha: '2025-01-02', valor: 0 },
    rp: { numero: '', fecha: '2025-01-07', valor: 0 },
    obligaciones: [],
    obligacionesSupervision: [],
    plantillaId: 'p1',
    activo: true,
  };
}

function informe(contratoId: string, mes: number): InformeMes {
  return { contratoId, anio: 2025, mes, generadoEn: '2025-02-01T00:00:00.000Z' };
}

function baseCon(contratos: Contrato[], informes: InformeMes[] = []): BaseDeDatos {
  return {
    version: 1,
    contratistas: [
      { id: 'k1', nombre: 'PERSONA DE PRUEBA', cedula: '10.000.000', expedidaEn: 'X' },
    ],
    contratos,
    informes,
    certificados: [],
    papelera: [],
    ajustes: { ...AJUSTES_INICIALES, carpetaSalida: '' },
  };
}

/** Fecha a N días en el pasado. */
function haceDias(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('enviar a la papelera', () => {
  it('saca el contrato de la lista activa y se lleva sus informes', () => {
    const base = baseCon(
      [contrato('c1', '078-2025'), contrato('c2', '084-2025')],
      [informe('c1', 1), informe('c1', 2), informe('c2', 1)],
    );

    const r = enviarAPapelera(base, 'c1');

    expect(r.contratos.map((c) => c.id)).toEqual(['c2']);
    expect(r.informes.map((i) => i.contratoId)).toEqual(['c2']);
    expect(r.papelera).toHaveLength(1);
    expect(r.papelera[0].contrato.numero).toBe('078-2025');
    expect(r.papelera[0].informes).toHaveLength(2);
  });

  it('no altera la base si el contrato no existe', () => {
    const base = baseCon([contrato('c1', '078-2025')]);
    expect(enviarAPapelera(base, 'inexistente')).toBe(base);
  });

  it('eliminar dos veces no duplica la entrada', () => {
    const base = baseCon([contrato('c1', '078-2025')]);
    const una = enviarAPapelera(base, 'c1');
    const dos = enviarAPapelera(una, 'c1');
    expect(dos.papelera).toHaveLength(1);
  });
});

describe('restaurar', () => {
  it('devuelve el contrato y sus informes intactos', () => {
    const base = baseCon([contrato('c1', '078-2025')], [informe('c1', 1), informe('c1', 2)]);
    const borrado = enviarAPapelera(base, 'c1');
    const vuelto = restaurarDePapelera(borrado, 'c1');

    expect(vuelto.contratos.map((c) => c.numero)).toEqual(['078-2025']);
    expect(vuelto.informes).toHaveLength(2);
    expect(vuelto.papelera).toHaveLength(0);
  });

  it('no duplica informes que ya existan', () => {
    const base = baseCon([contrato('c1', '078-2025')], [informe('c1', 1)]);
    const borrado = enviarAPapelera(base, 'c1');
    // Alguien recreó el informe de enero mientras el contrato estaba borrado.
    const conInforme = { ...borrado, informes: [informe('c1', 1)] };

    const vuelto = restaurarDePapelera(conInforme, 'c1');
    expect(vuelto.informes).toHaveLength(1);
  });

  it('restaura aunque su contratista ya no exista', () => {
    const base = baseCon([contrato('c1', '078-2025')]);
    const borrado = enviarAPapelera(base, 'c1');
    const sinContratista = { ...borrado, contratistas: [] };

    const vuelto = restaurarDePapelera(sinContratista, 'c1');
    // Es preferible un contrato que hay que reasignar a perder el trabajo.
    expect(vuelto.contratos).toHaveLength(1);
  });
});

describe('borrado definitivo', () => {
  it('quita la entrada sin devolver el contrato', () => {
    const base = enviarAPapelera(baseCon([contrato('c1', '078-2025')]), 'c1');
    const r = borrarDefinitivamente(base, 'c1');
    expect(r.papelera).toHaveLength(0);
    expect(r.contratos).toHaveLength(0);
  });

  it('vaciar deja la papelera sin nada', () => {
    let base = baseCon([contrato('c1', 'a'), contrato('c2', 'b')]);
    base = enviarAPapelera(base, 'c1');
    base = enviarAPapelera(base, 'c2');
    expect(vaciarPapelera(base).papelera).toHaveLength(0);
  });
});

describe('caducidad a los 30 días', () => {
  it('cuenta los días que quedan', () => {
    const base = enviarAPapelera(baseCon([contrato('c1', 'a')]), 'c1');
    expect(diasRestantes(base.papelera[0])).toBe(DIAS_EN_PAPELERA);

    const casi = { ...base.papelera[0], eliminadoEn: haceDias(29) };
    expect(diasRestantes(casi)).toBe(1);

    const pasado = { ...base.papelera[0], eliminadoEn: haceDias(45) };
    expect(diasRestantes(pasado)).toBe(0);
  });

  it('caduca justo a los 30 días, no antes', () => {
    const base = enviarAPapelera(baseCon([contrato('c1', 'a')]), 'c1');
    const entrada = base.papelera[0];

    expect(haCaducado({ ...entrada, eliminadoEn: haceDias(29) })).toBe(false);
    expect(haCaducado({ ...entrada, eliminadoEn: haceDias(30) })).toBe(true);
    expect(haCaducado({ ...entrada, eliminadoEn: haceDias(31) })).toBe(true);
  });

  it('depurar borra lo caducado y conserva lo vigente', () => {
    let base = baseCon([contrato('c1', 'viejo'), contrato('c2', 'nuevo')]);
    base = enviarAPapelera(base, 'c1');
    base = enviarAPapelera(base, 'c2');
    base.papelera = base.papelera.map((e) =>
      e.contrato.id === 'c1' ? { ...e, eliminadoEn: haceDias(40) } : e,
    );

    const r = depurarPapelera(base);
    expect(r.papelera).toHaveLength(1);
    expect(r.papelera[0].contrato.numero).toBe('nuevo');
  });

  it('depurar no toca la base si no hay nada caducado', () => {
    const base = enviarAPapelera(baseCon([contrato('c1', 'a')]), 'c1');
    expect(depurarPapelera(base)).toBe(base);
  });

  it('una fecha ilegible no borra la entrada', () => {
    const base = enviarAPapelera(baseCon([contrato('c1', 'a')]), 'c1');
    base.papelera[0].eliminadoEn = 'no es una fecha';
    expect(depurarPapelera(base).papelera).toHaveLength(1);
  });
});

describe('orden de la papelera', () => {
  it('muestra primero lo más recién eliminado', () => {
    let base = baseCon([contrato('c1', 'primero'), contrato('c2', 'segundo')]);
    base = enviarAPapelera(base, 'c1');
    base.papelera[0].eliminadoEn = haceDias(10);
    base = enviarAPapelera(base, 'c2');

    expect(papeleraOrdenada(base).map((e) => e.contrato.numero)).toEqual([
      'segundo',
      'primero',
    ]);
  });
});
