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
