const request = require('supertest');
const app = require('../src/app');

const jwt = require('jsonwebtoken');

const tokenPaciente = jwt.sign(
  {
    id_usuario: 999,
    id_paciente: 999,
    rol: 'paciente'
  },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const tokenRecepcionista = jwt.sign(
  {
    id_usuario: 998,
    id_paciente: null,
    rol: 'recepcionista'
  },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('Pruebas generales de MediCitas', () => {
  test('La API debe responder correctamente en la ruta principal', async () => {
    const respuesta = await request(app).get('/');

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.body.estado).toBe('OK');
    expect(respuesta.body.mensaje).toBe('API de MediCitas funcionando correctamente');
  });
  test('La API debe conectarse correctamente a PostgreSQL', async () => {
    const respuesta = await request(app).get('/api/conexion');

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.body.mensaje).toBe('Conexión con PostgreSQL exitosa');
    expect(respuesta.body.version).toContain('PostgreSQL');
  });
  test('No debe permitir consultar pacientes sin autenticación', async () => {
    const respuesta = await request(app).get('/api/pacientes');

    expect(respuesta.statusCode).toBe(401);
  });
  test('Debe rechazar el acceso con un token inválido', async () => {
    const respuesta = await request(app)
      .get('/api/pacientes')
      .set('Authorization', 'Bearer token_falso');

    expect(respuesta.statusCode).toBe(401);
  });
  test('Debe rechazar el registro cuando faltan campos obligatorios', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('Todos los campos son obligatorios.');
  });
  test('Debe rechazar un documento que contiene letras', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina',
      apellidos: 'Cortez',
      documento: 'ABC12345',
      correo: 'prueba@ejemplo.com',
      telefono: '3001234567',
      contrasena: 'Prueba123!'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('El documento debe contener entre 6 y 15 números.');
  });
  test('Debe rechazar un correo electrónico inválido', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina',
      apellidos: 'Cortez',
      documento: '12345678',
      correo: 'correo-invalido',
      telefono: '3001234567',
      contrasena: 'Prueba123!'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('Ingresa un correo electrónico válido.');
  });

  test('Debe rechazar contraseñas con menos de 8 caracteres', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina',
      apellidos: 'Cortez',
      documento: '12345678',
      correo: 'prueba@ejemplo.com',
      telefono: '3001234567',
      contrasena: 'Ab1!'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('La contraseña debe tener mínimo 8 caracteres.');
  });
  test('Debe rechazar contraseñas que no contienen símbolos', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina',
      apellidos: 'Cortez',
      documento: '12345678',
      correo: 'prueba@ejemplo.com',
      telefono: '3001234567',
      contrasena: 'Prueba123'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('La contraseña debe contener al menos un símbolo.');
  });
  test('Debe rechazar números de teléfono inválidos', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina',
      apellidos: 'Cortez',
      documento: '12345678',
      correo: 'prueba@ejemplo.com',
      telefono: '123',
      contrasena: 'Prueba123!'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('Ingresa un teléfono válido de entre 7 y 15 números.');
  });
  test('Debe rechazar nombres que contienen números', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina123',
      apellidos: 'Cortez',
      documento: '12345678',
      correo: 'prueba@ejemplo.com',
      telefono: '3001234567',
      contrasena: 'Prueba123!'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('El nombre solo debe contener letras y espacios.');
  });
  test('Debe rechazar apellidos que contienen números', async () => {
    const respuesta = await request(app).post('/api/auth/registro').send({
      nombres: 'Karina',
      apellidos: 'Cortez123',
      documento: '12345678',
      correo: 'prueba@ejemplo.com',
      telefono: '3001234567',
      contrasena: 'Prueba123!'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('Los apellidos solo deben contener letras y espacios.');
  });

  test('No debe iniciar sesión si falta el correo', async () => {
    const respuesta = await request(app).post('/api/auth/login').send({
      contrasena: 'Prueba123!'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('Debes ingresar el correo y la contraseña.');
  });

  test('No debe iniciar sesión si falta la contraseña', async () => {
    const respuesta = await request(app).post('/api/auth/login').send({
      correo: 'prueba@correo.com'
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.body.mensaje).toBe('Debes ingresar el correo y la contraseña.');
  });

  test('No debe iniciar sesión con un correo inexistente', async () => {
    const respuesta = await request(app).post('/api/auth/login').send({
      correo: 'usuario.inexistente.987654321@prueba.com',
      contrasena: 'Prueba123!'
    });

    expect(respuesta.statusCode).toBe(401);
    expect(respuesta.body.mensaje).toBe('Correo o contraseña incorrectos.');
  });

  test('No debe agendar una cita si faltan campos obligatorios', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('Todos los campos son obligatorios.');
  });

  test('Debe rechazar un identificador de médico inválido', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: -1,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('El médico seleccionado no es válido.');
  });

  test('Debe rechazar fechas con formato incorrecto', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '20/11/2026',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('La fecha no tiene un formato válido.');
  });

  test('Debe rechazar fechas inexistentes', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-02-30',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('La fecha ingresada no es válida.');
  });

  test('No debe permitir agendar citas en fechas pasadas', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2020-01-01',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('No puedes agendar una cita en una fecha pasada.');
  });

  test('Debe rechazar horas con formato incorrecto', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '25:90',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('La hora ingresada no es válida.');
  });

  test('Debe rechazar un motivo de consulta vacío', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: '   '
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('Debes escribir el motivo de la consulta.');
  });

  test('No debe agendar una cita si la cuenta no está vinculada a un paciente', async () => {
    const tokenSinPaciente = jwt.sign(
      {
        id_usuario: 999,
        id_paciente: null,
        rol: 'paciente'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenSinPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.mensaje).toBe('Tu cuenta no está vinculada a un paciente.');
  });

  test('Debe rechazar una hora que no cumple el formato de 24 horas', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '9:00 AM',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('La hora ingresada no es válida.');
  });

  test('Debe rechazar la solicitud cuando el médico no existe', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 2147483647,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.mensaje).toBe('El médico seleccionado no existe.');
  });

  test('Recepción no debe agendar una cita sin seleccionar un paciente válido', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenRecepcionista}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: 'Consulta general',
        id_paciente: -1
      });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.mensaje).toBe('Debes seleccionar un paciente válido.');
  });

  test('Recepción no debe agendar una cita para un paciente inexistente', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenRecepcionista}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: 'Consulta general',
        id_paciente: 2147483647
      });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.mensaje).toBe('El paciente seleccionado no existe.');
  });

  test('No debe permitir agendar una cita cuando el médico no tiene horario ese día', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-22',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'El médico no tiene disponibilidad para esa hora. Selecciona un horario de atención válido.'
    );
  });

  test('No debe permitir agendar una cita fuera del horario de atención', async () => {
    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-16',
        hora: '13:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'El médico no tiene disponibilidad para esa hora. Selecciona un horario de atención válido.'
    );
  });
});
