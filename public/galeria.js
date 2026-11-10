// Página de GALERÍA. Usa funciones de comun.js:
// verificarSesion, ocultarPantallaCarga y sesionVencida.

// ---------- 1. DATOS Y ELEMENTOS ----------
const NOMBRES = { lele: "Lele", mayita: "Mayita" };

// Tamaños a los que se achica cada foto ANTES de subirla (el lado más largo, en píxeles).
// Una foto de celular pesa 3-5 MB; achicada queda en unos 300 KB.
const LADO_IMAGEN = 1600;
const LADO_MINIATURA = 480;

const listaFotos = document.querySelector("#fotos");
const fotosVacio = document.querySelector("#fotos-vacio");

const ventanaSubir = document.querySelector("#ventana-subir");
const formFoto = document.querySelector("#form-foto");
const campoArchivo = document.querySelector("#archivo");
const vistaPrevia = document.querySelector("#vista-previa");
const elegirTexto = document.querySelector("#elegir-texto");
const campoDescripcion = document.querySelector("#foto-descripcion");
const campoLugar = document.querySelector("#foto-lugar");
const campoFecha = document.querySelector("#foto-fecha");
const fotoError = document.querySelector("#foto-error");
const botonGuardar = document.querySelector("#boton-guardar-foto");

const ventanaVer = document.querySelector("#ventana-ver");
const fotoGrande = document.querySelector("#foto-grande");
const verDatos = document.querySelector("#ver-datos");
const verDescripcion = document.querySelector("#ver-descripcion");
const botonBorrar = document.querySelector("#borrar-foto");

// La foto que está abierta en grande (para saber cuál borrar)
let fotoAbierta = null;


// ---------- 2. AYUDAS ----------

// "2026-11-10" → "10 de noviembre de 2026"  (o "10 nov 2026" si corta es true)
function formatearFecha(texto, corta) {
  if (!texto) return "";
  // "T00:00" para que JavaScript no la mueva al día anterior por la zona horaria
  const fecha = new Date(texto + "T00:00");
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: corta ? "short" : "long", year: "numeric" });
}

// Achica una imagen y la convierte en JPEG.
// Devuelve un texto "data:image/jpeg;base64,..." listo para mandar al servidor.
// Bonus: al redibujarla se borran los datos ocultos de la foto (EXIF),
// como la ubicación GPS donde se tomó.
function achicarImagen(img, ladoMaximo, calidad) {
  // Math.min(1, ...): si ya es pequeña, no la agrandamos
  const escala = Math.min(1, ladoMaximo / Math.max(img.naturalWidth, img.naturalHeight));
  const ancho = Math.round(img.naturalWidth * escala);
  const alto = Math.round(img.naturalHeight * escala);

  // canvas: un "lienzo" invisible donde dibujamos la foto ya achicada
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext("2d").drawImage(img, 0, 0, ancho, alto);

  return lienzo.toDataURL("image/jpeg", calidad);
}

// Carga un archivo elegido por la persona como <img>, para poder dibujarlo.
// Es una promesa: "resolve" cuando cargó, "reject" si no es una imagen válida.
function cargarArchivo(archivo) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(archivo);   // dirección temporal del archivo
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}


// ---------- 3. HABLAR CON EL SERVIDOR ----------
async function cargarFotos() {
  try {
    const respuesta = await fetch("/api/fotos");
    if (sesionVencida(respuesta)) return;
    if (!respuesta.ok) throw new Error("El servidor no mandó las fotos");

    mostrarFotos(await respuesta.json());
  } catch (error) {
    console.error("No se pudieron cargar las fotos:", error);
    alert("No se pudieron cargar las fotos.");
  }
}

async function subirFoto(datos) {
  const respuesta = await fetch("/api/fotos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });
  if (sesionVencida(respuesta)) return;

  if (!respuesta.ok) {
    // 413 = el servidor dice que el archivo es demasiado grande
    if (respuesta.status === 413) throw new Error("La foto es demasiado pesada");
    const info = await respuesta.json().catch(function () { return {}; });
    throw new Error(info.error || "No se pudo guardar la foto");
  }
}

async function borrarFoto(id) {
  try {
    const respuesta = await fetch("/api/fotos/" + id, { method: "DELETE" });
    if (sesionVencida(respuesta)) return;

    const info = await respuesta.json();
    if (!respuesta.ok) {
      alert(info.error);
      return;
    }
    ventanaVer.close();
    await cargarFotos();
  } catch (error) {
    console.error("No se pudo borrar la foto:", error);
    alert("No se pudo borrar la foto.");
  }
}


// ---------- 4. DIBUJAR LA CUADRÍCULA ----------
function mostrarFotos(fotos) {
  listaFotos.innerHTML = "";
  fotosVacio.hidden = fotos.length > 0;

  fotos.forEach(function (foto) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "foto-tarjeta";
    boton.addEventListener("click", function () { abrirFoto(foto); });

    const img = document.createElement("img");
    img.src = "/api/fotos/" + foto.id + "/miniatura";
    img.alt = foto.descripcion || "Foto de " + NOMBRES[foto.autor];
    img.loading = "lazy";   // solo se descarga cuando está por aparecer en pantalla

    // Debajo de la foto: lugar y fecha (lo que haya)
    const pie = document.createElement("span");
    pie.className = "foto-pie";
    pie.textContent = [foto.lugar, formatearFecha(foto.fecha, true)].filter(Boolean).join(" · ");

    boton.append(img);
    if (pie.textContent) boton.append(pie);

    const item = document.createElement("li");
    item.append(boton);
    listaFotos.append(item);
  });
}


// ---------- 5. VER UNA FOTO EN GRANDE ----------
function abrirFoto(foto) {
  fotoAbierta = foto;
  fotoGrande.src = "/api/fotos/" + foto.id + "/imagen";
  fotoGrande.alt = foto.descripcion || "";

  const partes = ["Subida por " + NOMBRES[foto.autor], foto.lugar, formatearFecha(foto.fecha)];
  verDatos.textContent = partes.filter(Boolean).join(" · ");
  verDescripcion.textContent = foto.descripcion || "";

  // El botón de borrar solo aparece en TUS fotos (el servidor igual lo revisa)
  botonBorrar.hidden = !foto.mia;
  ventanaVer.showModal();
}

document.querySelector("#cerrar-ver").addEventListener("click", function () {
  ventanaVer.close();
});

// Clic fuera de la foto (en el fondo oscuro) también cierra
ventanaVer.addEventListener("click", function (evento) {
  if (evento.target === ventanaVer) ventanaVer.close();
});

botonBorrar.addEventListener("click", function () {
  if (fotoAbierta && confirm("¿Eliminar esta foto? Esta acción no se puede deshacer.")) {
    borrarFoto(fotoAbierta.id);
  }
});


// ---------- 6. SUBIR UNA FOTO ----------
function limpiarFormulario() {
  formFoto.reset();
  if (vistaPrevia.src) URL.revokeObjectURL(vistaPrevia.src);
  vistaPrevia.removeAttribute("src");
  vistaPrevia.hidden = true;
  elegirTexto.hidden = false;
  fotoError.textContent = "";
}

document.querySelector("#abrir-subir").addEventListener("click", function () {
  limpiarFormulario();
  ventanaSubir.showModal();
});

document.querySelector("#cancelar-subir").addEventListener("click", function () {
  ventanaSubir.close();
});

// Al elegir un archivo, mostramos la vista previa
campoArchivo.addEventListener("change", function () {
  const archivo = campoArchivo.files[0];
  if (!archivo) return;

  if (vistaPrevia.src) URL.revokeObjectURL(vistaPrevia.src);
  vistaPrevia.src = URL.createObjectURL(archivo);
  vistaPrevia.hidden = false;
  elegirTexto.hidden = true;
  fotoError.textContent = "";
});

formFoto.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const archivo = campoArchivo.files[0];
  if (!archivo) {
    fotoError.textContent = "Elige una foto primero.";
    return;
  }

  // Mientras sube: botón desactivado para no subir la misma foto dos veces
  botonGuardar.disabled = true;
  botonGuardar.textContent = "Subiendo…";
  fotoError.textContent = "";

  try {
    const img = await cargarArchivo(archivo);

    await subirFoto({
      imagen: achicarImagen(img, LADO_IMAGEN, 0.82),
      miniatura: achicarImagen(img, LADO_MINIATURA, 0.75),
      descripcion: campoDescripcion.value,
      lugar: campoLugar.value,
      fecha: campoFecha.value,   // "" si no eligió fecha
    });

    URL.revokeObjectURL(img.src);
    ventanaSubir.close();
    await cargarFotos();
  } catch (error) {
    console.error("No se pudo subir la foto:", error);
    fotoError.textContent = error.message;
  } finally {
    // finally se ejecuta SIEMPRE, salga bien o mal
    botonGuardar.disabled = false;
    botonGuardar.textContent = "Guardar foto";
  }
});


// ---------- 7. INICIO ----------
async function arrancar() {
  const yo = await verificarSesion();
  if (!yo) return;

  await cargarFotos();
  ocultarPantallaCarga();
}

arrancar();
