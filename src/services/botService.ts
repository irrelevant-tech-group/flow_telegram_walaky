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