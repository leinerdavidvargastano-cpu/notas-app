// ---------- SERVICE WORKER DE MAYLEN ----------
// Guarda en el teléfono los archivos de la página (no los datos) para que abra rápido
// y no se quede en blanco si falla la conexión.
const CACHE = "maylen-v1";

// Los archivos básicos que se guardan al instalar
const BASE = ["/", "/login.html", "/style.css", "/login.css", "/script.js", "/login.js", "/img/logo.png"];

// INSTALAR: se ejecuta una sola vez, cuando el navegador descubre este archivo
self.addEventListener("install", function (evento) {
  evento.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(BASE); })
  );
  self.skipWaiting();   // no espera: se activa de inmediato
});

// ACTIVAR: borra las memorias de versiones anteriores
self.addEventListener("activate", function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres.filter(function (n) { return n !== CACHE; })
               .map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();   // toma el control de las pestañas abiertas
});

// PETICIONES: se ejecuta cada vez que la página pide un archivo
self.addEventListener("fetch", function (evento) {
  const peticion = evento.request;
  const url = new URL(peticion.url);

  // Solo guardamos lecturas (GET) de nuestra propia página
  if (peticion.method !== "GET" || url.origin !== self.location.origin) return;

  // Los recuerdos, las sesiones y las reacciones NUNCA se guardan en el teléfono:
  // son datos privados. Las rutas /api/ siempre van directo al servidor.
  if (url.pathname.startsWith("/api/")) return;

  // Estrategia "primero la red": se pide lo más nuevo al servidor y se guarda una copia.
  // Solo si no hay conexión se usa la copia guardada. Así, cuando publiques cambios,
  // siempre verán la versión nueva y no una vieja atascada.
  evento.respondWith(
    fetch(peticion)
      .then(function (respuesta) {
        if (respuesta.ok) {
          const copia = respuesta.clone();   // una respuesta solo se puede usar una vez
          caches.open(CACHE).then(function (cache) { cache.put(peticion, copia); });
        }
        return respuesta;
      })
      .catch(function () {
        return caches.match(peticion).then(function (guardada) {
          if (guardada) return guardada;
          // Sin copia: si es una página, mostramos la principal
          if (peticion.mode === "navigate") return caches.match("/");
        });
      })
  );
});