/** Piezas de interfaz reutilizables. */

import { useState } from 'react';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

// ── Botón ───────────────────────────────────────────────────────────────────

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';

type PropsBoton = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBoton;
  cargando?: boolean;
  icono?: ReactNode;
};

const ESTILOS: Record<VarianteBoton, string> = {
  primario: 'bg-naranja-500 text-white hover:bg-naranja-600 active:bg-naranja-700',
  secundario: 'border border-borde bg-lienzo text-tinta hover:bg-superficie',
  fantasma: 'text-tinta-tenue hover:bg-superficie hover:text-tinta',
  peligro: 'border border-error-borde bg-lienzo text-error-fuerte hover:bg-error-fondo',
};

export function Boton({
  variante = 'secundario',
  cargando = false,
  icono,
  children,
  className = '',
  disabled,
  ...resto
}: PropsBoton) {
  return (
    <button
      {...resto}
      disabled={disabled || cargando}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2
                  text-sm font-medium transition-colors
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${ESTILOS[variante]} ${className}`}
    >
      {cargando ? <Loader2 size={16} className="animate-spin" /> : icono}
      {children}
    </button>
  );
}

// ── Avisos ──────────────────────────────────────────────────────────────────

type TipoAviso = 'info' | 'exito' | 'alerta' | 'error';

const AVISOS: Record<TipoAviso, { clase: string; Icono: typeof Info }> = {
  info: { clase: 'border-info-borde bg-info-fondo text-info-texto', Icono: Info },
  exito: { clase: 'border-exito-borde bg-exito-fondo text-exito-texto', Icono: CheckCircle2 },
  alerta: { clase: 'border-alerta-borde bg-alerta-fondo text-alerta-texto', Icono: AlertTriangle },
  error: { clase: 'border-error-borde bg-error-fondo text-error-texto', Icono: XCircle },
};

export function Aviso({
  tipo = 'info',
  titulo,
  children,
}: {
  tipo?: TipoAviso;
  titulo?: string;
  children: ReactNode;
}) {
  const { clase, Icono } = AVISOS[tipo];
  return (
    <div className={`flex gap-3 rounded-lg border p-3 text-sm ${clase}`}>
      <Icono size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {titulo && <p className="mb-0.5 font-semibold">{titulo}</p>}
        <div className="whitespace-pre-wrap break-words">{children}</div>
      </div>
    </div>
  );
}

// ── Estructura de página ────────────────────────────────────────────────────

export function Pagina({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-5 p-4 sm:gap-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{titulo}</h1>
          {descripcion && (
            <p className="mt-1 max-w-2xl text-sm text-tinta-tenue">{descripcion}</p>
          )}
        </div>
        {acciones && <div className="flex flex-wrap gap-2 sm:shrink-0">{acciones}</div>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function Vacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  return (
    <div className="tarjeta flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="rounded-full bg-naranja-50 p-3 text-naranja-500">{icono}</div>
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-tinta-tenue">{descripcion}</p>
      </div>
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

// ── Formularios ─────────────────────────────────────────────────────────────

export function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-tinta-tenue">{ayuda}</span>}
    </label>
  );
}

export function Insignia({
  children,
  tono = 'neutro',
}: {
  children: ReactNode;
  tono?: 'neutro' | 'naranja' | 'verde' | 'rojo' | 'ambar';
}) {
  const tonos = {
    neutro: 'bg-apagado-fondo text-apagado-texto',
    naranja: 'bg-naranja-50 text-naranja-700',
    verde: 'bg-exito-fondo text-exito-fuerte',
    rojo: 'bg-error-fondo text-error-fuerte',
    ambar: 'bg-alerta-fondo text-alerta-fuerte',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tonos[tono]}`}
    >
      {children}
    </span>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-tinta-tenue">
      <Loader2 size={16} className="animate-spin" />
      {texto}
    </div>
  );
}

/** Formato de moneda para la interfaz. */
export function moneda(valor: number): string {
  return `$${Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/**
 * Momento exacto, para el historial: "17/08/2026, 15:42".
 *
 * Aquí sí se usa `Date`, y no el tipo `Fecha` del núcleo, porque esto no es un
 * día de calendario del contrato sino el instante en que se pulsó Generar: la
 * hora local es justo lo que se quiere ver.
 */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = (n: number) => n.toString().padStart(2, '0');
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}, ${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

/**
 * Campo para importes en pesos.
 *
 * Muestra la cifra formateada —$1.880.000— mientras no se está escribiendo en
 * él, y las cifras a secas en cuanto recibe el foco. Se hace así porque
 * reformatear en cada tecla mueve el cursor de sitio: al escribir el cuarto
 * dígito aparece un punto y el cursor salta, que es lo que vuelve insufribles
 * estos campos. Con el cambio al enfocar se lee cómodo y se edita cómodo.
 */
export function CampoMoneda({
  valor,
  alCambiar,
  className = '',
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  valor: number;
  alCambiar: (n: number) => void;
}) {
  const [enFoco, setEnFoco] = useState(false);
  const [texto, setTexto] = useState('');

  return (
    <input
      {...resto}
      inputMode="numeric"
      className={`tabular-nums ${className}`}
      value={enFoco ? texto : valor > 0 ? moneda(valor) : ''}
      onFocus={(e) => {
        setTexto(valor > 0 ? String(valor) : '');
        setEnFoco(true);
        resto.onFocus?.(e);
      }}
      onBlur={(e) => {
        setEnFoco(false);
        resto.onBlur?.(e);
      }}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, '');
        setTexto(digitos);
        alCambiar(Number(digitos) || 0);
      }}
    />
  );
}

/**
 * Todo a minúsculas menos la inicial de cada frase.
 *
 * Se considera frase lo que sigue a un punto, a un signo de cierre o a un salto
 * de línea. No pretende ser un corrector: los nombres propios quedan en
 * minúscula y se arreglan a mano, que es mucho menos trabajo que al revés.
 */
export function aMinusculasConFrases(texto: string): string {
  return texto
    .toLocaleLowerCase('es')
    .replace(
      /(^|[.!?]\s+|\n\s*)(\p{Ll})/gu,
      (_todo, antes: string, letra: string) => antes + letra.toLocaleUpperCase('es'),
    );
}

/**
 * Botones para pasar un texto a mayúsculas o a minúsculas.
 *
 * Los contratos llegan escritos de las dos formas y el informe los quiere de
 * una: el OBJETO va en mayúsculas y el PLAZO también. Rehacerlo a mano en un
 * párrafo largo es tedioso y siempre se cuela alguna letra.
 */
export function BotonesDeCaja({
  texto,
  alCambiar,
  disabled,
}: {
  texto: string;
  alCambiar: (t: string) => void;
  disabled?: boolean;
}) {
  const vacio = texto.trim().length === 0;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Boton
        variante="fantasma"
        disabled={disabled || vacio}
        title="Pasar todo el texto a MAYÚSCULAS"
        onClick={() => alCambiar(texto.toLocaleUpperCase('es'))}
      >
        MAYÚSCULAS
      </Boton>
      <Boton
        variante="fantasma"
        disabled={disabled || vacio}
        title="Pasar a minúsculas, dejando mayúscula al principio de cada frase"
        onClick={() => alCambiar(aMinusculasConFrases(texto))}
      >
        minúsculas
      </Boton>
    </div>
  );
}
