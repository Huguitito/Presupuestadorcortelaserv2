function generarPDF() {
  const resultado = document.getElementById("tablaResultado").innerHTML;
  const ventana = window.open('', '', 'width=800,height=600');
  ventana.document.write('<html><head><title>Cotización PDF</title></head><body>');
  ventana.document.write('<h1>Presupuesto Corte Láser</h1>');
  ventana.document.write('<table border="1" style="width:100%; border-collapse:collapse;">' + resultado + '</table>');
  ventana.document.write('</body></html>');
  ventana.document.close();
  ventana.print();
}