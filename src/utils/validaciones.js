
function validarDocumento(documento) {
  return /^\d{10}$/.test(String(documento ?? '').trim());
}

function validarTelefono(telefono) {
  return /^\d{10}$/.test(String(telefono ?? '').trim());
}

function validarNombre(nombre) {
  return /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]{2,60}$/.test(
    String(nombre ?? '').trim()
  );
}

function validarCorreo(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(correo ?? '').trim()
  );
}

function validarContrasena(contrasena) {
  return typeof contrasena === 'string' &&
    contrasena.length >= 8;
}

function validarId(id) {
  return Number.isInteger(Number(id)) && Number(id) > 0;
}

function validarFecha(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) {
    return false;
  }

  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fechaReal = new Date(anio, mes - 1, dia);

  return fechaReal.getFullYear() === anio &&
    fechaReal.getMonth() === mes - 1 &&
    fechaReal.getDate() === dia;
}

function validarHora(hora) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hora ?? ''))) {
    return false;
  }

  return true;
}

function validarDuracion(duracion) {
  return Number.isInteger(Number(duracion)) &&
    Number(duracion) > 0;
}

function validarEstado(estado) {
  const estadosPermitidos = [
    'Pendiente',
    'Confirmada',
    'Cancelada',
    'Completada'
  ];

  return estadosPermitidos.includes(estado);
}

module.exports = {
  validarDocumento,
  validarTelefono,
  validarNombre,
  validarCorreo,
  validarContrasena,
  validarId,
  validarFecha,
  validarHora,
  validarDuracion,
  validarEstado
};
