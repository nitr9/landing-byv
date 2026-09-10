// El año del footer ya viene escrito en el HTML; esto sólo lo mantiene al día.
const anio = document.getElementById('anio');
if (anio) anio.textContent = new Date().getFullYear();
