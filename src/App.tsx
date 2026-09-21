import { useCallback, useState, type ReactNode } from 'react';
import {
  Users,
  FileSignature,
  CalendarDays,
  Settings,
  FileStack,
  LogOut,
  Menu,
} from 'lucide-react';
import logoKaori from './recursos/icono.png';
import { esRemoto, salir } from './apiRemota';

import { ProveedorEstado, useEstado } from './estado';
import { ProveedorNavegacion, type OpcionesNavegacion, type Seccion } from './navegacion';
import { ProveedorTema, type Tema } from './tema';
import { InterruptorTema } from './componentes/InterruptorTema';
import { Aviso, Cargando } from './componentes/Ui';
import { PaginaPlantillas } from './paginas/Plantillas';
import { PaginaContratistas } from './paginas/Contratistas';
import { PaginaContratos } from './paginas/Contratos';
import { PaginaGenerarMes } from './paginas/GenerarMes';
import { PaginaAjustes } from './paginas/Ajustes';

const NAVEGACION: {
  id: Seccion;
  etiqueta: string;
  Icono: typeof Users;
  descripcion: string;
}[] = [
  {
    id: 'generar',
    etiqueta: 'Generar mes',
    Icono: CalendarDays,
    descripcion: 'Informes del mes para todos los contratistas',
  },
  {
    id: 'contratos',
    etiqueta: 'Contratos',
    Icono: FileSignature,
    descripcion: 'Contratos, pagos, adiciones y suspensiones',
  },
  {
    id: 'contratistas',
    etiqueta: 'Contratistas',
    Icono: Users,
    descripcion: 'Personas contratadas',
  },
  {
    id: 'plantillas',
    etiqueta: 'Plantillas',
    Icono: FileStack,
    descripcion: 'Modelos de informe en Word',
  },
  {
    id: 'ajustes',
    etiqueta: 'Ajustes',
    Icono: Settings,
    descripcion: 'Carpeta de salida, municipio y supervisor',
  },
];

function Contenido() {
  const [seccion, setSeccion] = useState<Seccion>('generar');
  /** Contrato que debe abrirse al entrar en Contratos, si se llegó desde un enlace. */
  const [contratoDestino, setContratoDestino] = useState<string | undefined>();
  /** Contratista al que hay que crearle un contrato al llegar a Contratos. */
  const [nuevoPara, setNuevoPara] = useState<string | undefined>();
  /** Menú desplegado, en pantallas estrechas. */
  const [menuAbierto, setMenuAbierto] = useState(false);

  const irA = (s: Seccion, opciones?: OpcionesNavegacion) => {
    setContratoDestino(opciones?.contratoId);
    setNuevoPara(opciones?.nuevoContratoPara);
    setSeccion(s);
  };
  const { cargando, error, base } = useEstado();

  if (cargando) return <Cargando texto="Abriendo el programa…" />;

  if (error && !base) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Aviso tipo="error" titulo="No se pudo iniciar">
          {error}
        </Aviso>
      </div>
    );
  }

  const actual = NAVEGACION.find((n) => n.id === seccion);

  return (
    <ProveedorNavegacion ir={irA}>
    <div className="flex h-full flex-col md:flex-row">
      {/* En pantallas estrechas —el teléfono— la barra lateral no cabe: arriba
          queda una franja con la sección actual y el menú se despliega. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-borde bg-superficie px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir el menú"
          className="rounded-lg p-2 text-tinta-tenue hover:bg-lienzo hover:text-tinta"
        >
          <Menu size={20} />
        </button>
        <img src={logoKaori} alt="" className="h-7 w-7 object-contain" draggable={false} />
        <p className="min-w-0 truncate font-semibold">{actual?.etiqueta}</p>
      </header>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuAbierto(false)}
          aria-hidden
        />
      )}

      {/* Barra lateral */}
      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-borde
                    bg-superficie shadow-elevada transition-transform duration-200
                    md:static md:w-60 md:translate-x-0 md:shadow-none
                    ${menuAbierto ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img
            src={logoKaori}
            alt=""
            className="h-9 w-9 shrink-0 object-contain"
            draggable={false}
          />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold leading-tight tracking-tight text-naranja-600">
              Kaori
            </p>
            <p className="truncate text-xs text-tinta-tenue">Informes de contrato</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 px-3">
          {NAVEGACION.map(({ id, etiqueta, Icono, descripcion }) => {
            const activo = seccion === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setSeccion(id);
                  setMenuAbierto(false);
                }}
                title={descripcion}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm
                            font-medium transition-colors
                            ${
                              activo
                                ? 'bg-naranja-50 text-naranja-700'
                                : 'text-tinta-tenue hover:bg-lienzo hover:text-tinta'
                            }`}
              >
                <Icono size={17} className={activo ? 'text-naranja-500' : ''} />
                {etiqueta}
              </button>
            );
          })}
        </div>

        <div className="border-t border-borde px-3 py-2">
          <InterruptorTema />
        </div>

        {esRemoto() ? (
          <div className="flex items-center justify-between gap-2 px-5 pb-4">
            <p className="text-xs text-tinta-suave">Conectado al PC de la oficina.</p>
            <button
              type="button"
              onClick={() => void salir()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-tinta-tenue
                         hover:bg-lienzo hover:text-tinta"
            >
              <LogOut size={13} />
              Salir
            </button>
          </div>
        ) : (
          <p className="px-5 pb-4 text-xs text-tinta-suave">
            Los datos se guardan sólo en este equipo.
          </p>
        )}
      </nav>

      {/* Contenido */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 pt-4 sm:px-8 sm:pt-6">
            <Aviso tipo="error">{error}</Aviso>
          </div>
        )}
        {seccion === 'generar' && <PaginaGenerarMes />}
        {seccion === 'contratos' && (
          <PaginaContratos
            abrirContratoId={contratoDestino}
            alAbrir={() => setContratoDestino(undefined)}
            nuevoContratoPara={nuevoPara}
            alCrear={() => setNuevoPara(undefined)}
          />
        )}
        {seccion === 'contratistas' && <PaginaContratistas />}
        {seccion === 'plantillas' && <PaginaPlantillas />}
        {seccion === 'ajustes' && <PaginaAjustes />}
      </main>
    </div>
    </ProveedorNavegacion>
  );
}

/**
 * Puente entre el tema y los ajustes.
 *
 * Va dentro del proveedor de estado porque la preferencia se guarda con el
 * resto de los datos, y fuera del contenido porque el interruptor tiene que
 * funcionar también mientras se carga.
 */
function ConTema({ children }: { children: ReactNode }) {
  const { base, guardar } = useEstado();

  const alCambiar = useCallback(
    (t: Tema) => {
      void guardar((b) => ({ ...b, ajustes: { ...b.ajustes, tema: t } }));
    },
    [guardar],
  );

  return (
    <ProveedorTema temaDeAjustes={base?.ajustes.tema} alCambiar={alCambiar}>
      {children}
    </ProveedorTema>
  );
}

export default function App() {
  return (
    <ProveedorEstado>
      <ConTema>
        <Contenido />
      </ConTema>
    </ProveedorEstado>
  );
}
