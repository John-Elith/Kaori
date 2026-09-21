import { useEffect, useState } from 'react';
import {
  FolderOpen,
  Save,
  Database,
  Monitor,
  Moon,
  Sun,
  Palette,
} from 'lucide-react';
import { useEstado } from '../estado';
import { useTema, type Tema } from '../tema';
import { Boton, Campo, Cargando, Pagina } from '../componentes/Ui';
import { Papelera } from '../componentes/Papelera';
import { PapeleraPlantillas } from '../componentes/PapeleraPlantillas';
import { AccesoTelefono } from '../componentes/AccesoTelefono';
import { AjustesIA } from '../componentes/AjustesIA';
import { esRemoto } from '../apiRemota';

/**
 * Elección de modo claro, oscuro o el de Windows.
 *
 * La barra lateral sólo alterna entre claro y oscuro, que es lo que se hace a
 * diario. La tercera opción vive aquí porque «seguir a Windows» se elige una
 * vez y no se vuelve a tocar.
 */
function Apariencia() {
  const { tema, cambiar } = useTema();

  const opciones: { id: Tema; etiqueta: string; ayuda: string; Icono: typeof Sun }[] = [
    { id: 'claro', etiqueta: 'Claro', ayuda: 'Siempre en claro', Icono: Sun },
    { id: 'oscuro', etiqueta: 'Oscuro', ayuda: 'Siempre en oscuro', Icono: Moon },
    {
      id: 'sistema',
      etiqueta: 'Como Windows',
      ayuda: 'Cambia solo con el sistema',
      Icono: Monitor,
    },
  ];

  return (
    <section className="tarjeta p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Palette size={17} className="text-tinta-tenue" />
        Apariencia
      </h2>
      <p className="mb-4 mt-1 text-sm text-tinta-tenue">
        El modo oscuro conserva el naranja de marca para las acciones; lo que cambia son
        los fondos y el texto. La elección se guarda con el resto de los ajustes.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        {opciones.map(({ id, etiqueta, ayuda, Icono }) => {
          const activo = tema === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={activo}
              onClick={() => cambiar(id)}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left
                          transition-colors
                          ${
                            activo
                              ? 'border-naranja-500 bg-naranja-50'
                              : 'border-borde bg-lienzo hover:border-naranja-300'
                          }`}
            >
              <Icono
                size={18}
                className={`mt-0.5 shrink-0 ${activo ? 'text-naranja-500' : 'text-tinta-tenue'}`}
              />
              <span className="min-w-0">
                <span
                  className={`block text-sm font-medium ${activo ? 'text-naranja-700' : 'text-tinta'}`}
                >
                  {etiqueta}
                </span>
                <span className="mt-0.5 block text-xs text-tinta-tenue">{ayuda}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PaginaAjustes() {
  const { base, guardar } = useEstado();
  const [rutaDatos, setRutaDatos] = useState('');

  useEffect(() => {
    void window.api.datos.rutaArchivo().then(setRutaDatos);
  }, []);

  if (!base) return <Cargando />;
  const a = base.ajustes;

  const cambiar = (parcial: Partial<typeof a>) =>
    void guardar((b) => ({ ...b, ajustes: { ...b.ajustes, ...parcial } }));

  async function elegirCarpeta() {
    const ruta = await window.api.sistema.elegirCarpeta();
    if (ruta) cambiar({ carpetaSalida: ruta });
  }

  return (
    <Pagina
      titulo="Ajustes"
      descripcion="Valores por defecto al crear un contrato nuevo, carpeta de salida y lectura con IA."
    >
      <div className="flex flex-col gap-6 pb-8">
        {/* Desde el teléfono no se abre otro acceso: eso se decide en el PC. */}
        {!esRemoto() && <AccesoTelefono />}

        <Apariencia />

        {/* Carpeta de salida */}
        <section className="tarjeta p-5">
          <h2 className="mb-4 font-semibold">Carpeta de salida</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Campo etiqueta="Los informes generados se guardarán aquí">
                <input
                  className="campo"
                  value={a.carpetaSalida}
                  onChange={(e) => cambiar({ carpetaSalida: e.target.value })}
                  placeholder="Sin elegir"
                />
              </Campo>
            </div>
            <Boton className="solo-pc" icono={<FolderOpen size={16} />} onClick={elegirCarpeta}>
              Elegir…
            </Boton>
            {a.carpetaSalida && (
              <Boton
                className="solo-pc"
                variante="fantasma"
                onClick={() => void window.api.sistema.abrirCarpeta(a.carpetaSalida)}
              >
                Abrir
              </Boton>
            )}
          </div>
        </section>

        {/* Valores por defecto */}
        <section className="tarjeta p-5">
          <h2 className="font-semibold">Valores por defecto del contrato</h2>
          <p className="mb-4 mt-1 text-sm text-tinta-tenue">
            Se usan al crear un contrato nuevo. Cada contrato puede cambiarlos después,
            porque el contratante y el supervisor no siempre son los mismos.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Contratante">
              <input
                className="campo"
                value={a.contratantePorDefecto}
                placeholder="Ejemplo: MUNICIPIO DE NOMBRE DEL MUNICIPIO"
                onChange={(e) => cambiar({ contratantePorDefecto: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="NIT del contratante">
              <input
                className="campo"
                value={a.nitPorDefecto}
                placeholder="Ejemplo: 800XXXXXX-X"
                onChange={(e) => cambiar({ nitPorDefecto: e.target.value })}
              />
            </Campo>
            <Campo
              etiqueta="Municipio"
              ayuda='Aparece en "En constancia se expide en el Municipio de…"'
            >
              <input
                className="campo"
                value={a.municipioPorDefecto}
                placeholder="Ejemplo: Nombre del municipio"
                onChange={(e) => cambiar({ municipioPorDefecto: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Nombre del supervisor">
              <input
                className="campo"
                value={a.supervisorPorDefecto.nombre}
                placeholder="Ejemplo: NOMBRE DEL SUPERVISOR"
                onChange={(e) =>
                  cambiar({
                    supervisorPorDefecto: {
                      ...a.supervisorPorDefecto,
                      nombre: e.target.value,
                    },
                  })
                }
              />
            </Campo>
            <div className="sm:col-span-2">
              <Campo etiqueta="Cargo del supervisor">
                <textarea
                  className="campo min-h-[72px]"
                  value={a.supervisorPorDefecto.cargo}
                  placeholder="Ejemplo: Secretario de Planeación"
                  onChange={(e) =>
                    cambiar({
                      supervisorPorDefecto: {
                        ...a.supervisorPorDefecto,
                        cargo: e.target.value,
                      },
                    })
                  }
                />
              </Campo>
            </div>
          </div>
        </section>

        <AjustesIA />

        <Papelera />

        <PapeleraPlantillas />

        {/* Datos */}
        <section className="tarjeta p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Database size={17} className="text-tinta-tenue" />
            Sus datos
          </h2>
          <p className="text-sm text-tinta-tenue">
            Todo se guarda en un solo archivo. Para hacer una copia de seguridad, basta con
            copiarlo:
          </p>
          <code className="mt-2 block break-all rounded-lg bg-superficie px-3 py-2 text-xs">
            {rutaDatos || '…'}
          </code>
          <div className="mt-3">
            <Boton
              className="solo-pc"
              variante="secundario"
              icono={<Save size={16} />}
              onClick={() =>
                void window.api.sistema.abrirCarpeta(
                  rutaDatos.replace(/[\\/][^\\/]+$/, ''),
                )
              }
            >
              Abrir la carpeta de datos
            </Boton>
          </div>
        </section>
      </div>
    </Pagina>
  );
}
