const request = require('supertest');

let conflictoEsperado = 'medico';

let consultaInsertCapturada = '';

let citaCancelacion = [
  {
    id_cita: 10,
    estado: 'Pendiente'
  }
];

let resultadoCancelacion = [
  {
    id_cita: 10,
    estado: 'Cancelada'
  }
];

let errorCancelacion = false;

let medicoExiste = true;

let errorInsertHorario = null;

let horarioExiste = true;
let errorActualizarHorario = null;

const mockSql = jest.fn(async (strings) => {
  const consulta = strings.join(' ');

  if (consulta.includes('FROM medicos')) {
  return medicoExiste
    ? [{ id_medico: 1, estado: 'activo' }]
    : [];
}

if (consulta.includes('UPDATE horarios_medicos')) {
  if (errorActualizarHorario) {
    const error = new Error('Conflicto al actualizar horario');
    error.code = errorActualizarHorario;
    throw error;
  }

  return [
    {
      id_horario: 10,
      id_medico: 1,
      dia_semana: 2,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      duracion_cita: 30,
      activo: true
    }
  ];
}

  if (consulta.includes('INSERT INTO horarios_medicos')) {
  if (errorInsertHorario) {
    const error = new Error('Conflicto de horario');
    error.code = errorInsertHorario;
    throw error;
  }

  return [
    {
      id_horario: 10,
      id_medico: 1,
      dia_semana: 1,
      hora_inicio: '08:00',
      hora_fin: '12:00',
      duracion_cita: 30,
      activo: true
    }
  ];
}

if (
  consulta.includes('SELECT *') &&
  consulta.includes('FROM horarios_medicos')
) {
  return horarioExiste
    ? [
        {
          id_horario: 10,
          id_medico: 1,
          dia_semana: 1,
          hora_inicio: '08:00',
          hora_fin: '12:00',
          duracion_cita: 30,
          activo: true
        }
      ]
    : [];
}

  if (consulta.includes('FROM horarios_medicos')) {
    return [
      {
        hora_inicio: '08:00',
        hora_fin: '12:00',
        duracion_cita: 30
      }
    ];
  }

  if (consulta.includes('FROM citas')) {
  if (
    consulta.includes('id_medico =') &&
    conflictoEsperado === 'medico'
  ) {
    return [{ id_cita: 123 }];
  }

  if (
    consulta.includes('id_paciente =') &&
    conflictoEsperado === 'paciente'
  ) {
    return [{ id_cita: 456 }];
  }

  if (
    consulta.includes('id_cita =') &&
    consulta.includes('id_paciente =')
  ) {
    return citaCancelacion;
  }
}

if (consulta.includes('UPDATE citas')) {
  if (errorCancelacion) {
    throw new Error('Error simulado al cancelar la cita');
  }

  return resultadoCancelacion;
}

  if (consulta.includes('INSERT INTO citas')) {
    consultaInsertCapturada = consulta;

    return [
      {
        id_cita: 789,
        fecha: '2026-11-20',
        hora: '09:00:00',
        motivo: 'Consulta general',
        estado: 'Pendiente',
        id_paciente: 999,
        id_medico: 1,
        duracion_minutos: 30,
        periodo_cita: '["2026-11-16 09:00:00","2026-11-16 09:30:00")'
      }
    ];
  }

  return [];
});

jest.doMock('@neondatabase/serverless', () => ({
  neon: jest.fn(() => mockSql)
}));

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

const tokenPacienteSinId = jwt.sign(
  {
    id_usuario: 994,
    id_paciente: null,
    rol: 'paciente'
  },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const tokenMedico = jwt.sign(
  {
    id_usuario: 997,
    id_medico: 1,
    rol: 'medico'
  },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const tokenMedicoSinId = jwt.sign(
  {
    id_usuario: 996,
    id_medico: null,
    rol: 'medico'
  },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const tokenAdministrador = jwt.sign(
  {
    id_usuario: 995,
    rol: 'administrador'
  },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('Pruebas de conflictos de citas', () => {
  test('No debe permitir agendar una cita cuando el médico ya tiene ocupado ese horario', async () => {
    conflictoEsperado = 'medico';

    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'Ese espacio ya está ocupado. Selecciona otro horario disponible.'
    );
  });

  test('No debe permitir agendar una cita cuando el paciente ya tiene otra en ese horario', async () => {
    conflictoEsperado = 'paciente';

    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-20',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'Ya tienes otra cita en ese horario. Selecciona una hora diferente.'
    );
  });
  
test('Debe crear una cita y recibir el periodo_cita generado por PostgreSQL', async () => {
  conflictoEsperado = 'ninguno';
  consultaInsertCapturada = '';

  const respuesta = await request(app)
    .post('/api/citas')
    .set('Authorization', `Bearer ${tokenPaciente}`)
    .send({
      id_medico: 1,
      fecha: '2026-11-20',
      hora: '09:00',
      motivo: 'Consulta general'
    });

  expect(respuesta.status).toBe(201);

  const columnasInsertadas = consultaInsertCapturada.split('VALUES')[0];

  expect(columnasInsertadas).not.toContain('periodo_cita');

  expect(consultaInsertCapturada).toContain('RETURNING');
  expect(consultaInsertCapturada).toContain('periodo_cita');

  expect(consultaInsertCapturada).not.toContain('tsrange');

  expect(respuesta.body.cita).toEqual(
    expect.objectContaining({
      periodo_cita: expect.any(String)
    })
  );
});
test('Debe permitir que un médico consulte su agenda', async () => {
  const respuesta = await request(app)
    .get('/api/medico/mi-agenda')
    .set('Authorization', `Bearer ${tokenMedico}`);

  expect(respuesta.status).toBe(200);
  expect(Array.isArray(respuesta.body)).toBe(true);
  expect(respuesta.body.length).toBeGreaterThan(0);
});

test('No debe consultar la agenda si el médico no tiene identificador asociado', async () => {
  const respuesta = await request(app)
    .get('/api/medico/mi-agenda')
    .set('Authorization', `Bearer ${tokenMedicoSinId}`);

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'No se encontró un médico asociado a esta cuenta.'
  );
});
test('Debe permitir al administrador consultar los horarios de un médico', async () => {
  const respuesta = await request(app)
    .get('/api/medicos/1/horarios')
    .set('Authorization', `Bearer ${tokenAdministrador}`);

  expect(respuesta.status).toBe(200);
  expect(Array.isArray(respuesta.body)).toBe(true);
});

test('Debe rechazar la consulta de horarios cuando el identificador del médico no es válido', async () => {
  const respuesta = await request(app)
    .get('/api/medicos/-1/horarios')
    .set('Authorization', `Bearer ${tokenAdministrador}`);

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'El identificador del médico no es válido.'
  );
});
test('Debe permitir al administrador registrar un horario médico correctamente', async () => {
  const respuesta = await request(app)
    .post('/api/medicos/1/horarios')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 1,
      hora_inicio: '08:00',
      hora_fin: '12:00',
      duracion_cita: 30
    });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.mensaje).toBe(
    'Horario médico registrado correctamente.'
  );
  expect(respuesta.body.horario.id_horario).toBe(10);
});

test('No debe registrar un horario con un día de la semana inválido', async () => {
  const respuesta = await request(app)
    .post('/api/medicos/1/horarios')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 8,
      hora_inicio: '08:00',
      hora_fin: '12:00',
      duracion_cita: 30
    });

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'El día de la semana no es válido.'
  );
});

test('No debe registrar un horario para un médico inexistente', async () => {
  medicoExiste = false;

  try{
  const respuesta = await request(app)
    .post('/api/medicos/1/horarios')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 1,
      hora_inicio: '08:00',
      hora_fin: '12:00',
      duracion_cita: 30
    });

  expect(respuesta.status).toBe(404);
  expect(respuesta.body.mensaje).toBe(
    'El médico no existe o se encuentra inactivo.'
  );
  }finally {
  medicoExiste = true;
}
});
test('No debe registrar un horario si la hora de inicio es igual a la hora de fin', async () => {
  const respuesta = await request(app)
    .post('/api/medicos/1/horarios')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 1,
      hora_inicio: '12:00',
      hora_fin: '12:00',
      duracion_cita: 30
    });

  expect(respuesta.status).toBe(400);
});
test('No debe registrar un horario con duración igual a cero', async () => {
  const respuesta = await request(app)
    .post('/api/medicos/1/horarios')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 1,
      hora_inicio: '08:00',
      hora_fin: '12:00',
      duracion_cita: 0
    });

  expect(respuesta.status).toBe(400);
});
test('Debe responder 409 cuando PostgreSQL detecta un conflicto de horario', async () => {
  errorInsertHorario = '23P01';

  try {
    const respuesta = await request(app)
      .post('/api/medicos/1/horarios')
      .set('Authorization', `Bearer ${tokenAdministrador}`)
      .send({
        dia_semana: 1,
        hora_inicio: '08:00',
        hora_fin: '12:00',
        duracion_cita: 30
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'El horario se cruza con otro horario registrado para este médico.'
    );
  } finally {
    errorInsertHorario = null;
  }
});

test('Debe responder 409 cuando PostgreSQL detecta un horario duplicado', async () => {
  errorInsertHorario = '23505';

  try {
    const respuesta = await request(app)
      .post('/api/medicos/1/horarios')
      .set('Authorization', `Bearer ${tokenAdministrador}`)
      .send({
        dia_semana: 1,
        hora_inicio: '08:00',
        hora_fin: '12:00',
        duracion_cita: 30
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'El horario se cruza con otro horario registrado para este médico.'
    );
  } finally {
    errorInsertHorario = null;
  }
});
test('Debe actualizar correctamente un horario médico', async () => {
  const respuesta = await request(app)
    .patch('/api/horarios/10')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 2,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      duracion_cita: 30,
      activo: true
    });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.mensaje).toBe(
    'Horario actualizado correctamente.'
  );
  expect(respuesta.body.horario.id_horario).toBe(10);
});
test('No debe actualizar un horario inexistente', async () => {
  horarioExiste = false;

  try {
    const respuesta = await request(app)
      .patch('/api/horarios/10')
      .set('Authorization', `Bearer ${tokenAdministrador}`)
      .send({
        dia_semana: 2,
        hora_inicio: '09:00',
        hora_fin: '13:00',
        duracion_cita: 30,
        activo: true
      });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.mensaje).toBe('El horario no existe.');
  } finally {
    horarioExiste = true;
  }
});
test('No debe actualizar un horario con identificador inválido', async () => {
  const respuesta = await request(app)
    .patch('/api/horarios/abc')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 2,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      duracion_cita: 30,
      activo: true
    });

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'El identificador del horario no es válido.'
  );
});
test('No debe actualizar un horario con un día de semana inválido', async () => {
  const respuesta = await request(app)
    .patch('/api/horarios/10')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 8,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      duracion_cita: 30,
      activo: true
    });

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'El día de la semana no es válido.'
  );
});
test('No debe actualizar un horario cuando la hora de inicio es igual a la hora final', async () => {
  const respuesta = await request(app)
    .patch('/api/horarios/10')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 2,
      hora_inicio: '09:00',
      hora_fin: '09:00',
      duracion_cita: 30,
      activo: true
    });

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'La hora de inicio debe ser anterior a la hora final.'
  );
});
test('No debe actualizar un horario con duración de cita inválida', async () => {
  const respuesta = await request(app)
    .patch('/api/horarios/10')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 2,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      duracion_cita: 0,
      activo: true
    });

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'La duración de la cita debe ser positiva.'
  );
});
test('No debe actualizar un horario con estado inválido', async () => {
  const respuesta = await request(app)
    .patch('/api/horarios/10')
    .set('Authorization', `Bearer ${tokenAdministrador}`)
    .send({
      dia_semana: 2,
      hora_inicio: '09:00',
      hora_fin: '13:00',
      duracion_cita: 30,
      activo: 'si'
    });

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'El estado del horario no es válido.'
  );
});
test('No debe actualizar un horario cuando existe un conflicto de horario', async () => {
  errorActualizarHorario = '23P01';

  try {
    const respuesta = await request(app)
      .patch('/api/horarios/10')
      .set('Authorization', `Bearer ${tokenAdministrador}`)
      .send({
        dia_semana: 2,
        hora_inicio: '09:00',
        hora_fin: '13:00',
        duracion_cita: 30,
        activo: true
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'El horario se cruza con otro horario activo del médico.'
    );
  } finally {
    errorActualizarHorario = null;
  }
});
test('No debe actualizar un horario cuando se viola una restricción única', async () => {
  errorActualizarHorario = '23505';

  try {
    const respuesta = await request(app)
      .patch('/api/horarios/10')
      .set('Authorization', `Bearer ${tokenAdministrador}`)
      .send({
        dia_semana: 2,
        hora_inicio: '09:00',
        hora_fin: '13:00',
        duracion_cita: 30,
        activo: true
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'El horario se cruza con otro horario activo del médico.'
    );
  } finally {
    errorActualizarHorario = null;
  }
});
test('Un paciente debe poder cancelar una cita pendiente', async () => {
  citaCancelacion = [
    {
      id_cita: 10,
      estado: 'Pendiente'
    }
  ];

  resultadoCancelacion = [
    {
      id_cita: 10,
      estado: 'Cancelada'
    }
  ];

  errorCancelacion = false;

  try {
    const respuesta = await request(app)
      .patch('/api/citas/10/cancelar')
      .set('Authorization', `Bearer ${tokenPaciente}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.mensaje).toBe(
      'Tu cita fue cancelada correctamente.'
    );
    expect(respuesta.body.cita.estado).toBe('Cancelada');
  } finally {
    citaCancelacion = [
      {
        id_cita: 10,
        estado: 'Pendiente'
      }
    ];

    resultadoCancelacion = [
      {
        id_cita: 10,
        estado: 'Cancelada'
      }
    ];

    errorCancelacion = false;
  }
});
test('No debe cancelar una cita con un identificador inválido', async () => {
  const respuesta = await request(app)
    .patch('/api/citas/abc/cancelar')
    .set('Authorization', `Bearer ${tokenPaciente}`);

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.mensaje).toBe(
    'El identificador de la cita no es válido.'
  );
});
test('No debe cancelar una cita si el paciente no tiene un ID asociado', async () => {
  const respuesta = await request(app)
    .patch('/api/citas/10/cancelar')
    .set('Authorization', `Bearer ${tokenPacienteSinId}`);

  expect(respuesta.status).toBe(403);
  expect(respuesta.body.mensaje).toBe(
    'Tu cuenta no tiene un paciente asociado.'
  );
});
test('No debe cancelar una cita que no pertenece al paciente', async () => {
  citaCancelacion = [];

  try {
    const respuesta = await request(app)
      .patch('/api/citas/10/cancelar')
      .set('Authorization', `Bearer ${tokenPaciente}`);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.mensaje).toBe(
      'No se encontró una cita asociada a tu cuenta.'
    );
  } finally {
    citaCancelacion = [
      {
        id_cita: 10,
        estado: 'Pendiente'
      }
    ];
  }
});
test('No debe cancelar una cita que ya está cancelada', async () => {
  citaCancelacion = [
    {
      id_cita: 10,
      estado: 'Cancelada'
    }
  ];

  try {
    const respuesta = await request(app)
      .patch('/api/citas/10/cancelar')
      .set('Authorization', `Bearer ${tokenPaciente}`);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'Esta cita ya está cancelada.'
    );
  } finally {
    citaCancelacion = [
      {
        id_cita: 10,
        estado: 'Pendiente'
      }
    ];
  }
});
test('No debe cancelar una cita con un estado no permitido', async () => {
  citaCancelacion = [
    {
      id_cita: 10,
      estado: 'Completada'
    }
  ];

  try {
    const respuesta = await request(app)
      .patch('/api/citas/10/cancelar')
      .set('Authorization', `Bearer ${tokenPaciente}`);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'Esta cita no se puede cancelar.'
    );
  } finally {
    citaCancelacion = [
      {
        id_cita: 10,
        estado: 'Pendiente'
      }
    ];
  }
});
test('Debe responder con error 500 si falla la cancelación de una cita', async () => {
  citaCancelacion = [
    {
      id_cita: 10,
      estado: 'Pendiente'
    }
  ];

  errorCancelacion = true;

  try {
    const respuesta = await request(app)
      .patch('/api/citas/10/cancelar')
      .set('Authorization', `Bearer ${tokenPaciente}`);

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.mensaje).toBe(
      'No fue posible cancelar la cita.'
    );
  } finally {
    errorCancelacion = false;

    citaCancelacion = [
      {
        id_cita: 10,
        estado: 'Pendiente'
      }
    ];
  }
});
});
