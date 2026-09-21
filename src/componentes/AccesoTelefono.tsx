/**
 * «Usar desde el teléfono», en Ajustes del PC.
 *
 * Enciende el acceso por la Wi-Fi y muestra lo necesario para entrar: el QR,
 * que lleva a la dirección del PC, y el código de 6 cifras, que hay que
 * escribir en el teléfono. El QR no lleva el código a propósito: así, para
 * entrar hace falta estar delante de esta pantalla.
 *
 * También lista los teléfonos conectados, con un botón para echar a cada uno.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, Smartphone, Unplug, Wifi, WifiOff } from 'lucide-react';

import type { EstadoRemoto } from '../../electron/preload';
import { Aviso, Boton, fechaHora } from './Ui';

export function AccesoTelefono() {
  const [estado, setEstado] = useState<EstadoRemoto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    void window.api.remoto.estado().then(setEstado);
    // Cuando entra o sale un teléfono, se refresca la lista.
    return window.api.remoto.alCambiar(() => {
      void window.api.remoto.estado().then(setEstado);
    });
  }, []);

  // La cuenta atrás del código.
  useEffect(() => {
    if (!estado?.activo) return;
    const t = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [estado?.activo]);

  async function hacer(f: () => Promise<EstadoRemoto>) {
    setOcupado(true);
    try {
      setEstado(await f());
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return null;

  const quedan = estado.caduca ? Math.max(0, Math.round((estado.caduca - ahora) / 1000)) : 0;
  const codigoVigente = estado.codigo && quedan > 0;

  return (
    <section className="tarjeta p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <Smartphone size={17} className="text-tinta-tenue" />
            Usar desde el teléfono
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-tinta-tenue">
            El teléfono ve y hace lo mismo que el PC: contratos, plantillas, generar
            documentos y descargarlos. Tiene que estar conectado a la misma Wi-Fi que este
            PC, y Kaori debe seguir abierto aquí.
          </p>
        </div>
        {estado.activo ? (
          <Boton
            variante="peligro"
            icono={<WifiOff size={15} />}
            cargando={ocupado}
            onClick={() => void hacer(() => window.api.remoto.desactivar())}
          >
            Apagar el acceso
          </Boton>
        ) : (
          <Boton
            variante="primario"
            icono={<Wifi size={15} />}
            cargando={ocupado}
            onClick={() => void hacer(() => window.api.remoto.activar())}
          >
            Activar
          </Boton>
        )}
      </div>

      {estado.error && (
        <div className="mt-4">
          <Aviso tipo="error">{estado.error}</Aviso>
        </div>
      )}

      {estado.activo && estado.direccion && (
        <div className="mt-5 grid gap-6 md:grid-cols-[auto,1fr]">
          {/* El QR, sobre blanco siempre: en oscuro los lectores fallan. */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl bg-white p-3 shadow-tarjeta ring-1 ring-borde">
              {estado.qr && (
                <img src={estado.qr} alt="Código QR con la dirección de Kaori" className="h-48 w-48" />
              )}
            </div>
            <p className="font-mono text-xs text-tinta-tenue">{estado.direccion}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <ol className="flex flex-col gap-1.5 text-sm">
              <li>
                <b>1.</b> Abra la cámara del teléfono y apunte al código QR.
              </li>
              <li>
                <b>2.</b> Toque el enlace que aparece. Se abrirá Kaori en el navegador.
              </li>
              <li>
                <b>3.</b> Escriba este código:
              </li>
            </ol>

            <div className="flex flex-wrap items-center gap-4">
              {codigoVigente ? (
                <>
                  <span
                    className="rounded-xl border border-naranja-200 bg-naranja-50 px-5 py-2 font-mono
                               text-3xl font-semibold tabular-nums tracking-[0.3em] text-naranja-700"
                    aria-label={`Código ${estado.codigo!.split('').join(' ')}`}
                  >
                    {estado.codigo}
                  </span>
                  <span className="text-xs text-tinta-tenue">
                    Vale para una sola entrada.
                    <br />
                    Caduca en {Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, '0')}
                  </span>
                </>
              ) : (
                <span className="text-sm text-tinta-tenue">
                  El código ya se usó o caducó. Pida otro para conectar un teléfono.
                </span>
              )}
              <Boton
                variante="fantasma"
                icono={<RefreshCw size={14} />}
                disabled={ocupado}
                onClick={() => void hacer(() => window.api.remoto.nuevoCodigo())}
              >
                Código nuevo
              </Boton>
            </div>

            {estado.otras && estado.otras.length > 0 && (
              <p className="text-xs text-tinta-tenue">
                ¿El teléfono no abre la dirección? El PC tiene otras:{' '}
                {estado.otras.map((ip, i) => (
                  <span key={ip}>
                    {i > 0 && ', '}
                    <button
                      className="font-mono underline underline-offset-2 hover:no-underline"
                      onClick={() => void hacer(() => window.api.remoto.usarDireccion(ip))}
                    >
                      {ip}
                    </button>
                  </span>
                ))}
                .
              </p>
            )}

            <p className="text-xs text-tinta-tenue">
              La primera vez, Windows puede preguntar si deja que Kaori use la red: responda
              que sí para <b>redes privadas</b>. Si la Wi-Fi está marcada como pública en
              Windows, el teléfono no podrá entrar.
            </p>
          </div>
        </div>
      )}

      {estado.activo && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium">
            Conectados {estado.sesiones.length > 0 && `(${estado.sesiones.length})`}
          </h3>
          {estado.sesiones.length === 0 ? (
            <p className="text-sm text-tinta-tenue">Todavía no hay ningún teléfono conectado.</p>
          ) : (
            <ul className="divide-y divide-borde rounded-lg border border-borde">
              {estado.sesiones.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{s.dispositivo}</span>
                    <span className="ml-2 text-xs text-tinta-tenue">
                      desde {fechaHora(new Date(s.creada).toISOString())} ·{' '}
                      {s.direccion.replace(/^::ffff:/, '')}
                    </span>
                  </span>
                  <Boton
                    variante="fantasma"
                    icono={<Unplug size={14} />}
                    onClick={() => void hacer(() => window.api.remoto.cerrarSesion(s.id))}
                  >
                    Desconectar
                  </Boton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
