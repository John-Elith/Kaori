<p align="center">
  <img src="recursos/logo.png" alt="Kaori" width="120">
</p>

<h1 align="center">Kaori</h1>

<p align="center">
  Genera en Word los informes mensuales de contratos de prestación de servicios de una alcaldía,<br>
  conservando exactamente el diseño de sus propias plantillas.
</p>

---

Cada mes, cada contratista de una alcaldía entrega un informe de actividades,
una cuenta de cobro y, al terminar, un certificado de cumplimiento. Casi todo
lo que llevan está ya en el contrato: fechas, valores, obligaciones, CDP y RP.
Kaori lo registra una vez y produce los documentos de cualquier mes: calcula
los pagos, los acumulados y los saldos, y escribe las fechas y las cifras en
letras.

No dibuja los documentos de nuevo. Parte del Word que ya usa la entidad, así
que el resultado sale con su logo, sus tablas y su formato, sin cambiar nada.

## Qué hace

- **Tres documentos**: el informe de actividad y supervisión y la cuenta de
  cobro, cada mes, y el certificado de cumplimiento de cada contrato. Genera
  varios meses y contratistas de una vez, cada mes en su carpeta.
- **Sus plantillas**: se sube un Word ya diligenciado y Kaori reconoce solo
  casi todos los campos. Se confirma una vez y sirve para siempre.
- **Cálculos automáticos**: cronograma de pagos, meses incompletos en
  proporción, relación de pagos acumulada, balance del contrato, adiciones y
  suspensiones.
- **Español correcto**: importes y fechas en letras como los escribe la
  administración («UN MILLÓN SEISCIENTOS VEINTITRÉS MIL PESOS M/CTE»).
- **Lectura de contratos**: propone los datos a partir del PDF del contrato o
  de la planilla PILA, también de escaneos.
- **Redacción con IA (opcional)**: con una clave de Claude o de Gemini, redacta
  las obligaciones y las actividades ejecutadas en el estilo de la entidad.
- **Dictado por voz**: en los campos de texto, en el propio equipo y sin enviar
  la voz a ningún servicio.
- **Desde el teléfono**: la misma interfaz, por la Wi-Fi de la oficina, con un
  código QR y un código de acceso que se ve en el PC.
- **Contrato nuevo a partir de otro**: copia el objeto, las obligaciones y el
  sueldo del contrato anterior de la misma persona.

## Privacidad

Kaori **empieza vacío**: no trae datos de ningún municipio ni de ninguna
persona. Los contratos, los contratistas y las plantillas se guardan en el
equipo donde se usa, en un archivo que no forma parte de este repositorio.
Las claves de IA se guardan cifradas por Windows.

Este repositorio no contiene documentos reales: sus pruebas usan datos
ficticios.

## Instalación

Kaori es una aplicación de escritorio para **Windows**.

```bash
npm install     # dependencias, una sola vez
npm run dist    # crea el instalador en release/
```

El instalador no está firmado digitalmente. La primera vez, Windows muestra
«Windows protegió su PC»: *Más información → Ejecutar de todas formas*.

## Primeros pasos

1. **Ajustes**: elija la carpeta de salida y escriba los datos de la entidad
   (contratante, NIT, municipio, supervisor).
2. **Plantillas**: suba un informe, una cuenta de cobro o un certificado de
   Word ya diligenciado y confirme los campos que reconoce.
3. **Contratistas y Contratos**: registre a las personas y sus contratos, a
   mano o desde el PDF del contrato.
4. **Generar mes**: marque los meses y los contratistas, y pulse *Generar*.

El manual completo, con cada función explicada, está en **[LEEME.md](LEEME.md)**.

## Desarrollo

Requiere **Node.js 20** o posterior.

```bash
npm run dev     # abre Kaori en modo desarrollo
npm test        # pruebas automáticas
npm run build   # comprueba los tipos y compila
```

Tecnologías: Electron, React, TypeScript, Vite, Tailwind CSS y Vitest.

```
core/          Lógica sin interfaz: español, pagos, Word, generación
electron/      Proceso principal, almacenamiento y acceso desde el teléfono
src/           Interfaz en React
tests/         Pruebas automáticas
herramientas/  Scripts auxiliares (ícono, informe del proyecto)
recursos/      Logo e ícono
```

La idea central del diseño: la plantilla de Word no se reconstruye, se
**clona**. Kaori solo sustituye el texto de los campos y regenera las filas de
las tablas, así que todo lo demás (estilos, encabezados, imágenes, saltos de
página) llega intacto al documento generado. Los detalles están en
[LEEME.md](LEEME.md#cómo-conserva-el-diseño).
