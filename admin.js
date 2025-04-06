
const passwordCorrecta = "laseradmin123";

function login() {
  const pass = document.getElementById("password").value;
  if (pass === passwordCorrecta) {
    document.getElementById("login").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
  } else {
    alert("Contraseña incorrecta");
  }
}

const db = firebase.firestore();

document.getElementById("costosForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  for (let key in data) data[key] = parseFloat(data[key]);
  await db.collection("costosFijos").doc("valores").set(data);
  alert("Costos guardados correctamente.");
  e.target.reset();
});

document.getElementById("materialForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.disponible = !!data.disponible;
  data.costoPlancha = parseFloat(data.costoPlancha);
  await db.collection("materiales").add(data);
  alert("Material agregado correctamente.");
  e.target.reset();
});
