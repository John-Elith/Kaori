/**
 * Ajustes de IA: la clave de Claude, la de Gemini y cuál redacta.
 *
 * Las dos son opcionales y Kaori funciona completo sin ninguna. Las claves se
 * guardan cifradas por Windows en el PC y no vuelven nunca a la interfaz: aquí
 * sólo se sabe si hay una o no.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Sparkles, Trash2 } from 'lucide-react';

import { useEstado } from '../estado';
import type { ProveedorIA } from '../../core/modelo/tipos';
import { Aviso, Boton, Campo } from './Ui';

type Proveedor = {
  id: ProveedorIA;
  nombre: string;
  empresa: string;
  ejemplo: string;
  dondeConseguirla: string;
  hace: string;
  hay: () => Promise<boolean>;
  guardar: (c: string) => Promise<{ ok: boolean; error?: string }>;
  borrar: () => Promise<unknown>;
};

const PROVEEDORES: Proveedor[] = [
  {
    id: 'claude',
    nombre: 'Claude',
    empresa: 'Anthropic',
    ejemplo: 'sk-ant-…',
    dondeConseguirla: 'https://console.anthropic.com/settings/keys',
    hace: 'Lee contratos y planillas escaneados, y redacta obligaciones y actividades.',
    hay: () => window.api.sistema.hayClave(),
    guardar: (c) => window.api.sistema.guardarClave(c),
    borrar: () => window.api.sistema.borrarClave(),
  },
  {
    id: 'gemini',
    nombre: 'Gemini',
    empresa: 'Google',
    ejemplo: 'AIza…',
    dondeConseguirla: 'https://aistudio.google.com/apikey',
    hace: 'Redacta obligaciones y actividades. Tiene cuota gratuita.',
    hay: () => window.api.sistema.hayClaveGemini(),
    guardar: (c) => window.api.sistema.guardarClaveGemini(c),
    borrar: () => window.api.sistema.borrarClaveGemini(),
  },
];

export function AjustesIA() {
  const { base, guardar } = useEstado();
  const [hay, setHay] = useState<Record<ProveedorIA, boolean>>({ claude: false, gemini: false });
  const [escrita, setEscrita] = useState<Record<ProveedorIA, string>>({ claude: '', gemini: '' });
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  async function refrescar() {
    const [claude, gemini] = await Promise.all(PROVEEDORES.map((p) => p.hay()));
    setHay({ claude, gemini });
  }

  useEffect(() => {
    void refrescar();
  }, []);

  if (!base) return null;

  const ambas = hay.claude && hay.gemini;
  // La que redacta: la elegida si tiene clave; si no, la que la tenga.
  const preferida = base.ajustes.proveedorIA ?? 'claude';
  const redacta: ProveedorIA | null = hay[preferida]
    ? preferida
    : hay.claude
      ? 'claude'
      : hay.gemini
        ? 'gemini'
        : null;

  async function guardarClave(p: Proveedor) {
    const clave = escrita[p.id].trim();
    if (!clave) return;
    const r = await p.guardar(clave);
    if (r.ok) {
      setEscrita((e) => ({ ...e, [p.id]: '' }));
      setMensaje({ tipo: 'exito', texto: `Clave de ${p.nombre} guardada y cifrada por Windows.` });
      // Con una sola clave, esa es la que redacta: no hace falta elegir.
      if (!hay.claude && !hay.gemini) {
        void guardar((b) => ({ ...b, ajustes: { ...b.ajustes, proveedorIA: p.id } }));
      }
    } else {
      setMensaje({ tipo: 'error', texto: r.error ?? 'No se pudo guardar la clave.' });
    }
    await refrescar();
  }

  async function borrarClave(p: Proveedor) {
    await p.borrar();
    setMensaje({ tipo: 'exito', texto: `Clave de ${p.nombre} quitada.` });
    await refrescar();
  }

  return (
    <section className="tarjeta p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Sparkles size={17} className="text-tinta-tenue" />
        IA (opcional)
      </h2>
      <p className="mb-4 mt-1 text-sm text-tinta-tenue">
        Kaori funciona completo sin esto. Con una clave, redacta las obligaciones y las
        actividades ejecutadas, y lee mejor los escaneos. Las claves se guardan cifradas por
        Windows en este PC y sólo salen hacia su servicio.
      </p>

      {mensaje && (
        <div className="mb-4">
          <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {PROVEEDORES.map((p) => (
          <div key={p.id} className="rounded-lg border border-borde p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                {p.nombre} <span className="text-xs font-normal text-tinta-tenue">· {p.empresa}</span>
              </h3>
              {hay[p.id] && (
                <span className="flex items-center gap-1 text-xs font-medium text-exito-fuerte">
                  <CheckCircle2 size={14} />
                  Configurada{redacta === p.id ? ' · redacta' : ''}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-tinta-tenue">{p.hace}</p>

            {hay[p.id] ? (
              <div className="mt-3">
                <Boton variante="peligro" icono={<Trash2 size={15} />} onClick={() => void borrarClave(p)}>
                  Quitar la clave
                </Boton>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 basis-48">
                  <Campo etiqueta={`Clave de API de ${p.nombre}`}>
                    <input
                      className="campo font-mono"
                      type="password"
                      value={escrita[p.id]}
                      onChange={(e) => setEscrita((x) => ({ ...x, [p.id]: e.target.value }))}
                      placeholder={p.ejemplo}
                      autoComplete="off"
                    />
                  </Campo>
                </div>
                <Boton
                  variante="primario"
                  icono={<KeyRound size={15} />}
                  onClick={() => void guardarClave(p)}
                  disabled={escrita[p.id].trim().length === 0}
                >
                  Guardar
                </Boton>
                <a
                  href={p.dondeConseguirla}
                  target="_blank"
                  rel="noreferrer"
                  className="flex basis-full items-center gap-1 text-xs text-naranja-700 underline underline-offset-2 hover:no-underline"
                >
                  <ExternalLink size={12} />
                  Dónde conseguir una clave de {p.nombre}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      {ambas && (
        <fieldset className="mt-4">
          <legend className="etiqueta">Para redactar obligaciones y actividades, usar</legend>
          <div className="flex flex-wrap gap-2">
            {PROVEEDORES.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  redacta === p.id
                    ? 'border-naranja-500 bg-naranja-50 text-naranja-700'
                    : 'border-borde bg-lienzo hover:border-naranja-300'
                }`}
              >
                <input
                  type="radio"
                  name="proveedorIA"
                  className="accent-naranja-500"
                  checked={redacta === p.id}
                  onChange={() =>
                    void guardar((b) => ({ ...b, ajustes: { ...b.ajustes, proveedorIA: p.id } }))
                  }
                />
                {p.nombre}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-tinta-tenue">
            La lectura de contratos y planillas escaneados usa Claude en cualquier caso.
          </p>
        </fieldset>
      )}

      {!hay.claude && hay.gemini && (
        <p className="mt-3 text-xs text-tinta-tenue">
          Gemini redacta las obligaciones y las actividades. La lectura de escaneos sin clave
          de Claude se hace sin conexión, con reconocimiento de texto.
        </p>
      )}
    </section>
  );
}
