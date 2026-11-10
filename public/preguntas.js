// Página de PREGUNTAS DEL DÍA. Usa funciones de comun.js:
// verificarSesion, ocultarPantallaCarga y sesionVencida.

// ---------- 1. DATOS Y ELEMENTOS ----------
const NOMBRES = { lele: "Lele", mayita: "Mayita" };
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const cajaHoy = document.querySelector("#pregunta-hoy");
const cajaHistorial = document.querySelector("#historial");
const historialVacio = document.querySelector("#historial-vacio");

// Quién soy yo y quién es la otra persona (para los textos)
let yo = null;
let nombreOtra = "la otra persona";


// ---------- 2. AYUDAS ----------
function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto) el.textContent = texto;
  return el;
}

// "2026-11-10" → "10 nov 2026"
function fechaCorta(clave) {
  const [anio, mes, dia] = clave.split("-").map(Number);
  return dia + " " + MESES_CORTOS[mes - 1] + " " + anio;
}

// Una "burbuja" con la respuesta de una persona
function crearBurbuja(autor, texto, esMia) {
  const burbuja = crear("div", "burbuja " + autor + (esMia ? " mia" : ""));
  burbuja.append(crear("strong", "", esMia ? "Tú" : NOMBRES[autor]));
  burbuja.append(crear("p", "", texto));
  return burbuja;
}


// ---------- 3. HABLAR CON EL SERVIDOR ----------
async function pedir(url) {
  const respuesta = await fetch(url);
  if (sesionVencida(respuesta)) return null;
  if (!respuesta.ok) throw new Error("El servidor respondió con error");
  return respuesta.json();
}

async function cargarTodo() {
  try {
    // Promise.all pide las dos cosas AL MISMO TIEMPO (más rápido que una tras otra)
    const [hoy, historial] = await Promise.all([
      pedir("/api/preguntas/hoy"),
      pedir("/api/preguntas/historial"),
    ]);
    if (!hoy || !historial) return;

    cajaHoy.innerHTML = "";
    cajaHoy.append(crearTarjeta(hoy, true));

    cajaHistorial.innerHTML = "";
    historialVacio.hidden = historial.length > 0;
    historial.forEach(function (pregunta) {
      cajaHistorial.append(crearTarjeta(pregunta, false));
    });
  } catch (error) {
    console.error("No se pudieron cargar las preguntas:", error);
    alert("No se pudieron cargar las preguntas.");
  }
}

async function enviarRespuesta(fecha, texto) {
  const respuesta = await fetch("/api/preguntas/" + fecha + "/respuesta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ respuesta: texto }),
  });
  if (sesionVencida(respuesta)) return null;

  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || "No se pudo guardar la respuesta");
  return datos;   // la pregunta actualizada, ya con la respuesta de la otra persona
}


// ---------- 4. DIBUJAR UNA PREGUNTA ----------
// grande = true para la de hoy; false para las del historial
function crearTarjeta(pregunta, grande) {
  const tarjeta = crear("article", "pregunta" + (grande ? " pregunta-hoy" : ""));

  const cabecera = crear("div", "pregunta-cabecera");
  cabecera.append(crear("span", "pregunta-tema", pregunta.tema));
  if (!grande) cabecera.append(crear("time", "pregunta-fecha", fechaCorta(pregunta.fecha)));
  tarjeta.append(cabecera);

  tarjeta.append(crear(grande ? "h3" : "h4", "pregunta-texto", pregunta.texto));

  if (pregunta.mia) {
    // YA RESPONDÍ: se ven las dos respuestas (o la espera de la otra)
    const respuestas = crear("div", "respuestas");
    respuestas.append(crearBurbuja(pregunta.mia.autor, pregunta.mia.respuesta, true));

    if (pregunta.otra) {
      respuestas.append(crearBurbuja(pregunta.otra.autor, pregunta.otra.respuesta, false));
    } else {
      respuestas.append(crear("p", "esperando", "Esperando la respuesta de " + nombreOtra + "…"));
    }
    tarjeta.append(respuestas);
  } else {
    // NO HE RESPONDIDO: aviso de si la otra persona ya respondió, y el formulario
    const estado = pregunta.otra
      ? "🔒 " + NOMBRES[pregunta.otra.autor] + " ya respondió. Responde para ver su respuesta."
      : nombreOtra + " todavía no responde.";
    tarjeta.append(crear("p", "pregunta-estado", estado));

    if (grande) {
      tarjeta.append(crearFormulario(pregunta, tarjeta, grande));
    } else {
      // En el historial el formulario se abre con un botón, para no llenar la pantalla
      const abrir = crear("button", "boton-cancelar boton-responder", "Responder");
      abrir.type = "button";
      abrir.addEventListener("click", function () {
        abrir.replaceWith(crearFormulario(pregunta, tarjeta, grande));
      });
      tarjeta.append(abrir);
    }
  }

  return tarjeta;
}

function crearFormulario(pregunta, tarjeta, grande) {
  const form = crear("form", "form-respuesta");

  const campo = document.createElement("textarea");
  campo.rows = grande ? 4 : 3;
  campo.maxLength = 1000;
  campo.required = true;
  campo.placeholder = "Escribe tu respuesta…";
  campo.setAttribute("aria-label", "Tu respuesta");

  const aviso = crear("p", "form-aviso", "Tu respuesta no se puede cambiar después de enviarla.");
  const error = crear("p", "foto-error");
  error.setAttribute("role", "alert");

  const boton = crear("button", "", "Responder");
  boton.type = "submit";

  form.append(campo, aviso, error, boton);

  form.addEventListener("submit", async function (evento) {
    evento.preventDefault();
    const texto = campo.value.trim();
    if (texto === "") return;

    boton.disabled = true;
    error.textContent = "";
    try {
      const actualizada = await enviarRespuesta(pregunta.fecha, texto);
      // Cambiamos la tarjeta por una nueva que ya muestra las dos respuestas
      if (actualizada) tarjeta.replaceWith(crearTarjeta(actualizada, grande));
    } catch (e) {
      error.textContent = e.message;
      boton.disabled = false;
    }
  });

  // En el historial, enfocamos el campo apenas se abre
  if (!grande) setTimeout(function () { campo.focus(); }, 0);
  return form;
}


// ---------- 5. INICIO ----------
async function arrancar() {
  yo = await verificarSesion();
  if (!yo) return;

  // La otra persona es la que NO soy yo
  if (yo.autor === "lele") nombreOtra = "Mayita";
  if (yo.autor === "mayita") nombreOtra = "Lele";

  await cargarTodo();
  ocultarPantallaCarga();
}

arrancar();
