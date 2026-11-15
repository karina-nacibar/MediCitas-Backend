const request = require('supertest');

let conflictoEsperado = 'medico';

let consultaInsertCapturada = '';

const mockSql = jest.fn(async (strings) => {
  const consulta = strings.join(' ');

  if (consulta.includes('FROM medicos')) {
    return [{ id_medico: 1, estado: 'activo' }];
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
    if (consulta.includes('id_medico =') && conflictoEsperado === 'medico') {
      return [{ id_cita: 123 }];
    }

    if (consulta.includes('id_paciente =') && conflictoEsperado === 'paciente') {
      return [{ id_cita: 456 }];
    }
  }

  if (consulta.includes('INSERT INTO citas')) {
    consultaInsertCapturada = consulta;

    return [
      {
        id_cita: 789,
        fecha: '2026-11-16',
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

describe('Pruebas de conflictos de citas', () => {
  test('No debe permitir agendar una cita cuando el médico ya tiene ocupado ese horario', async () => {
    conflictoEsperado = 'medico';

    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-16',
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
        fecha: '2026-11-16',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.mensaje).toBe(
      'Ya tienes otra cita en ese horario. Selecciona una hora diferente.'
    );
  });
  test('Debe crear una cita incluyendo el periodo_cita', async () => {
    conflictoEsperado = 'ninguno';
    consultaInsertCapturada = '';

    const respuesta = await request(app)
      .post('/api/citas')
      .set('Authorization', `Bearer ${tokenPaciente}`)
      .send({
        id_medico: 1,
        fecha: '2026-11-16',
        hora: '09:00',
        motivo: 'Consulta general'
      });

    expect(respuesta.status).toBe(201);

    expect(consultaInsertCapturada).toContain('periodo_cita');
    expect(consultaInsertCapturada).toContain('tsrange');

    expect(respuesta.body.cita).toEqual(
      expect.objectContaining({
        periodo_cita: expect.any(String)
      })
    );
  });
});
