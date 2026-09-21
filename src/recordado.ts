/**
 * Estado que sobrevive a salir de la pantalla.
 *
 * Las pantallas se montan y desmontan al cambiar de sección, así que su estado
 * local se pierde: elegir cuatro meses, ir a Contratos a mirar algo y volver
 * dejaba la pantalla en blanco. Esto lo guarda en el almacenamiento local del
 * navegador, que además hace que aguante el cierre del programa.
 *
 * Va aparte del archivo de datos a propósito: son preferencias de trabajo de
 * este equipo —qué estaba mirando—, no información del municipio que deba
 * viajar en un respaldo.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const PREFIJO = 'kaori.';

function leer<T>(clave: string): T | undefined {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo === null ? undefined : (JSON.parse(crudo) as T);
  } catch {
    // Almacenamiento lleno, bloqueado o con un JSON de una versión anterior:
    // se sigue con el valor inicial en vez de impedir abrir la pantalla.
    return undefined;
  }
}

function escribir(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento se pierde sólo la comodidad de recordarlo */
  }
}

/**
 * Como `useState`, pero recordando el valor entre visitas.
 *
 * `validar` filtra lo que se leyó del disco: la forma del dato pudo cambiar
 * entre versiones, y un valor de otra época no debe romper la pantalla.
 */
export function useRecordado<T>(
  clave: string,
  inicial: T,
  validar?: (v: unknown) => v is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [valor, setValor] = useState<T>(() => {
    const guardado = leer<T>(clave);
    if (guardado === undefined) return inicial;
    if (validar && !validar(guardado)) return inicial;
    return guardado;
  });

  useEffect(() => {
    escribir(clave, valor);
  }, [clave, valor]);

  return [valor, setValor];
}

/**
 * Un conjunto recordado.
 *
 * Los `Set` no sobreviven a `JSON.stringify`, así que se guardan como lista y
 * se rehacen al leer. Se expone tal cual un `Set` porque es como se usa: la
 * pantalla pregunta «¿está marcado este mes?» muchas más veces de las que lo
 * recorre entero.
 */
export function useConjuntoRecordado<T extends string | number>(
  clave: string,
  inicial: Set<T>,
): [Set<T>, Dispatch<SetStateAction<Set<T>>>] {
  const primera = useRef(true);
  const [conjunto, setConjunto] = useState<Set<T>>(() => {
    const guardado = leer<T[]>(clave);
    return Array.isArray(guardado) ? new Set(guardado) : inicial;
  });

  useEffect(() => {
    // La primera pasada sólo confirmaría lo que ya está en disco.
    if (primera.current) {
      primera.current = false;
      return;
    }
    escribir(clave, [...conjunto]);
  }, [clave, conjunto]);

  const asignar = useCallback<Dispatch<SetStateAction<Set<T>>>>((accion) => {
    setConjunto((previo) => (typeof accion === 'function' ? accion(previo) : accion));
  }, []);

  return [conjunto, asignar];
}
