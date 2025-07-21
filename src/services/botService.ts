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
      // Ignorar mensajes del propio bot
      if (msg.from.is_bot) {
        return;
      }
      
      // Manejar comandos especiales
      if (msg.text && msg.text.startsWith('/')) {
        await this.handleCommand(msg.chat.id, msg.text);
        return;
      }
      
      // Procesar solo mensajes de texto que no sean comandos
      if (msg.text && !msg.text.startsWith('/')) {
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

  private async handleCommand(chatId: number, command: string): Promise<void> {
    const cmd = command.toLowerCase();
    
    switch (cmd) {
      case '/start':
        await this.bot.sendMessage(chatId, 
          '👋 ¡Hola! Soy tu bot de facturación.\n\n' +
          'Envíame los detalles de un pedido y lo procesaré automáticamente.\n\n' +
          'Ejemplo:\n' +
          'Luciana Toro\n' +
          'CC 1047382910\n' +
          'Kit 001 + Kit 009\n' +
          '311 2345678\n' +
          'luciana@gmail.com'
        );
        break;
        
      case '/help':
        await this.bot.sendMessage(chatId, 
          '📋 Comandos disponibles:\n' +
          '/start - Mensaje de bienvenida\n' +
          '/help - Esta ayuda\n\n' +
          'Para crear una factura, simplemente envía los datos del cliente y productos.'
        );
        break;
        
      default:
        await this.bot.sendMessage(chatId, 
          '❓ Comando no reconocido. Usa /help para ver los comandos disponibles.'
        );
    }
  }

  private async handleMessage(chatId: number, message: string): Promise<void> {
    try {
      // Validar que el mensaje tenga contenido útil
      if (!message || message.trim().length < 10) {
        await this.bot.sendMessage(chatId, 
          '❌ El mensaje es muy corto. Por favor envía los datos completos del pedido.'
        );
        return;
      }

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

      // Guardar los datos de la compra
      const success = await this.sheetsService.insertDataToSheet(sheetRows);

      if (!success) {
        await this.bot.sendMessage(chatId, '❌ Error al guardar los datos en Google Sheets.');
        return;
      }

      // Procesar información del cliente
      await this.processClientData(extractedData, fechaRegistro);

      const summary = this.generateSummary(extractedData, facturaId, fechaRegistro);
      await this.bot.sendMessage(chatId, `✅ ${summary}`, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error al procesar mensaje:', error);
      await this.bot.sendMessage(chatId, '❌ Error interno del servidor.');
    }
  }


  private async processClientData(extractedData: ExtractedData, fechaRegistro: string): Promise<void> {
    try {
      console.log('👤 Procesando información del cliente...');
      console.log('📧 Email extraído:', extractedData.email);
      console.log('👤 Cliente extraído:', extractedData.cliente);
  
      const email = extractedData.email;
      if (!email || email === 'No identificado' || email === 'N/A') {
        console.log('⚠️ Email no válido, saltando actualización de cliente');
        console.log('⚠️ Email recibido:', email);
        return;
      }
  
      console.log('🔍 Buscando cliente existente con email:', email);
  
      // Buscar cliente existente
      const existingClient = await this.sheetsService.getClientByEmail(email);
      
      console.log('🔍 Resultado de búsqueda:', existingClient ? 'Cliente encontrado' : 'Cliente no encontrado');
      
      if (existingClient) {
        console.log('🔄 Cliente existente encontrado, actualizando estadísticas...');
        console.log('👤 Datos del cliente existente:', existingClient);
        
        // Obtener historial de compras del cliente
        const purchaseHistory = await this.sheetsService.getClientPurchaseHistory(email);
        console.log('📊 Historial de compras obtenido:', purchaseHistory.length, 'compras');
        
        // Calcular nuevas estadísticas
        const totalCompras = purchaseHistory.length;
        const totalGastado = purchaseHistory.reduce((sum, purchase) => sum + purchase.total, 0);
        const ticketPromedio = totalCompras > 0 ? totalGastado / totalCompras : 0;
        
        // Obtener productos únicos
        const productosUnicos = new Set(purchaseHistory.map(p => p.codigo)).size;
        
        // Calcular frecuencia de compra (días promedio entre compras)
        let frecuenciaCompra = 0;
        if (purchaseHistory.length > 1) {
          const fechas = purchaseHistory.map(p => new Date(p.fecha)).sort((a, b) => a.getTime() - b.getTime());
          const diasEntreFechas: number[] = [];
          
          for (let i = 1; i < fechas.length; i++) {
            const diffTime = fechas[i].getTime() - fechas[i-1].getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            diasEntreFechas.push(diffDays);
          }
          
          frecuenciaCompra = diasEntreFechas.length > 0 
            ? Math.round(diasEntreFechas.reduce((sum, days) => sum + days, 0) / diasEntreFechas.length)
            : 0;
        }
  
        const updates = {
          numeroCompras: totalCompras,
          totalGastado: totalGastado,
          ticketPromedio: ticketPromedio,
          productosUnicos: productosUnicos,
          frecuenciaCompra: frecuenciaCompra,
          primeraCompra: existingClient.primeraCompra,
          ultimaCompra: fechaRegistro
        };
  
        console.log('📊 Actualizaciones calculadas:', updates);
  
        const updateSuccess = await this.sheetsService.updateClient(email, updates);
  
        if (updateSuccess) {
          console.log('✅ Cliente actualizado exitosamente');
        } else {
          console.log('❌ Error al actualizar cliente');
        }
  
      } else {
        console.log('➕ Cliente nuevo, agregando a la base de datos...');
        
        // Extraer cédula del mensaje si está disponible
        const cedulaMatch = extractedData.cliente.match(/CC\s*(\d+)/i);
        const cedula = cedulaMatch ? cedulaMatch[1] : '';
  
        console.log('🆔 Cédula extraída:', cedula);
  
        // Generar ID único para el cliente
        const clientId = await this.sheetsService.getNextClientId();
        console.log('🆔 ID generado para cliente:', clientId);
  
        const totalCompra = extractedData.productos.reduce((sum, p) => sum + p.total, 0);
  
        const newClient = {
          id: clientId,
          nombre: extractedData.cliente.replace(/CC\s*\d+/i, '').trim(),
          cedula: cedula,
          email: email,
          fechaCumpleanos: extractedData.fechaCumpleanos || '', // Usar la fecha extraída por Gemini
          numeroCompras: 1,
          totalGastado: totalCompra,
          ticketPromedio: totalCompra,
          productosUnicos: extractedData.productos.length,
          frecuenciaCompra: 0, // Primera compra
          primeraCompra: fechaRegistro,
          ultimaCompra: fechaRegistro
        };
  
        console.log('👤 Datos del nuevo cliente a agregar:', newClient);
  
        const addSuccess = await this.sheetsService.addNewClient(newClient);
  
        if (addSuccess) {
          console.log('✅ Nuevo cliente agregado exitosamente');
        } else {
          console.log('❌ Error al agregar nuevo cliente');
        }
      }
  
    } catch (error) {
      console.error('Error al procesar datos del cliente:', error);
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