
require('dotenv').config();

const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en el archivo .env');
  process.exit(1);
}

async function crearUsuarioPrueba() {
  const sql = neon(process.env.DATABASE_URL);

  // Datos de prueba: puedes cambiarlos por otros.
  const nombre = 'Usuario de Prueba';
  const correo = 'prueba@medicitas.com';
  const contrasena = 'MediCitas2026*';

  try {
    const existente = await sql`
      SELECT id_usuario
      FROM usuarios
      WHERE correo = ${correo}
      LIMIT 1
    `;

    if (existente.length > 0) {
      console.log('Ya existe un usuario con ese correo.');
      return;
    }

    const hash = await bcrypt.hash(contrasena, 12);

    await sql`
      INSERT INTO usuarios (
        nombre,
        correo,
        contrasena,
        rol
      )
      VALUES (
        ${nombre},
        ${correo},
        ${hash},
        'paciente'
      )
    `;

    console.log('Usuario de prueba creado correctamente.');
    console.log('Correo:', correo);
    console.log('Contraseña:', contrasena);
    console.log('Rol: paciente');
  } catch (error) {
    console.error('No se pudo crear el usuario:', error.message);
    process.exitCode = 1;
  }
}

crearUsuarioPrueba();
