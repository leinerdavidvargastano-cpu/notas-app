// ---------- 1. CONSTANTES Y ELEMENTOS DEL HTML ----------

// Dirección de nuestra API. Es una ruta relativa (empieza con "/"):
// como la página la sirve el mismo servidor, el navegador completa
// solo "http://localhost:3000" delante.
const URL_API = "/api/notas";

const formulario = document.querySelector("#formulario");
const campoTexto = document.querySelector("#texto");
const lista = document.querySelector("#lista");
const mensajeVacio = document.querySelector("#vacio");


// ---------- 2. HABLAR CON EL SERVIDOR (fetch) ----------

// "async" marca una función que espera respuestas lentas (como las del servidor).
// Dentro de ella podemos usar "await" para decir: "espera a que termine esto
// antes de pasar a la siguiente línea".
async function cargarNotas() {
  // try/catch: si el servidor está apagado, fetch falla y caemos en el catch.
  try {
    // fetch(url) hace una petición GET por defecto.
    // Devuelve la respuesta del servidor (todavía sin leer su contenido).
    const respuesta = await fetch(URL_API);

    // respuesta.json() lee el contenido y lo convierte en un array de objetos.
    // También es lento, por eso lleva await.
    const notas = await respuesta.json();

    mostrarNotas(notas);
  } catch (error) {
    console.error("No se pudieron cargar las notas:", error);
    alert("No se pudo conectar con el servidor. ¿Está encendido?");
  }
}

async function agregarNota(texto) {
  try {
    // Para enviar datos, fetch recibe un segundo parámetro con opciones.
    const respuesta = await fetch(URL_API, {
      method: "POST", // método HTTP: crear
      // headers = información extra. Aquí avisamos que enviamos JSON.
      headers: { "Content-Type": "application/json" },
      // body = los datos. JSON.stringify convierte el objeto a texto,
      // porque por internet solo viajan textos.
      body: JSON.stringify({ texto: texto }),
    });

    // respuesta.ok es true si el servidor respondió con éxito (códigos 200 a 299).
    // Si respondió 400 (nota vacía), ok es false.
    if (!respuesta.ok) {
      throw new Error("El servidor rechazó la nota");
    }

    // La base de datos ya la guardó: pedimos la lista actualizada y la dibujamos.
    await cargarNotas();
  } catch (error) {
    console.error("No se pudo guardar la nota:", error);
    alert("No se pudo guardar la nota.");
  }
}

async function eliminarNota(id) {
  try {
    // La URL lleva el id: /api/notas/5. Las comillas invertidas (``)
    // permiten meter variables dentro del texto con ${...}.
    const respuesta = await fetch(`${URL_API}/${id}`, {
      method: "DELETE", // método HTTP: borrar
    });

    if (!respuesta.ok) {
      throw new Error("El servidor no pudo eliminar la nota");
    }

    await cargarNotas();
  } catch (error) {
    console.error("No se pudo eliminar la nota:", error);
    alert("No se pudo eliminar la nota.");
  }
}


// ---------- 3. MOSTRAR LAS NOTAS EN PANTALLA ----------

// Ahora recibe las notas como parámetro: ya no las guardamos en una variable
// del JS, porque la fuente de la verdad es la base de datos del servidor.
function mostrarNotas(notas) {
  lista.innerHTML = "";

  // Si no hay notas mostramos el mensaje; si hay, lo ocultamos.
  mensajeVacio.hidden = notas.length > 0;

  notas.forEach(function (nota) {
    const item = document.createElement("li");
    item.className = "nota";

    const parrafo = document.createElement("p");
    // textContent inserta el texto "tal cual" (más seguro que innerHTML).
    parrafo.textContent = nota.texto;

    const pie = document.createElement("div");
    pie.className = "nota-pie";

    const fecha = document.createElement("time");
    fecha.textContent = nota.fecha;

    const botonEliminar = document.createElement("button");
    botonEliminar.type = "button";
    botonEliminar.className = "boton-eliminar";
    botonEliminar.textContent = "Eliminar";

    // nota.id es el id que le asignó la base de datos (1, 2, 3...).
    botonEliminar.addEventListener("click", function () {
      eliminarNota(nota.id);
    });

    pie.append(fecha, botonEliminar);
    item.append(parrafo, pie);
    lista.append(item);
  });
}


// ---------- 4. EVENTOS ----------

// La función del evento también es async para poder usar await adentro.
formulario.addEventListener("submit", async function (evento) {
  // Cancela la recarga automática del formulario.
  evento.preventDefault();

  const texto = campoTexto.value.trim();

  if (texto === "") {
    return;
  }

  // Esperamos a que el servidor guarde antes de limpiar el campo.
  await agregarNota(texto);

  formulario.reset();
  campoTexto.focus();
});


// ---------- 5. INICIO ----------

// Al abrir la página pedimos al servidor las notas que ya estaban guardadas.
cargarNotas();
