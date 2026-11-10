// ---------- CÓDIGO COMÚN A TODAS LAS PÁGINAS ----------
// Se carga ANTES del script de cada página. Tiene lo que todas comparten:
// pantalla de carga, revisar la sesión, cerrar sesión y el service worker.

// ---------- PANTALLA DE CARGA ----------
const pantallaCarga = document.querySelector("#pantalla-carga");
const textoCarga = document.querySelector("#carga-texto");
const botonReintentar = document.querySelector("#carga-reintentar");

// Si tarda más de 6 segundos, avisamos para que no parezca que se trabó
const avisoLento = setTimeout(function () {
  textoCarga.textContent = "Esto está tardando más de lo normal…";
}, 6000);

function ocultarPantallaCarga() {
  clearTimeout(avisoLento);
  pantallaCarga.classList.add("oculta");
}

// Si el servidor no responde, mostramos un mensaje y el botón para reintentar
function mostrarErrorCarga() {
  clearTimeout(avisoLento);
  textoCarga.textContent = "No se pudo conectar con el servidor.";
  botonReintentar.hidden = false;
}

botonReintentar.addEventListener("click", function () {
  window.location.reload();
});


// ---------- REVISAR LA SESIÓN ----------
// Pregunta al servidor quién tiene la sesión (la cookie viaja sola).
// Devuelve los datos de la cuenta ({ id, email, autor }) o null si no hay sesión.
async function verificarSesion() {
  try {
    const respuesta = await fetch("/api/yo");

    if (respuesta.ok) return await respuesta.json();

    if (respuesta.status === 401) {
      // Sin sesión: vamos al login SIN quitar la pantalla de carga.
      // "replace" no deja la página actual en el historial, así que el botón
      // "atrás" no devuelve a una pantalla que rebota otra vez al login.
      window.location.replace("/login.html");
      return null;
    }

    // Cualquier otro error del servidor
    mostrarErrorCarga();
    return null;
  } catch (error) {
    // No hubo conexión
    mostrarErrorCarga();
    return null;
  }
}

// Si la sesión venció (401), manda al login. Devuelve true si redirigió.
function sesionVencida(respuesta) {
  if (respuesta.status === 401) {
    window.location.href = "/login.html";
    return true;
  }
  return false;
}


// ---------- PÁGINAS SENCILLAS ----------
// Las páginas con <body data-pagina-simple> no cargan datos todavía:
// solo revisamos la sesión y quitamos la pantalla de carga.
if (document.body.hasAttribute("data-pagina-simple")) {
  verificarSesion().then(function (yo) {
    if (yo) ocultarPantallaCarga();
  });
}


// ---------- CERRAR SESIÓN ----------
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


// ---------- REGISTRAR EL SERVICE WORKER ----------
// Se registra cuando la página termina de cargar, para no frenar la pantalla de carga
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function (error) {
      console.error("No se pudo registrar el service worker:", error);
    });
  });
}
