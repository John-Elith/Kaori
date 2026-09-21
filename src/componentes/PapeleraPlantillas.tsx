/**
 * Papelera de plantillas eliminadas.
 *
 * Va aparte de la papelera de contratos porque las plantillas no viven en el
 * archivo de datos sino en su propia carpeta, con su .docx normalizado al
 * lado; la lista hay que pedírsela al proceso principal en vez de leerla del
 * estado compartido.
 *
 * Lo que se protege aquí no es tanto el archivo —siempre se puede volver a
 * subir el .docx— como el mapeo: las cincuenta y pico posiciones de campo que
 * costó confirmar una por una, y que se recuperan intactas.
 */

import { useCallback, useEffect, useState } from 'react';
import { Trash2, Undo2, AlertTriangle, Inbox, FileStack } from 'lucide-react';

import { useEstado } from '../estado';
import { Aviso, Boton, Insignia } from './Ui';
import { DIAS_EN_PAPELERA } from '../../core/modelo/tipos';
import {
  diasRestantes,
  ordenadas,
  type PlantillaEnPapelera,
} from '../../core/modelo/papeleraPlantillas';

export function PapeleraPlantillas() {
  const { recargarPlantillas } = useEstado();
  const [entradas, setEntradas] = useState<PlantillaEnPapelera[]>([]);
  const [cargando, setCargando] = useState(true);
  const [porBorrar, setPorBorrar] = useState<string | null>(null);
  const [vaciarTodo, setVaciarTodo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    setEntradas(ordenadas(await window.api.plantillas.papelera()));
    setCargando(false);
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  async function restaurar(e: PlantillaEnPapelera) {
    setError(null);
    const r = await window.api.plantillas.restaurar(e.mapa.id);
    if (!r.ok) {
      setError(r.error ?? 'No se pudo recuperar la plantilla.');
      return;
    }
    await refrescar();
    await recargarPlantillas();
    setMensaje(
      `Plantilla «${e.mapa.nombre}» recuperada con su mapeo. Los contratos que la ` +
        'tenían asignada vuelven a reconocerla.',
    );
  }

  if (cargando) return null;

  return (
    <section className="tarjeta p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileStack size={17} className="text-tinta-tenue" />
          Papelera de plantillas
        </h2>
        {entradas.length > 0 && (
          <Boton
            variante="peligro"
            icono={<Trash2 size={15} />}
            onClick={() => setVaciarTodo(true)}
          >
            Vaciar la papelera
          </Boton>
        )}
      </div>
      <p className="mb-4 text-sm text-tinta-tenue">
        Las plantillas eliminadas se conservan {DIAS_EN_PAPELERA} días con su documento y
        su mapeo de campos. Pasado ese plazo se borran solas.
      </p>

      {error && (
        <div className="mb-4">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
      {mensaje && (
        <div className="mb-4">
          <Aviso tipo="exito">{mensaje}</Aviso>
        </div>
      )}

      {/* Confirmación de vaciado total */}
      {vaciarTodo && (
        <div className="mb-4 rounded-lg border border-error-borde bg-error-fondo p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-error-texto">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            ¿Borrar definitivamente las {entradas.length} plantilla(s) de la papelera?
            Se perderá también su mapeo y esto no se puede deshacer.
          </p>
          <div className="mt-3 flex gap-2">
            <Boton
              variante="peligro"
              onClick={async () => {
                await window.api.plantillas.vaciarPapelera();
                await refrescar();
                setVaciarTodo(false);
                setMensaje('Papelera de plantillas vaciada.');
              }}
            >
              Sí, borrar todo
            </Boton>
            <Boton variante="secundario" onClick={() => setVaciarTodo(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}

      {entradas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-borde py-10 text-center">
          <Inbox size={22} className="text-tinta-suave" />
          <p className="text-sm text-tinta-tenue">No hay plantillas eliminadas.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entradas.map((e) => {
            const dias = diasRestantes(e);
            const mapeados = e.mapa.campos.filter((c) => c.ocurrencias.length > 0).length;
            const urgente = dias <= 5;

            return (
              <div key={e.mapa.id} className="rounded-lg border border-borde p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {e.mapa.nombre}
                      <span className="ml-2">
                        <Insignia tono={urgente ? 'rojo' : 'ambar'}>
                          {dias === 0
                            ? 'caduca hoy'
                            : `${dias} día${dias === 1 ? '' : 's'} para recuperarla`}
                        </Insignia>
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-tinta-suave">
                      {mapeados === 0
                        ? 'sin campos mapeados'
                        : `${mapeados} campo${mapeados === 1 ? '' : 's'} mapeado${mapeados === 1 ? '' : 's'}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Boton icono={<Undo2 size={15} />} onClick={() => void restaurar(e)}>
                      Recuperar
                    </Boton>
                    <Boton
                      variante="fantasma"
                      icono={<Trash2 size={15} />}
                      onClick={() => setPorBorrar(e.mapa.id)}
                    >
                      Borrar ya
                    </Boton>
                  </div>
                </div>

                {porBorrar === e.mapa.id && (
                  <div className="mt-3 rounded-lg border border-error-borde bg-error-fondo p-3">
                    <p className="text-sm text-error-texto">
                      Se borrará el documento y su mapeo para siempre. Esto no se puede
                      deshacer.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Boton
                        variante="peligro"
                        onClick={async () => {
                          await window.api.plantillas.borrarDefinitivo(e.mapa.id);
                          await refrescar();
                          setPorBorrar(null);
                          setMensaje('Plantilla borrada definitivamente.');
                        }}
                      >
                        Sí, borrar definitivamente
                      </Boton>
                      <Boton variante="secundario" onClick={() => setPorBorrar(null)}>
                        Cancelar
                      </Boton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
