/**
 * Acceso desde el teléfono: el código, las sesiones y el servidor.
 *
 * El servidor se prueba de verdad, escuchando en un puerto y con peticiones
 * HTTP reales; lo único simulado son los canales del programa.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ControlDeAcceso,
  INACTIVIDAD_MAXIMA_MS,
  VIGENCIA_CODIGO_MS,
  describirDispositivo,
} from '../electron/remoto/acceso';
import {
  canalPermitido,
  conExtension,
  dentroDe,
  iniciarServidor,
  limpiarNombre,
  type Remitente,
} from '../electron/remoto/servidor';

describe('el código de entrada', () => {
  it('tiene 6 cifras', () => {
    const a = new ControlDeAcceso();
    expect(a.nuevoCodigo().codigo).toMatch(/^\d{6}$/);
  });

  it('deja entrar una sola vez', () => {
    const a = new ControlDeAcceso();
    const { codigo } = a.nuevoCodigo();
    expect(a.entrar(codigo, 'ua', '1.1.1.1').ok).toBe(true);
    expect(a.entrar(codigo, 'ua', '1.1.1.2').ok).toBe(false);
  });

  it('acepta el código aunque se escriba con espacios', () => {
    const a = new ControlDeAcceso();
    const { codigo } = a.nuevoCodigo();
    expect(a.entrar(`${codigo.slice(0, 3)} ${codigo.slice(3)}`, 'ua', 'x').ok).toBe(true);
  });

  it('caduca a los 10 minutos', () => {
    let t = 1_000_000;
    const a = new ControlDeAcceso(() => t);
    const { codigo } = a.nuevoCodigo();
    t += VIGENCIA_CODIGO_MS + 1;
    const r = a.entrar(codigo, 'ua', 'x');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/caduc/);
  });

  it('se anula tras 5 intentos fallidos, aunque luego se acierte', () => {
    const a = new ControlDeAcceso();
    const { codigo } = a.nuevoCodigo();
    const malo = codigo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      const r = a.entrar(malo, 'ua', `ip${i}`);
      expect(!r.ok && r.motivo).toMatch(/quedan/);
    }
    expect(a.entrar(malo, 'ua', 'ip4').ok).toBe(false);
    expect(a.entrar(codigo, 'ua', 'ip5').ok).toBe(false);
  });

  it('frena a un mismo equipo que prueba a ciegas', () => {
    const a = new ControlDeAcceso();
    for (let i = 0; i < 10; i++) {
      a.nuevoCodigo();
      a.entrar('999999', 'ua', 'atacante');
    }
    const { codigo } = a.nuevoCodigo();
    const r = a.entrar(codigo, 'ua', 'atacante');
    expect(!r.ok && r.motivo).toMatch(/Demasiados intentos/);
    // Otro equipo, en cambio, entra.
    expect(a.entrar(codigo, 'ua', 'otro').ok).toBe(true);
  });

  it('uno nuevo invalida el anterior', () => {
    const a = new ControlDeAcceso();
    const viejo = a.nuevoCodigo().codigo;
    let nuevo = a.nuevoCodigo().codigo;
    while (nuevo === viejo) nuevo = a.nuevoCodigo().codigo;
    expect(a.entrar(viejo, 'ua', 'x').ok).toBe(false);
  });
});

describe('las sesiones', () => {
  it('caducan tras 12 horas sin uso, pero no mientras se usan', () => {
    let t = 0;
    const a = new ControlDeAcceso(() => t);
    const r = a.entrar(a.nuevoCodigo().codigo, 'ua', 'x');
    if (!r.ok) throw new Error();
    t += INACTIVIDAD_MAXIMA_MS - 1000;
    expect(a.validar(r.token)).not.toBeNull(); // cuenta como actividad
    t += INACTIVIDAD_MAXIMA_MS - 1000;
    expect(a.validar(r.token)).not.toBeNull();
    t += INACTIVIDAD_MAXIMA_MS + 1;
    expect(a.validar(r.token)).toBeNull();
  });

  it('el PC puede cerrar una por su id, sin conocer el token', () => {
    const a = new ControlDeAcceso();
    const r = a.entrar(a.nuevoCodigo().codigo, 'ua', 'x');
    if (!r.ok) throw new Error();
    expect(a.cerrarPorId(r.sesion.id)).toBe(true);
    expect(a.validar(r.token)).toBeNull();
  });

  it('la lista no muestra los tokens', () => {
    const a = new ControlDeAcceso();
    const r = a.entrar(a.nuevoCodigo().codigo, 'ua', 'x');
    if (!r.ok) throw new Error();
    expect(JSON.stringify(a.listar())).not.toContain(r.token);
  });

  it('reconoce el teléfono', () => {
    expect(
      describirDispositivo(
        'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
      ),
    ).toBe('Android · Chrome');
    expect(
      describirDispositivo(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Safari');
  });
});

describe('qué puede pedir el teléfono', () => {
  it('lo del trabajo diario, sí', () => {
    for (const c of [
      'datos:leer',
      'datos:escribir',
      'plantillas:registrar',
      'generacion:lote',
      'extraccion:contrato',
      'sistema:hayClave',
      'sistema:guardarClaveGemini',
    ]) {
      expect(canalPermitido(c), c).toBe(true);
    }
  });

  it('lo que abre ventanas en el PC o gestiona el acceso, no', () => {
    for (const c of [
      'sistema:elegirCarpeta',
      'sistema:abrirArchivo',
      'sistema:leerArchivo',
      'sistema:tema',
      'remoto:activar',
      'remoto:nuevoCodigo',
      'voz:transcribir',
      'inventado',
    ]) {
      expect(canalPermitido(c), c).toBe(false);
    }
  });

  it('no se escapa de una carpeta con «..»', () => {
    expect(dentroDe('C:\\Salida\\ENERO\\a.docx', ['C:\\Salida'])).toBe(true);
    expect(dentroDe('C:\\Salida\\..\\Windows\\win.ini', ['C:\\Salida'])).toBe(false);
    expect(dentroDe('C:\\SalidaFalsa\\a.docx', ['C:\\Salida'])).toBe(false);
    expect(dentroDe('C:\\Salida', ['C:\\Salida'])).toBe(false);
  });

  it('una foto de la cámara sin extensión la recibe según su tipo', () => {
    expect(conExtension('image', 'image/jpeg')).toBe('image.jpg');
    expect(conExtension('1726012345', 'image/png')).toBe('1726012345.png');
    expect(conExtension('contrato.jpeg', 'image/jpeg')).toBe('contrato.jpeg');
    expect(conExtension('contrato.pdf', 'application/pdf')).toBe('contrato.pdf');
    expect(conExtension('raro', '')).toBe('raro');
  });

  it('los nombres subidos no traen rutas', () => {
    expect(limpiarNombre('..\\..\\Windows\\evil.docx')).toBe('evil.docx');
    expect(limpiarNombre('../../x.pdf')).toBe('x.pdf');
    expect(limpiarNombre('con:dos?.pdf')).toBe('con_dos_.pdf');
    expect(limpiarNombre('')).toBe('archivo');
  });
});

describe('el servidor', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'kaori-remoto-'));
  const estatica = join(raiz, 'dist');
  const subidas = join(raiz, 'subidas');
  const salida = join(raiz, 'salida');
  const secreto = join(raiz, 'secreto.txt');

  const acceso = new ControlDeAcceso();
  const llamadas: { canal: string; args: unknown[] }[] = [];
  const destinos = new Set<Remitente>();
  let url = '';
  let cerrar: () => Promise<void> = async () => {};

  beforeAll(async () => {
    mkdirSync(join(estatica, 'assets'), { recursive: true });
    mkdirSync(join(salida, 'ENERO'), { recursive: true });
    writeFileSync(join(estatica, 'index.html'), '<!doctype html><title>Kaori</title>');
    writeFileSync(join(estatica, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(salida, 'ENERO', 'INFORME ENERO.docx'), 'contenido-docx');
    writeFileSync(secreto, 'no debe salir');

    const s = await iniciarServidor(
      {
        acceso,
        raizEstatica: estatica,
        carpetaSubidas: subidas,
        invocar: async (canal, remitente, args) => {
          llamadas.push({ canal, args });
          if (canal === 'generacion:lote') remitente.send('generacion:progreso', { indice: 0 });
          if (canal === 'datos:escribir') {
            for (const d of destinos) if (d !== remitente) d.send('datos:cambiados', {});
          }
          if (canal === 'datos:leer') return { contratos: [] };
          return { ok: true };
        },
        registrarDestino: (r) => {
          destinos.add(r);
          return () => destinos.delete(r);
        },
        carpetasDescargables: async () => [salida],
      },
      0,
      '127.0.0.1',
    );
    url = `http://127.0.0.1:${s.puerto}`;
    cerrar = s.cerrar;
  });

  afterAll(() => cerrar());

  async function entrar(): Promise<string> {
    const { codigo } = acceso.nuevoCodigo();
    const r = await fetch(`${url}/api/entrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    });
    expect(r.status).toBe(200);
    const galleta = r.headers.get('set-cookie') ?? '';
    expect(galleta).toMatch(/HttpOnly/);
    expect(galleta).toMatch(/SameSite=Strict/);
    return galleta.split(';')[0];
  }

  const invocar = (galleta: string, canal: string, args: unknown[] = []) =>
    fetch(`${url}/api/invocar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: galleta },
      body: JSON.stringify({ canal, args }),
    });

  it('sin sesión, la interfaz lleva a la página del código', async () => {
    const r = await fetch(`${url}/`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/entrar');

    const p = await fetch(`${url}/entrar`);
    expect(p.status).toBe(200);
    expect(await p.text()).toContain('Escriba el código del PC');
  });

  it('sin sesión, la API no responde nada', async () => {
    const r = await invocar('', 'datos:leer');
    expect(r.status).toBe(401);
    expect(llamadas.some((l) => l.canal === 'datos:leer')).toBe(false);
  });

  it('con un código equivocado no entra', async () => {
    acceso.nuevoCodigo();
    const r = await fetch(`${url}/api/entrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: 'abcdef' }),
    });
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('con el código entra y ve la interfaz', async () => {
    const g = await entrar();
    const r = await fetch(`${url}/`, { headers: { Cookie: g } });
    expect(await r.text()).toContain('<title>Kaori</title>');

    const a = await fetch(`${url}/assets/app.js`, { headers: { Cookie: g } });
    expect(a.headers.get('content-type')).toMatch(/javascript/);
  });

  it('las llamadas llegan al programa con sus argumentos, `undefined` incluido', async () => {
    const g = await entrar();
    const r = await invocar(g, 'generacion:certificados', [{ a: 'p1' }, ['c1'], 'C:\\x', '__kaori_indefinido__']);
    expect(r.status).toBe(200);
    const l = llamadas.find((x) => x.canal === 'generacion:certificados')!;
    expect(l.args).toEqual([{ a: 'p1' }, ['c1'], 'C:\\x', undefined]);
    expect(l.args[3]).toBeUndefined();
  });

  it('lo que es sólo del PC se rechaza aunque haya sesión', async () => {
    const g = await entrar();
    for (const canal of ['sistema:elegirCarpeta', 'remoto:nuevoCodigo', 'sistema:leerArchivo']) {
      const r = await invocar(g, canal, [secreto]);
      expect(r.status, canal).toBe(403);
    }
    expect(llamadas.some((l) => l.canal.startsWith('remoto:'))).toBe(false);
  });

  it('una plantilla sólo se registra si la subió el teléfono', async () => {
    const g = await entrar();
    const fuera = await invocar(g, 'plantillas:registrar', [secreto, 'x']);
    expect(fuera.status).toBe(403);

    const subida = await fetch(`${url}/api/subir`, {
      method: 'POST',
      headers: {
        Cookie: g,
        'Content-Type': 'application/octet-stream',
        'X-Nombre': encodeURIComponent('..\\..\\INFORME ENERO.docx'),
      },
      body: 'bytes-del-docx',
    });
    const { ruta } = (await subida.json()) as { ruta: string };
    expect(dentroDe(ruta, [subidas])).toBe(true);
    expect(ruta).toMatch(/INFORME ENERO\.docx$/);
    expect(readFileSync(ruta, 'utf8')).toBe('bytes-del-docx');

    const dentro = await invocar(g, 'plantillas:registrar', [ruta, 'x']);
    expect(dentro.status).toBe(200);
    expect(readdirSync(subidas)).toHaveLength(1);
  });

  it('descarga lo generado, y nada de fuera de la carpeta de salida', async () => {
    const g = await entrar();
    const doc = join(salida, 'ENERO', 'INFORME ENERO.docx');
    const r = await fetch(`${url}/api/descargar?ruta=${encodeURIComponent(doc)}`, {
      headers: { Cookie: g },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/attachment/);
    expect(await r.text()).toBe('contenido-docx');

    for (const mala of [secreto, join(salida, '..', 'secreto.txt')]) {
      const x = await fetch(`${url}/api/descargar?ruta=${encodeURIComponent(mala)}`, {
        headers: { Cookie: g },
      });
      expect(x.status).toBe(403);
    }
  });

  it('no sirve archivos de fuera de la interfaz', async () => {
    const g = await entrar();
    const r = await fetch(`${url}/..%2F..%2Fsecreto.txt`, { headers: { Cookie: g } });
    expect(await r.text()).not.toContain('no debe salir');
  });

  it('manda los avisos al teléfono que los provocó, y los cambios a los demás', async () => {
    const g = await entrar();
    const ac = new AbortController();
    const flujo = await fetch(`${url}/api/eventos`, { headers: { Cookie: g }, signal: ac.signal });
    const lector = flujo.body!.getReader();
    const recibido: string[] = [];
    const leyendo = (async () => {
      const dec = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          recibido.push(dec.decode(value));
        }
      } catch {
        /* abortado */
      }
    })();

    // Lo suyo: el progreso de un lote que pidió él.
    await invocar(g, 'generacion:lote', []);
    // Lo de otro: el PC guarda.
    const pc: Remitente = { send: () => {}, isDestroyed: () => false };
    destinos.add(pc);
    for (const d of destinos) if (d !== pc) d.send('datos:cambiados', {});

    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    await leyendo;
    const todo = recibido.join('');
    expect(todo).toContain('"canal":"generacion:progreso"');
    expect(todo).toContain('"canal":"datos:cambiados"');
  });

  it('al salir, la sesión deja de valer', async () => {
    const g = await entrar();
    expect((await invocar(g, 'datos:leer')).status).toBe(200);
    await fetch(`${url}/api/salir`, { method: 'POST', headers: { Cookie: g } });
    expect((await invocar(g, 'datos:leer')).status).toBe(401);
  });

  it('una sesión cerrada desde el PC deja de valer', async () => {
    const g = await entrar();
    const id = acceso.listar().at(-1)!.id;
    acceso.cerrarPorId(id);
    expect((await invocar(g, 'datos:leer')).status).toBe(401);
  });

  it('no acepta llamadas que no sean JSON', async () => {
    const g = await entrar();
    const r = await fetch(`${url}/api/invocar`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Cookie: g },
      body: JSON.stringify({ canal: 'datos:escribir', args: [{}] }),
    });
    expect(r.status).not.toBe(200);
  });
});
