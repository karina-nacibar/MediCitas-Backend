
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

// Configuración de Express
app.use(cors());
app.use(express.json());

// Conexión con Neon PostgreSQL
const sql = neon(process.env.DATABASE_URL);
// ========================================
// INICIAR SESIÓN
// ========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    // Validar los datos recibidos
    if (!correo || !contrasena) {
      return res.status(400).json({
        mensaje: 'Debes ingresar el correo y la contraseña.'
      });
    }

    // Buscar el usuario por su correo
    const resultado = await sql`
      SELECT
        id_usuario,
        nombre,
        correo,
        contrasena,
        rol,
        id_paciente,
        id_medico
      FROM usuarios
      WHERE correo = ${correo.trim().toLowerCase()}
      LIMIT 1
    `;

    if (resultado.length === 0) {
      return res.status(401).json({
        mensaje: 'Correo o contraseña incorrectos.'
      });
    }

    const usuario = resultado[0];

    // Verificar la contraseña cifrada
    const contrasenaValida = await bcrypt.compare(
      contrasena,
      usuario.contrasena
    );

    if (!contrasenaValida) {
      return res.status(401).json({
        mensaje: 'Correo o contraseña incorrectos.'
      });
    }

    // Comprobar que exista la clave privada del token
    if (!process.env.JWT_SECRET) {
      console.error('Falta configurar JWT_SECRET en el archivo .env');

      return res.status(500).json({
        mensaje: 'El servicio de autenticación no está configurado.'
      });
    }

    // Generar el token de autenticación
    const token = jwt.sign(
      {
        id_usuario: usuario.id_usuario,
        rol: usuario.rol
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '2h'
      }
    );

    // Responder sin enviar la contraseña
    return res.json({
      mensaje: 'Inicio de sesión exitoso.',
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        id_paciente: usuario.id_paciente,
        id_medico: usuario.id_medico
      }
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error.message);

    return res.status(500).json({
      mensaje: 'Ocurrió un error al iniciar sesión.'
    });
  }
});
// ========================================
// RUTA PRINCIPAL
// ========================================
app.get('/', (req, res) => {
  res.json({
    mensaje: 'API de MediCitas funcionando correctamente',
    estado: 'OK'
  });
});

// ========================================
// VERIFICAR CONEXIÓN CON POSTGRESQL
// ========================================
app.get('/api/conexion', async (req, res) => {
  try {
    const resultado = await sql`SELECT version()`;

    res.json({
      mensaje: 'Conexión con PostgreSQL exitosa',
      version: resultado[0].version
    });
  } catch (error) {
    console.error('Error al consultar PostgreSQL:', error.message);

    res.status(500).json({
      mensaje: 'No fue posible conectar con la base de datos'
    });
  }
});

// ========================================
// CONSULTAR ESPECIALIDADES
// ========================================
app.get('/api/especialidades', async (req, res) => {
  try {
    const especialidades = await sql`
      SELECT *
      FROM especialidades
      ORDER BY id_especialidad
    `;

    res.json(especialidades);
  } catch (error) {
    console.error('Error al consultar especialidades:', error.message);

    res.status(500).json({
      mensaje: 'No fue posible consultar las especialidades'
    });
  }
});

// ========================================
// CONSULTAR MÉDICOS CON SU ESPECIALIDAD
// ========================================
app.get('/api/medicos', async (req, res) => {
  try {
    const medicos = await sql`
      SELECT
        m.id_medico,
        m.nombres,
        m.apellidos,
        m.correo,
        m.telefono,
        e.nombre AS especialidad
      FROM medicos m
      INNER JOIN especialidades e
        ON m.id_especialidad = e.id_especialidad
      ORDER BY m.id_medico
    `;

    res.json(medicos);
  } catch (error) {
    console.error('Error al consultar médicos:', error.message);

    res.status(500).json({
      mensaje: 'No fue posible consultar los médicos'
    });
  }
});

// ========================================
// CONSULTAR PACIENTES
// ========================================
app.get('/api/pacientes', async (req, res) => {
  try {
    const pacientes = await sql`
      SELECT
        id_paciente,
        nombres,
        apellidos,
        documento,
        correo,
        telefono
      FROM pacientes
      ORDER BY id_paciente
    `;

    res.json(pacientes);
  } catch (error) {
    console.error('Error al consultar pacientes:', error.message);

    res.status(500).json({
      mensaje: 'No fue posible consultar los pacientes'
    });
  }
});

// ========================================
// CONSULTAR CITAS CON PACIENTE Y MÉDICO
// ========================================
app.get('/api/citas', async (req, res) => {
  try {
    const citas = await sql`
      SELECT
        c.id_cita,
        c.fecha,
        c.hora,
        c.motivo,
        c.estado,
        p.nombres AS nombres_paciente,
        p.apellidos AS apellidos_paciente,
        m.nombres AS nombres_medico,
        m.apellidos AS apellidos_medico,
        e.nombre AS especialidad
      FROM citas c
      INNER JOIN pacientes p
        ON c.id_paciente = p.id_paciente
      INNER JOIN medicos m
        ON c.id_medico = m.id_medico
      INNER JOIN especialidades e
        ON m.id_especialidad = e.id_especialidad
      ORDER BY c.fecha, c.hora
    `;

    res.json(citas);
  } catch (error) {
    console.error('Error al consultar citas:', error.message);

    res.status(500).json({
      mensaje: 'No fue posible consultar las citas'
    });
  }
});

// ========================================
// INICIAR SERVIDOR
// ========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor MediCitas ejecutándose en el puerto ${PORT}`);
});
