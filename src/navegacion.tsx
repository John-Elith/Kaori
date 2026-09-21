/**
 * Navegación entre secciones.
 *
 * Existe para que un aviso pueda llevar directamente a donde se resuelve el
 * problema: si falta asignar una plantilla, el botón del aviso abre Contratos
 * en vez de limitarse a describir el trámite.
 *
 * `opciones.contratoId` permite además abrir un contrato concreto, de modo que
 * desde la ficha de un contratista se pueda saltar a uno de sus contratos sin
 * tener que buscarlo otra vez en la lista.
 */

import { createContext, useContext, type ReactNode } from 'react';

export type Seccion = 'generar' | 'contratos' | 'contratistas' | 'plantillas' | 'ajustes';

export type OpcionesNavegacion = {
  /** Contrato que debe quedar abierto al llegar a la sección */
  contratoId?: string;
  /**
   * Crear un contrato para esta persona nada más llegar, y abrirlo.
   *
   * Una misma persona encadena contratos —enero a junio, julio a diciembre— y
   * el camino natural es pedirlo desde su ficha. Sin esto había que ir a
   * Contratos, pulsar «Nuevo contrato» y corregir el contratista a mano en el
   * desplegable, porque el contrato nuevo salía siempre con el primero de la
   * lista.
   */
  nuevoContratoPara?: string;
};

type IrA = (seccion: Seccion, opciones?: OpcionesNavegacion) => void;

const Contexto = createContext<IrA | null>(null);

export function ProveedorNavegacion({
  ir,
  children,
}: {
  ir: IrA;
  children: ReactNode;
}) {
  return <Contexto.Provider value={ir}>{children}</Contexto.Provider>;
}

export function useIrA(): IrA {
  const ir = useContext(Contexto);
  if (!ir) throw new Error('useIrA debe usarse dentro de <ProveedorNavegacion>');
  return ir;
}
