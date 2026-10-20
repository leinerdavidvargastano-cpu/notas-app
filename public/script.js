// ---------- 1. DATOS Y ELEMENTOS ----------
const URL_API = "/api/notas";

// Las dos personas: la clave ("lele") es lo que se guardará como autor.
const PERSONAS = {
  lele: { nombre: "Lele", foto: "img/lele.jpg", inicial: "L" },
  mayita: { nombre: "Mayita", foto: "img/mayita.jpg", inicial: "M" },
};

const formulario = document.querySelector("#formulario");
const campoTitulo = document.querySelector("#titulo");
const campoTexto = document.querySelector("#texto");
const lista = document.querySelector("#lista");
const mensajeVacio = document.querySelector("#vacio");
const selector = document.querySelector("#selector");
const autorActual = document.querySelector("#autor-actual");

// Quién eres: se recuerda en el navegador con localStorage.
let autor = localStorage.getItem("autor");
if (!PERSONAS[autor]) autor = null;

// Título y autor de esta sesión. TEMPORAL: el servidor todavía solo guarda
// "texto"; cuando hagamos el backend, esto desaparece.
const extras = {};


// ---------- 2. HABLAR CON EL SERVIDOR (igual que antes) ----------
async function cargarNotas() {
  try {
    const respuesta = await fetch(URL_API);
    const notas = await respuesta.json();
    mostrarNotas(notas);
  } catch (error) {
    console.error("No se pudieron cargar las notas:", error);
    alert("No se pudo conectar con el servidor. ¿Está encendido?");
  }
}

async function agregarNota(titulo, texto) {
  try {
    const respuesta = await fetch(URL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Enviamos también título y autor; el servidor actual los ignora.
      body: JSON.stringify({ texto: texto, titulo: titulo, autor: autor }),
    });
    if (!respuesta.ok) {
      throw new Error("El servidor rechazó la nota");
    }
    // El servidor devuelve la nota creada (con su id): la usamos para
    // acordarnos del título y el autor mientras la página siga abierta.
    const creada = await respuesta.json();
    extras[creada.id] = { titulo: titulo, autor: autor };
    await cargarNotas();
  } catch (error) {
    console.error("No se pudo guardar la nota:", error);
    alert("No se pudo guardar la nota.");
  }
}

async function eliminarNota(id) {
  try {
    const respuesta = await fetch(`${URL_API}/${id}`, { method: "DELETE" });
    if (!respuesta.ok) {
      throw new Error("El servidor no pudo eliminar la nota");
    }
    await cargarNotas();
  } catch (error) {
    console.error("No se pudo eliminar la nota:", error);
    alert("No se pudo eliminar la nota.");
  }
}


// ---------- 3. DIBUJAR EN PANTALLA ----------

// Ayuda para crear un elemento con clase y texto en una sola línea.
function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto) el.textContent = texto;
  return el;
}

// Círculo con la foto de la persona; si la foto no existe, queda la inicial.
function crearAvatar(clave) {
  const persona = PERSONAS[clave];
  const span = crear("span", "avatar");
  span.dataset.i = persona ? persona.inicial : "?";
  if (persona) {
    const img = document.createElement("img");
    img.src = persona.foto;
    img.alt = "";
    img.onerror = function () { img.remove(); };
    span.append(img);
  }
  return span;
}

function mostrarNotas(notas) {
  lista.innerHTML = "";
  mensajeVacio.hidden = notas.length > 0;

  notas.forEach(function (nota) {
    // Título y autor: los de esta sesión o, si algún día el servidor los envía, los suyos.
    const datos = extras[nota.id] || {};
    const titulo = datos.titulo || nota.titulo;
    const clave = datos.autor || nota.autor;
    const persona = PERSONAS[clave];

    const cabecera = crear("div", "nota-cabecera");
    cabecera.append(crear("strong", "", persona ? persona.nombre : "Sin autor"), crear("time", "", nota.fecha));

    const cuerpo = crear("div", "nota-cuerpo");
    cuerpo.append(cabecera);
    if (titulo) cuerpo.append(crear("h3", "", titulo));
    cuerpo.append(crear("p", "", nota.texto));

    const boton = crear("button", "boton-eliminar", "Eliminar");
    boton.type = "button";
    boton.addEventListener("click", function () { eliminarNota(nota.id); });
    cuerpo.append(boton);

    const item = crear("li", "nota");
    item.append(crearAvatar(clave), cuerpo);
    lista.append(item);
  });
}


// ---------- 4. QUIÉN ERES (ventana emergente) ----------
function elegirAutor(clave) {
  autor = clave;
  localStorage.setItem("autor", clave);
  autorActual.textContent = PERSONAS[clave].nombre;
  selector.close();
}

selector.querySelectorAll(".opcion").forEach(function (boton) {
  boton.addEventListener("click", function () { elegirAutor(boton.dataset.autor); });
});

// Si todavía no eligió a nadie, la ventana no se puede cerrar con Esc.
selector.addEventListener("cancel", function (evento) {
  if (!autor) evento.preventDefault();
});

document.querySelector("#cambiar").addEventListener("click", function () {
  selector.showModal();
});


// ---------- 5. FORMULARIO ----------
formulario.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const titulo = campoTitulo.value.trim();
  const texto = campoTexto.value.trim();
  if (titulo === "" || texto === "") return;

  if (!autor) {
    selector.showModal();
    return;
  }

  await agregarNota(titulo, texto);
  formulario.reset();
  campoTitulo.focus();
});


// ---------- 6. INICIO ----------
if (autor) {
  autorActual.textContent = PERSONAS[autor].nombre;
} else {
  selector.showModal();
}
cargarNotas();
