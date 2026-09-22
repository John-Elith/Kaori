/**
 * Gemini y las claves de IA.
 *
 * La API de Google se simula: se comprueba qué se le manda —la clave en
 * cabecera, las instrucciones y el esquema en su dialecto— y cómo se leen sus
 * respuestas y sus errores.
 */

import { describe, it, expect } from 'vitest';
import {
  aEsquemaGemini,
  elegirModelo,
  generarJson,
  mejorModelo,
  modelosCandidatos,
  MODELO_POR_DEFECTO,
} from '../core/extraccion/gemini';
import {
  ESQUEMA_OBLIGACIONES,
  instruccionesActividades,
  instruccionesObligaciones,
} from '../core/extraccion/instruccionesRedaccion';
import { conSecretosDe, sinSecretos } from '../core/modelo/secretos';
import type { BaseDeDatos } from '../core/modelo/tipos';

type Llamada = { url: string; init: RequestInit };

/** Un Google de mentira: responde según la dirección pedida. */
function googleFalso(
  responder: (url: string, cuerpo: unknown) => { estado?: number; json: unknown },
): { fetch: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = responder(url, init.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(JSON.stringify(r.json), { status: r.estado ?? 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, llamadas };
}

const MODELOS = {
  models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-4.0-flash-preview-09', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.0-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ],
};

const respuesta = (texto: string, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text: texto }] } }],
});

describe('el modelo se elige solo', () => {
  it('el Flash estable de versión más alta; ni lite, ni preview, ni pro', () => {
    expect(mejorModelo(MODELOS.models.map((m) => m.name))).toBe('gemini-3.0-flash');
  });

  it('si no hay ninguno reconocible, el de siempre', () => {
    expect(mejorModelo(['models/otra-cosa'])).toBe(MODELO_POR_DEFECTO);
  });

  it('pregunta la lista una sola vez por clave', async () => {
    const g = googleFalso(() => ({ json: MODELOS }));
    await elegirModelo('clave-lista', g.fetch);
    await elegirModelo('clave-lista', g.fetch);
    expect(g.llamadas).toHaveLength(1);
  });
});

describe('lo que se le manda', () => {
  it('la clave en cabecera, nunca en la dirección', async () => {
    const g = googleFalso((url) =>
      url.includes('/models?') ? { json: MODELOS } : { json: respuesta('{"obligaciones":["Realizar A."]}') },
    );
    await generarJson('AIza-secreta', instruccionesObligaciones('Realizar A.', 1), g.fetch);
    for (const l of g.llamadas) {
      expect(l.url).not.toContain('AIza-secreta');
      expect((l.init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-secreta');
    }
  });

  it('las mismas instrucciones que Claude, con el esquema en su dialecto', async () => {
    let cuerpo: Record<string, unknown> = {};
    const g = googleFalso((url, c) => {
      if (url.includes('/models?')) return { json: MODELOS };
      cuerpo = c as Record<string, unknown>;
      return { json: respuesta('{"actividades":["Se limpiaron las redes."]}') };
    });
    const i = instruccionesActividades(['Limpiar las redes.'], true);
    const r = await generarJson<{ actividades: string[] }>('clave-instr', i, g.fetch);

    expect(r.actividades).toEqual(['Se limpiaron las redes.']);
    expect(g.llamadas.at(-1)!.url).toContain('/models/gemini-3.0-flash:generateContent');
    expect(JSON.stringify(cuerpo)).toContain('ACTIVIDADES EJECUTADAS');
    expect(JSON.stringify(cuerpo)).toContain('1. Limpiar las redes.');
    const cfg = cuerpo.generationConfig as { responseMimeType: string; responseSchema: unknown };
    expect(cfg.responseMimeType).toBe('application/json');
    expect(cfg.responseSchema).toEqual(aEsquemaGemini(i.esquema));
  });

  it('el esquema: tipos en mayúsculas y sin additionalProperties', () => {
    expect(aEsquemaGemini(ESQUEMA_OBLIGACIONES)).toEqual({
      type: 'OBJECT',
      properties: {
        obligaciones: {
          type: 'ARRAY',
          description: 'Una obligación específica por elemento, sin numerar',
          items: { type: 'STRING' },
        },
      },
      required: ['obligaciones'],
    });
  });
});

describe('los errores se entienden', () => {
  const conError = (estado: number, mensaje: string) =>
    googleFalso(() => ({ estado, json: { error: { message: mensaje } } }));

  it('clave mala', async () => {
    const g = conError(400, 'API key not valid. Please pass a valid API key.');
    await expect(generarJson('mala-1', instruccionesObligaciones('x', 1), g.fetch)).rejects.toThrow(
      /clave de Gemini no es válida/,
    );
  });

  it('cuota agotada', async () => {
    const g = conError(429, 'Resource has been exhausted');
    await expect(generarJson('mala-2', instruccionesObligaciones('x', 1), g.fetch)).rejects.toThrow(
      /cuota/,
    );
  });

  it('sin conexión', async () => {
    const f = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(generarJson('mala-3', instruccionesObligaciones('x', 1), f)).rejects.toThrow(
      /No hay conexión/,
    );
  });

  it('respuesta bloqueada o cortada', async () => {
    const bloqueada = googleFalso((url) =>
      url.includes('/models?') ? { json: MODELOS } : { json: respuesta('', 'SAFETY') },
    );
    await expect(generarJson('k-4', instruccionesObligaciones('x', 1), bloqueada.fetch)).rejects.toThrow(
      /no quiso/,
    );
    const cortada = googleFalso((url) =>
      url.includes('/models?') ? { json: MODELOS } : { json: respuesta('{"obl', 'MAX_TOKENS') },
    );
    await expect(generarJson('k-5', instruccionesObligaciones('x', 1), cortada.fetch)).rejects.toThrow(
      /incompleta/,
    );
  });

  it('un fallo al elegir el modelo no se queda guardado', async () => {
    let primera = true;
    const f = (async () => {
      if (primera) {
        primera = false;
        throw new TypeError('fetch failed');
      }
      return new Response(JSON.stringify(MODELOS));
    }) as unknown as typeof fetch;
    await expect(elegirModelo('k-reintento', f)).rejects.toThrow();
    await expect(elegirModelo('k-reintento', f)).resolves.toBe('gemini-3.0-flash');
  });
});

describe('cuando un modelo falla, se pasa al siguiente', () => {
  // Lo que se vio con una cuenta real: el modelo más nuevo daba 429 (sin
  // cuota), el siguiente 503 (saturado), uno viejo 404 (retirado) y el de
  // detrás respondía en un segundo. Antes Kaori insistía con el primero, se le
  // acababa el tiempo y caía a las reglas sin decir nada.
  const CUENTA = {
    models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'].map(
      (n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] }),
    ),
  };
  const error = (estado: number, message: string) => ({ estado, json: { error: { message } } });
  const bien = { json: respuesta('{"actividades":["Se limpiaron las redes."]}') };
  const pedido = instruccionesActividades(['Limpiar las redes.'], true);

  /** Google según el modelo, como en la cuenta real. */
  function cuentaReal(funciona: (m: string) => boolean = (m) => m === 'gemini-3.6-flash') {
    return googleFalso((url) => {
      if (url.includes('/models?')) return { json: CUENTA };
      const m = /models\/([^:]+):/.exec(url)![1];
      if (funciona(m)) return bien;
      if (m === 'gemini-3.8-flash') return error(429, 'Quota exceeded');
      if (m === 'gemini-3.7-flash') return error(503, 'This model is currently experiencing high demand.');
      if (m === 'gemini-2.5-flash') return error(404, 'models/gemini-2.5-flash is not found');
      return error(503, 'overloaded');
    });
  }
  const modeloDe = (l: Llamada) => /models\/([^:?]+)[:?]/.exec(l.url)?.[1];

  it('los candidatos: flash del más nuevo al más viejo, luego los lite', () => {
    expect(modelosCandidatos(MODELOS.models.map((m) => m.name))).toEqual([
      'gemini-3.0-flash',
      'gemini-2.5-flash',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('salta el sin cuota y el saturado, un intento cada uno, y usa el que responde', async () => {
    const g = cuentaReal();
    const r = await generarJson<{ actividades: string[] }>('k-real-1', pedido, g.fetch);
    expect(r.actividades).toEqual(['Se limpiaron las redes.']);
    expect(g.llamadas.filter((l) => l.init.method === 'POST').map(modeloDe)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
    ]);
  });

  it('la próxima vez empieza por el que respondió, sin repetir los fallos', async () => {
    const g = cuentaReal();
    await generarJson('k-real-2', pedido, g.fetch);
    const antes = g.llamadas.length;
    await generarJson('k-real-2', pedido, g.fetch);
    expect(g.llamadas.slice(antes).map(modeloDe)).toEqual(['gemini-3.6-flash']);
  });

  it('aparta los que fallaron: si el bueno se satura, no vuelve a ellos enseguida', async () => {
    let bueno = 'gemini-3.6-flash';
    const g = cuentaReal((m) => m === bueno);
    await generarJson('k-real-3', pedido, g.fetch);
    // Ahora el 3.6 se satura y sólo responde el lite.
    bueno = 'gemini-3.5-flash-lite';
    const antes = g.llamadas.length;
    const r = await generarJson<{ actividades: string[] }>('k-real-3', pedido, g.fetch);
    expect(r.actividades).toEqual(['Se limpiaron las redes.']);
    // Ni el 3.8 (sin cuota) ni el 3.7 (saturado) se repiten. El 2.5 sí se
    // prueba: la primera vez no hizo falta llegar a él.
    expect(g.llamadas.slice(antes).map(modeloDe)).toEqual([
      'gemini-3.6-flash',
      'gemini-2.5-flash',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('si todos fallan, lo dice claro y cuántos probó', async () => {
    const g = cuentaReal(() => false);
    await expect(generarJson('k-real-4', pedido, g.fetch)).rejects.toThrow(/probaron 5 modelos/);
  });

  it('no se pasa del tiempo máximo', async () => {
    let t = 0;
    const g = googleFalso((url) => {
      if (url.includes('/models?')) return { json: CUENTA };
      t += 40_000; // cada modelo tarda 40 s en fallar
      return error(503, 'high demand');
    });
    await expect(
      generarJson('k-real-5', pedido, { fetchImpl: g.fetch, ahora: () => t }),
    ).rejects.toThrow(/probaron 3 modelos/);
  });

  it('una clave mala no se prueba con otros modelos: insistir no lo arregla', async () => {
    let n = 0;
    const g = googleFalso((url) => {
      if (url.includes('/models?')) return { json: CUENTA };
      n++;
      return error(400, 'API key not valid.');
    });
    await expect(generarJson('k-real-6', pedido, g.fetch)).rejects.toThrow(/no es válida/);
    expect(n).toBe(1);
  });
});

describe('las claves no pasan por la interfaz', () => {
  const base = (ajustes: Record<string, unknown>) =>
    ({ contratos: [], ajustes: { carpetaSalida: 'C:\\x', ...ajustes } }) as unknown as BaseDeDatos;

  it('la interfaz recibe la base sin claves', () => {
    const b = sinSecretos(base({ apiKeyCifrada: 'AAA', geminiClaveCifrada: 'GGG', tema: 'oscuro' }));
    expect(b.ajustes.apiKeyCifrada).toBeUndefined();
    expect(b.ajustes.geminiClaveCifrada).toBeUndefined();
    expect(b.ajustes.tema).toBe('oscuro');
  });

  it('un guardado de la interfaz no borra las claves guardadas', () => {
    // El fallo de antes: la interfaz guardaba su copia, sin la clave recién
    // guardada, y la clave desaparecía.
    const enDisco = base({ apiKeyCifrada: 'AAA', geminiClaveCifrada: 'GGG' });
    const deLaInterfaz = base({ tema: 'claro' });
    const r = conSecretosDe(deLaInterfaz, enDisco);
    expect(r.ajustes.apiKeyCifrada).toBe('AAA');
    expect(r.ajustes.geminiClaveCifrada).toBe('GGG');
    expect(r.ajustes.tema).toBe('claro');
  });

  it('ni la interfaz puede poner una clave por su cuenta', () => {
    const r = conSecretosDe(base({ apiKeyCifrada: 'INVENTADA' }), base({}));
    expect(r.ajustes.apiKeyCifrada).toBeUndefined();
  });
});
