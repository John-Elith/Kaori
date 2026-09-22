# Kaori

Genera los informes mensuales de actividad contractual y de supervisión en Word,
conservando exactamente el diseño de su plantilla.

## Cómo usarlo

```bash
npm install       # una sola vez
npm run dev       # abre Kaori en modo desarrollo
npm run dist      # crea el instalador .exe en la carpeta release/
```

Otros comandos:

| Comando | Para qué |
|---|---|
| `npm test` | Ejecuta las pruebas automáticas |
| `npm run build` | Comprueba los tipos y compila |
| `npm run icono` | Regenera el ícono a partir de `recursos/logo.png` |

## Empieza en cero

Kaori no trae datos de ningún municipio ni de ninguna persona: ni contratos,
ni contratistas, ni plantillas, ni valores por defecto. Cada instalación
empieza vacía y se llena con lo propio. Los campos muestran solo ejemplos de
formato («Ejemplo: 300XXXXXXX»).

Los datos se guardan en el equipo donde se usa (la ruta aparece en Ajustes →
Sus datos), nunca en la carpeta del proyecto, y no forman parte del
repositorio. Tampoco se publican los documentos Word con que se desarrolló
(informes, cuentas de cobro y certificados reales), porque llevan nombres,
cédulas, teléfonos y cuentas bancarias. Las pruebas que los usan viven en
`tests/locales/`, fuera del repositorio. En un equipo sin esos documentos se
ejecutan las demás, que usan datos ficticios.

## Primeros pasos

1. **Ajustes** → elija la carpeta donde se guardarán los informes.
2. **Plantillas** → suba uno de sus informes de Word ya diligenciado. Kaori
   reconoce solo casi todos los campos; usted confirma y guarda. Se hace una
   sola vez por plantilla.
3. **Contratos** → suba el PDF del contrato (o créelo a mano) y asígnele la
   plantilla.
4. **Generar informes** → marque los meses, marque los contratistas y pulse
   Generar.

## Los tres documentos

Kaori produce tres documentos, cada uno con su propia plantilla de Word:

| Documento | Cuántos | Fecha que lleva |
|---|---|---|
| Informe de actividad y supervisión | Uno por contratista y mes | El cierre del mes |
| Cuenta de cobro | Una por contratista y mes | El último día del mes |
| Certificado de cumplimiento | **Uno por contrato** | El último día de su vigencia, o el del mes que se elija |

En **Plantillas**, el programa reconoce solo de qué documento se trata leyendo
lo que dice: «DEBE A» y «POR CONCEPTO DE» son una cuenta de cobro, «HACE
CONSTAR» un certificado, «ELEMENTOS DE ORDEN ADMINISTRATIVO» un informe. Manda
el documento sobre el desplegable, porque ese desplegable empieza en «Informe»
y se pasa por alto — y una plantilla registrada con el tipo equivocado no
detecta ninguno de sus campos.

Si aun así hiciera falta corregirlo, cada tarjeta de plantilla lleva un
desplegable para cambiarlo sin volver a subir el archivo. El mapeo anterior se
descarta, porque los campos de un informe no existen en un certificado.

Cada contrato lleva entonces sus tres plantillas, en Contratos → Datos.

En **Generar**, las casillas de arriba deciden qué se produce en cada pasada.
El informe y la cuenta comparten meses y contratistas, así que salen del mismo
recorrido; el certificado va en su propia sección al final, porque no es
mensual.

### La cuenta de cobro

Todo sale del contrato menos dos datos: el **teléfono** y el **número de
cuenta** a la que se consigna. Viven en el contrato, no en la persona, porque
una cuenta bancaria puede cambiar de un contrato al siguiente y las cuentas de
cobro ya emitidas deben seguir diciendo lo que decían. El desplegable ofrece
los que esa persona ya usó en otros contratos, y un contrato nuevo los hereda
del anterior, así que en la práctica se rellenan solos.

Los importes en letras salen sin la palabra «PESOS», como en el documento del
municipio, y con la ortografía correcta: donde su plantilla dice «NOVEINTA»,
Kaori escribe «NOVENTA».

### El certificado de cumplimiento

Las actividades son las **obligaciones del contrato**, numeradas
automáticamente: Kaori clona el párrafo molde de la lista tantas veces como
haga falta y Word pone los números. Si el contrato no tiene obligaciones
registradas, avisa en vez de dejar las de otro.

La fecha es la de terminación **vigente**: si hubo prórroga o suspensión, el
certificado se expide cuando el contrato terminó de verdad, no cuando decía el
papel original.

#### Certificar hasta un mes, con el contrato en curso

La columna «Se expide» es un desplegable con los meses del contrato. Empieza en
el último —el certificado del contrato entero, que es lo corriente— y se puede
bajar a cualquier mes anterior para acreditar lo cumplido hasta ahí, cuando el
contrato sigue vivo y hay que entregar algo ya.

Al elegir un mes anterior se mueven las tres cosas a la vez:

- el **periodo** llega hasta ese mes («…hasta el día treinta y un (31) de
  marzo…»);
- la **fecha de expedición** es esa misma, porque certificar hasta marzo
  firmando en junio no querría decir nada;
- el archivo va a la **carpeta de ese mes** y lleva el mes en el nombre
  —`CERTIFICADO … 079-2025 MARZO.docx`—, para que no pise al del contrato
  entero cuando llegue el momento de expedirlo.

La fila lo marca con la insignia **parcial**.

## Dónde quedan los archivos

Cada mes tiene su carpeta dentro de la carpeta de salida, y el informe y su
cuenta de cobro caen juntos:

```
INFORMES-KAORI/
  ENERO/
    PEDRO RAMIREZ LOPEZ 079-2025 ENERO.docx
    CUENTA DE COBRO PEDRO RAMIREZ LOPEZ 079-2025 ENERO.docx
  JUNIO/
    PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx
    CUENTA DE COBRO PEDRO RAMIREZ LOPEZ 079-2025 JUNIO.docx
    CERTIFICADO DE CUMPLIMIENTO PEDRO RAMIREZ LOPEZ 079-2025.docx
```

Todos en mayúsculas y separados por espacios, para leerlos de un vistazo en el
explorador. El informe va sin etiqueta delante porque es el documento
principal; los otros dos la llevan. El certificado no lleva mes: hay uno por
contrato.

El certificado de cumplimiento se expide el último día del contrato, así que
va en la carpeta de **ese** mes, con los demás papeles que se archivan juntos.
Si se pidió hasta un mes anterior, va en la carpeta de ese mes y sí lleva el
mes en el nombre, para distinguirlo del definitivo.

## Dictar en vez de escribir

Los campos de texto de **Contratos** —objeto, plazo, forma de pago,
obligaciones, actividades, supervisor, motivo de una suspensión…— llevan un
micrófono en la esquina:

1. Pulse el micrófono. Se pone rojo y debajo aparece «Escuchando…» con unas
   barras que se mueven con la voz: si no se mueven, el micrófono no capta.
2. Hable con normalidad, con puntos y comas si quiere.
3. Pulse ■ para terminar. En unos segundos el texto aparece donde estaba el
   cursor.

Los campos de cifras (NIT, teléfono, cuenta, valores, fechas) no lo llevan,
porque las cifras dictadas salen mal con frecuencia.

**Cómo funciona.** La voz se convierte en texto en el propio PC, con Whisper
(el modelo `whisper-small`), sin mandarla a ningún sitio. La primera vez que se
usa, Kaori descarga el modelo —unos 240 MB— y lo avisa con un porcentaje;
después funciona sin internet. Se eligió ese modelo tras probarlo con una frase
de contrato: la transcribió sin un error, mientras que uno tres veces más
rápido escribió «del impiezas» por «de limpieza».

No se usa el reconocimiento del navegador porque dentro de Kaori no funciona
(depende de un servicio de Google que sólo trae Chrome), ni el dictado de
Windows, que funciona a medias según el equipo.

Si la grabación llega en silencio, Kaori lo dice en vez de transcribir: con
silencio, el modelo se inventa palabras sueltas («de la»). Suele ser el
micrófono silenciado o, en Windows, el dispositivo de entrada equivocado
(Configuración → Sistema → Sonido → Entrada).

## Usar desde el teléfono

El teléfono ve y hace lo mismo que el PC: contratos, contratistas, plantillas,
generar los documentos y descargarlos. No es una versión recortada: es la misma
interfaz, servida por el PC y adaptada a la pantalla pequeña (el menú se abre
con ☰).

**Para conectar un teléfono:**

1. En el PC: **Ajustes → Usar desde el teléfono → Activar**. Aparecen un código
   QR y un código de 6 cifras.
2. En el teléfono, conectado **a la misma Wi-Fi** que el PC: abra la cámara,
   apunte al QR y toque el enlace.
3. Escriba el código de 6 cifras. Ya está dentro.

**Por qué es seguro:**

- Sólo funciona dentro de la red de la oficina; desde fuera no se llega.
- El QR lleva sólo la dirección. Para entrar hace falta además el código, que
  sólo se ve en la pantalla del PC: una foto del QR no basta.
- El código vale para **una sola entrada**, caduca a los **10 minutos** y se
  anula tras **5 intentos fallidos**.
- El PC ve la lista de teléfonos conectados y puede echar a cualquiera con
  **Desconectar**. **Apagar el acceso** los echa a todos y deja de escuchar en
  la red. Al cerrar Kaori, se apaga solo.
- Desde el teléfono no se pueden crear códigos ni abrir el acceso a otros, ni
  leer archivos del PC que no sean los documentos generados.

**Lo que cambia en el teléfono:**

- **Elegir un archivo** (un PDF de contrato, una plantilla, una planilla) abre
  el selector del teléfono: se puede usar una foto o un PDF del propio móvil.
- **Abrir un documento generado** lo descarga en el teléfono.
- La carpeta de salida se elige desde el PC.
- **El micrófono** de los campos de texto enfoca el campo y remite al micrófono
  del teclado del teléfono, que ya hace eso mismo.

Si se trabaja a la vez en el PC y en el teléfono, cada uno ve al momento lo que
guarda el otro. Nada se pisa, ni siquiera en el mismo contrato: cada guardado
lleva el número de versión que conoce, y si el otro guardó entre medias, Kaori
toma lo suyo y vuelve a aplicar encima lo que se estaba escribiendo. Escribir
rápido desde el teléfono con una conexión lenta tampoco pierde letras: los
cambios salen en orden, uno detrás de otro, y si se cae la Wi-Fi se quedan
esperando para el siguiente guardado.

Una foto hecha con la cámara del teléfono sirve igual que una del PC para
**Leer de una foto o PDF**: Kaori la endereza (las cámaras la guardan de lado y
anotan cómo girarla), la reduce y reconoce el tipo aunque el móvil la mande sin
extensión. Con Gemini saturado la lectura puede tardar un par de minutos,
porque pasa al reconocimiento de texto del propio PC; mientras, el botón dice
«Leyendo el contrato…».

**Si el teléfono no abre la página:** compruebe que está en la misma Wi-Fi y no
con datos móviles. Si el PC tiene varias conexiones, debajo del QR aparecen
sus otras direcciones para probar. El instalador ya deja a Kaori pasar el
cortafuegos de Windows en redes **privadas**; si Windows tiene la Wi-Fi marcada
como **pública**, no dejará entrar al teléfono (Configuración → Red e Internet
→ Wi-Fi → la red → Perfil de red: Privada).

En desarrollo (`npm run dev`), el teléfono recibe la interfaz de la carpeta
`dist`, la de la última compilación: después de cambiar la interfaz hay que
ejecutar `npm run build` para verla en el teléfono.

## Generar cada documento por su cuenta

La casilla de cada documento decide qué entra en el botón «Generar». Además,
cada una lleva su propio botón **▷** que lo produce sólo a él, sin tocar lo
demás: repetir las cuentas de cobro de un mes sin volver a generar los informes
que ya se entregaron es lo más corriente del mundo.

El botón ▷ mide por su cuenta quién está listo. A quien le falte la plantilla
de la cuenta no se le impide el informe.

## Solo un contrato

Para generar todos los informes de un contrato —lo corriente al terminar de
registrarlo—, elija el contrato en **Solo un contrato**, debajo de los meses.
Kaori marca los meses de ese contrato y, en cada uno, sólo a él: basta pulsar
Generar. Si el contrato es de otro año, cambia al suyo. Si cruza de un año al
siguiente, marca los del año que se ve y avisa de los demás. El último
contrato trabajado sale el primero de la lista.

## Filtrar la tabla por contrato

En la cabecera de la tabla de meses, **Contrato** deja ver sólo un contrato.
Con el filtro puesto, los meses se despliegan solos, y los contadores, los
avisos de duplicados y el botón Generar cuentan sólo lo que se ve: nunca se
genera una fila marcada que quedó oculta. **Quitar filtro** vuelve a mostrar
todos. **Solo un contrato** pone también el filtro en ese contrato. El filtro
se recuerda al volver a la pantalla; si el contrato se elimina, se quita solo.

## Cada mes, desplegable

En la tabla de **Generar mes** cada mes es una franja que se despliega o
pliega con un clic; **Desplegar todos** y **Plegar todos** hacen lo propio con
todos a la vez. Kaori recuerda cuáles dejó abiertos.

Plegado, el mes dice cuántos contratos tiene, cuántos están marcados y cuál es
el **último trabajado**. Desplegado, ese contrato va primero, con la etiqueta
«Último trabajado», y los demás le siguen del más reciente al más antiguo.
«Trabajar» un contrato es editarlo, anotarle la planilla de un mes o generarle
un documento. Los que nunca se tocaron van al final, el contrato más nuevo
primero.

## Varios meses de una vez

Los doce meses están siempre a la vista como casillas: se pueden marcar
seguidos (enero a junio) o sueltos (enero, marzo y abril). Hay atajos para
«Todo el año», «Hasta hoy» y «Ninguno».

La tabla de abajo se agrupa por mes, y cada casilla es **un contratista en un
mes concreto**. Así se puede generar a alguien enero y marzo pero saltarse
febrero, que ya se entregó. Cada mes lleva su propia casilla de «marcar todo».

Al pulsar Generar, Kaori hace un lote por mes. Si uno falla, los demás siguen,
y lo ya producido queda anotado en el historial.

## La planilla de cada mes

El número de planilla PILA cambia todos los meses, así que se anota por
contrato y mes, en la columna PLANILLA de la tabla. Dos vías:

- **Leer** — de un PDF o una imagen; el programa saca el número, la fecha y el
  mes acreditado.
- **Escribir** — a mano, cuando sólo se tiene el papel delante o la lectura no
  acierta. Se piden los mismos campos que trae la tabla del informe: número,
  fecha de pago y mes de pago.

La fecha que se propone es el día uno del mes siguiente, porque la planilla de
un mes se paga a principios del otro. El **mes de pago** es el que la planilla
acredita —el del informe—, no aquel en que se pagó.

Ya anotada, se pulsa sobre el número para corregirla o quitarla.

**Si un mes no tiene planilla anotada**, el número y la fecha salen en blanco
para escribirlos a mano, y **MES DE PAGO lleva el mes del informe**: el de
enero dice «enero». Nunca se deja lo que traiga la plantilla, que sería el
número de seguridad social de otro contratista en un documento que se firma.

## Contrato nuevo con los datos del anterior

Al crear un contrato para alguien que ya tiene otros, arriba del contrato
aparece un recuadro: **«Esta persona ya tiene otro contrato. ¿Usar sus
datos?»**. Se elige de cuál (si hay varios) y se pulsa **Cargar sus datos**.

| Se copia tal cual | Se recalcula con las fechas del nuevo | No se copia |
|---|---|---|
| Objeto | Texto del plazo | Número |
| Obligaciones y actividades | | Fechas de inicio, terminación y firma |
| Supervisor y contratante | | CDP y RP con sus valores |
| Teléfono y cuenta | | Adiciones y suspensiones |
| Las tres plantillas | | Valor del contrato, cuotas y forma de pago |

Conviene poner antes las fechas del contrato nuevo: el plazo se redacta con
ellas, porque copiado tal cual diría las del contrato anterior en un documento
que se firma.

**El dinero no se copia.** El valor del contrato y sus cuotas quedan vacíos,
aunque el anterior los tuviera: el sueldo cambia de un contrato al siguiente
más de lo que parece, y una cifra heredada sin querer acaba impresa en un
documento que se firma. Se escribe el valor en **Pagos** y se genera allí el
cronograma; el aviso de la carga recuerda a cuánto iba el contrato anterior.
Sin cuotas no hay forma de pago que redactar, así que también queda vacía:
se redacta con su botón cuando estén hechas las cuotas.

En un contrato que ya tiene datos, el recuadro queda como un botón («Cargar
datos de otro contrato de esta persona») y pide confirmación, porque
reemplaza lo escrito. Funciona igual desde el teléfono.

## Nada se pierde al cambiar de sección

En **Contratos**, Kaori recuerda qué contrato estaba abierto y en qué pestaña:
ir a Plantillas a mirar algo y volver lleva al mismo sitio. Las obligaciones
de la lista se guardan al escribirlas. Lo que se está redactando en «Escribir
varias obligaciones de una vez» —el texto, las propuestas de la IA— es un
borrador de cada contrato y también se conserva hasta que se agrega o se
borra.

## CDP y RP con el mismo número

A veces el CDP y el RP de un contrato llevan el mismo número. Si una plantilla
salía de un contrato así, Kaori asignaba las dos apariciones al CDP y el RP se
quedaba sin ninguna: todo documento generado con esa plantilla ponía el número
del CDP también en la casilla del RP. Ahora, cuando un valor pertenece a más de
un campo, lo decide la fila de la tabla (la del CDP o la del RP) y no el valor.

Las plantillas ya registradas con este defecto se reparan solas al abrir
Kaori: la aparición de la fila del RP vuelve al RP. Sólo se toca una plantilla
cuando las señales coinciden (el RP vacío, el CDP repetido y la posición
exacta de la fila del RP); las demás quedan como están.

## Historial de informes generados

Debajo de la tabla, en la misma pantalla. Contesta lo que antes había que ir a
mirar a la carpeta de salida: qué se generó, cuándo y por cuánto. Se puede
filtrar por contrato, por contratista, por rango de fechas de generación y por
rango de valor, y ordenar por cualquiera de esas columnas. Cada fila abre el
documento o su carpeta.

El valor que muestra es el que quedó **impreso en ese documento**, guardado con
el registro: si después se corrige el cronograma del contrato, el historial
sigue diciendo lo que decía el papel entregado.

## Lo elegido se recuerda

El año, los meses marcados y los contratistas marcados de cada mes se guardan
en el equipo. Salir a mirar un contrato y volver ya no deshace el trabajo de
marcar cuatro meses, y aguanta también el cierre del programa. Se vacía cuando
usted lo desmarque o pulse «Ninguno».

## Modo claro y oscuro

El interruptor está abajo en la barra lateral; en **Ajustes → Apariencia** están
las tres opciones, incluida «Como Windows». El cambio lleva una transición
suave, y la elección se recuerda: la ventana vuelve a abrir en el modo en que se
dejó, sin fogonazo blanco de por medio.

El naranja de marca no cambia —sigue marcando las acciones—; lo que se voltea
son los fondos, el texto y los contornos.

## Cómo conserva el diseño

Un archivo `.docx` es en realidad un ZIP con XML dentro. Kaori **copia ese ZIP
completo** y sólo reemplaza el texto que usted marcó en el mapeo. Los logos, las
imágenes, los tipos de letra, los estilos, los bordes de tabla y los márgenes
nunca se abren siquiera, así que salen idénticos al original.

Está comprobado con una prueba automática (`tests/docxArchivo.test.ts`) que
genera tres informes encadenados y verifica que los bytes del logo y el archivo
de estilos siguen siendo exactamente los mismos.

## Cómo reconoce los campos

Kaori usa tres vías, de más fiable a menos:

1. **Los datos que ya tiene registrados.** Una plantilla es el documento de
   alguien, con su teléfono y su cédula escritos dentro. Si esos datos ya están
   en un contrato, se buscan literalmente en el archivo y aparecen mapeados
   solos. Es la vía más segura, porque compara con el dato exacto en vez de
   adivinar por la forma — y es la única que sabe que `3007654321` es un
   teléfono y no una planilla PILA, ya que por su aspecto son idénticos.
2. **Los rótulos del propio documento** (ver abajo).
3. **La forma del texto**, sólo en el informe y como último recurso.



Kaori se guía por los **rótulos del propio informe**, no por la forma del texto:
lo que va debajo de «CONTRATISTA:» es el nombre, lo que va debajo de «OBJETO» es
el objeto, y así con el resto. Después propaga cada dato ya resuelto a sus demás
apariciones — el nombre del contratista sale en el encabezado, bajo la firma y
como beneficiario del CDP y del RP.

Las tablas que Kaori regenera enteras (obligaciones y cronograma de pagos) se
excluyen del mapeo, porque no tiene sentido marcar celda por celda algo que se
va a reconstruir.

Sobre el informe real del contrato 084-2025, esto reconoce los 20 campos
principales sin ninguna ayuda, con más del 90 % de las propuestas en confianza
alta.

## FORMA DE PAGO

El párrafo que va encima de la tabla PAGO / FECHA / VALOR se redacta solo desde
el cronograma, porque casi todo en él cambia: el valor total en letras y en
números, cuántas mensualidades son, el importe de la primera —distinto cuando el
contrato arranca a mitad de mes, «los veinticuatro (24) días del mes de enero»— y
el de las demás. El botón está en Contratos → Datos, y el texto queda editable.

La tabla de debajo también se regenera con las cuotas del contrato.

## Cómo queda el documento

Tres cosas del documento generado que conviene tener presentes:

- **La paginación es la de la plantilla.** Kaori no mete ni quita saltos de
  página. Hubo una versión que insertaba uno antes del INFORME DE SUPERVISIÓN
  para que cada informe empezara en su hoja, y sobraba: la plantilla del
  municipio no lleva ningún salto —la separación sale sola porque el primer
  informe llena la página— así que el añadido caía sobre una página que ya
  terminaba y dejaba **una hoja en blanco** en medio. Dónde parte Word una
  página no se puede saber leyendo el XML: depende de la altura del texto ya
  compuesto. Si hace falta mover el corte, se mueve en la plantilla.
- **Los importes en negrita.** El párrafo de FORMA DE PAGO lo compone Kaori
  entero, así que no hereda formato de nada. Las cifras escritas en letras con
  su número —`TRECE MILLONES … PESOS M/CTE ($13.630.000)`— salen en negrita,
  como en los informes del municipio. La regla se aplica sobre el texto final,
  así que vale también para lo que usted escriba a mano en ese cuadro.
- **Los importes en pesos en pantalla.** Los campos de dinero muestran
  `$1.880.000` y se editan escribiendo sólo las cifras.

## Las obligaciones y sus actividades

En **Contratos → Obligaciones** hay tres formas de llenarlas, de menos a más
trabajo:

- **Pegarlas.** Se copian del contrato y se pegan enteras en el cuadro de
  arriba. El programa las parte y les quita la numeración, vengan numeradas con
  puntos, con paréntesis, con viñetas o sin nada. Las obligaciones largas que
  el contrato parte en varias líneas se vuelven a unir.
- **Proponerlas.** Se escriben una o dos de ejemplo y el programa completa el
  resto en el mismo registro y sobre el mismo oficio. Esto **necesita la clave
  de IA** de Ajustes: redactar obligaciones nuevas es escribir de cero, no
  transformar un texto que ya está, y sin clave lo único que se podría hacer es
  copiar las de la plantilla — que son las de otro contratista, y ese era el
  problema. Se muestran para revisarlas antes de aceptarlas.
- **Una a una**, con el botón «Agregar una».
- **Leerlas del contrato.** «Leer de una foto o PDF» toma la página donde están
  las obligaciones específicas —numeradas 1, 2, 3… hasta el «Parágrafo»— y
  pone cada una en su campo. Sirve una foto hecha con el teléfono. Con una
  clave de IA (Gemini o Claude) se le manda el documento y las transcribe tal
  cual: con una foto de ejemplo salieron las 15 sin un error, en unos 7
  segundos. Sin IA las lee el reconocimiento de texto del propio equipo, que
  con una foto buena acierta la mayoría pero puede confundir letras donde hay
  sombras: conviene revisarlas. Si el contrato ya tenía obligaciones, Kaori
  pregunta si reemplazarlas o agregar las leídas al final, y se puede
  deshacer.

Las **ACTIVIDADES EJECUTADAS** salen de las obligaciones, en pasado. El botón
«Redactar las que faltan» respeta lo que ya esté escrito y sólo completa los
huecos. Con clave de IA quedan mejor redactadas; sin ella las conjuga por
reglas gramaticales, que también funciona sin conexión.

Cada tabla del informe las escribe a su manera:

| Tabla | Quién habla | Cómo sale |
|---|---|---|
| Informe de actividad (la primera) | El contratista | «Se apoyó en las labores…» |
| DETALLE DE LA EJECUCIÓN (la del supervisor) | El supervisor, sobre el contratista | «Apoyó en las labores…» |

Se escriben una sola vez, en impersonal, y la segunda tabla las pasa a
tercera persona al generar. El verbo concuerda: «Se realizaron actividades»
pasa a «Realizó actividades». Los verbos que llevan «se» de por sí, como «Se
reunió con el supervisor», se dejan como están.

## Mayúsculas y minúsculas

El OBJETO y el texto del PLAZO llevan dos botones para pasarlos a MAYÚSCULAS o
a minúsculas. Al bajar a minúsculas se respeta la inicial de cada frase, porque
si no el párrafo empezaría en minúscula.

## La relación de pagos efectuados

Esa tabla del informe es el **histórico**, no el pago del mes. El informe de
marzo lleva tres renglones:

```
Pago realizado, mes de enero      2025   $1.298.400
Pago realizado, mes de febrero           $1.623.000
Pago realizado, mes de marzo             $1.623.000
```

Kaori la regenera entera en cada informe, con un renglón por mes transcurrido
desde el inicio del contrato. Es lo que justifica el TOTAL PAGADO de debajo y
el balance de VALOR EJECUTADO y VALOR POR EJECUTAR, que se recalculan solos.

El año se escribe en el primer renglón y cada vez que cambia, no en todos. La
fila de «TOTAL, PAGADO HASTA LA FECHA» se conserva: es un cierre de la tabla,
no un dato.

## El balance de recursos

La tabla de VALOR EJECUTADO y VALOR POR EJECUTAR se rellena **por posición de
celda**, no por el mapeo de campos. La razón es que esas casillas suelen venir
vacías en la plantilla, y el mapeo sólo sabe reemplazar texto que ya existe: sin
nada que reemplazar no tenía dónde escribir y el balance salía en blanco. Ahora
se localiza cada renglón por su rótulo y se escribe en su columna, hubiera algo
antes o no.

- VALOR EJECUTADO — lo pagado hasta ese mes, acumulado.
- VALOR POR EJECUTAR — lo que falta. En el último mes, `$0`.
- SALDO A LIBERAR no se toca: no sale del contrato.

## Cronograma de pagos

No todos los meses se pagan igual: si el contrato arrancó el 7 de enero, ese mes
va proporcional y los demás completos. Kaori ofrece las dos vías:

- **Por lotes** — escriba el importe de los meses completos y añada una
  excepción por cada mes que se pague distinto.
- **Uno por uno** — la tabla de cuotas es editable: puede cambiar cualquier
  fecha o importe a mano, y eso manda sobre lo generado.

Kaori avisa si las cuotas no suman el valor del contrato, porque entonces el
saldo por ejecutar no llegaría a cero al final.

## Dos erratas corregidas

Su plantilla arrastraba dos valores incorrectos en la columna «VALOR TOTAL»:

| Campo | Traía | Ahora |
|---|---|---|
| `VALOR EJECUTADO` | `3.000.000` | Se deja en blanco |
| `VALOR POR EJECUTAR` | `6000000000666` | Se deja en blanco |

Se dejan vacías porque esa columna ya cuadra sin ellas: valor inicial +
adiciones = SUMAS IGUALES. Las cifras de la columna derecha siempre fueron
correctas y se reproducen igual.

## Papelera

Nada se borra de golpe. Hay dos papeleras, ambas en **Ajustes**, ambas con 30
días de plazo:

- **Contratos.** Eliminar un contrato se lleva consigo su historial de
  informes, así que pasa a la papelera y sigue recuperable con el historial
  intacto.
- **Plantillas.** Lo que se protege aquí no es el `.docx` —siempre se puede
  volver a subir— sino el mapeo: las decenas de posiciones de campo que costó
  confirmar una por una. Al recuperarla vuelve con el mismo id, así que los
  contratos que la tenían asignada la reconocen sin reasignar nada.

Pasado el plazo se borran solas. También se puede borrar antes de tiempo, o
vaciar cualquiera de las dos papeleras entera.

## Eliminar varios contratos a la vez

La lista de contratos tiene una casilla por fila y otra en la cabecera para
marcarlos todos. Con algo marcado aparece arriba una barra con «Eliminar (n)»;
la confirmación enumera cuáles son y cuántos informes se llevan entre todos, y
el envío a la papelera se hace en un solo guardado.

## Buscar y ordenar contratos

La búsqueda de la lista de contratos mira a la vez el número, el nombre y la
cédula — y acepta la cédula con o sin puntos. Se puede ordenar por número,
contratista, fecha de inicio o valor.

En Contratistas, quien tiene varios contratos muestra un desplegable con sus
números; al pulsar uno se ve su ficha resumida, con un botón para abrir el
contrato completo.

## Funciona sin internet

Todo lo esencial funciona sin conexión: lectura de PDFs con texto, OCR local
(Tesseract en español) y redacción de las actividades ejecutadas por reglas
gramaticales.

Con una clave de IA en **Ajustes → IA**, Kaori redacta las obligaciones y las
actividades ejecutadas. Hay dos opciones y basta con una:

| | Claude (Anthropic) | Gemini (Google) |
|---|---|---|
| Redacta obligaciones y actividades | Sí | Sí |
| Lee contratos y planillas escaneados | Sí | No: sin Claude se leen sin conexión |
| Dónde se consigue la clave | console.anthropic.com | aistudio.google.com/apikey (con cuota gratuita) |

Si están las dos, se elige cuál redacta. Las dos reciben las mismas
instrucciones: el estilo del municipio, verbos en infinitivo para las
obligaciones y pasado impersonal para las actividades, y la prohibición de
inventar cifras, fechas o nombres. Con Gemini, Kaori elige solo el modelo
«Flash» estable más reciente que ofrezca la clave, porque Google retira modelos
cada pocos meses y uno fijado a mano dejaría de funcionar sin aviso.

**Cuando Gemini falla.** Google tiene a menudo algún modelo saturado (responde
503, «alta demanda»), otros sin cuota para la clave (429) y otros retirados
aunque sigan en la lista (404). Kaori prueba los modelos de uno en uno, aparta
un rato los que fallan y se queda con el primero que responde. Si fallan
todos, **no escribe nada a escondidas**: dice por qué y ofrece **Reintentar** o
**Redactar por reglas, sin IA**. Para rehacer con la IA unas actividades ya
escritas está **Volver a redactar todas**.

Las claves se guardan cifradas por Windows y sólo las usa el proceso principal
del programa. No llegan a la interfaz ni al teléfono. Antes llegaban, y eso
causaba un fallo: al guardar una clave y editar después cualquier cosa, la
interfaz guardaba su copia de los datos sin la clave y la clave se borraba sin
avisar.

En ambos casos Kaori **propone y usted confirma**: nada se guarda ni se genera
sin que lo revise.

## Notas

- **Sólo Windows.** El instalador se crea con `npm run dist` y queda en
  `release/`. No está firmado digitalmente, así que la primera vez Windows
  SmartScreen mostrará «editor desconocido» → *Más información* → *Ejecutar de
  todas formas*.
- **Sus datos** se guardan en un único archivo JSON dentro de la carpeta de datos
  de la aplicación (la ruta exacta aparece en Ajustes). Para respaldar, basta con
  copiar ese archivo. Si venía usando la versión anterior llamada
  «programa-alcaldia», Kaori traslada sus datos automáticamente la primera vez.
- **Suspensiones**: al reanudar, Kaori corre la fecha de terminación tantos días
  como duró la suspensión. Es el criterio habitual, pero conviene contrastarlo
  con un caso real antes de darlo por definitivo, porque ninguno de los informes
  de ejemplo lo ejercita.

## Estructura

```
core/               Lógica pura, sin interfaz: es lo que cubren las pruebas
  espanol/          Números y fechas en letras
  pagos/            Cuotas, acumulados, adiciones y suspensiones
  docx/             Lectura del .docx, detección de campos y generación
  extraccion/       PDF, OCR y redacción
  modelo/           Tipos y las dos papeleras
  almacenamiento/   Escritura de archivos a prueba de carreras
electron/           Proceso principal, almacenamiento y canales IPC
src/                Interfaz en React
herramientas/       Scripts: el ícono y este informe
recursos/           Logo e ícono (icono.png e icono.ico)
tests/              Pruebas automáticas con datos ficticios
```

## El ícono

`recursos/icono.png` e `icono.ico` **se generan**, no se editan a mano:

```bash
npm run icono
```

El script parte de `recursos/logo.png`, le quita el fondo blanco, mide el
contorno del símbolo en la mitad superior —sin la palabra «Kaori», ilegible a
32 píxeles— y escribe las resoluciones que Windows pide. Si cambia el logo,
basta con volver a ejecutarlo.

Quitar el fondo tiene truco, porque el papel del documento es casi tan blanco
como el fondo (252,250,249 contra 254,254,254): un umbral global se comería el
dibujo. Lo que hace el script es entrar desde los bordes y avanzar **sólo
mientras el píxel siguiente sea igual o más oscuro**. La sombra se oscurece
hacia adentro; el papel vuelve a aclararse, y esa inversión detiene el avance
justo en el borde. A la sombra se le descuenta el blanco de debajo, para que
sobre la barra de tareas oscura no quede un cerco gris.
