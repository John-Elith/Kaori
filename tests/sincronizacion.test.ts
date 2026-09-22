/**
 * Varias pantallas guardando a la vez: el PC y un teléfono.
 *
 * El «PC» de estas pruebas es un almacén con número de versión, como el del
 * proceso principal. Las pantallas se simulan con Sincronizador.
 */

import { describe, it, expect } from 'vitest';
import { Sincronizador, type Escritor, type RespuestaEscritura } from '../core/modelo/sincronizacion';
import type { BaseDeDatos, Contrato } from '../core/modelo/tipos';

const baseInicial = (): BaseDeDatos =>
  ({
    version: 1,
    contratistas: [],
    contratos: [{ id: 'c1', numero: '', objeto: '', obligaciones: [] } as unknown as Contrato],
    informes: [],
    certificados: [],
    papelera: [],
    ajustes: {} as BaseDeDatos['ajustes'],
  }) as BaseDeDatos;

/** El almacén del PC: acepta un guardado sólo si se hizo sobre su versión. */
function almacen() {
  let base = baseInicial();
  let revision = 1;
  const escritor = (retraso = () => 0): Escritor => async (b, rev): Promise<RespuestaEscritura> => {
    await new Promise((r) => setTimeout(r, retraso()));
    if (rev !== revision) return { ok: false, revision, base: structuredClone(base) };
    base = structuredClone(b);
    revision += 1;
    return { ok: true, revision };
  };
  return { escritor, leer: () => ({ base: structuredClone(base), revision }) };
}

const poner = (campo: 'numero' | 'objeto', valor: string) => (b: BaseDeDatos) => ({
  ...b,
  contratos: b.contratos.map((c) => (c.id === 'c1' ? { ...c, [campo]: valor } : c)),
});

describe('una pantalla sola', () => {
  it('guarda en orden aunque la red devuelva las respuestas desordenadas', async () => {
    // Pasó con el teléfono: letra a letra, cada guardado por su cuenta, y el
    // de «1» podía llegar después del de «123».
    const pc = almacen();
    const { base, revision } = pc.leer();
    let n = 0;
    const tel = new Sincronizador(base, revision, pc.escritor(() => [30, 5, 20, 1][n++ % 4]), () => {});
    for (const v of ['1', '12', '123', '123-', '123-2', '123-20', '123-202', '123-2025']) {
      void tel.cambiar(poner('numero', v));
    }
    await tel.esperar();
    expect(pc.leer().base.contratos[0].numero).toBe('123-2025');
  });

  it('lo que se ve incluye los cambios aún no guardados', async () => {
    const pc = almacen();
    const { base, revision } = pc.leer();
    let vista = base;
    const tel = new Sincronizador(base, revision, pc.escritor(() => 20), (v) => (vista = v));
    void tel.cambiar(poner('objeto', 'APOYO'));
    expect(vista.contratos[0].objeto).toBe('APOYO');
    await tel.esperar();
  });
});

describe('el PC y el teléfono a la vez', () => {
  it('no se pisan: cada uno conserva su cambio', async () => {
    const almacenPc = almacen();
    const a = almacenPc.leer();
    const b = almacenPc.leer();
    const pc = new Sincronizador(a.base, a.revision, almacenPc.escritor(() => 5), () => {});
    const tel = new Sincronizador(b.base, b.revision, almacenPc.escritor(() => 5), () => {});

    // Los dos parten de la misma versión y cambian campos distintos.
    await Promise.all([pc.cambiar(poner('objeto', 'OBJETO DEL PC')), tel.cambiar(poner('numero', '123-2025'))]);

    const final = almacenPc.leer().base.contratos[0];
    expect(final.numero).toBe('123-2025');
    expect(final.objeto).toBe('OBJETO DEL PC');
  });

  it('las obligaciones leídas de una foto no se pierden si el PC guarda en medio', async () => {
    const almacenPc = almacen();
    const a = almacenPc.leer();
    const b = almacenPc.leer();
    const pc = new Sincronizador(a.base, a.revision, almacenPc.escritor(() => 1), () => {});
    const tel = new Sincronizador(b.base, b.revision, almacenPc.escritor(() => 30), () => {});

    const quince = Array.from({ length: 15 }, (_, i) => ({ n: i + 1, texto: `Obligación ${i + 1}.` }));
    const conObligaciones = (x: BaseDeDatos) => ({
      ...x,
      contratos: x.contratos.map((c) => ({ ...c, obligaciones: quince })),
    });
    await Promise.all([tel.cambiar(conObligaciones), pc.cambiar(poner('objeto', 'DEL PC'))]);

    const final = almacenPc.leer().base.contratos[0];
    expect(final.obligaciones).toHaveLength(15);
    expect(final.objeto).toBe('DEL PC');
  });

  it('una recarga que llega tarde no devuelve la pantalla a un estado viejo', async () => {
    const almacenPc = almacen();
    const vieja = almacenPc.leer(); // la recarga que se pidió antes
    const a = almacenPc.leer();
    let vista = a.base;
    const pc = new Sincronizador(a.base, a.revision, almacenPc.escritor(() => 1), (v) => (vista = v));
    await pc.cambiar(poner('numero', '123-2025'));

    pc.recibir(vieja.base, vieja.revision); // llega tarde, con la versión anterior
    expect(vista.contratos[0].numero).toBe('123-2025');
  });

  it('una recarga nueva se aplica, sin perder lo que aún no se ha guardado', async () => {
    const almacenPc = almacen();
    const a = almacenPc.leer();
    let vista = a.base;
    const tel = new Sincronizador(a.base, a.revision, almacenPc.escritor(() => 50), (v) => (vista = v));
    void tel.cambiar(poner('numero', '123-2025')); // aún viajando

    const nueva = { ...a.base, contratistas: [{ id: 'k9', nombre: 'NUEVO', cedula: '', expedidaEn: '' }] };
    tel.recibir(nueva, a.revision + 10);
    expect(vista.contratistas).toHaveLength(1);
    expect(vista.contratos[0].numero).toBe('123-2025');
    await tel.esperar();
  });

  it('sin conexión, el cambio se sigue viendo y se guarda con el siguiente', async () => {
    const pc = almacen();
    const { base, revision } = pc.leer();
    let caida = true;
    const bueno = pc.escritor();
    const escritor: Escritor = async (b, rev) => {
      if (caida) throw new Error('sin conexión');
      return bueno(b, rev);
    };
    const errores: unknown[] = [];
    let vista = base;
    const tel = new Sincronizador(base, revision, escritor, (v) => (vista = v), (e) => errores.push(e));
    await tel.cambiar(poner('numero', '123'));
    expect(errores).toHaveLength(1);
    expect(vista.contratos[0].numero).toBe('123');
    expect(tel.hayPendientes).toBe(true);

    caida = false;
    await tel.cambiar(poner('objeto', 'APOYO'));
    expect(pc.leer().base.contratos[0]).toMatchObject({ numero: '123', objeto: 'APOYO' });
  });
});
