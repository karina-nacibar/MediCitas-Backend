
  require('dotenv').config();

  const express = require('express');
  const cors = require('cors');
  const { neon } = require('@neondatabase/serverless');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');

  const app = express();

  app.use(cors());
  app.use(express.json());

  const sql = neon(process.env.DATABASE_URL);

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
    console.error(
      'ERROR AL VERIFICAR JWT:',
      error.name,
      error.message
    );

    return res.status(401).json({
      mensaje: 'Tu sesión ha expirado o el token no es válido.'
    });
}
}

function autorizarRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: 'Debes iniciar sesión para continuar.'
      });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        mensaje: 'No tienes permisos para realizar esta acción.'
      });
    }

    next();
  };
}

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

      const nombresLimpios = nombres.trim();
      const apellidosLimpios = apellidos.trim();
      const documentoLimpio = documento.trim();

      if (!/^\d{6,15}$/.test(documentoLimpio)) {
  return res.status(400).json({
    mensaje: 'El documento debe contener entre 6 y 15 números.'
  });
}
      const correoLimpio = correo.trim().toLowerCase();
      const telefonoLimpio = telefono.trim();
      const telefonoNumerico = telefonoLimpio.replace(/\s/g, '');

if (!/^\+?\d{7,15}$/.test(telefonoNumerico)) {
  return res.status(400).json({
    mensaje: 'Ingresa un teléfono válido de entre 7 y 15 números.'
  });
}

      const expresionNombre = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;

if (!expresionNombre.test(nombresLimpios)) {
  return res.status(400).json({
    mensaje: 'El nombre solo debe contener letras y espacios.'
  });
}

if (!expresionNombre.test(apellidosLimpios)) {
  return res.status(400).json({
    mensaje: 'Los apellidos solo deben contener letras y espacios.'
  });
}

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

      const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!formatoCorreo.test(correoLimpio)) {
        return res.status(400).json({
          mensaje: 'Ingresa un correo electrónico válido.'
        });
      }

      if (contrasena.length < 8) {
        return res.status(400).json({
          mensaje: 'La contraseña debe tener mínimo 8 caracteres.'
        });
      }
      const tieneSimbolo = /[!@#$%^&*(),.?":{}|<>_\-+=]/.test(contrasena);

if (!tieneSimbolo) {
  return res.status(400).json({
    mensaje: 'La contraseña debe contener al menos un símbolo.'
  });
}

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

      const contrasenaCifrada = await bcrypt.hash(contrasena, 10);

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
    id_medico: usuario.id_medico,
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

  app.get('/', (req, res) => {
    res.json({
      mensaje: 'API de MediCitas funcionando correctamente',
      estado: 'OK'
    });
  });

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

  app.get(
  '/api/especialidades',
  verificarToken,
  autorizarRoles('paciente', 'medico', 'recepcionista', 'administrador'),
  async (req, res) => {
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

  app.get(
  '/api/medicos',
  verificarToken,
  autorizarRoles('paciente', 'medico', 'recepcionista', 'administrador'),
  async (req, res) => {
    try {
      const medicos = await sql`
        SELECT
          m.id_medico,
          m.nombres,
          m.apellidos,
          m.correo,
          m.telefono,
          m.estado,
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

app.post(
  '/api/medicos',
  verificarToken,
  autorizarRoles('administrador'),
  async (req, res) => {
    try {
      const {
        nombres,
        apellidos,
        correo,
        telefono,
        id_especialidad,
        contrasena
      } = req.body

      if (
        !nombres ||
        !apellidos ||
        !correo ||
        !id_especialidad ||
        !contrasena
      ) {
        return res.status(400).json({
          mensaje: 'Completa todos los campos obligatorios.'
        })
      }

      if (contrasena.length < 8) {
        return res.status(400).json({
          mensaje: 'La contraseña debe tener mínimo 8 caracteres.'
        })
      }

      const correoNormalizado = correo.trim().toLowerCase()
      const nombresLimpios = nombres.trim()
      const apellidosLimpios = apellidos.trim()
      const especialidadId = Number(id_especialidad)

      if (!Number.isInteger(especialidadId) || especialidadId <= 0) {
        return res.status(400).json({
          mensaje: 'Selecciona una especialidad válida.'
        })
      }

      const correoExistente = await sql`
        SELECT correo
        FROM usuarios
        WHERE LOWER(correo) = ${correoNormalizado}
        LIMIT 1
      `

      if (correoExistente.length > 0) {
        return res.status(409).json({
          mensaje: 'Ya existe una cuenta con ese correo electrónico.'
        })
      }

      const especialidad = await sql`
        SELECT id_especialidad
        FROM especialidades
        WHERE id_especialidad = ${especialidadId}
      `

      if (especialidad.length === 0) {
        return res.status(400).json({
          mensaje: 'La especialidad seleccionada no existe.'
        })
      }

      const contrasenaEncriptada = await bcrypt.hash(contrasena, 10)

      const resultado = await sql`
        WITH nuevo_medico AS (
          INSERT INTO medicos (
            nombres,
            apellidos,
            correo,
            telefono,
            id_especialidad,
            estado
          )
          VALUES (
            ${nombresLimpios},
            ${apellidosLimpios},
            ${correoNormalizado},
            ${telefono?.trim() || null},
            ${especialidadId},
            'activo'
          )
          RETURNING
            id_medico,
            nombres,
            apellidos,
            correo,
            telefono,
            id_especialidad,
            estado
        ),
        nuevo_usuario AS (
          INSERT INTO usuarios (
            nombre,
            correo,
            contrasena,
            rol,
            id_medico,
            fecha_creacion
          )
          SELECT
            CONCAT(nombres, ' ', apellidos),
            correo,
            ${contrasenaEncriptada},
            'medico',
            id_medico,
            NOW()
          FROM nuevo_medico
          RETURNING id_usuario, correo, rol, id_medico
        )
        SELECT
          nuevo_medico.*,
          nuevo_usuario.id_usuario,
          nuevo_usuario.rol
        FROM nuevo_medico
        INNER JOIN nuevo_usuario
          ON nuevo_medico.id_medico = nuevo_usuario.id_medico
      `

      return res.status(201).json({
        mensaje: 'Médico registrado correctamente.',
        medico: resultado[0]
      })

    } catch (error) {
      console.error('Error al registrar médico:', error)

      if (error.code === '23505') {
        return res.status(409).json({
          mensaje: 'Ya existe un registro con ese correo electrónico.'
        })
      }

      if (error.code === '23503') {
        return res.status(400).json({
          mensaje: 'La especialidad seleccionada no es válida.'
        })
      }

      return res.status(500).json({
        mensaje: 'Error interno al registrar el médico.'
      })
    }
  }
)
 

app.post(
  '/api/recepcionistas',
  verificarToken,
  autorizarRoles('administrador'),
  async (req, res) => {
    try {
      const { nombre, correo, contrasena } = req.body;

      if (!nombre || !correo || !contrasena) {
        return res.status(400).json({
          mensaje: 'Completa todos los campos obligatorios.'
        });
      }

      const nombreLimpio = nombre.trim();
      const correoNormalizado = correo.trim().toLowerCase();

      if (nombreLimpio.length < 3) {
        return res.status(400).json({
          mensaje: 'El nombre debe tener al menos 3 caracteres.'
        });
      }

      const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!formatoCorreo.test(correoNormalizado)) {
        return res.status(400).json({
          mensaje: 'Ingresa un correo electrónico válido.'
        });
      }

      if (contrasena.length < 8) {
        return res.status(400).json({
          mensaje: 'La contraseña debe tener mínimo 8 caracteres.'
        });
      }

      const correoExistente = await sql`
        SELECT id_usuario
        FROM usuarios
        WHERE LOWER(correo) = ${correoNormalizado}
        LIMIT 1
      `;

      if (correoExistente.length > 0) {
        return res.status(409).json({
          mensaje: 'Ya existe una cuenta con ese correo electrónico.'
        });
      }

      const contrasenaEncriptada = await bcrypt.hash(contrasena, 10);

      const resultado = await sql`
        INSERT INTO usuarios (
          nombre,
          correo,
          contrasena,
          rol,
          fecha_creacion
        )
        VALUES (
          ${nombreLimpio},
          ${correoNormalizado},
          ${contrasenaEncriptada},
          'recepcionista',
          NOW()
        )
        RETURNING
          id_usuario,
          nombre,
          correo,
          rol,
          fecha_creacion
      `;

      return res.status(201).json({
        mensaje: 'Recepcionista registrado correctamente.',
        recepcionista: resultado[0]
      });

    } catch (error) {
      console.error('Error al registrar recepcionista:', error);

      if (error.code === '23505') {
        return res.status(409).json({
          mensaje: 'Ya existe una cuenta con ese correo electrónico.'
        });
      }

      return res.status(500).json({
        mensaje: 'Error interno al registrar el recepcionista.'
      });
    }
  }
);

app.post(
  '/api/pacientes',
  verificarToken,
  autorizarRoles('recepcionista', 'administrador'),
  async (req, res) => {
    try {
      const {
        nombres,
        apellidos,
        documento,
        correo,
        telefono
      } = req.body;

      // 1. Validar campos obligatorios
      if (
        !nombres ||
        !apellidos ||
        !documento ||
        !correo ||
        !telefono
      ) {
        return res.status(400).json({
          mensaje: 'Todos los campos son obligatorios.'
        });
      }

      // 2. Limpiar y normalizar información
      const nombresLimpios = nombres.trim();
      const apellidosLimpios = apellidos.trim();
      const documentoLimpio = String(documento).trim();
      const correoLimpio = correo.trim().toLowerCase();
      const telefonoLimpio = telefono.trim();

      // 3. Validar nombres y apellidos
      const expresionNombre = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;

      if (
        !expresionNombre.test(nombresLimpios) ||
        !expresionNombre.test(apellidosLimpios)
      ) {
        return res.status(400).json({
          mensaje: 'Los nombres y apellidos solo deben contener letras y espacios.'
        });
      }

      // 4. Validar documento
      if (!/^\d{6,15}$/.test(documentoLimpio)) {
        return res.status(400).json({
          mensaje: 'El documento debe contener entre 6 y 15 números.'
        });
      }

      // 5. Validar correo
      const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!formatoCorreo.test(correoLimpio)) {
        return res.status(400).json({
          mensaje: 'Ingresa un correo electrónico válido.'
        });
      }

      // 6. Validar teléfono
      const telefonoNumerico = telefonoLimpio.replace(/\s/g, '');

      if (!/^\+?\d{7,15}$/.test(telefonoNumerico)) {
        return res.status(400).json({
          mensaje: 'Ingresa un teléfono válido de entre 7 y 15 números.'
        });
      }

      // 7. Comprobar que el documento no esté registrado
      const documentoExistente = await sql`
        SELECT id_paciente
        FROM pacientes
        WHERE documento = ${documentoLimpio}
        LIMIT 1
      `;

      if (documentoExistente.length > 0) {
        return res.status(409).json({
          mensaje: 'Ya existe un paciente registrado con ese documento.'
        });
      }

      // 8. Comprobar que el correo no esté registrado
      const correoExistente = await sql`
        SELECT id_paciente
        FROM pacientes
        WHERE LOWER(correo) = ${correoLimpio}
        LIMIT 1
      `;

      if (correoExistente.length > 0) {
        return res.status(409).json({
          mensaje: 'Ya existe un paciente registrado con ese correo.'
        });
      }

      // 9. Registrar solamente al paciente
      // No se crea ningún usuario ni contraseña.
      const resultado = await sql`
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
          ${telefonoNumerico}
        )
        RETURNING
          id_paciente,
          nombres,
          apellidos,
          documento,
          correo,
          telefono
      `;

      return res.status(201).json({
        mensaje: 'Paciente registrado correctamente.',
        paciente: resultado[0]
      });

    } catch (error) {
      console.error('Error al registrar paciente:', error);

      if (error.code === '23505') {
        return res.status(409).json({
          mensaje: 'El documento o correo ya se encuentra registrado.'
        });
      }

      return res.status(500).json({
        mensaje: 'No fue posible registrar al paciente.'
      });
    }
  }
);


app.get(
  '/api/pacientes/buscar',
  verificarToken,
  autorizarRoles('recepcionista', 'administrador'),
  async (req, res) => {
    try {
      const termino = (req.query.termino || '').trim();

      if (!termino) {
        return res.status(400).json({
          mensaje: 'Debes ingresar un nombre o número de documento para buscar.'
        });
      }

      const patron = `%${termino}%`;

      const pacientes = await sql`
        SELECT
          id_paciente,
          nombres,
          apellidos,
          documento,
          correo,
          telefono
        FROM pacientes
        WHERE
          documento ILIKE ${patron}
          OR nombres ILIKE ${patron}
          OR apellidos ILIKE ${patron}
          OR CONCAT(nombres, ' ', apellidos) ILIKE ${patron}
        ORDER BY nombres ASC
      `;

      return res.status(200).json({
        mensaje: pacientes.length > 0
          ? 'Pacientes encontrados.'
          : 'No se encontraron pacientes.',
        total: pacientes.length,
        pacientes
      });

    } catch (error) {
      console.error('Error al buscar pacientes:', error);

      return res.status(500).json({
        mensaje: 'No fue posible realizar la búsqueda.'
      });
    }
  }
);


app.get(
  '/api/pacientes/perfil',
  verificarToken,
  autorizarRoles('paciente'),
  async (req, res) => {
    try {
      const idPaciente = req.usuario.id_paciente;

      if (!idPaciente) {
        return res.status(403).json({
          mensaje: 'La cuenta no tiene un paciente asociado.'
        });
      }

      const resultado = await sql`
        SELECT
          id_paciente,
          nombres,
          apellidos,
          documento,
          correo,
          telefono
        FROM pacientes
        WHERE id_paciente = ${idPaciente}
        LIMIT 1
      `;

      if (resultado.length === 0) {
        return res.status(404).json({
          mensaje: 'No se encontró el perfil del paciente.'
        });
      }

      return res.status(200).json({
        mensaje: 'Perfil consultado correctamente.',
        paciente: resultado[0]
      });

    } catch (error) {
      console.error('Error al consultar perfil:', error);

      return res.status(500).json({
        mensaje: 'No fue posible consultar el perfil.'
      });
    }
  }
);


app.patch(
  '/api/pacientes/perfil',
  verificarToken,
  autorizarRoles('paciente'),
  async (req, res) => {
    try {
      const idPaciente = req.usuario.id_paciente;
      const { nombres, apellidos, correo, telefono } = req.body;

      if (!idPaciente) {
        return res.status(403).json({
          mensaje: 'La cuenta no tiene un paciente asociado.'
        });
      }

      if (!nombres || !apellidos || !correo || !telefono) {
        return res.status(400).json({
          mensaje: 'Todos los campos son obligatorios.'
        });
      }

      const nombresLimpios = nombres.trim();
      const apellidosLimpios = apellidos.trim();
      const correoLimpio = correo.trim().toLowerCase();
      const telefonoLimpio = telefono.trim().replace(/\s/g, '');

      const expresionNombre = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
      const expresionCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (
        !expresionNombre.test(nombresLimpios) ||
        !expresionNombre.test(apellidosLimpios)
      ) {
        return res.status(400).json({
          mensaje: 'Los nombres y apellidos solo deben contener letras y espacios.'
        });
      }

      if (!expresionCorreo.test(correoLimpio)) {
        return res.status(400).json({
          mensaje: 'Ingresa un correo electrónico válido.'
        });
      }

      if (!/^\+?\d{7,15}$/.test(telefonoLimpio)) {
        return res.status(400).json({
          mensaje: 'Ingresa un teléfono válido de entre 7 y 15 números.'
        });
      }

      const correoExistente = await sql`
  SELECT id_paciente
  FROM pacientes
  WHERE LOWER(correo) = ${correoLimpio}
    AND id_paciente <> ${idPaciente}
  LIMIT 1
`;

if (correoExistente.length > 0) {
  return res.status(409).json({
    mensaje: 'Ese correo ya está registrado por otro paciente.'
  });
}


const usuarioActual = await sql`
  SELECT id_usuario
  FROM usuarios
  WHERE id_paciente = ${idPaciente}
  LIMIT 1
`;

if (usuarioActual.length === 0) {
  return res.status(404).json({
    mensaje: 'No se encontró la cuenta asociada al paciente.'
  });
}

const correoUsuarioExistente = await sql`
  SELECT id_usuario
  FROM usuarios
  WHERE LOWER(correo) = ${correoLimpio}
    AND id_usuario <> ${usuarioActual[0].id_usuario}
  LIMIT 1
`;

if (correoUsuarioExistente.length > 0) {
  return res.status(409).json({
    mensaje: 'Ese correo ya está asociado a otra cuenta.'
  });
}

const resultado = await sql`
  WITH paciente_actualizado AS (
    UPDATE pacientes
    SET
      nombres = ${nombresLimpios},
      apellidos = ${apellidosLimpios},
      correo = ${correoLimpio},
      telefono = ${telefonoLimpio}
    WHERE id_paciente = ${idPaciente}
    RETURNING
      id_paciente,
      nombres,
      apellidos,
      documento,
      correo,
      telefono
  ),
  usuario_actualizado AS (
    UPDATE usuarios
    SET correo = ${correoLimpio}
    WHERE id_usuario = ${usuarioActual[0].id_usuario}
    RETURNING id_usuario
  )
  SELECT
    id_paciente,
    nombres,
    apellidos,
    documento,
    correo,
    telefono
  FROM paciente_actualizado
`;

      if (resultado.length === 0) {
        return res.status(404).json({
          mensaje: 'No se encontró el perfil del paciente.'
        });
      }

      return res.status(200).json({
        mensaje: 'Perfil actualizado correctamente.',
        paciente: resultado[0]
      });

    } catch (error) {
      console.error('Error al actualizar perfil:', error);

      if (error.code === '23505') {
        return res.status(409).json({
          mensaje: 'Ese correo ya se encuentra registrado.'
        });
      }

      return res.status(500).json({
        mensaje: 'No fue posible actualizar el perfil.'
      });
    }
  }
);

  app.get(
  '/api/pacientes',
  verificarToken,
  autorizarRoles('recepcionista', 'administrador'),
  async (req, res) => {
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

  app.get(
    '/api/citas',
    verificarToken,
    autorizarRoles('paciente', 'medico', 'recepcionista', 'administrador'),
    async (req, res) => {
      try {
        const { rol, id_paciente, id_medico } = req.usuario;

        let citas;

        if (rol === 'paciente') {
          if (!id_paciente) {
            return res.status(403).json({
              mensaje: 'Tu cuenta no tiene un paciente asociado.'
            });
          }

          citas = await sql`
            SELECT
              c.id_cita,
              c.id_paciente,
              c.id_medico,
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
            WHERE c.id_paciente = ${id_paciente}
            ORDER BY c.fecha, c.hora
          `;

        } else if (rol === 'medico') {
          if (!id_medico) {
            return res.status(403).json({
              mensaje: 'Tu cuenta no tiene un médico asociado.'
            });
          }

          citas = await sql`
            SELECT
              c.id_cita,
              c.id_paciente,
              c.id_medico,
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
            WHERE c.id_medico = ${id_medico}
            ORDER BY c.fecha, c.hora
          `;

        } else {
          citas = await sql`
            SELECT
              c.id_cita,
              c.id_paciente,
              c.id_medico,
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
        }

        res.json(citas);

      } catch (error) {
        console.error('Error al consultar citas:', error.message);

        res.status(500).json({
          mensaje: 'No fue posible consultar las citas.'
        });
      }
    }
  );

app.patch(
  '/api/medicos/:id/estado',
  verificarToken,
  autorizarRoles('administrador'),
  async (req, res) => {
    try {
      const idMedico = Number(req.params.id);
      const { estado } = req.body;

      if (!Number.isInteger(idMedico) || idMedico <= 0) {
        return res.status(400).json({
          mensaje: 'El identificador del médico no es válido.'
        });
      }

      if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({
          mensaje: 'El estado debe ser activo o inactivo.'
        });
      }

      const medico = await sql`
        SELECT id_medico, estado
        FROM medicos
        WHERE id_medico = ${idMedico}
      `;

      if (medico.length === 0) {
        return res.status(404).json({
          mensaje: 'El médico no existe.'
        });
      }

      if (estado === 'inactivo') {
        const resultado = await sql`
          SELECT COUNT(*)::int AS cantidad
          FROM citas
          WHERE id_medico = ${idMedico}
          AND estado IN ('Pendiente', 'Confirmada')
        `;

        const citasActivas = resultado[0].cantidad;

        if (citasActivas > 0) {
          return res.status(409).json({
            mensaje:
              `No se puede desactivar este médico porque tiene ${citasActivas} cita(s) pendiente(s) o confirmada(s). Primero debes reasignarlas o resolverlas.`,
            citas_activas: citasActivas
          });
        }
      }

      const actualizado = await sql`
        UPDATE medicos
        SET estado = ${estado}
        WHERE id_medico = ${idMedico}
        RETURNING id_medico, nombres, apellidos, estado
      `;

      return res.json({
        mensaje: `Médico ${estado === 'activo' ? 'activado' : 'desactivado'} correctamente.`,
        medico: actualizado[0]
      });

    } catch (error) {
      console.error('Error al cambiar estado del médico:', error);

      return res.status(500).json({
        mensaje: 'No fue posible actualizar el estado del médico.'
      });
    }
  }
);

  const PORT = process.env.PORT || 3000;

app.post(
    '/api/citas',
    verificarToken,
    autorizarRoles('paciente', 'recepcionista'),
    async (req, res) => {
        try {
            const { id_medico, fecha, hora, motivo } = req.body;

            if (!id_medico || !fecha || !hora || !motivo) {
                return res.status(400).json({
                    mensaje: 'Todos los campos son obligatorios.'
                });
            }

            const medicoId = Number(id_medico);

            if (!Number.isInteger(medicoId) || medicoId <= 0) {
                return res.status(400).json({
                    mensaje: 'El médico seleccionado no es válido.'
                });
            }

            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                return res.status(400).json({
                    mensaje: 'La fecha no tiene un formato válido.'
                });
            }

            const fechaIngresada = new Date(`${fecha}T12:00:00-05:00`);

            if (
                Number.isNaN(fechaIngresada.getTime()) ||
                fechaIngresada.toISOString().slice(0, 10) !== fecha
            ) {
                return res.status(400).json({
                    mensaje: 'La fecha ingresada no es válida.'
                });
            }

            const hoyColombia = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());

            if (fecha < hoyColombia) {
                return res.status(400).json({
                    mensaje: 'No puedes agendar una cita en una fecha pasada.'
                });
            }
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
                return res.status(400).json({
                    mensaje: 'La hora ingresada no es válida.'
                });
            }

            if (typeof motivo !== 'string' || !motivo.trim()) {
                return res.status(400).json({
                    mensaje: 'Debes escribir el motivo de la consulta.'
                });
            }

            let id_paciente;

// Si registra un paciente, se utiliza el paciente vinculado a su cuenta.
if (req.usuario.rol === 'paciente') {
    id_paciente = req.usuario.id_paciente;

    if (!id_paciente) {
        return res.status(403).json({
            mensaje: 'Tu cuenta no está vinculada a un paciente.'
        });
    }
}

// Si registra un recepcionista, se utiliza el paciente seleccionado.
if (req.usuario.rol === 'recepcionista') {
    id_paciente = Number(req.body.id_paciente);

    if (!Number.isInteger(id_paciente) || id_paciente <= 0) {
        return res.status(400).json({
            mensaje: 'Debes seleccionar un paciente válido.'
        });
    }

    const pacienteExiste = await sql`
        SELECT id_paciente
        FROM pacientes
        WHERE id_paciente = ${id_paciente}
    `;

    if (pacienteExiste.length === 0) {
        return res.status(404).json({
            mensaje: 'El paciente seleccionado no existe.'
        });
    }
}

const medico = await sql`
    SELECT id_medico, estado
    FROM medicos
    WHERE id_medico = ${medicoId}
`;

if (medico.length === 0) {
    return res.status(404).json({
        mensaje: 'El médico seleccionado no existe.'
    });
}

if (medico[0].estado !== 'activo') {
    return res.status(409).json({
        mensaje: 'No puedes agendar una cita con este médico porque actualmente está inactivo.'
    });
}

const diaSemana = (() => {
    const dia = new Date(`${fecha}T12:00:00-05:00`).getDay();
    return dia === 0 ? 7 : dia;
})();

const [horas, minutos] = hora.split(':').map(Number);
const minutosSolicitados = horas * 60 + minutos;

const horarios = await sql`
    SELECT
        hora_inicio,
        hora_fin,
        duracion_cita
    FROM horarios_medicos
    WHERE id_medico = ${medicoId}
      AND dia_semana = ${diaSemana}
      AND activo = TRUE
`;

const horarioValido = horarios.find((h) => {
    const [horaInicio, minutoInicio] = String(h.hora_inicio)
        .slice(0, 5).split(':').map(Number);

    const [horaFin, minutoFin] = String(h.hora_fin)
        .slice(0, 5).split(':').map(Number);

    const inicio = horaInicio * 60 + minutoInicio;
    const fin = horaFin * 60 + minutoFin;
    const duracion = Number(h.duracion_cita);

    return (
        minutosSolicitados >= inicio &&
        minutosSolicitados + duracion <= fin &&
        (minutosSolicitados - inicio) % duracion === 0
    );
});

if (!horarioValido) {
    return res.status(409).json({
        mensaje: 'El médico no tiene disponibilidad para esa hora. Selecciona un horario de atención válido.'
    });
}

const duracion = Number(horarioValido.duracion_cita);

const conflicto = await sql`
    SELECT id_cita
    FROM citas
    WHERE id_medico = ${medicoId}
      AND fecha = ${fecha}
      AND estado IN ('Pendiente', 'Confirmada')
      AND hora < (
          ${hora}::time + (${duracion} * INTERVAL '1 minute')
      )
      AND (
          hora + (${duracion} * INTERVAL '1 minute')
      ) > ${hora}::time
    LIMIT 1
`;

if (conflicto.length > 0) {
    return res.status(409).json({
        mensaje: 'Ese espacio ya está ocupado. Selecciona otro horario disponible.'
    });
}

const conflictoPaciente = await sql`
    SELECT id_cita
    FROM citas
    WHERE id_paciente = ${id_paciente}
      AND fecha = ${fecha}
      AND estado IN ('Pendiente', 'Confirmada')
      AND hora < (
          ${hora}::time + (${duracion} * INTERVAL '1 minute')
      )
      AND (
          hora + (${duracion} * INTERVAL '1 minute')
      ) > ${hora}::time
    LIMIT 1
`;

if (conflictoPaciente.length > 0) {
    return res.status(409).json({
        mensaje: 'Ya tienes otra cita en ese horario. Selecciona una hora diferente.'
    });
}

            const resultado = await sql`
                INSERT INTO citas (
                    fecha,
                    hora,
                    motivo,
                    estado,
                    id_paciente,
                    id_medico
                )
                VALUES (
                    ${fecha},
                    ${hora},
                    ${motivo.trim()},
                    'Pendiente',
                    ${id_paciente},
                    ${medicoId}
                )
                RETURNING
                    id_cita,
                    fecha,
                    hora,
                    motivo,
                    estado,
                    id_paciente,
                    id_medico
            `;

            return res.status(201).json({
                mensaje: 'Cita agendada correctamente.',
                cita: resultado[0]
            });

        } catch (error) {
            console.error('Error al agendar cita:', error);

            if (error.code === '23505') {
                return res.status(409).json({
                    mensaje: 'Este médico ya tiene una cita en esa fecha y hora. Selecciona otro horario.'
                });
            }

            return res.status(500).json({
                mensaje: 'Ocurrió un error al intentar agendar la cita.'
            });
        }
    }
);


app.patch(
    '/api/citas/:id/reprogramar',
    verificarToken,
    autorizarRoles('paciente'),
    async (req, res) => {
        try {
            const idCita = Number(req.params.id);
            const { id_medico, fecha, hora } = req.body;
            const idPaciente = req.usuario.id_paciente;

            if (!Number.isInteger(idCita) || idCita <= 0) {
                return res.status(400).json({
                    mensaje: 'La cita seleccionada no es válida.'
                });
            }

            if (!idPaciente) {
                return res.status(403).json({
                    mensaje: 'Tu cuenta no está vinculada a un paciente.'
                });
            }

            if (!id_medico || !fecha || !hora) {
                return res.status(400).json({
                    mensaje: 'Debes seleccionar un médico, una fecha y una hora.'
                });
            }

            const medicoId = Number(id_medico);

            if (!Number.isInteger(medicoId) || medicoId <= 0) {
                return res.status(400).json({
                    mensaje: 'El médico seleccionado no es válido.'
                });
            }

            // Verificar que la cita pertenezca al paciente
            const citaActual = await sql`
                SELECT id_cita, id_paciente, estado, motivo
                FROM citas
                WHERE id_cita = ${idCita}
                  AND id_paciente = ${idPaciente}
            `;

            if (citaActual.length === 0) {
                return res.status(404).json({
                    mensaje: 'No se encontró la cita seleccionada.'
                });
            }

            if (!['Pendiente', 'Confirmada'].includes(citaActual[0].estado)) {
                return res.status(409).json({
                    mensaje: 'Solo puedes reprogramar citas pendientes o confirmadas.'
                });
            }

            // Validar fecha
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                return res.status(400).json({
                    mensaje: 'La fecha no tiene un formato válido.'
                });
            }

            const fechaIngresada = new Date(`${fecha}T12:00:00-05:00`);

            if (
                Number.isNaN(fechaIngresada.getTime()) ||
                fechaIngresada.toISOString().slice(0, 10) !== fecha
            ) {
                return res.status(400).json({
                    mensaje: 'La fecha ingresada no es válida.'
                });
            }

            const hoyColombia = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());

            if (fecha < hoyColombia) {
                return res.status(400).json({
                    mensaje: 'No puedes reprogramar una cita para una fecha pasada.'
                });
            }

            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
                return res.status(400).json({
                    mensaje: 'La hora ingresada no es válida.'
                });
            }

            // Verificar que el médico exista y esté activo
            const medico = await sql`
                SELECT id_medico, estado
                FROM medicos
                WHERE id_medico = ${medicoId}
            `;

            if (medico.length === 0) {
                return res.status(404).json({
                    mensaje: 'El médico seleccionado no existe.'
                });
            }

            if (medico[0].estado !== 'activo') {
                return res.status(409).json({
                    mensaje: 'No puedes seleccionar un médico inactivo.'
                });
            }

            // Determinar el día de la semana
            const diaSemana = (() => {
                const dia = new Date(`${fecha}T12:00:00-05:00`).getDay();
                return dia === 0 ? 7 : dia;
            })();

            const [horas, minutos] = hora.split(':').map(Number);
            const minutosSolicitados = horas * 60 + minutos;

            // Consultar horarios del médico
            const horarios = await sql`
                SELECT hora_inicio, hora_fin, duracion_cita
                FROM horarios_medicos
                WHERE id_medico = ${medicoId}
                  AND dia_semana = ${diaSemana}
                  AND activo = TRUE
            `;

            const horarioValido = horarios.find((h) => {
                const [horaInicio, minutoInicio] = String(h.hora_inicio)
                    .slice(0, 5).split(':').map(Number);

                const [horaFin, minutoFin] = String(h.hora_fin)
                    .slice(0, 5).split(':').map(Number);

                const inicio = horaInicio * 60 + minutoInicio;
                const fin = horaFin * 60 + minutoFin;
                const duracion = Number(h.duracion_cita);

                return (
                    minutosSolicitados >= inicio &&
                    minutosSolicitados + duracion <= fin &&
                    (minutosSolicitados - inicio) % duracion === 0
                );
            });

            if (!horarioValido) {
                return res.status(409).json({
                    mensaje: 'El médico no tiene disponibilidad para esa hora. Selecciona un horario válido.'
                });
            }

            const duracion = Number(horarioValido.duracion_cita);

            // Verificar que el médico no tenga otra cita en ese horario
            const conflictoMedico = await sql`
                SELECT id_cita
                FROM citas
                WHERE id_medico = ${medicoId}
                  AND fecha = ${fecha}
                  AND id_cita <> ${idCita}
                  AND estado IN ('Pendiente', 'Confirmada')
                  AND hora < (
                      ${hora}::time + (${duracion} * INTERVAL '1 minute')
                  )
                  AND (
                      hora + (${duracion} * INTERVAL '1 minute')
                  ) > ${hora}::time
                LIMIT 1
            `;

            if (conflictoMedico.length > 0) {
                return res.status(409).json({
                    mensaje: 'Ese horario ya está ocupado. Selecciona otro.'
                });
            }

            // Verificar que el paciente no tenga otra cita en ese horario
            const conflictoPaciente = await sql`
                SELECT id_cita
                FROM citas
                WHERE id_paciente = ${idPaciente}
                  AND fecha = ${fecha}
                  AND id_cita <> ${idCita}
                  AND estado IN ('Pendiente', 'Confirmada')
                  AND hora < (
                      ${hora}::time + (${duracion} * INTERVAL '1 minute')
                  )
                  AND (
                      hora + (${duracion} * INTERVAL '1 minute')
                  ) > ${hora}::time
                LIMIT 1
            `;

            if (conflictoPaciente.length > 0) {
                return res.status(409).json({
                    mensaje: 'Ya tienes otra cita en ese horario. Selecciona una hora diferente.'
                });
            }

            // Actualizar la cita existente
            const resultado = await sql`
                UPDATE citas
                SET
                    id_medico = ${medicoId},
                    fecha = ${fecha},
                    hora = ${hora},
                    motivo = ${citaActual[0].motivo}
                WHERE id_cita = ${idCita}
                  AND id_paciente = ${idPaciente}
                RETURNING
                    id_cita,
                    fecha,
                    hora,
                    motivo,
                    estado,
                    id_paciente,
                    id_medico
            `;

            return res.status(200).json({
                mensaje: 'Cita reprogramada correctamente.',
                cita: resultado[0]
            });

        } catch (error) {
            console.error('Error al reprogramar la cita:', error);

            return res.status(500).json({
                mensaje: 'Ocurrió un error al intentar reprogramar la cita.'
            });
        }
    }
);

app.get(
  '/api/medicos/:id/disponibilidad',
  verificarToken,
  autorizarRoles('paciente', 'recepcionista', 'administrador'),
  async (req, res) => {
    try {
      const idMedico = Number(req.params.id);
      const { fecha } = req.query;

      if (!Number.isInteger(idMedico) || idMedico <= 0) {
        return res.status(400).json({
          mensaje: 'El identificador del médico no es válido.'
        });
      }

      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return res.status(400).json({
          mensaje: 'Debes proporcionar una fecha válida.'
        });
      }

      const fechaIngresada = new Date(`${fecha}T12:00:00-05:00`);

      if (
        Number.isNaN(fechaIngresada.getTime()) ||
        fechaIngresada.toISOString().slice(0, 10) !== fecha
      ) {
        return res.status(400).json({
          mensaje: 'La fecha ingresada no es válida.'
        });
      }

      const medico = await sql`
        SELECT id_medico, estado
        FROM medicos
        WHERE id_medico = ${idMedico}
      `;

      if (medico.length === 0) {
        return res.status(404).json({
          mensaje: 'El médico no existe.'
        });
      }

      if (medico[0].estado !== 'activo') {
        return res.status(409).json({
          mensaje: 'Este médico se encuentra inactivo.'
        });
      }

      const dia = fechaIngresada.getDay();
      const diaSemana = dia === 0 ? 7 : dia;

      const horarios = await sql`
        SELECT hora_inicio, hora_fin, duracion_cita
        FROM horarios_medicos
        WHERE id_medico = ${idMedico}
          AND dia_semana = ${diaSemana}
          AND activo = TRUE
        ORDER BY hora_inicio
      `;

      if (horarios.length === 0) {
        return res.json({
          fecha,
          id_medico: idMedico,
          disponibilidad: []
        });
      }

      const citas = await sql`
        SELECT hora
        FROM citas
        WHERE id_medico = ${idMedico}
          AND fecha = ${fecha}
          AND estado IN ('Pendiente', 'Confirmada')
      `;

      const horasOcupadas = citas.map(cita =>
        String(cita.hora).slice(0, 5)
      );

      const disponibilidad = [];

      for (const horario of horarios) {
        const [hi, mi] = String(horario.hora_inicio)
          .slice(0, 5).split(':').map(Number);

        const [hf, mf] = String(horario.hora_fin)
          .slice(0, 5).split(':').map(Number);

        const inicio = hi * 60 + mi;
        const fin = hf * 60 + mf;
        const duracion = Number(horario.duracion_cita);

        for (
          let minuto = inicio;
          minuto + duracion <= fin;
          minuto += duracion
        ) {
          const h = String(Math.floor(minuto / 60)).padStart(2, '0');
          const m = String(minuto % 60).padStart(2, '0');
          const hora = `${h}:${m}`;

          if (!horasOcupadas.includes(hora)) {
            disponibilidad.push(hora);
          }
        }
      }

      return res.json({
        fecha,
        id_medico: idMedico,
        disponibilidad
      });

    } catch (error) {
      console.error('Error al consultar disponibilidad:', error);

      return res.status(500).json({
        mensaje: 'No fue posible consultar los horarios disponibles.'
      });
    }
  }
);

// ACTUALIZAR EL ESTADO DE UNA CITA
app.patch(
    '/api/citas/:id/estado',
    verificarToken,
    autorizarRoles('recepcionista', 'administrador'),
    async (req, res) => {
        try {
            const idCita = Number(req.params.id);
            const { estado } = req.body;

            if (!Number.isInteger(idCita) || idCita <= 0) {
                return res.status(400).json({
                    mensaje: 'El identificador de la cita no es válido.'
                });
            }

            if (!['Confirmada', 'Cancelada'].includes(estado)) {
                return res.status(400).json({
                    mensaje: 'El estado solicitado no es válido.'
                });
            }

            const cita = await sql`
                SELECT id_cita, estado
                FROM citas
                WHERE id_cita = ${idCita}
            `;

            if (cita.length === 0) {
                return res.status(404).json({
                    mensaje: 'La cita no existe.'
                });
            }

            if (cita[0].estado === 'Cancelada') {
                return res.status(409).json({
                    mensaje: 'No puedes modificar una cita que ya está cancelada.'
                });
            }

            if (
                cita[0].estado === 'Confirmada' &&
                estado === 'Confirmada'
            ) {
                return res.status(409).json({
                    mensaje: 'Esta cita ya está confirmada.'
                });
            }

            const resultado = await sql`
                UPDATE citas
                SET estado = ${estado}
                WHERE id_cita = ${idCita}
                RETURNING id_cita, estado
            `;

            return res.status(200).json({
                mensaje: estado === 'Confirmada'
                    ? 'Cita confirmada correctamente.'
                    : 'Cita cancelada correctamente.',
                cita: resultado[0]
            });

        } catch (error) {
            console.error('Error al actualizar el estado de la cita:', error);

            return res.status(500).json({
                mensaje: 'No fue posible actualizar el estado de la cita.'
            });
        }
    }
);

// REGISTRAR RESULTADO DE LA CONSULTA
app.patch(
    '/api/citas/:id/resultado',
    verificarToken,
    autorizarRoles('medico'),
    async (req, res) => {
        try {
            const idCita = Number(req.params.id);
            const { estado } = req.body;

            if (!Number.isInteger(idCita) || idCita <= 0) {
                return res.status(400).json({
                    mensaje: 'El identificador de la cita no es válido.'
                });
            }

            if (!['Atendida', 'No asistió'].includes(estado)) {
                return res.status(400).json({
                    mensaje: 'El resultado de la consulta no es válido.'
                });
            }

            const cita = await sql`
                SELECT id_cita, id_medico, estado
                FROM citas
                WHERE id_cita = ${idCita}
            `;

            if (cita.length === 0) {
                return res.status(404).json({
                    mensaje: 'La cita no existe.'
                });
            }

            if (Number(cita[0].id_medico) !== Number(req.usuario.id_medico)) {
                return res.status(403).json({
                    mensaje: 'No tienes permiso para modificar esta cita.'
                });
            }

            if (!['Pendiente', 'Confirmada'].includes(cita[0].estado)) {
                return res.status(409).json({
                    mensaje: 'Esta cita ya no permite registrar resultados.'
                });
            }

            const resultado = await sql`
                UPDATE citas
                SET estado = ${estado}
                WHERE id_cita = ${idCita}
                RETURNING id_cita, estado
            `;

            return res.status(200).json({
                mensaje: estado === 'Atendida'
                    ? 'Consulta registrada como atendida.'
                    : 'Consulta registrada como no asistida.',
                cita: resultado[0]
            });

        } catch (error) {
            console.error('Error al registrar el resultado:', error);

            return res.status(500).json({
                mensaje: 'No fue posible registrar el resultado de la consulta.'
            });
        }
    }
);

// CONSULTAR LOS HORARIOS DEL MÉDICO QUE INICIÓ SESIÓN
app.get(
  '/api/medico/mi-agenda',
  verificarToken,
  autorizarRoles('medico'),
  async (req, res) => {
    try {
      const idMedico = Number(req.usuario.id_medico);

      if (!Number.isInteger(idMedico) || idMedico <= 0) {
        return res.status(400).json({
          mensaje: 'No se encontró un médico asociado a esta cuenta.'
        });
      }

      const horarios = await sql`
        SELECT
          id_horario,
          id_medico,
          dia_semana,
          hora_inicio,
          hora_fin,
          duracion_cita,
          activo
        FROM horarios_medicos
        WHERE id_medico = ${idMedico}
        ORDER BY dia_semana, hora_inicio
      `;

      return res.json(horarios);

    } catch (error) {
      console.error('Error al consultar la agenda del médico:', error);

      return res.status(500).json({
        mensaje: 'No fue posible consultar tu agenda.'
      });
    }
  }
);

app.get(
  '/api/medicos/:id/horarios',
  verificarToken,
  autorizarRoles('administrador'),
  async (req, res) => {
    try {
      const idMedico = Number(req.params.id);

      if (!Number.isInteger(idMedico) || idMedico <= 0) {
        return res.status(400).json({
          mensaje: 'El identificador del médico no es válido.'
        });
      }

      const horarios = await sql`
        SELECT
          id_horario,
          id_medico,
          dia_semana,
          hora_inicio,
          hora_fin,
          duracion_cita,
          activo
        FROM horarios_medicos
        WHERE id_medico = ${idMedico}
        ORDER BY dia_semana, hora_inicio
      `;

      return res.json(horarios);

    } catch (error) {
      console.error('Error al consultar horarios:', error);

      return res.status(500).json({
        mensaje: 'No fue posible consultar los horarios del médico.'
      });
    }
  }
);

app.post(
  '/api/medicos/:id/horarios',
  verificarToken,
  autorizarRoles('administrador'),
  async (req, res) => {
    try {
      const idMedico = Number(req.params.id);

      const {
        dia_semana,
        hora_inicio,
        hora_fin,
        duracion_cita
      } = req.body;

      if (!Number.isInteger(idMedico) || idMedico <= 0) {
        return res.status(400).json({
          mensaje: 'El identificador del médico no es válido.'
        });
      }

      const dia = Number(dia_semana);
      const duracion = Number(duracion_cita);

      if (!Number.isInteger(dia) || dia < 1 || dia > 7) {
        return res.status(400).json({
          mensaje: 'El día de la semana no es válido.'
        });
      }

      const formatoHora = /^([01]\d|2[0-3]):[0-5]\d$/;

      if (
        typeof hora_inicio !== 'string' ||
        typeof hora_fin !== 'string' ||
        !formatoHora.test(hora_inicio) ||
        !formatoHora.test(hora_fin)
      ) {
        return res.status(400).json({
          mensaje: 'Debes ingresar horas válidas en formato HH:MM.'
        });
      }

      if (hora_inicio >= hora_fin) {
        return res.status(400).json({
          mensaje: 'La hora de inicio debe ser anterior a la hora de finalización.'
        });
      }

      if (!Number.isInteger(duracion) || duracion <= 0) {
        return res.status(400).json({
          mensaje: 'La duración de la cita debe ser un número positivo.'
        });
      }

      const medico = await sql`
        SELECT id_medico
        FROM medicos
        WHERE id_medico = ${idMedico}
          AND estado = 'activo'
      `;

      if (medico.length === 0) {
        return res.status(404).json({
          mensaje: 'El médico no existe o se encuentra inactivo.'
        });
      }

      const resultado = await sql`
        INSERT INTO horarios_medicos (
          id_medico,
          dia_semana,
          hora_inicio,
          hora_fin,
          duracion_cita,
          activo
        )
        VALUES (
          ${idMedico},
          ${dia},
          ${hora_inicio},
          ${hora_fin},
          ${duracion},
          TRUE
        )
        RETURNING *
      `;

      return res.status(201).json({
        mensaje: 'Horario médico registrado correctamente.',
        horario: resultado[0]
      });

    } catch (error) {
      console.error('Error al registrar horario:', error);

      if (error.code === '23P01' || error.code === '23505') {
        return res.status(409).json({
          mensaje: 'El horario se cruza con otro horario registrado para este médico.'
        });
      }

      return res.status(500).json({
        mensaje: 'No fue posible registrar el horario médico.'
      });
    }
  }
);

app.patch(
  '/api/horarios/:id',
  verificarToken,
  autorizarRoles('administrador'),
  async (req, res) => {
    try {
      const idHorario = Number(req.params.id);

      if (!Number.isInteger(idHorario) || idHorario <= 0) {
        return res.status(400).json({
          mensaje: 'El identificador del horario no es válido.'
        });
      }

      const existente = await sql`
        SELECT *
        FROM horarios_medicos
        WHERE id_horario = ${idHorario}
      `;

      if (existente.length === 0) {
        return res.status(404).json({
          mensaje: 'El horario no existe.'
        });
      }

      const actual = existente[0];

      const dia = req.body.dia_semana !== undefined
        ? Number(req.body.dia_semana)
        : Number(actual.dia_semana);

      const inicio = req.body.hora_inicio !== undefined
        ? req.body.hora_inicio
        : String(actual.hora_inicio).slice(0, 5);

      const fin = req.body.hora_fin !== undefined
        ? req.body.hora_fin
        : String(actual.hora_fin).slice(0, 5);

      const duracion = req.body.duracion_cita !== undefined
        ? Number(req.body.duracion_cita)
        : Number(actual.duracion_cita);

      const activo = req.body.activo !== undefined
        ? req.body.activo
        : actual.activo;

      if (!Number.isInteger(dia) || dia < 1 || dia > 7) {
        return res.status(400).json({
          mensaje: 'El día de la semana no es válido.'
        });
      }

      const formatoHora = /^([01]\d|2[0-3]):[0-5]\d$/;

      if (
        typeof inicio !== 'string' ||
        typeof fin !== 'string' ||
        !formatoHora.test(inicio) ||
        !formatoHora.test(fin)
      ) {
        return res.status(400).json({
          mensaje: 'Las horas ingresadas no son válidas.'
        });
      }

      if (inicio >= fin) {
        return res.status(400).json({
          mensaje: 'La hora de inicio debe ser anterior a la hora final.'
        });
      }

      if (!Number.isInteger(duracion) || duracion <= 0) {
        return res.status(400).json({
          mensaje: 'La duración de la cita debe ser positiva.'
        });
      }

      if (typeof activo !== 'boolean') {
        return res.status(400).json({
          mensaje: 'El estado del horario no es válido.'
        });
      }

      const resultado = await sql`
        UPDATE horarios_medicos
        SET
          dia_semana = ${dia},
          hora_inicio = ${inicio},
          hora_fin = ${fin},
          duracion_cita = ${duracion},
          activo = ${activo}
        WHERE id_horario = ${idHorario}
        RETURNING *
      `;

      return res.json({
        mensaje: 'Horario actualizado correctamente.',
        horario: resultado[0]
      });

    } catch (error) {
      console.error('Error al actualizar horario:', error);

      if (error.code === '23P01' || error.code === '23505') {
        return res.status(409).json({
          mensaje: 'El horario se cruza con otro horario activo del médico.'
        });
      }

      return res.status(500).json({
        mensaje: 'No fue posible actualizar el horario.'
      });
    }
  }
);


// CANCELAR UNA CITA PROPIA COMO PACIENTE
app.patch(
  '/api/citas/:id/cancelar',
  verificarToken,
  autorizarRoles('paciente'),
  async (req, res) => {
    try {
      const idCita = Number(req.params.id);
      const idPaciente = Number(req.usuario.id_paciente);

      if (!Number.isInteger(idCita) || idCita <= 0) {
        return res.status(400).json({
          mensaje: 'El identificador de la cita no es válido.'
        });
      }

      if (!Number.isInteger(idPaciente) || idPaciente <= 0) {
        return res.status(403).json({
          mensaje: 'Tu cuenta no tiene un paciente asociado.'
        });
      }

      // Buscar únicamente una cita perteneciente al paciente.
      const cita = await sql`
        SELECT id_cita, estado
        FROM citas
        WHERE id_cita = ${idCita}
          AND id_paciente = ${idPaciente}
      `;

      if (cita.length === 0) {
        return res.status(404).json({
          mensaje: 'No se encontró una cita asociada a tu cuenta.'
        });
      }

      if (cita[0].estado === 'Cancelada') {
        return res.status(409).json({
          mensaje: 'Esta cita ya está cancelada.'
        });
      }

      if (!['Pendiente', 'Confirmada'].includes(cita[0].estado)) {
        return res.status(409).json({
          mensaje: 'Esta cita no se puede cancelar.'
        });
      }

      const resultado = await sql`
        UPDATE citas
        SET estado = 'Cancelada'
        WHERE id_cita = ${idCita}
          AND id_paciente = ${idPaciente}
          AND estado IN ('Pendiente', 'Confirmada')
        RETURNING id_cita, estado
      `;

      if (resultado.length === 0) {
        return res.status(409).json({
          mensaje: 'La cita ya no se encuentra disponible para cancelar.'
        });
      }

      return res.status(200).json({
        mensaje: 'Tu cita fue cancelada correctamente.',
        cita: resultado[0]
      });

    } catch (error) {
      console.error('Error al cancelar cita:', error);

      return res.status(500).json({
        mensaje: 'No fue posible cancelar la cita.'
      });
    }
  }
);

  app.listen(PORT, () => {
    console.log(`Servidor MediCitas ejecutándose en el puerto ${PORT}`);
  });