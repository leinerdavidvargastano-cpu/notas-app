// ---------- GUARDIA: SOLO ENTRA QUIEN TIENE SESIÓN ----------
// Le preguntamos al servidor quién somos. La cookie viaja sola en la petición.
fetch("/api/yo").then(function (respuesta) {
  // respuesta.ok es false cuando el servidor contestó 401 (sin sesión)
  if (!respuesta.ok) {
    // window.location.href cambia la dirección del navegador
    window.location.href = "/login.html";
  }
});




// ---------- 1. DATOS Y ELEMENTOS ----------
const URL_API = "/api/notas";

// Las dos personas: la clave ("lele") es lo que se guardará como autor.
const PERSONAS = {
  lele: { nombre: "Lele", foto: "img/lele.jpg", inicial: "L" },
  mayita: { nombre: "Mayita", foto: "img/mayita.jpg", inicial: "M" },
};


// Las reacciones: la "clave" es lo que se guarda en la base de datos
// (la misma lista que REACCIONES_VALIDAS del servidor).
const REACCIONES = [
  { clave: "encanta", emoji: "❤️", nombre: "Me encanta" },
  { clave: "gusta", emoji: "👍", nombre: "Me gusta" },
  { clave: "asombra", emoji: "😮", nombre: "Me asombra" },
  { clave: "divierte", emoji: "😂", nombre: "Me divierte" },
  { clave: "amen", emoji: "🙏", nombre: "Amén" },
  { clave: "ramon", emoji: "🍆", nombre: "Ramón" },
];


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


async function reaccionar(notaId, tipo) {
  try {
    // La ruta que ya probamos desde la consola: pone o quita la reacción
    const respuesta = await fetch(`${URL_API}/${notaId}/reacciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: tipo }),
    });

    // Si la sesión venció, mandamos al login
    if (respuesta.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!respuesta.ok) {
      throw new Error("El servidor rechazó la reacción");
    }

    // Volvemos a pedir las notas para que se actualicen los contadores
    await cargarNotas();
  } catch (error) {
    console.error("No se pudo guardar la reacción:", error);
    alert("No se pudo guardar la reacción.");
  }
}



async function cargarNotas() {
  try {
    const respuesta = await fetch(URL_API);

    // NUEVO: 401 significa que no hay sesión (o ya venció).
    // Mandamos al login y paramos aquí, sin mostrar ningún error.
    if (respuesta.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const notas = await respuesta.json();
    mostrarNotas(notas);
  } catch (error) {
    console.error("No se pudieron cargar las notas:", error);
    alert("No se pudo conectar con el servidor. ¿Está encendido?");
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


// Crea la fila de botones de reacción de UNA nota
function crearReacciones(nota) {
  const barra = crear("div", "reacciones");

  // Recorremos la lista y creamos un botón por cada reacción
  REACCIONES.forEach(function (reaccion) {
    const boton = crear("button", "reaccion");
    boton.type = "button";
    // title: el texto que aparece al dejar el mouse encima
    boton.title = reaccion.nombre;

    // ¿La puse yo? nota.mias es la lista que manda el servidor
    if ((nota.mias || []).includes(reaccion.clave)) {
      boton.classList.add("activa");
    }

    boton.append(crear("span", "", reaccion.emoji));

    // Contador: solo se muestra si hay al menos una reacción de ese tipo
    const total = (nota.reacciones || {})[reaccion.clave] || 0;
    if (total > 0) {
      boton.append(crear("span", "reaccion-numero", String(total)));
    }

    boton.addEventListener("click", function () {
      reaccionar(nota.id, reaccion.clave);
    });

    barra.append(boton);
  });

  return barra;
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
    cuerpo.append(crearReacciones(nota));   // ← NUEVA

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

// ---------- 7. CERRAR SESIÓN ----------
document.querySelector("#cerrar-sesion").addEventListener("click", async function () {
  try {
    // Le avisamos al servidor: borra la sesión en Neon y la cookie del navegador
    await fetch("/api/logout", { method: "POST" });
  } catch (error) {
    console.error("No se pudo cerrar la sesión:", error);
  }
  // Pase lo que pase, mandamos a la pantalla de entrada
  window.location.href = "/login.html";
});
