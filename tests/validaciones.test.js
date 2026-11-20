
const {
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
} = require('../src/utils/validaciones');

describe('Pruebas unitarias de validaciones - MediCitas', () => {

  test('Debe aceptar un documento válido', () => {
    expect(validarDocumento('1234567890')).toBe(true);
  });

  test('Debe rechazar un documento con letras', () => {
    expect(validarDocumento('123ABC')).toBe(false);
  });

  test('Debe aceptar un teléfono de 10 dígitos', () => {
    expect(validarTelefono('3001234567')).toBe(true);
  });

  test('Debe rechazar un teléfono incompleto', () => {
    expect(validarTelefono('300123')).toBe(false);
  });

  test('Debe aceptar un nombre válido', () => {
    expect(validarNombre('María Fernanda')).toBe(true);
  });

  test('Debe rechazar un nombre con números', () => {
    expect(validarNombre('María123')).toBe(false);
  });

  test('Debe aceptar un correo válido', () => {
    expect(validarCorreo('paciente@gmail.com')).toBe(true);
  });

  test('Debe rechazar un correo inválido', () => {
    expect(validarCorreo('paciente@')).toBe(false);
  });

  test('Debe aceptar una contraseña de mínimo 8 caracteres', () => {
    expect(validarContrasena('Clave123')).toBe(true);
  });

  test('Debe rechazar una contraseña corta', () => {
    expect(validarContrasena('12345')).toBe(false);
  });

  test('Debe aceptar un identificador positivo', () => {
    expect(validarId(5)).toBe(true);
  });

  test('Debe rechazar un identificador negativo', () => {
    expect(validarId(-5)).toBe(false);
  });

  test('Debe aceptar una fecha válida', () => {
    expect(validarFecha('2026-11-20')).toBe(true);
  });

  test('Debe rechazar una fecha inexistente', () => {
    expect(validarFecha('2026-02-30')).toBe(false);
  });

  test('Debe aceptar una hora válida', () => {
    expect(validarHora('08:30')).toBe(true);
  });

  test('Debe rechazar una hora inválida', () => {
    expect(validarHora('25:70')).toBe(false);
  });

  test('Debe aceptar una duración positiva', () => {
    expect(validarDuracion(30)).toBe(true);
  });

  test('Debe rechazar una duración negativa', () => {
    expect(validarDuracion(-30)).toBe(false);
  });

  test('Debe aceptar un estado permitido', () => {
    expect(validarEstado('Pendiente')).toBe(true);
  });

  test('Debe rechazar un estado no permitido', () => {
    expect(validarEstado('En espera')).toBe(false);
  });

});
