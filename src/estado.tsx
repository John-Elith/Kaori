/**
 * Estado compartido: la base de datos completa vive en memoria y se guarda
 * entera en cada cambio. Con cientos de contratos el archivo pesa pocos cientos
 * de kilobytes, así que la simplicidad gana sobre la escritura incremental.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BaseDeDatos } from '../core/modelo/tipos';
import type { MapaPlantilla } from '../core/docx/mapaPlantilla';
import { Sincronizador } from '../core/modelo/sincronizacion';

type Estado = {
  base: BaseDeDatos | null;
  plantillas: MapaPlantilla[];
  cargando: boolean;
  error: string | null;
  guardar: (cambio: (b: BaseDeDatos) => BaseDeDatos) => Promise<void>;
  recargarPlantillas: () => Promise<void>;
};

const Contexto = createContext<Estado | null>(null);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<BaseDeDatos | null>(null);
  const [plantillas, setPlantillas] = useState<MapaPlantilla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargarPlantillas = useCallback(async () => {
    setPlantillas(await window.api.plantillas.listar());
  }, []);

  /**
   * Quien guarda: en orden, diciendo sobre qué versión, y reaplicando el
   * cambio si otra pantalla guardó en medio (ver core/modelo/sincronizacion).
   * Antes cada cambio mandaba la base entera por su cuenta, y desde el
   * teléfono los guardados podían llegar desordenados y perderse campos.
   */
  const sinc = useRef<Sincronizador | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const [{ base: b, revision }, p] = await Promise.all([
          window.api.datos.leerConRevision(),
          window.api.plantillas.listar(),
        ]);
        if (!vigente) return;
        sinc.current = new Sincronizador(
          b,
          revision,
          (d, rev) => window.api.datos.escribirSi(d, rev),
          setBase,
          (e) =>
            setError(
              `No se pudieron guardar los cambios: ${e instanceof Error ? e.message : String(e)}`,
            ),
        );
        setBase(b);
        setPlantillas(p);
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  // Si el otro equipo —el teléfono desde el PC, o el PC desde el teléfono—
  // guarda algo, se recarga aquí. Una recarga más vieja que lo que ya se tiene
  // se descarta, y los cambios de aquí aún sin guardar se conservan encima.
  useEffect(() => {
    return window.api.eventos?.alCambiarDatos(() => {
      void (async () => {
        try {
          const [{ base: b, revision }, p] = await Promise.all([
            window.api.datos.leerConRevision(),
            window.api.plantillas.listar(),
          ]);
          sinc.current?.recibir(b, revision);
          setPlantillas(p);
        } catch {
          /* se reintentará con el siguiente aviso */
        }
      })();
    });
  }, []);

  const guardar = useCallback(async (cambio: (b: BaseDeDatos) => BaseDeDatos) => {
    if (!sinc.current) return;
    setError(null);
    await sinc.current.cambiar(cambio);
  }, []);

  const valor = useMemo<Estado>(
    () => ({ base, plantillas, cargando, error, guardar, recargarPlantillas }),
    [base, plantillas, cargando, error, guardar, recargarPlantillas],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): Estado {
  const c = useContext(Contexto);
  if (!c) throw new Error('useEstado debe usarse dentro de <ProveedorEstado>');
  return c;
}

/** Atajo: la base ya cargada. Lanza si aún no lo está. */
export function useBase(): BaseDeDatos {
  const { base } = useEstado();
  if (!base) throw new Error('La base de datos aún no está cargada');
  return base;
}
