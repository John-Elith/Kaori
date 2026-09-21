/**
 * La página a la que lleva el QR: pide el código que muestra el PC.
 *
 * Es HTML suelto, con su estilo dentro, porque se sirve antes de haber entrado
 * y no debe dar acceso a nada de la interfaz. Usa los mismos colores que Kaori
 * —hueso en claro, gris cálido en oscuro— para que se reconozca.
 */

export function paginaDeEntrada(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F1ECE2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#15181C" media="(prefers-color-scheme: dark)">
<title>Entrar · Kaori</title>
<style>
  :root {
    --fondo: #F1ECE2; --lienzo: #FBF8F2; --borde: #DDD4C5;
    --tinta: #2D2721; --tenue: #6B6155; --naranja: #F26A21; --naranja-f: #C4501A;
    --error: #C42C24; --error-fondo: #F9E5E0;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fondo: #15181C; --lienzo: #1B1F24; --borde: #2E343C;
      --tinta: #E8EAED; --tenue: #9BA3AE; --naranja: #F26A21; --naranja-f: #FFA274;
      --error: #F87878; --error-fondo: #381A1A;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: var(--fondo); color: var(--tinta);
    font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px; min-height: 100vh;
  }
  main {
    width: 100%; max-width: 380px; background: var(--lienzo);
    border: 1px solid var(--borde); border-radius: 16px; padding: 28px 22px;
  }
  .marca { font-size: 26px; font-weight: 700; color: var(--naranja); margin: 0; letter-spacing: -0.02em; }
  .sub { margin: 2px 0 22px; color: var(--tenue); font-size: 14px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p.ayuda { margin: 0 0 18px; color: var(--tenue); font-size: 14px; }
  input {
    width: 100%; font-size: 30px; letter-spacing: 0.35em; text-align: center;
    font-variant-numeric: tabular-nums; padding: 12px 8px 12px calc(8px + 0.35em);
    border: 1px solid var(--borde); border-radius: 12px;
    background: var(--fondo); color: var(--tinta); outline: none;
  }
  input:focus { border-color: var(--naranja); box-shadow: 0 0 0 3px rgba(242,106,33,.25); }
  button {
    margin-top: 16px; width: 100%; padding: 13px; font-size: 16px; font-weight: 600;
    border: 0; border-radius: 12px; background: var(--naranja); color: #fff;
  }
  button:disabled { opacity: .55; }
  .error {
    display: none; margin-top: 14px; padding: 10px 12px; border-radius: 10px;
    background: var(--error-fondo); color: var(--error); font-size: 14px;
  }
  .nota { margin-top: 20px; font-size: 12px; color: var(--tenue); }
</style>
</head>
<body>
<main>
  <p class="marca">Kaori</p>
  <p class="sub">Informes de contrato</p>
  <h1>Escriba el código del PC</h1>
  <p class="ayuda">Está en el PC, en <b>Ajustes → Usar desde el teléfono</b>. Son 6 cifras.</p>
  <form id="f" autocomplete="off">
    <input id="c" name="codigo" inputmode="numeric" pattern="[0-9]*" maxlength="6"
           autocomplete="one-time-code" aria-label="Código de 6 cifras" autofocus required>
    <button id="b" type="submit">Entrar</button>
    <div id="e" class="error" role="alert"></div>
  </form>
  <p class="nota">Sólo funciona conectado a la misma red Wi-Fi que el PC.</p>
</main>
<script>
  const f = document.getElementById('f');
  const c = document.getElementById('c');
  const b = document.getElementById('b');
  const e = document.getElementById('e');
  c.addEventListener('input', () => {
    c.value = c.value.replace(/\\D/g, '').slice(0, 6);
    if (c.value.length === 6) f.requestSubmit();
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (c.value.length !== 6) return;
    b.disabled = true; b.textContent = 'Comprobando…'; e.style.display = 'none';
    try {
      const r = await fetch('/api/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: c.value }),
      });
      const j = await r.json();
      if (j.ok) { location.replace('/'); return; }
      e.textContent = j.error || 'No se pudo entrar.';
    } catch {
      e.textContent = 'No hay conexión con el PC. Compruebe que Kaori sigue abierto y que está en la misma Wi-Fi.';
    }
    e.style.display = 'block';
    b.disabled = false; b.textContent = 'Entrar';
    c.value = ''; c.focus();
  });
</script>
</body>
</html>`;
}
