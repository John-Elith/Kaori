/**
 * Papelera de contratos eliminados.
 *
 * Un contrato borrado se lleva consigo su historial de informes, así que un
 * clic de más podría costar el trabajo de varios meses. Aquí se puede recuperar
 * durante 30 días; pasado ese plazo se borra solo.
 */

import { useState } from 'react';
import { Trash2, Undo2, AlertTriangle, Inbox } from 'lucide-react';

import { useEstado } from '../estado';
import { Aviso, Boton, Insignia, moneda } from './Ui';
import {
  borrarDefinitivamente,
  diasRestantes,
  papeleraOrdenada,
  restaurarDePapelera,
  vaciarPapelera,
} from '../../core/modelo/papelera';
import { DIAS_EN_PAPELERA } from '../../core/modelo/tipos';
import { desdeISO, formatoCorto } from '../../core/espanol/calendario';
import { valorVigente } from '../../core/pagos/cronograma';

export function Papelera() {
  const { base, guardar } = useEstado();
  const [porBorrar, setPorBorrar] = useState<string | null>(null);
  const [vaciarTodo, setVaciarTodo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (!base) return null;
  const entradas = papeleraOrdenada(base);

  return (
    <section className="tarjeta p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Trash2 size={17} className="text-tinta-tenue" />
          Papelera de contratos
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
        Los contratos eliminados se conservan {DIAS_EN_PAPELERA} días con todo su
        historial de informes. Pasado ese plazo se borran solos.
      </p>

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
            ¿Borrar definitivamente los {entradas.length} contrato(s) de la papelera?
            Esto no se puede deshacer.
          </p>
          <div className="mt-3 flex gap-2">
            <Boton
              variante="peligro"
              onClick={async () => {
                await guardar((b) => vaciarPapelera(b));
                setVaciarTodo(false);
                setMensaje('Papelera vaciada.');
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
          <p className="text-sm text-tinta-tenue">La papelera está vacía.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entradas.map((e) => {
            const dias = diasRestantes(e);
            const contratista = base.contratistas.find(
              (k) => k.id === e.contrato.contratistaId,
            );
            const urgente = dias <= 5;

            return (
              <div key={e.contrato.id} className="rounded-lg border border-borde p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {e.contrato.numero || '(sin número)'}
                      <span className="ml-2">
                        <Insignia tono={urgente ? 'rojo' : 'ambar'}>
                          {dias === 0
                            ? 'caduca hoy'
                            : `${dias} día${dias === 1 ? '' : 's'} para recuperarlo`}
                        </Insignia>
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-tinta-tenue">
                      {contratista?.nombre ?? (
                        <span className="text-alerta-fuerte">
                          Su contratista ya no existe: al recuperarlo habrá que
                          reasignarlo.
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-tinta-suave">
                      {formatoCorto(desdeISO(e.contrato.fechaInicio))} –{' '}
                      {formatoCorto(desdeISO(e.contrato.fechaTerminacion))} ·{' '}
                      {moneda(valorVigente(e.contrato))} ·{' '}
                      {e.informes.length === 0
                        ? 'sin informes generados'
                        : `${e.informes.length} informe(s) en su historial`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Boton
                      icono={<Undo2 size={15} />}
                      onClick={async () => {
                        await guardar((b) => restaurarDePapelera(b, e.contrato.id));
                        setMensaje(
                          `Contrato ${e.contrato.numero || '(sin número)'} recuperado con su historial.`,
                        );
                      }}
                    >
                      Recuperar
                    </Boton>
                    <Boton
                      variante="fantasma"
                      icono={<Trash2 size={15} />}
                      onClick={() => setPorBorrar(e.contrato.id)}
                    >
                      Borrar ya
                    </Boton>
                  </div>
                </div>

                {porBorrar === e.contrato.id && (
                  <div className="mt-3 rounded-lg border border-error-borde bg-error-fondo p-3">
                    <p className="text-sm text-error-texto">
                      Se borrará definitivamente, junto con su historial. Esto no se
                      puede deshacer.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Boton
                        variante="peligro"
                        onClick={async () => {
                          await guardar((b) =>
                            borrarDefinitivamente(b, e.contrato.id),
                          );
                          setPorBorrar(null);
                          setMensaje('Contrato borrado definitivamente.');
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
