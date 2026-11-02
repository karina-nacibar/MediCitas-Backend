
  require('dotenv').config();

  const express = require('express');
  const cors = require('cors');
  const { neon } = require('@neondatabase/serverless');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');

  const app = express();

  // ========================================
  // CONFIGURACIÓN GENERAL
  // ========================================
  app.use(cors());
  app.use(express.json());

  const sql = neon(process.env.DATABASE_URL);

  // ========================================
// VERIFICAR TOKEN DE AUTENTICACIÓN
// ========================================
function verificarToken(req, res, next) {
  const encabezado = req.headers.authorization;

  if (!encabezado || !encabezado.startsWith('Bearer ')) {
    return res.status(401).json({
      mensaje: 'Debes iniciar sesión para acceder a esta información.'
    });
  }

  const token = encabezado.split(' ')[1];

  try {
    const datosUsuario = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.usuario = datosUsuario;

    next();

  } catch (error) {
    return res.status(401).json({
      mensaje: 'Tu sesión ha expirado o el token no es válido.'
    });
  }
}
  // ========================================
  // REGISTRAR PACIENTE
  // ========================================
  app.post('/api/auth/registro', async (req, res) => {
    try {
      const {
        nombres,
        apellidos,
        documento,
        correo,
        telefono,
        contrasena
      } = req.body;

      // Validar campos obligatorios
      if (
        !nombres ||
        !apellidos ||
        !documento ||
        !correo ||
        !telefono ||
        !contrasena
      ) {
        return res.status(400).json({
          mensaje: 'Todos los campos son obligatorios.'
        });
      }

      // Limpiar y normalizar los datos
      const nombresLimpios = nombres.trim();
      const apellidosLimpios = apellidos.trim();
      const documentoLimpio = documento.trim();
      const correoLimpio = correo.trim().toLowerCase();
      const telefonoLimpio = telefono.trim();

      // Validar que los campos no estén vacíos
      if (
        !nombresLimpios ||
        !apellidosLimpios ||
        !documentoLimpio ||
        !correoLimpio ||
        !telefonoLimpio
      ) {
        return res.status(400).json({
          mensaje: 'Debes completar correctamente todos los campos.'
        });
      }

      // Validar formato del correo
      const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!formatoCorreo.test(correoLimpio)) {
        return res.status(400).json({
          mensaje: 'Ingresa un correo electrónico válido.'
        });
      }

      // Validar longitud de contraseña
      if (contrasena.length < 8) {
        return res.status(400).json({
          mensaje: 'La contraseña debe tener mínimo 8 caracteres.'
        });
      }

      // Comprobar si ya existe el correo o documento
      const existentes = await sql`
        SELECT
          EXISTS (
            SELECT 1
            FROM pacientes
            WHERE correo = ${correoLimpio}
          ) AS correo_paciente,

          EXISTS (
            SELECT 1
            FROM usuarios
            WHERE correo = ${correoLimpio}
          ) AS correo_usuario,

          EXISTS (
            SELECT 1
            FROM pacientes
            WHERE documento = ${documentoLimpio}
          ) AS documento_existente
      `;

      if (
        existentes[0].correo_paciente ||
        existentes[0].correo_usuario
      ) {
        return res.status(409).json({
          mensaje: 'Este correo electrónico ya está registrado.'
        });
      }

      if (existentes[0].documento_existente) {
        return res.status(409).json({
          mensaje: 'Este documento ya está registrado.'
        });
      }

      // Cifrar la contraseña
      const contrasenaCifrada = await bcrypt.hash(contrasena, 10);

      // Crear paciente y usuario en una sola operación SQL
      // Si falla alguna inserción, no se completa la operación.
      const resultado = await sql`
        WITH nuevo_paciente AS (
          INSERT INTO pacientes (
            nombres,
            apellidos,
            documento,
            correo,
            telefono
          )
          VALUES (
            ${nombresLimpios},
            ${apellidosLimpios},
            ${documentoLimpio},
            ${correoLimpio},
            ${telefonoLimpio}
          )
          RETURNING
            id_paciente,
            nombres,
            apellidos,
            correo
        )
        INSERT INTO usuarios (
          nombre,
          correo,
          contrasena,
          rol,
          id_paciente
        )
        SELECT
          CONCAT_WS(' ', nombres, apellidos),
          correo,
          ${contrasenaCifrada},
          'paciente',
          id_paciente
        FROM nuevo_paciente
        RETURNING
          id_usuario,
          nombre,
          correo,
          rol,
          id_paciente
      `;

      return res.status(201).json({
        mensaje: 'Cuenta de paciente creada exitosamente.',
        usuario: resultado[0]
      });

    } catch (error) {
      console.error('Error al registrar paciente:', error.message);

      // Manejar posibles duplicados por solicitudes simultáneas
      if (error.code === '23505') {
        return res.status(409).json({
          mensaje: 'El correo o documento ya se encuentra registrado.'
        });
      }

      return res.status(500).json({
        mensaje: 'Ocurrió un error al crear la cuenta.'
      });
    }
  });

  // ========================================
  // INICIAR SESIÓN
  // ========================================
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { correo, contrasena } = req.body;

      if (!correo || !contrasena) {
        return res.status(400).json({
          mensaje: 'Debes ingresar el correo y la contraseña.'
        });
      }

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

      const contrasenaValida = await bcrypt.compare(
        contrasena,
        usuario.contrasena
      );

      if (!contrasenaValida) {
        return res.status(401).json({
          mensaje: 'Correo o contraseña incorrectos.'
        });
      }

      if (!process.env.JWT_SECRET) {
        console.error('Falta configurar JWT_SECRET.');

        return res.status(500).json({
          mensaje: 'El servicio de autenticación no está configurado.'
        });
      }

const token = jwt.sign(
  {
    id_usuario: usuario.id_usuario,
    id_paciente: usuario.id_paciente,
    rol: usuario.rol
  },
  process.env.JWT_SECRET,
  {
    expiresIn: '2h'
  }
);

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
  // ========================================
// CONSULTAR CITAS DEL PACIENTE AUTENTICADO
// ========================================
app.get('/api/citas', verificarToken, async (req, res) => {
  try {
    // Verificar que el usuario tenga un paciente asociado
    if (!req.usuario.id_paciente || req.usuario.rol !== 'paciente') {
      return res.status(403).json({
        mensaje: 'No tienes permisos para consultar estas citas.'
      });
    }

    const idPaciente = req.usuario.id_paciente;

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
      WHERE c.id_paciente = ${idPaciente}
      ORDER BY c.fecha, c.hora
    `;

    res.json(citas);

  } catch (error) {
    console.error('Error al consultar citas:', error.message);

    res.status(500).json({
      mensaje: 'No fue posible consultar tus citas.'
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
