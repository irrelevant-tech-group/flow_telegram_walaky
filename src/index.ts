const dotenv = require('dotenv');
const fs = require('fs');
import { BotService } from './services/botService';

dotenv.config();

const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'GEMINI_API_KEY',
  'PRODUCTS_SHEET_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

console.log('🔍 Verificando configuración...');

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Variable de entorno requerida no encontrada: ${envVar}`);
    process.exit(1);
  }
}

if (!fs.existsSync('./creds.json')) {
  console.error('❌ Archivo de credenciales no encontrado: ./creds.json');
  console.error('💡 Asegúrate de tener el archivo creds.json en la raíz del proyecto');
  process.exit(1);
}

console.log('✅ Configuración verificada correctamente');

const botService = new BotService();
botService.start();

process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo el bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Deteniendo el bot...');
  process.exit(0);
});