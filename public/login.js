// ---------- 1. BUSCAR LOS ELEMENTOS DE LA PÁGINA ----------
// document.getElementById busca en el HTML el elemento que tiene ese id.
// Los guardamos en variables para poder usarlos después.
const formLogin = document.getElementById("form-login");
const formRegistro = document.getElementById("form-registro");
const irRegistro = document.getElementById("ir-registro");
const irLogin = document.getElementById("ir-login");


// ---------- 2. CAMBIAR ENTRE LOS DOS FORMULARIOS ----------
// addEventListener("click", ...) significa: "cuando hagan clic en este
// elemento, ejecuta esta función".
irRegistro.addEventListener("click", function (evento) {
  // Los enlaces con href="#" suben la página al inicio al hacer clic.
  // preventDefault() cancela ese comportamiento normal del enlace.
  evento.preventDefault();

  // hidden = true esconde el elemento; hidden = false lo muestra
  formLogin.hidden = true;
  formRegistro.hidden = false;
});

irLogin.addEventListener("click", function (evento) {
  evento.preventDefault();

  formRegistro.hidden = true;
  formLogin.hidden = false;
});


// ---------- 3. ENVIAR EL FORMULARIO DE REGISTRO ----------
// "submit" es el evento que ocurre cuando el formulario se envía
// (al presionar el botón o la tecla Enter).
// async permite usar await dentro de la función, igual que en el servidor.
formRegistro.addEventListener("submit", async function (evento) {
  // Cancelamos el envío normal del navegador (que recargaría la página).
  // Lo vamos a mandar nosotros con fetch.
  evento.preventDefault();

  // .value es lo que la persona escribió en cada campo
  const email = document.getElementById("registro-email").value;
  const password = document.getElementById("registro-password").value;

  // El párrafo donde mostramos errores; lo vaciamos antes de cada intento
  const parrafoError = document.getElementById("registro-error");
  parrafoError.textContent = "";

  try {
    // Mandamos los datos a la ruta que creamos en el servidor.
    // Es el mismo fetch que hacíamos desde la consola.
    const respuesta = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    });

    // Convertimos la respuesta del servidor en un objeto
    const datos = await respuesta.json();

    // respuesta.ok es true si el servidor contestó con éxito (200, 201...)
    // y false si contestó con error (400, 403, 409...).
    if (!respuesta.ok) {
      // datos.error trae el mensaje que escribimos en el servidor,
      // por ejemplo "Ese correo ya está registrado"
      parrafoError.textContent = datos.error;
      return;
    }

    // Si llegamos aquí, la cuenta se creó bien.
    // Limpiamos los campos, escondemos el registro y mostramos el login.
    formRegistro.reset();
    formRegistro.hidden = true;
    formLogin.hidden = false;
    document.getElementById("login-error").textContent =
      "Cuenta creada. Ahora inicia sesión.";
  } catch (error) {
    // Si ni siquiera pudo hablar con el servidor (por ejemplo, está apagado)
    parrafoError.textContent = "No se pudo conectar con el servidor";
  }
});

// ---------- 4. ENVIAR EL FORMULARIO DE LOGIN ----------
formLogin.addEventListener("submit", async function (evento) {
  // Cancelamos el envío normal del navegador, igual que en el registro
  evento.preventDefault();

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  // Vaciamos el párrafo de error (así desaparece el mensaje "Cuenta creada...")
  const parrafoError = document.getElementById("login-error");
  parrafoError.textContent = "";

  try {
    const respuesta = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    });

    const datos = await respuesta.json();

    // Si el servidor respondió con error (400, 401...), mostramos su mensaje
    if (!respuesta.ok) {
      parrafoError.textContent = datos.error;
      return;
    }

    // Login correcto: el servidor ya mandó la cookie y el navegador la guardó.
    // Ahora mandamos a la persona a la página principal.
    // "/" es la dirección de tu página de notas (public/index.html).
    window.location.href = "/";
  } catch (error) {
    parrafoError.textContent = "No se pudo conectar con el servidor";
  }
});