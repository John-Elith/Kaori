/**
 * Interruptor de modo claro / oscuro.
 *
 * Es un interruptor y no un desplegable porque en la barra lateral la acción
 * habitual es sólo alternar. Las tres opciones —incluida «como Windows»— están
 * en Ajustes, que es donde se va cuando se quiere elegir con detalle.
 */

import { Moon, Sun } from 'lucide-react';
import { useTema } from '../tema';

export function InterruptorTema() {
  const { oscuro, alternar, tema } = useTema();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={oscuro}
      onClick={alternar}
      title={
        tema === 'sistema'
          ? 'Ahora sigue a Windows. Al pulsar, se fija el modo elegido.'
          : oscuro
            ? 'Cambiar a modo claro'
            : 'Cambiar a modo oscuro'
      }
      className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left
                 text-sm font-medium text-tinta-tenue transition-colors
                 hover:bg-lienzo hover:text-tinta"
    >
      {/* La pista y el pomo: el pomo se desliza, los iconos se cruzan. */}
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full
                    border transition-colors duration-300
                    ${oscuro ? 'border-naranja-500 bg-naranja-500' : 'border-borde bg-apagado-fondo'}`}
      >
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full bg-lienzo
                      shadow-tarjeta transition-transform duration-300 ease-out
                      ${oscuro ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}
        >
          {oscuro ? (
            <Moon size={10} className="text-naranja-500" />
          ) : (
            <Sun size={10} className="text-tinta-tenue" />
          )}
        </span>
      </span>
      {oscuro ? 'Modo oscuro' : 'Modo claro'}
    </button>
  );
}
