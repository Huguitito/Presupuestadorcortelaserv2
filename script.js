document.getElementById("cotizador-form").addEventListener("submit", function(e) {
  e.preventDefault();
  const largo = parseFloat(document.getElementById("largo").value);
  const ancho = parseFloat(document.getElementById("ancho").value);
  const material = document.getElementById("material").value;
  const tipoTrabajo = document.getElementById("tipoTrabajo").value;

  const superficie = (largo * ancho) / 100; // cm²

  // Simulación de costos por cm² por material
  const costosMateriales = {
    mdf3: 0.10,
    mdf5: 0.15,
    mdf9: 0.20,
    blanco3: 0.18,
    acrilico: 0.25
  };

  const costo = superficie * costosMateriales[material];
  document.getElementById("resultado").style.display = "block";
  document.getElementById("tablaResultado").innerHTML = `
    <tr><th>Material</th><td>${material.toUpperCase()}</td></tr>
    <tr><th>Superficie</th><td>${superficie.toFixed(2)} cm²</td></tr>
    <tr><th>Tipo de Trabajo</th><td>${tipoTrabajo}</td></tr>
    <tr><th>Total Estimado</th><td>$${costo.toFixed(2)}</td></tr>
  `;
});