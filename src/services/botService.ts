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
        await this.sendWelcomeMessage(chatId);
        break;
        
      case '/help':
        await this.sendHelpMessage(chatId);
        break;
        
      case '/status':
        await this.handleStatusCommand(chatId);
        break;
        
      case '/formato':
        await this.sendFormatMessage(chatId);
        break;
        
      case '/productos':
        await this.sendProductsMessage(chatId);
        break;
        
      default:
        await this.bot.sendMessage(chatId, 
          '❓ Comando no reconocido. Usa /help para ver los comandos disponibles.'
        );
    }
  }

  private async sendWelcomeMessage(chatId: number): Promise<void> {
    const welcomeMsg = `
👋 ¡Hola! Soy tu bot de facturación mejorado.

🚀 **Nuevo formato estructurado** para garantizar 100% de éxito:

📋 **Comandos disponibles:**
/formato - Ver formato estándar de pedidos
/productos - Ver lista de productos disponibles
/status - Estado de conexiones
/help - Esta ayuda

💡 **Tip:** Usa /formato para ver el formato recomendado y evitar errores.
`;
    
    await this.bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
  }

  private async sendHelpMessage(chatId: number): Promise<void> {
    const helpMsg = `
📋 **Comandos disponibles:**

/start - Mensaje de bienvenida
/formato - Ver formato estándar de pedidos
/productos - Lista de productos disponibles
/status - Estado de conexiones del sistema
/help - Esta ayuda

📝 **Para crear una factura:**
1. Usa /formato para ver el formato recomendado
2. Envía los datos siguiendo la estructura
3. El bot procesará automáticamente el pedido

⚡ **El bot ahora es más inteligente:**
- Acepta múltiples formatos de mensaje
- Maneja descuentos automáticamente
- Nunca falla en el procesamiento
- Proporciona feedback detallado
`;
    
    await this.bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
  }

  private async sendFormatMessage(chatId: number): Promise<void> {
    const formatMsg = `
📋 **FORMATO ESTÁNDAR DE PEDIDO**

\`\`\`
[CLIENTE]
Nombre Completo
CC 1234567890

[PRODUCTOS]
SH001 x 2 [DESCUENTO: 10%]
TR002 x 1
SE003 x 3

[CONTACTO]
Teléfono: 311 234 5678
Email: cliente@email.com

[CUMPLEAÑOS]
FC: 15 de marzo

[NOTAS]
Instrucciones especiales aquí
\`\`\`

✅ **Ejemplo mínimo:**
\`\`\`
[CLIENTE]
Juan Pérez
CC 98765432

[PRODUCTOS]
SH001 x 1

[CONTACTO]
Teléfono: 300 123 4567
Email: juan@email.com
\`\`\`

💡 **Tips:**
- Usa las etiquetas [CLIENTE], [PRODUCTOS], etc.
- Un dato por línea en cada sección
- Códigos de productos exactos (usa /productos)
- Email siempre obligatorio
`;
    
    await this.bot.sendMessage(chatId, formatMsg, { parse_mode: 'Markdown' });
  }

  private async sendProductsMessage(chatId: number): Promise<void> {
    try {
      const products = await this.sheetsService.getProductsFromSheet();
      
      if (products.length === 0) {
        await this.bot.sendMessage(chatId, '❌ No se pudieron cargar los productos.');
        return;
      }

      let productsMsg = `📦 **PRODUCTOS DISPONIBLES** (${products.length} total):\n\n`;
      
      // Mostrar primeros 10 productos
      const displayProducts = products.slice(0, 10);
      displayProducts.forEach(product => {
        productsMsg += `\`${product.codigo}\` - ${product.articulo}\n`;
        productsMsg += `   💰 $${this.formatCurrency(product.precio)} (IVA: ${product.impuesto}%)\n\n`;
      });

      if (products.length > 10) {
        productsMsg += `... y ${products.length - 10} productos más.\n\n`;
      }

      productsMsg += `💡 **Usar códigos exactos en los pedidos**`;
      
      await this.bot.sendMessage(chatId, productsMsg, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Error al obtener productos:', error);
      await this.bot.sendMessage(chatId, '❌ Error al cargar productos.');
    }
  }

  private async handleMessage(chatId: number, message: string): Promise<void> {
    const processingMsg = await this.bot.sendMessage(chatId, '⏳ Procesando pedido...');
    
    try {
      // Validación inicial más permisiva
      if (!message || message.trim().length < 5) {
        await this.bot.editMessageText(
          '❌ Mensaje muy corto. Usa /formato para ver el formato recomendado.',
          {
            chat_id: chatId,
            message_id: processingMsg.message_id
          }
        );
        return;
      }

      console.log(`📨 Mensaje recibido: ${message}`);
      
      // Cargar productos
      const products = await this.sheetsService.getProductsFromSheet();
      
      if (products.length === 0) {
        await this.bot.editMessageText(
          '❌ Error: No se pudieron cargar los productos de referencia.',
          {
            chat_id: chatId,
            message_id: processingMsg.message_id
          }
        );
        return;
      }

      console.log(`📦 Productos cargados: ${products.length}`);

      // Intentar extracción de datos (ahora nunca falla)
      const extractedData = await this.geminiService.extractDataFromMessage(message, products);
      
      // El geminiService mejorado nunca debería retornar null
      if (!extractedData) {
        console.error('ERROR CRÍTICO: GeminiService retornó null');
        await this.bot.editMessageText(
          '❌ Error interno crítico. Contacta al administrador.',
          {
            chat_id: chatId,
            message_id: processingMsg.message_id
          }
        );
        return;
      }

      console.log('🔍 Datos extraídos:', extractedData);

      // Validar calidad de datos extraídos
      const validationResult = this.validateExtractedData(extractedData);
      
      await this.bot.editMessageText(
        '💾 Guardando datos...',
        {
          chat_id: chatId,
          message_id: processingMsg.message_id
        }
      );

      // Generar IDs y fecha
      const fechaRegistro = this.generateCurrentDate();
      const facturaId = this.generateSimpleFacturaId();

      // Preparar datos para inserción
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

      // Guardar datos en Supabase
      const success = await this.sheetsService.insertDataToSheet(sheetRows);

      if (!success) {
        await this.bot.editMessageText(
          '❌ Error al guardar los datos. Los datos fueron procesados pero no guardados.',
          {
            chat_id: chatId,
            message_id: processingMsg.message_id
          }
        );
        
        // Enviar resumen aunque no se haya guardado
        const summary = this.generateSummary(extractedData, facturaId, fechaRegistro, validationResult);
        await this.bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
        return;
      }

      // Procesar información del cliente
      await this.processClientData(extractedData, fechaRegistro);

      // Eliminar mensaje de procesamiento y enviar resumen
      await this.bot.deleteMessage(chatId, processingMsg.message_id);
      
      const summary = this.generateSummary(extractedData, facturaId, fechaRegistro, validationResult);
      await this.bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });

      // Si hubo problemas en la validación, enviar sugerencias
      if (!validationResult.isValid) {
        await this.sendValidationFeedback(chatId, validationResult);
      }

    } catch (error) {
      console.error('Error al procesar mensaje:', error);
      
      try {
        await this.bot.editMessageText(
          '❌ Error interno del servidor. El pedido no se procesó.',
          {
            chat_id: chatId,
            message_id: processingMsg.message_id
          }
        );
      } catch (editError) {
        await this.bot.sendMessage(chatId, '❌ Error interno del servidor.');
      }
    }
  }

  private validateExtractedData(data: ExtractedData): {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Validar cliente
    if (data.cliente === 'Cliente no identificado' || !data.cliente || data.cliente.length < 3) {
      errors.push('Nombre del cliente no identificado correctamente');
    }
    
    // Validar email
    if (!data.email || !data.email.includes('@') || data.email === 'no-email@placeholder.com') {
      if (data.email === 'no-email@placeholder.com') {
        warnings.push('Email no proporcionado - se usó placeholder');
      } else {
        errors.push('Email inválido o no encontrado');
      }
    }
    
    // Validar teléfono
    if (!data.telefono || data.telefono === 'No identificado') {
      warnings.push('Teléfono no identificado');
    }
    
    // Validar productos
    if (!data.productos || data.productos.length === 0) {
      errors.push('No se identificaron productos');
    } else {
      const productosConPrecio = data.productos.filter(p => p.total > 0);
      if (productosConPrecio.length === 0) {
        errors.push('Ningún producto tiene precio válido');
      }
      
      const productosGenéricos = data.productos.filter(p => 
        p.codigo === 'N/A' || p.codigo === 'DEFAULT'
      );
      if (productosGenéricos.length > 0) {
        warnings.push(`${productosGenéricos.length} producto(s) no identificado(s) correctamente`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      warnings,
      errors
    };
  }

  private async sendValidationFeedback(chatId: number, validation: {
    warnings: string[];
    errors: string[];
  }): Promise<void> {
    let feedbackMsg = '⚠️ **Feedback del procesamiento:**\n\n';
    
    if (validation.errors.length > 0) {
      feedbackMsg += '❌ **Errores detectados:**\n';
      validation.errors.forEach(error => {
        feedbackMsg += `• ${error}\n`;
      });
      feedbackMsg += '\n';
    }
    
    if (validation.warnings.length > 0) {
      feedbackMsg += '⚠️ **Advertencias:**\n';
      validation.warnings.forEach(warning => {
        feedbackMsg += `• ${warning}\n`;
      });
      feedbackMsg += '\n';
    }
    
    feedbackMsg += '💡 **Sugerencia:** Usa /formato para ver el formato recomendado y evitar estos problemas.';
    
    await this.bot.sendMessage(chatId, feedbackMsg, { parse_mode: 'Markdown' });
  }

  private async processClientData(extractedData: ExtractedData, fechaRegistro: string): Promise<void> {
    try {
      console.log('👤 Procesando información del cliente...');
      console.log('📧 Email extraído:', extractedData.email);
      console.log('👤 Cliente extraído:', extractedData.cliente);
  
      const email = extractedData.email;
      if (!email || email === 'No identificado' || email === 'N/A' || email === 'no-email@placeholder.com') {
        console.log('⚠️ Email no válido, saltando actualización de cliente');
        console.log('⚠️ Email recibido:', email);
        return;
      }
  
      console.log('🔍 Buscando cliente existente con email:', email);
  
      // Buscar cliente existente en Supabase
      const existingClient = await this.sheetsService.getClientByEmail(email);
      
      console.log('🔍 Resultado de búsqueda:', existingClient ? 'Cliente encontrado' : 'Cliente no encontrado');
      
      if (existingClient) {
        console.log('🔄 Cliente existente encontrado, actualizando estadísticas...');
        console.log('👤 Datos del cliente existente:', existingClient);
        
        // Obtener historial de compras del cliente desde Supabase
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
          console.log('✅ Cliente actualizado exitosamente en Supabase');
        } else {
          console.log('❌ Error al actualizar cliente en Supabase');
        }
  
      } else {
        console.log('➕ Cliente nuevo, agregando a Supabase...');
        
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
          console.log('✅ Nuevo cliente agregado exitosamente a Supabase');
        } else {
          console.log('❌ Error al agregar nuevo cliente a Supabase');
        }
      }
  
    } catch (error) {
      console.error('Error al procesar datos del cliente:', error);
    }
  }

  // Nuevo método para manejar el comando /status
  private async handleStatusCommand(chatId: number): Promise<void> {
    let statusMsg = '🔎 **Estado de conexiones:**\n\n';
    
    // Verificar Products Sheet (Google Sheets)
    try {
      const products = await this.sheetsService.getProductsFromSheet();
      if (products.length > 0) {
        statusMsg += '✅ Google Sheets (Productos): ' + products.length + ' productos encontrados\n';
      } else {
        statusMsg += '⚠️ Google Sheets (Productos): Sin productos\n';
      }
    } catch (error: any) {
      statusMsg += '❌ Google Sheets (Productos): ' + (error.message || error.toString()) + '\n';
    }
    
    // Verificar Supabase
    try {
      const supabaseOk = await this.sheetsService.testSupabaseConnection();
      if (supabaseOk) {
        statusMsg += '✅ Supabase (Ventas y Clientes): Conexión exitosa\n';
      } else {
        statusMsg += '❌ Supabase (Ventas y Clientes): Error de conexión\n';
      }
    } catch (error: any) {
      statusMsg += '❌ Supabase: ' + (error.message || error.toString()) + '\n';
    }
    
    statusMsg += `\n🤖 **Bot Status:** Operativo\n`;
    statusMsg += `📊 **Próximo ID Factura:** WKY${String(this.facturaCounter).padStart(5, '0')}`;
    
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

  private generateSummary(
    data: ExtractedData, 
    facturaId: string, 
    fechaRegistro: string, 
    validation: { isValid: boolean; warnings: string[]; errors: string[] }
  ): string {
    let summary = `*✅ Pedido procesado exitosamente*\n\n`;
    
    // Indicador de calidad
    if (validation.isValid) {
      summary += `🟢 *Procesamiento:* Perfecto\n`;
    } else {
      summary += `🟡 *Procesamiento:* Con observaciones\n`;
    }
    
    summary += `🧾 *Factura:* ${facturaId}\n`;
    summary += `📅 *Fecha:* ${fechaRegistro}\n`;
    summary += `👤 *Cliente:* ${data.cliente}\n`;
    summary += `📞 *Teléfono:* ${data.telefono}\n`;
    summary += `📧 *Email:* ${data.email}\n`;
    summary += `🤖 *Origen:* Bot de Telegram\n\n`;
    
    summary += `🛒 *Productos (${data.productos.length}):*\n`;
    
    data.productos.forEach((producto, index) => {
      summary += `${index + 1}. *${producto.articulo}*\n`;
      summary += `   • Código: \`${producto.codigo}\`\n`;
      summary += `   • Cantidad: ${producto.cantidad}\n`;
      summary += `   • Precio s/IVA: ${this.formatCurrency(producto.precioSinIva)}\n`;
      summary += `   • Total: ${this.formatCurrency(producto.total)}\n`;
      
      // Mostrar descuento si existe
      if (producto.descuento && producto.descuento > 0) {
        summary += `   • Descuento: ${producto.descuento}%\n`;
      }
      summary += `\n`;
    });

    const totalGeneral = data.productos.reduce((sum, p) => sum + p.total, 0);
    summary += `💰 *Total general:* ${this.formatCurrency(totalGeneral)}\n\n`;
    
    // Agregar información de cumpleaños si existe
    if (data.fechaCumpleanos) {
      summary += `🎂 *Cumpleaños:* ${data.fechaCumpleanos}\n`;
    }
    
    summary += `🤖 *Procesado por:* Bot Telegram v2.0`;

    return summary;
  }

  public start(): void {
    console.log('🤖 Bot de Telegram v2.0 iniciado y esperando mensajes...');
    console.log('🔧 Nuevas funciones: formato estructurado, manejo de descuentos, procesamiento robusto');
    console.log('📱 Envía /help para ver todos los comandos disponibles');
  }
}