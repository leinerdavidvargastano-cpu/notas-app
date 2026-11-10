// Página de CALENDARIO. Usa funciones de comun.js:
// verificarSesion, ocultarPantallaCarga y sesionVencida.

// ---------- 1. DATOS Y ELEMENTOS ----------
const NOMBRES_PERSONAS = { lele: "Lele", mayita: "Mayita" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Todas las fechas se manejan como texto "AAAA-MM-DD" (igual que en la base de datos).
// Así se pueden comparar directo: "2026-01-05" < "2026-11-10" funciona.
let eventos = [];
let anioVisto, mesVisto;   // el mes que se está mostrando (mes: 0 = enero)
let diaElegido;            // "AAAA-MM-DD" del día tocado

const mesTitulo = document.querySelector("#mes-titulo");
const mesDias = document.querySelector("#mes-dias");
const diaTitulo = document.querySelector("#dia-titulo");
const diaEventos = document.querySelector("#dia-eventos");
const diaVacio = document.querySelector("#dia-vacio");
const listaProximos = document.querySelector("#proximos");
const proximosVacio = document.querySelector("#proximos-vacio");

const ventanaEvento = document.querySelector("#ventana-evento");
const formEvento = document.querySelector("#form-evento");
const eventoError = document.querySelector("#evento-error");
const botonGuardarEvento = document.querySelector("#guardar-evento");


// ---------- 2. AYUDAS DE FECHAS ----------

// (2026, 10, 5) → "2026-11-05". padStart pone el 0 delante: "5" → "05"
function claveFecha(anio, mes, dia) {
  return anio + "-" + String(mes + 1).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
}

function claveDeDate(fecha) {
  return claveFecha(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function hoy() {
  return claveDeDate(new Date());
}

// "2026-11-05" → "5 de noviembre de 2026" (o sin el año)
function fechaBonita(clave, conAnio) {
  const [anio, mes, dia] = clave.split("-").map(Number);
  return dia + " de " + MESES[mes - 1] + (conAnio ? " de " + anio : "");
}

// ¿Este evento cae en este día?
// - Normal: solo en su fecha.
// - Cada año: mismo mes y día, desde el año en que se creó en adelante.
//   slice(5) quita el año: "2026-11-05" → "11-05"
function caeEnDia(evento, clave) {
  if (evento.fecha === clave) return true;
  return evento.cada_anio && clave > evento.fecha && evento.fecha.slice(5) === clave.slice(5);
}

function eventosDelDia(clave) {
  return eventos.filter(function (evento) { return caeEnDia(evento, clave); });
}


// ---------- 3. HABLAR CON EL SERVIDOR ----------
async function cargarEventos() {
  try {
    const respuesta = await fetch("/api/eventos");
    if (sesionVencida(respuesta)) return;
    if (!respuesta.ok) throw new Error("El servidor no mandó los eventos");

    eventos = await respuesta.json();
    dibujarTodo();
  } catch (error) {
    console.error("No se pudieron cargar los eventos:", error);
    alert("No se pudieron cargar los eventos.");
  }
}

async function crearEvento(datos) {
  const respuesta = await fetch("/api/eventos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  if (sesionVencida(respuesta)) return;

  if (!respuesta.ok) {
    const info = await respuesta.json().catch(function () { return {}; });
    throw new Error(info.error || "No se pudo guardar el evento");
  }
}

async function borrarEvento(evento) {
  if (!confirm("¿Eliminar «" + evento.titulo + "»? Esta acción no se puede deshacer.")) return;

  try {
    const respuesta = await fetch("/api/eventos/" + evento.id, { method: "DELETE" });
    if (sesionVencida(respuesta)) return;

    const info = await respuesta.json();
    if (!respuesta.ok) {
      alert(info.error);
      return;
    }
    await cargarEventos();
  } catch (error) {
    console.error("No se pudo borrar el evento:", error);
    alert("No se pudo borrar el evento.");
  }
}


// ---------- 4. DIBUJAR EL MES ----------
function dibujarMes() {
  mesTitulo.textContent = MESES[mesVisto] + " " + anioVisto;
  mesDias.innerHTML = "";

  // getDay() da 0 = domingo... 6 = sábado. Lo pasamos a 0 = lunes ... 6 = domingo
  const primerDia = (new Date(anioVisto, mesVisto, 1).getDay() + 6) % 7;
  // El día 0 del mes siguiente es el último día de este mes
  const diasDelMes = new Date(anioVisto, mesVisto + 1, 0).getDate();
  const claveHoy = hoy();

  // Casillas vacías antes del día 1, para que caiga en su día de la semana
  for (let i = 0; i < primerDia; i++) {
    mesDias.append(document.createElement("span"));
  }

  for (let dia = 1; dia <= diasDelMes; dia++) {
    const clave = claveFecha(anioVisto, mesVisto, dia);
    const delDia = eventosDelDia(clave);

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "dia";
    if (clave === claveHoy) boton.classList.add("hoy");
    // aria-pressed: le dice al lector de pantalla cuál día está elegido
    boton.setAttribute("aria-pressed", clave === diaElegido ? "true" : "false");
    boton.setAttribute("aria-label", fechaBonita(clave) + (delDia.length ? ", " + delDia.length + " evento(s)" : ""));

    const numero = document.createElement("span");
    numero.className = "dia-numero";
    numero.textContent = dia;
    boton.append(numero);

    // Hasta 3 eventos: en PC se ve el título, en celular un puntito
    delDia.slice(0, 3).forEach(function (evento) {
      const marca = document.createElement("span");
      marca.className = "dia-evento " + evento.autor;
      marca.textContent = evento.titulo;
      boton.append(marca);
    });
    if (delDia.length > 3) {
      const mas = document.createElement("span");
      mas.className = "dia-mas";
      mas.textContent = "+" + (delDia.length - 3);
      boton.append(mas);
    }

    boton.addEventListener("click", function () {
      diaElegido = clave;
      dibujarTodo();
    });
    mesDias.append(boton);
  }
}


// ---------- 5. DIBUJAR LAS LISTAS ----------

// Una fila de evento. "clave" es el día en que aparece (para contar los años).
function crearItemEvento(evento, clave, mostrarFecha) {
  const item = document.createElement("li");
  item.className = "evento " + evento.autor;

  const cuerpo = document.createElement("div");
  cuerpo.className = "evento-cuerpo";

  const titulo = document.createElement("strong");
  titulo.textContent = evento.titulo;
  cuerpo.append(titulo);

  // Línea de datos: fecha, hora, cuántos años cumple, quién lo creó
  const datos = [];
  if (mostrarFecha) datos.push(fechaBonita(clave));
  if (evento.hora) datos.push(evento.hora);
  if (evento.cada_anio) {
    const anios = Number(clave.slice(0, 4)) - Number(evento.fecha.slice(0, 4));
    datos.push(anios > 0 ? "🔁 " + anios + (anios === 1 ? " año" : " años") : "🔁 cada año");
  }
  datos.push(NOMBRES_PERSONAS[evento.autor] || "");

  const linea = document.createElement("span");
  linea.className = "evento-datos";
  linea.textContent = datos.filter(Boolean).join(" · ");
  cuerpo.append(linea);

  if (evento.descripcion) {
    const descripcion = document.createElement("p");
    descripcion.textContent = evento.descripcion;
    cuerpo.append(descripcion);
  }

  item.append(cuerpo);

  // Solo quien lo creó ve el botón de borrar (el servidor igual lo revisa)
  if (evento.mio) {
    const borrar = document.createElement("button");
    borrar.type = "button";
    borrar.className = "evento-borrar";
    borrar.setAttribute("aria-label", "Eliminar " + evento.titulo);
    borrar.textContent = "✕";
    borrar.addEventListener("click", function () { borrarEvento(evento); });
    item.append(borrar);
  }

  return item;
}

function dibujarDia() {
  diaTitulo.textContent = (diaElegido === hoy() ? "Hoy, " : "") + fechaBonita(diaElegido, true);
  diaEventos.innerHTML = "";

  const delDia = eventosDelDia(diaElegido);
  diaVacio.hidden = delDia.length > 0;
  delDia.forEach(function (evento) {
    diaEventos.append(crearItemEvento(evento, diaElegido, false));
  });
}

// Los próximos 6 eventos, buscando día por día durante un año desde hoy
function dibujarProximos() {
  listaProximos.innerHTML = "";
  let encontrados = 0;
  const dia = new Date();

  for (let i = 0; i < 366 && encontrados < 6; i++) {
    const clave = claveDeDate(dia);
    eventosDelDia(clave).forEach(function (evento) {
      if (encontrados < 6) {
        listaProximos.append(crearItemEvento(evento, clave, true));
        encontrados++;
      }
    });
    dia.setDate(dia.getDate() + 1);   // pasa al día siguiente (cambia de mes solo)
  }

  proximosVacio.hidden = encontrados > 0;
}

function dibujarTodo() {
  dibujarMes();
  dibujarDia();
  dibujarProximos();
}


// ---------- 6. CAMBIAR DE MES ----------
function moverMes(cuanto) {
  // new Date se encarga de pasar de diciembre a enero (mes 12 → enero del año siguiente)
  const fecha = new Date(anioVisto, mesVisto + cuanto, 1);
  anioVisto = fecha.getFullYear();
  mesVisto = fecha.getMonth();
  dibujarMes();
}

document.querySelector("#mes-anterior").addEventListener("click", function () { moverMes(-1); });
document.querySelector("#mes-siguiente").addEventListener("click", function () { moverMes(1); });

document.querySelector("#ir-hoy").addEventListener("click", function () {
  const ahora = new Date();
  anioVisto = ahora.getFullYear();
  mesVisto = ahora.getMonth();
  diaElegido = hoy();
  dibujarTodo();
});


// ---------- 7. CREAR UN EVENTO ----------
document.querySelector("#abrir-evento").addEventListener("click", function () {
  formEvento.reset();
  eventoError.textContent = "";
  // La fecha empieza en el día que tienes elegido
  document.querySelector("#evento-fecha").value = diaElegido;
  ventanaEvento.showModal();
});

document.querySelector("#cancelar-evento").addEventListener("click", function () {
  ventanaEvento.close();
});

formEvento.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const fecha = document.querySelector("#evento-fecha").value;
  botonGuardarEvento.disabled = true;
  eventoError.textContent = "";

  try {
    await crearEvento({
      titulo: document.querySelector("#evento-titulo").value,
      fecha: fecha,
      hora: document.querySelector("#evento-hora").value,
      descripcion: document.querySelector("#evento-descripcion").value,
      cada_anio: document.querySelector("#evento-cada-anio").checked,
    });

    // Saltamos al día del evento nuevo para que se vea
    diaElegido = fecha;
    anioVisto = Number(fecha.slice(0, 4));
    mesVisto = Number(fecha.slice(5, 7)) - 1;

    ventanaEvento.close();
    await cargarEventos();
  } catch (error) {
    eventoError.textContent = error.message;
  } finally {
    botonGuardarEvento.disabled = false;
  }
});


// ---------- 8. INICIO ----------
async function arrancar() {
  const yo = await verificarSesion();
  if (!yo) return;

  const ahora = new Date();
  anioVisto = ahora.getFullYear();
  mesVisto = ahora.getMonth();
  diaElegido = hoy();

  await cargarEventos();
  ocultarPantallaCarga();
}

arrancar();
