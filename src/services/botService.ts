const TelegramBot = require('node-telegram-bot-api');
import { SheetsService } from './sheetsService';
import { GeminiService } from './geminiService';
import { ExtractedData, SheetRow } from '../types';
const fs = require('fs');

export class BotService {
  private bot: any;
  private sheetsService: SheetsService;
  private geminiService: GeminiService;
  private facturaCounter: number;
  private counterFilePath: string = './factura_counter.txt';

  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN || '', { polling: true });
    this.sheetsService = new SheetsService();
    this.geminiService = new GeminiService();
    this.facturaCounter = this.loadFacturaCounter();
    this.setupHandlers();
  }

  private loadFacturaCounter(): number {
    try {
      if (fs.existsSync(this.counterFilePath)) {
        const counterStr = fs.readFileSync(this.counterFilePath, 'utf8');
        return parseInt(counterStr) || 1;
      }
    } catch (error) {
      console.error('Error al cargar contador de facturas:', error);
    }
    return 1;
  }

  private saveFacturaCounter(): void {
    try {
      fs.writeFileSync(this.counterFilePath, this.facturaCounter.toString(), 'utf8');
    } catch (error) {
      console.error('Error al guardar contador de facturas:', error);
    }
  }

  private setupHandlers(): void {
    this.bot.on('message', async (msg: any) => {
      if (msg.text) {
        // Comando especial de status
        if (msg.text.trim() === '/status') {
          await this.handleStatusCommand(msg.chat.id);
          return;
        }
        await this.handleMessage(msg.chat.id, msg.text);
      }
    });

    this.bot.on('error', (error: any) => {
      console.error('Error en el bot de Telegram:', error);
    });
  }

  private async handleMessage(chatId: number, message: string): Promise<void> {
    try {
      console.log(`📨 Mensaje recibido: ${message}`);
      
      await this.bot.sendMessage(chatId, '📋 Procesando mensaje, por favor espera...');

      const products = await this.sheetsService.getProductsFromSheet();
      
      if (products.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Error: No se pudieron cargar los productos de referencia.');
        return;
      }

      console.log(`📦 Productos cargados: ${products.length}`);

      const extractedData = await this.geminiService.extractDataFromMessage(message, products);
      
      if (!extractedData) {
        await this.bot.sendMessage(chatId, '❌ Error: No se pudo extraer la información del mensaje.');
        return;
      }

      console.log('🔍 Datos extraídos:', extractedData);

      const fechaRegistro = this.generateCurrentDate();
      const facturaId = this.generateSimpleFacturaId();

      const sheetRows: SheetRow[] = extractedData.productos.map(producto => ({
        codigo: producto.codigo,
        articulo: producto.articulo,
        cantidad: producto.cantidad,
        precioSinIva: producto.precioSinIva,
        total: producto.total,
        factura: facturaId,
        fecha: fechaRegistro,
        cliente: extractedData.cliente,
        telefono: extractedData.telefono,
        email: extractedData.email,
      }));

      const success = await this.sheetsService.insertDataToSheet(sheetRows);

      if (success) {
        const summary = this.generateSummary(extractedData, facturaId, fechaRegistro);
        await this.bot.sendMessage(chatId, `✅ ${summary}`, { parse_mode: 'Markdown' });
      } else {
        await this.bot.sendMessage(chatId, '❌ Error al guardar los datos en Google Sheets.');
      }

    } catch (error) {
      console.error('Error al procesar mensaje:', error);
      await this.bot.sendMessage(chatId, '❌ Error interno del servidor.');
    }
  }

  // Nuevo método para manejar el comando /status
  private async handleStatusCommand(chatId: number): Promise<void> {
    let statusMsg = '🔎 *Estado de conexión a Google Sheets:*\n\n';
    // Verificar Products Sheet
    try {
      const products = await this.sheetsService.getProductsFromSheet();
      if (products.length > 0) {
        statusMsg += '✅ Conexión exitosa a PRODUCTS_SHEET_ID. Productos encontrados: ' + products.length + '\n';
      } else {
        statusMsg += '⚠️ Conexión a PRODUCTS_SHEET_ID realizada, pero no se encontraron productos o la hoja está vacía.\n';
      }
    } catch (error: any) {
      statusMsg += '❌ Error en PRODUCTS_SHEET_ID: ' + (error.message || error.toString()) + '\n';
    }
    // Verificar Destination Sheet (intentando insertar una fila de prueba y borrarla sería lo ideal, pero aquí solo probamos acceso)
    try {
      // Intentar leer encabezados para verificar acceso
      const DESTINATION_SHEET_ID = process.env.DESTINATION_SHEET_ID;
      const response = await this.sheetsService["sheets"].spreadsheets.values.get({
        spreadsheetId: DESTINATION_SHEET_ID,
        range: 'A1:J1',
      });
      if (response.data && response.data.values) {
        statusMsg += '✅ Conexión exitosa a DESTINATION_SHEET_ID.\n';
      } else {
        statusMsg += '⚠️ Conexión a DESTINATION_SHEET_ID realizada, pero no se obtuvieron datos.\n';
      }
    } catch (error: any) {
      statusMsg += '❌ Error en DESTINATION_SHEET_ID: ' + (error.message || error.toString()) + '\n';
    }
    await this.bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' });
  }

  private generateCurrentDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private generateSimpleFacturaId(): string {
    const facturaNumber = String(this.facturaCounter).padStart(5, '0');
    this.facturaCounter++;
    this.saveFacturaCounter();
    return `WKY${facturaNumber}`;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  private generateSummary(data: ExtractedData, facturaId: string, fechaRegistro: string): string {
    let summary = `*Datos procesados exitosamente:*\n\n`;
    summary += `*📋 Resumen del registro:*\n\n`;
    summary += `🧾 *Factura:* ${facturaId}\n`;
    summary += `📅 *Fecha de registro:* ${fechaRegistro}\n`;
    summary += `👤 *Cliente:* ${data.cliente}\n`;
    summary += `📞 *Teléfono:* ${data.telefono}\n`;
    summary += `📧 *Email:* ${data.email}\n\n`;
    summary += `🛒 *Productos:*\n`;
    
    data.productos.forEach((producto, index) => {
      summary += `${index + 1}. *${producto.articulo}*\n`;
      summary += `   • Código: \`${producto.codigo}\`\n`;
      summary += `   • Cantidad: ${producto.cantidad}\n`;
      summary += `   • Precio sin IVA: ${this.formatCurrency(producto.precioSinIva)}\n`;
      summary += `   • Total: ${this.formatCurrency(producto.total)}\n\n`;
    });

    const totalGeneral = data.productos.reduce((sum, p) => sum + p.total, 0);
    summary += `💰 *Total general:* ${this.formatCurrency(totalGeneral)}`;

    return summary;
  }

  public start(): void {
    console.log('🤖 Bot de Telegram iniciado y esperando mensajes...');
    console.log('📱 Envía cualquier mensaje al bot para procesarlo');
  }
}