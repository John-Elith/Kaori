/**
 * Modo claro y oscuro.
 *
 * La preferencia se guarda en dos sitios a propósito. En los ajustes, que es
 * el archivo de datos y por tanto lo que sobrevive a un respaldo; y en el
 * almacenamiento local del navegador, que es lo único disponible en el
 * instante en que arranca la ventana, antes de que se haya leído nada del
 * disco. Sin esa segunda copia el programa abriría siempre en claro y
 * cambiaría a oscuro medio segundo después, con un fogonazo blanco de por
 * medio que es justo lo que el modo oscuro pretende evitar.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Tema = 'claro' | 'oscuro' | 'sistema';

const CLAVE = 'kaori.tema';
const DURACION_TRANSICION = 300;

function esTema(v: unknown): v is Tema {
  return v === 'claro' || v === 'oscuro' || v === 'sistema';
}

/** Lo que el sistema operativo tiene configurado ahora mismo. */
function sistemaEnOscuro(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function temaEfectivo(tema: Tema): 'claro' | 'oscuro' {
  if (tema === 'sistema') return sistemaEnOscuro() ? 'oscuro' : 'claro';
  return tema;
}

function pintar(tema: Tema): void {
  document.documentElement.classList.toggle('oscuro', temaEfectivo(tema) === 'oscuro');
}

/**
 * Aplica el tema recordado antes del primer pintado.
 *
 * Se llama desde main.tsx, fuera de React: para cuando el primer componente se
 * monta la ventana ya está pintada, y ahí el cambio ya se vería.
 */
export function aplicarTemaGuardado(): Tema {
  let guardado: Tema = 'claro';
  try {
    const v = localStorage.getItem(CLAVE);
    if (esTema(v)) guardado = v;
  } catch {
    /* modo privado o almacenamiento lleno: se sigue con el valor por defecto */
  }
  pintar(guardado);
  return guardado;
}

type Contexto = {
  tema: Tema;
  /** Qué se está viendo de verdad; con «sistema» depende de Windows. */
  oscuro: boolean;
  cambiar: (t: Tema) => void;
  /** Atajo del interruptor: alterna entre claro y oscuro. */
  alternar: () => void;
};

const Ctx = createContext<Contexto | null>(null);

export function ProveedorTema({
  /** Preferencia guardada en los ajustes, cuando la base ya se ha leído. */
  temaDeAjustes,
  alCambiar,
  children,
}: {
  temaDeAjustes?: Tema;
  alCambiar: (t: Tema) => void;
  children: ReactNode;
}) {
  const [tema, setTema] = useState<Tema>(() => aplicarTemaGuardado());

  // Los ajustes mandan sobre la copia local: si se restauró un respaldo en otro
  // equipo, es la preferencia del archivo de datos la que debe imponerse.
  useEffect(() => {
    if (temaDeAjustes && temaDeAjustes !== tema) {
      setTema(temaDeAjustes);
      pintar(temaDeAjustes);
      try {
        localStorage.setItem(CLAVE, temaDeAjustes);
      } catch {
        /* sin almacenamiento local se pierde sólo la ventaja del arranque */
      }
    }
    // Sólo cuando cambia lo que viene de los ajustes; `tema` es el estado local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temaDeAjustes]);

  // Con «sistema», seguir a Windows cuando lo cambie mientras el programa corre.
  useEffect(() => {
    if (tema !== 'sistema') return;
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    const alPreferir = () => pintar('sistema');
    consulta.addEventListener('change', alPreferir);
    return () => consulta.removeEventListener('change', alPreferir);
  }, [tema]);

  // Que el marco de la ventana y los menús nativos acompañen al tema.
  useEffect(() => {
    void window.api.sistema.temaDelSistema(temaEfectivo(tema));
  }, [tema]);

  const cambiar = useCallback((nuevo: Tema) => {
    // La clase de transición se pone justo antes del cambio y se quita al
    // terminar, para no dejar animándose el resto de la interfaz.
    const raiz = document.documentElement;
    raiz.classList.add('cambiando-tema');
    window.setTimeout(() => raiz.classList.remove('cambiando-tema'), DURACION_TRANSICION);

    setTema(nuevo);
    pintar(nuevo);
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch {
      /* ídem */
    }
    alCambiar(nuevo);
  }, [alCambiar]);

  const valor = useMemo<Contexto>(
    () => ({
      tema,
      oscuro: temaEfectivo(tema) === 'oscuro',
      cambiar,
      alternar: () => cambiar(temaEfectivo(tema) === 'oscuro' ? 'claro' : 'oscuro'),
    }),
    [tema, cambiar],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useTema(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTema debe usarse dentro de <ProveedorTema>');
  return c;
}
