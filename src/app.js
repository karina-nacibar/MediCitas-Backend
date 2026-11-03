
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

// ========================================
// AUTORIZAR ACCESO SEGÚN EL ROL
// ========================================
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

  // ========================================
  // CONSULTAR MÉDICOS CON SU ESPECIALIDAD
  // ========================================
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

  // REGISTRAR MÉDICO (SOLO ADMINISTRADOR)
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

      // Validar campos obligatorios
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

      // Verificar si el correo ya existe
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

      // Verificar que la especialidad exista
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

      // Encriptar contraseña
      const contrasenaEncriptada = await bcrypt.hash(contrasena, 10)

      // Crear médico y usuario en una sola operación
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
 
  // ========================================
  // CONSULTAR PACIENTES
  // ========================================
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

  // ========================================
  // CONSULTAR CITAS CON PACIENTE Y MÉDICO
  // ========================================
  // ========================================
// CONSULTAR CITAS DEL PACIENTE AUTENTICADO
// ========================================

  // ========================================
  // CONSULTAR CITAS SEGÚN EL ROL
  // ========================================
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

  
// ==========================================
// ACTIVAR O DESACTIVAR MÉDICOS
// ==========================================
app.patch(
  '/api/medicos/:id/estado',
  verificarToken,
  autorizarRoles('administrador'),
  async (req, res) => {
    try {
      const idMedico = Number(req.params.id);
      const { estado } = req.body;

      // Validar identificador
      if (!Number.isInteger(idMedico) || idMedico <= 0) {
        return res.status(400).json({
          mensaje: 'El identificador del médico no es válido.'
        });
      }

      // Validar estado solicitado
      if (!['activo', 'inactivo'].includes(estado)) {
        return res.status(400).json({
          mensaje: 'El estado debe ser activo o inactivo.'
        });
      }

      // Verificar que el médico exista
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

      // Si se solicita desactivar, verificar sus citas
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

      // Actualizar estado
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


  // ========================================
  // INICIAR SERVIDOR
  // ========================================
  const PORT = process.env.PORT || 3000;

// ==========================================
// AGENDAR UNA CITA MÉDICA
// ==========================================
app.post(
    '/api/citas',
    verificarToken,
    autorizarRoles('paciente'),
    async (req, res) => {
        try {
            const { id_medico, fecha, hora, motivo } = req.body;

            // Validar campos obligatorios
            if (!id_medico || !fecha || !hora || !motivo) {
                return res.status(400).json({
                    mensaje: 'Todos los campos son obligatorios.'
                });
            }

            // Validar identificador del médico
            const medicoId = Number(id_medico);

            if (!Number.isInteger(medicoId) || medicoId <= 0) {
                return res.status(400).json({
                    mensaje: 'El médico seleccionado no es válido.'
                });
            }

            // Validar formato de fecha
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                return res.status(400).json({
                    mensaje: 'La fecha no tiene un formato válido.'
                });
            }

            // Validar que la fecha exista y no sea anterior a hoy en Colombia
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

            // Validar formato de hora
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
                return res.status(400).json({
                    mensaje: 'La hora ingresada no es válida.'
                });
            }

            // Validar motivo
            if (typeof motivo !== 'string' || !motivo.trim()) {
                return res.status(400).json({
                    mensaje: 'Debes escribir el motivo de la consulta.'
                });
            }

            // Obtener el paciente desde el token, no desde el formulario
            const id_paciente = req.usuario.id_paciente;

            if (!id_paciente) {
                return res.status(403).json({
                    mensaje: 'Tu cuenta no está vinculada a un paciente.'
                });
            }


// Comprobar que el médico exista y esté activo
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


// ==========================================
// VALIDAR DISPONIBILIDAD SEGÚN EL HORARIO
// ==========================================

// Obtener el día de la semana de la fecha solicitada
// 1 = lunes, 2 = martes ... 7 = domingo
const diaSemana = (() => {
    const dia = new Date(`${fecha}T12:00:00-05:00`).getDay();
    return dia === 0 ? 7 : dia;
})();

// Convertir la hora solicitada a minutos
const [horas, minutos] = hora.split(':').map(Number);
const minutosSolicitados = horas * 60 + minutos;

// Consultar los horarios activos del médico para ese día
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

// Buscar un horario que permita atender la cita completa
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

// Comprobar que no exista otra cita que se cruce con el espacio solicitado
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



            // Registrar la cita
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

            // Horario ocupado: restricción única de Neon
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


// ==========================================
// CONSULTAR HORARIOS DISPONIBLES DE UN MÉDICO
// ==========================================
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


// ==========================================
// GESTIÓN DE HORARIOS MÉDICOS
// ==========================================

// CONSULTAR HORARIOS DE UN MÉDICO (ADMINISTRADOR)
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


// REGISTRAR HORARIO DE UN MÉDICO (ADMINISTRADOR)
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


// ==========================================
// EDITAR HORARIO MÉDICO (ADMINISTRADOR)
// ==========================================

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

  app.listen(PORT, () => {
    console.log(`Servidor MediCitas ejecutándose en el puerto ${PORT}`);
  });
