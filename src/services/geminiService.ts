import { ExtractedData, ProductInfo } from '../types';

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

export class GeminiService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
  }

  async extractDataFromMessage(message: string, products: ProductInfo[]): Promise<ExtractedData | null> {
    console.log('🎯 Iniciando extracción con formato v3.0...');
    
    // 1. Intentar extracción con formato estructurado v3.0 (más preciso)
    let extractedData = this.tryUltraStructuredExtraction(message, products);
    
    if (extractedData && this.validateExtractionQuality(extractedData) >= 0.8) {
      console.log('✅ Extracción ultra estructurada exitosa (calidad alta)');
      return extractedData;
    }
    
    // 2. Si falla, usar Gemini AI con prompt mejorado
    console.log('🤖 Intentando extracción con Gemini AI v3.0...');
    extractedData = await this.tryEnhancedGeminiExtraction(message, products);
    
    if (extractedData && this.validateExtractionQuality(extractedData) >= 0.6) {
      console.log('✅ Extracción con Gemini exitosa (calidad media-alta)');
      return extractedData;
    }
    
    // 3. Extracción inteligente de emergencia
    console.log('🔄 Usando extracción inteligente de emergencia...');
    return this.intelligentEmergencyExtraction(message, products);
  }

  private tryUltraStructuredExtraction(message: string, products: ProductInfo[]): ExtractedData | null {
    try {
      console.log('🔍 Analizando formato ultra estructurado...');
      
      const normalizedMessage = this.normalizeMessageV3(message);
      const sections = this.parseStructuredSections(normalizedMessage);
      
      // Validar que tenga las secciones críticas
      if (!sections.CLIENTE || !sections.PRODUCTOS || !sections.CONTACTO) {
        console.log('❌ Faltan secciones obligatorias para extracción estructurada');
        return null;
      }

      // Extraer información del cliente
      const clientInfo = this.extractClientInfoV3(sections.CLIENTE);
      if (!clientInfo.nombre || clientInfo.nombre.length < 3) {
        console.log('❌ No se pudo extraer nombre del cliente');
        return null;
      }

      // Extraer productos con nuevo formato de viñetas
      const productosExtracted = this.extractProductsV3(sections.PRODUCTOS, products);
      if (productosExtracted.length === 0) {
        console.log('❌ No se pudieron extraer productos');
        return null;
      }

      // Extraer contacto
      const contactInfo = this.extractContactInfoV3(sections.CONTACTO);
      if (!contactInfo.telefono || !contactInfo.email) {
        console.log('❌ Información de contacto incompleta');
        return null;
      }

      // Extraer cumpleaños (opcional)
      const fechaCumpleanos = sections.CUMPLEAÑOS ? 
        this.extractBirthdayV3(sections.CUMPLEAÑOS) : 
        this.extractBirthdayV3(sections.CLIENTE);

      return {
        productos: productosExtracted,
        factura: 'N/A',
        fecha: this.getCurrentDate(),
        cliente: clientInfo.nombre,
        telefono: contactInfo.telefono,
        email: contactInfo.email,
        fechaCumpleanos: fechaCumpleanos
      };

    } catch (error) {
      console.error('Error en extracción ultra estructurada:', error);
      return null;
    }
  }

  private normalizeMessageV3(message: string): string {
    let normalized = message.trim();
    
    // Normalizar secciones
    normalized = normalized
      .replace(/\[CLIENTE\]/gi, '[CLIENTE]')
      .replace(/\[PRODUCTOS\]/gi, '[PRODUCTOS]')
      .replace(/\[CONTACTO\]/gi, '[CONTACTO]')
      .replace(/\[NOTAS\]/gi, '[NOTAS]')
      .replace(/\[CUMPLEAÑOS\]/gi, '[CUMPLEAÑOS]');
    
    // Normalizar viñetas de productos
    normalized = normalized
      .replace(/•\s*/g, '• ')
      .replace(/\*\s*/g, '• ')
      .replace(/\-\s*/g, '• ')
      .replace(/\d+\.\s*/g, '• ');
    
    return normalized;
  }

  private parseStructuredSections(message: string): { [key: string]: string } {
    const sections: { [key: string]: string } = {};
    
    // Buscar secciones marcadas con []
    const sectionRegex = /\[([^\]]+)\]\s*\n?((?:(?!\[)[^\n]*\n?)*)/gi;
    let match;
    
    while ((match = sectionRegex.exec(message)) !== null) {
      const sectionName = match[1].toUpperCase();
      const sectionContent = match[2].trim();
      sections[sectionName] = sectionContent;
    }

    // Si no hay secciones marcadas, intentar parsing inteligente
    if (Object.keys(sections).length === 0) {
      return this.intelligentSectionParsing(message);
    }

    return sections;
  }

  private intelligentSectionParsing(message: string): { [key: string]: string } {
    const lines = message.split('\n').map(l => l.trim()).filter(l => l);
    const sections: { [key: string]: string } = {};
    
    let clientLines: string[] = [];
    let productLines: string[] = [];
    let contactLines: string[] = [];
    
    for (const line of lines) {
      if (this.isClientLineV3(line)) {
        clientLines.push(line);
      } else if (this.isProductLineV3(line)) {
        productLines.push(line);
      } else if (this.isContactLineV3(line)) {
        contactLines.push(line);
      }
    }
    
    if (clientLines.length > 0) sections.CLIENTE = clientLines.join('\n');
    if (productLines.length > 0) sections.PRODUCTOS = productLines.join('\n');
    if (contactLines.length > 0) sections.CONTACTO = contactLines.join('\n');
    
    return sections;
  }

  private isClientLineV3(line: string): boolean {
    return /CC\s*\d+|ID\s*\d+/i.test(line) || 
           /FC\s*:/i.test(line) ||
           (!line.includes('@') && !line.includes('•') && !line.includes('Código:') && 
            !line.match(/^\d+/) && line.length > 3 && !line.includes('Teléfono'));
  }

  private isProductLineV3(line: string): boolean {
    return line.includes('•') || 
           line.includes('Código:') ||
           /\w+\s*x\s*\d+/i.test(line) || 
           /kit|shampoo|tratamiento|suero/i.test(line);
  }

  private isContactLineV3(line: string): boolean {
    return line.includes('@') || 
           /\d{3}\s*\d{3,4}\s*\d{4}/.test(line) ||
           /teléfono|email|dirección/i.test(line);
  }

  private extractClientInfoV3(clientSection: string): { nombre: string; cedula: string } {
    const lines = clientSection.split('\n').map(l => l.trim()).filter(l => l);
    
    let nombre = '';
    let cedula = '';
    
    for (const line of lines) {
      // Buscar cédula o ID
      const cedulaMatch = line.match(/(?:CC|ID)\s*(\d+)/i);
      if (cedulaMatch) {
        cedula = cedulaMatch[1];
        // El nombre podría estar en la misma línea o en otra
        const nombreEnLinea = line.replace(/(?:CC|ID)\s*\d+/i, '').trim();
        if (nombreEnLinea && !nombre) {
          nombre = nombreEnLinea;
        }
      } else if (!nombre && line.length > 3 && !line.includes('@') && !line.includes('FC:')) {
        // Esta línea probablemente es el nombre
        nombre = line;
      }
    }
    
    return { nombre, cedula };
  }

  private extractProductsV3(productSection: string, products: ProductInfo[]): Array<{
    codigo: string;
    articulo: string;
    cantidad: number;
    precioSinIva: number;
    total: number;
    descuento?: number;
  }> {
    const lines = productSection.split('\n').map(l => l.trim()).filter(l => l);
    const productosExtracted: any[] = [];
    
    for (const line of lines) {
      const producto = this.parseProductLineV3(line, products);
      if (producto) {
        productosExtracted.push(producto);
      }
    }
    
    return productosExtracted;
  }

  private parseProductLineV3(line: string, products: ProductInfo[]): any | null {
    console.log(`🔍 Analizando línea de producto: "${line}"`);
    
    // Formato v3.0: • Código: XXX | Cantidad: N | Descuento: X%
    const v3FormatMatch = line.match(/•\s*Código:\s*(\w+)\s*\|\s*Cantidad:\s*(\d+)\s*\|\s*Descuento:\s*(\d+)%/i);
    
    if (v3FormatMatch) {
      const codigo = v3FormatMatch[1].toUpperCase();
      const cantidad = parseInt(v3FormatMatch[2]);
      const descuento = parseInt(v3FormatMatch[3]);
      
      console.log(`✅ Formato v3.0 detectado: ${codigo} x${cantidad} (${descuento}% desc)`);
      
      return this.buildProductFromCode(codigo, cantidad, descuento, products);
    }
    
    // Formato alternativo: SH001 x 2 [DESCUENTO: 15%]
    const altFormatMatch = line.match(/(\w+)\s*x\s*(\d+)(?:\s*\[?DESCUENTO:\s*(\d+)%\]?)?/i);
    
    if (altFormatMatch) {
      const codigo = altFormatMatch[1].toUpperCase();
      const cantidad = parseInt(altFormatMatch[2]);
      const descuento = altFormatMatch[3] ? parseInt(altFormatMatch[3]) : 0;
      
      console.log(`✅ Formato alternativo detectado: ${codigo} x${cantidad} (${descuento}% desc)`);
      
      return this.buildProductFromCode(codigo, cantidad, descuento, products);
    }
    
    // Formato texto libre: buscar por nombre y cantidad
    return this.parseTextualProductLine(line, products);
  }

  private buildProductFromCode(codigo: string, cantidad: number, descuento: number, products: ProductInfo[]): any | null {
    // Buscar producto por código exacto
    let productoReal = products.find(p => p.codigo.toUpperCase() === codigo);
    
    // Si no se encuentra por código exacto, buscar por similitud
    if (!productoReal) {
      productoReal = this.findBestProductMatch(codigo, '', products);
    }
    
    if (productoReal) {
      const precioBase = productoReal.precio;
      const precioConDescuento = precioBase * (1 - descuento / 100);
      const factorIva = 1 + (productoReal.impuesto / 100);
      const precioSinIva = precioConDescuento / factorIva;
      const total = precioConDescuento * cantidad;
      
      console.log(`💰 Producto procesado: ${productoReal.articulo} - $${total.toFixed(2)}`);
      
      return {
        codigo: productoReal.codigo,
        articulo: productoReal.articulo,
        cantidad: cantidad,
        precioSinIva: Math.round(precioSinIva),
        total: Math.round(total),
        descuento: descuento
      };
    }
    
    console.warn(`❌ No se encontró producto para código: ${codigo}`);
    return null;
  }

  private parseTextualProductLine(line: string, products: ProductInfo[]): any | null {
    console.log(`🔍 Analizando línea textual: "${line}"`);
    
    // Extraer cantidad si está presente
    const cantidadMatch = line.match(/(\d+)\s*(?:x\s*)?(.+)|(.+)\s*x\s*(\d+)/i);
    let cantidad = 1;
    let productText = line;
    
    if (cantidadMatch) {
      if (cantidadMatch[1] && cantidadMatch[2]) {
        cantidad = parseInt(cantidadMatch[1]);
        productText = cantidadMatch[2];
      } else if (cantidadMatch[3] && cantidadMatch[4]) {
        productText = cantidadMatch[3];
        cantidad = parseInt(cantidadMatch[4]);
      }
    }
    
    // Extraer descuento si está presente
    const descuentoMatch = productText.match(/(\d+)%\s*(?:dscto|descuento|desc)/i);
    const descuento = descuentoMatch ? parseInt(descuentoMatch[1]) : 0;
    
    // Limpiar el texto del producto
    productText = productText
      .replace(/\d+%\s*(?:dscto|descuento|desc)/gi, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/•/g, '')
      .trim();
    
    // Buscar el producto
    const productoReal = this.findBestProductMatch(productText, '', products);
    
    if (productoReal) {
      const precioBase = productoReal.precio;
      const precioConDescuento = precioBase * (1 - descuento / 100);
      const factorIva = 1 + (productoReal.impuesto / 100);
      const precioSinIva = precioConDescuento / factorIva;
      const total = precioConDescuento * cantidad;
      
      console.log(`✅ Producto textual procesado: ${productoReal.articulo} x${cantidad}`);
      
      return {
        codigo: productoReal.codigo,
        articulo: productoReal.articulo,
        cantidad: cantidad,
        precioSinIva: Math.round(precioSinIva),
        total: Math.round(total),
        descuento: descuento
      };
    }
    
    return null;
  }

  private extractContactInfoV3(contactSection: string): { telefono: string; email: string } {
    const lines = contactSection.split('\n').map(l => l.trim()).filter(l => l);
    
    let telefono = '';
    let email = '';
    
    for (const line of lines) {
      // Buscar teléfono (múltiples formatos)
      const telefonoMatch = line.match(/(\+?\d{1,3}?\s*\(?\d{3}\)?\s*\d{3,4}\s*\d{4})/);
      if (telefonoMatch && !telefono) {
        telefono = telefonoMatch[1].replace(/\s+/g, ' ').trim();
      }
      
      // Buscar email
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch && !email) {
        email = emailMatch[1];
      }
    }
    
    return { telefono, email };
  }

  private extractBirthdayV3(birthdaySection: string): string {
    const lines = birthdaySection.split('\n').map(l => l.trim()).filter(l => l);
    
    for (const line of lines) {
      // Formato: FC: DD de MMMM
      const fechaMatch = line.match(/FC:?\s*(\d{1,2})\s+de\s+(\w+)/i);
      if (fechaMatch) {
        const dia = fechaMatch[1];
        const mesNombre = fechaMatch[2].toLowerCase();
        const meses: { [key: string]: number } = {
          'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
          'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
        };
        const mesNumero = meses[mesNombre];
        if (mesNumero) {
          return `${dia}/${mesNumero}`;
        }
      }
      
      // Formato: FC: DD/MM
      const fechaNumericaMatch = line.match(/FC:?\s*(\d{1,2})\/(\d{1,2})/);
      if (fechaNumericaMatch) {
        return `${fechaNumericaMatch[1]}/${fechaNumericaMatch[2]}`;
      }
    }
    
    return '';
  }

  private async tryEnhancedGeminiExtraction(message: string, products: ProductInfo[]): Promise<ExtractedData | null> {
    const prompt = this.buildUltraEnhancedPrompt(message, products);
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.05, // Más determinístico
            topK: 1,
            topP: 0.8,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!response.ok) {
        console.error('Error en respuesta de Gemini:', response.status);
        return null;
      }

      const data: GeminiResponse = await response.json();
      
      if (!data.candidates || !data.candidates[0]) {
        console.error('Respuesta inválida de Gemini');
        return null;
      }

      const generatedText = data.candidates[0].content.parts[0].text;
      console.log('🤖 Respuesta de Gemini v3.0:', generatedText);
      
      try {
        let jsonText = generatedText;
        
        const jsonMatch = generatedText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        } else {
          const cleanJsonMatch = generatedText.match(/\{[\s\S]*\}/);
          if (cleanJsonMatch) {
            jsonText = cleanJsonMatch[0];
          }
        }
        
        const parsedData = JSON.parse(jsonText);
        
        // Corregir precios y validar datos
        const correctedData = this.correctPricesAndCalculateIVA(parsedData, products);
        
        // Validar calidad de extracción
        if (this.validateExtractionQuality(correctedData) >= 0.6) {
          return correctedData;
        }
        
        return null;
        
      } catch (parseError) {
        console.error('Error al parsear respuesta de Gemini:', parseError);
        return null;
      }
    } catch (error) {
      console.error('Error al llamar a Gemini:', error);
      return null;
    }
  }

  private intelligentEmergencyExtraction(message: string, products: ProductInfo[]): ExtractedData {
    console.log('🆘 Ejecutando extracción inteligente de emergencia...');
    
    const lines = message.split('\n').map(line => line.trim()).filter(line => line);
    
    // Buscar cliente de forma más inteligente
    let cliente = 'Cliente no identificado';
    let cedula = '';
    
    for (const line of lines) {
      const cedulaMatch = line.match(/(?:CC|ID)\s*(\d+)/i);
      if (cedulaMatch) {
        cedula = cedulaMatch[1];
        const nombreEnLinea = line.replace(/(?:CC|ID)\s*\d+/i, '').trim();
        if (nombreEnLinea.length > 3) {
          cliente = nombreEnLinea;
          break;
        }
      } else if (!line.includes('@') && !line.includes('•') && 
                 !line.match(/^\d+/) && line.length > 5 && 
                 !line.includes('Teléfono') && !line.includes('FC:')) {
        cliente = line;
        break;
      }
    }
    
    // Buscar teléfono
    const telefonoMatch = message.match(/(\+?\d{1,3}?\s*\(?\d{3}\)?\s*\d{3,4}\s*\d{4})/);
    const telefono = telefonoMatch ? telefonoMatch[1] : 'No identificado';
    
    // Buscar email
    const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : 'no-email@placeholder.com';
    
    // Buscar cumpleaños
    const cumpleanosMatch = message.match(/FC:?\s*(\d{1,2})\s+de\s+(\w+)/i);
    let fechaCumpleanos = '';
    if (cumpleanosMatch) {
      const meses: { [key: string]: number } = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
        'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
      };
      const mesNumero = meses[cumpleanosMatch[2].toLowerCase()];
      if (mesNumero) {
        fechaCumpleanos = `${cumpleanosMatch[1]}/${mesNumero}`;
      }
    }
    
    // Intentar extraer al menos un producto inteligentemente
    let productosExtracted: any[] = [];
    
    // Buscar menciones de productos conocidos
    for (const product of products.slice(0, 10)) { // Revisar top 10 productos
      const productRegex = new RegExp(product.articulo.split(' ')[0], 'i');
      if (productRegex.test(message)) {
        const factorIva = 1 + (product.impuesto / 100);
        const precioSinIva = product.precio / factorIva;
        
        productosExtracted.push({
          codigo: product.codigo,
          articulo: product.articulo,
          cantidad: 1,
          precioSinIva: Math.round(precioSinIva),
          total: Math.round(product.precio),
          descuento: 0
        });
        break;
      }
    }
    
    // Si no encontró ningún producto, usar producto por defecto
    if (productosExtracted.length === 0 && products.length > 0) {
      const productoPorDefecto = products[0];
      const factorIva = 1 + (productoPorDefecto.impuesto / 100);
      const precioSinIva = productoPorDefecto.precio / factorIva;
      
      productosExtracted.push({
        codigo: productoPorDefecto.codigo,
        articulo: productoPorDefecto.articulo,
        cantidad: 1,
        precioSinIva: Math.round(precioSinIva),
        total: Math.round(productoPorDefecto.precio),
        descuento: 0
      });
    }
    
    return {
      productos: productosExtracted,
      factura: 'N/A',
      fecha: this.getCurrentDate(),
      cliente: cliente,
      telefono: telefono,
      email: email,
      fechaCumpleanos: fechaCumpleanos
    };
  }

  private validateExtractionQuality(data: ExtractedData): number {
    let score = 0;
    
    // Cliente (25 puntos)
    if (data.cliente && data.cliente !== 'Cliente no identificado' && data.cliente.length > 3) {
      score += 25;
    }
    
    // Email (25 puntos)
    if (data.email && data.email.includes('@') && data.email !== 'no-email@placeholder.com') {
      score += 25;
    }
    
    // Teléfono (15 puntos)
    if (data.telefono && data.telefono !== 'No identificado') {
      score += 15;
    }
    
    // Productos (35 puntos)
    if (data.productos && data.productos.length > 0) {
      const productosValidos = data.productos.filter(p => p.total > 0 && p.codigo !== 'DEFAULT');
      score += Math.min(35, (productosValidos.length / data.productos.length) * 35);
    }
    
    return score / 100; // Retornar como porcentaje
  }

  private getCurrentDate(): string {
    const now = new Date();
    return now.toLocaleDateString('es-ES');
  }

  private findBestProductMatch(searchText: string, searchCode: string, products: ProductInfo[]): ProductInfo | null {
    const searchLower = searchText.toLowerCase().trim();
    
    // 1. Búsqueda por código exacto
    if (searchCode && searchCode.trim()) {
      const exactCodeMatch = products.find(p => p.codigo.toLowerCase() === searchCode.toLowerCase());
      if (exactCodeMatch) return exactCodeMatch;
    }

    // 2. Mapeo inteligente v3.0 (incluye kits)
    const smartMappings: { [key: string]: string[] } = {
      'kit': ['kit', 'viajero'],
      'shampoo': ['shampoo', 'champú', 'champu', 'herbal', 'frutal'],
      'tratamiento': ['tratamiento', 'mascarilla', 'mask', 'acondicionador'],
      'suero': ['suero', 'serum', 'cejas', 'pestañas', 'capilar'],
      'styling': ['styling', 'cream', 'crema'],
      'exfoliante': ['exfoliante', 'scrub', 'peeling', 'café', 'coffee'],
      'cannabis': ['cannabis', 'hemp', 'canabis'],
      'frutal': ['frutal', 'frutas', 'frutales'],
      'herbal': ['herbal', 'hierbas', 'natural'],
      'mini': ['mini', 'pequeño', 'minis']
    };

    // 3. Búsqueda inteligente por palabras clave
    for (const product of products) {
      const productLower = product.articulo.toLowerCase();
      
      const searchWords = searchLower.split(/\s+/).filter(w => w.length > 2);
      let matchCount = 0;
      
      for (const word of searchWords) {
        if (productLower.includes(word)) {
          matchCount++;
          continue;
        }
        
        // Buscar sinónimos
        for (const [key, synonyms] of Object.entries(smartMappings)) {
          if (synonyms.includes(word) && productLower.includes(key)) {
            matchCount++;
            break;
          }
        }
      }
      
      // Si coincide con al menos el 70% de las palabras
      if (searchWords.length > 0 && matchCount / searchWords.length >= 0.7) {
        console.log(`✅ Producto encontrado por palabras clave: "${searchText}" -> ${product.articulo}`);
        return product;
      }
    }

    // 4. Búsqueda difusa para typos
    const fuzzyMatches = products.map(product => ({
      product,
      similarity: this.calculateFuzzyMatch(searchLower, product.articulo.toLowerCase())
    })).filter(match => match.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity);

    if (fuzzyMatches.length > 0) {
      console.log(`✅ Producto encontrado por similitud: "${searchText}" -> ${fuzzyMatches[0].product.articulo}`);
      return fuzzyMatches[0].product;
    }

    console.warn(`❌ No se encontró producto para: "${searchText}"`);
    return null;
  }

  private calculateFuzzyMatch(search: string, target: string): number {
    const searchWords = search.split(/\s+/);
    const targetWords = target.split(/\s+/);
    
    let totalSimilarity = 0;
    let maxPossible = 0;
    
    for (const searchWord of searchWords) {
      let bestMatch = 0;
      for (const targetWord of targetWords) {
        const similarity = this.calculateSimilarity(searchWord, targetWord);
        bestMatch = Math.max(bestMatch, similarity);
      }
      totalSimilarity += bestMatch;
      maxPossible += 1;
    }
    
    return maxPossible > 0 ? totalSimilarity / maxPossible : 0;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private correctPricesAndCalculateIVA(data: any, products: ProductInfo[]): ExtractedData {
    const productosCorregidos = data.productos.map((producto: any) => {
      let productoReal = this.findBestProductMatch(producto.articulo, producto.codigo || '', products);

      if (productoReal) {
        const cantidad = producto.cantidad || 1;
        const descuento = producto.descuento || 0;
        const precioBase = productoReal.precio;
        
        const precioConDescuento = precioBase * (1 - descuento / 100);
        const factorIva = 1 + (productoReal.impuesto / 100);
        const precioSinIvaReal = precioConDescuento / factorIva;
        const total = precioConDescuento * cantidad;

        console.log(`💰 Calculando para ${productoReal.articulo}:`);
        console.log(`   - Precio base: ${precioBase}`);
        console.log(`   - Descuento: ${descuento}%`);
        console.log(`   - Precio con descuento: ${precioConDescuento.toFixed(2)}`);
        console.log(`   - Precio sin IVA: ${precioSinIvaReal.toFixed(2)}`);
        console.log(`   - Cantidad: ${cantidad}`);
        console.log(`   - Total: ${total.toFixed(2)}`);

        return {
          codigo: productoReal.codigo,
          articulo: productoReal.articulo,
          cantidad: cantidad,
          precioSinIva: Math.round(precioSinIvaReal),
          total: Math.round(total),
          descuento: descuento
        };
      } else {
        console.warn(`⚠️ Producto no encontrado: ${producto.articulo} (código: ${producto.codigo})`);
        return {
          codigo: producto.codigo || 'N/A',
          articulo: producto.articulo,
          cantidad: producto.cantidad || 1,
          precioSinIva: 0,
          total: 0,
          descuento: producto.descuento || 0
        };
      }
    });

    return {
      productos: productosCorregidos,
      factura: data.factura,
      fecha: data.fecha,
      cliente: data.cliente,
      telefono: data.telefono,
      email: data.email,
      fechaCumpleanos: data.fechaCumpleanos || ''
    };
  }

  private buildUltraEnhancedPrompt(message: string, products: ProductInfo[]): string {
    const productsList = products.map(p => `${p.codigo}: ${p.articulo} - Precio: ${p.precio} (IVA: ${p.impuesto}%)`).join('\n');
    
    return `
SISTEMA DE EXTRACCIÓN ULTRA PRECISO v3.0 PARA PEDIDOS

PRODUCTOS DISPONIBLES:
${productsList}

MENSAJE A ANALIZAR:
"${message}"

INSTRUCCIONES CRÍTICAS v3.0:
1. NUNCA retornes null - SIEMPRE extrae al menos datos básicos
2. Los KITS son UN SOLO PRODUCTO - no separar en componentes
3. Cada producto puede tener su propio descuento individual
4. Busca códigos exactos PRIMERO, luego por nombre similar
5. Formato de productos esperado: "• Código: XXX | Cantidad: N | Descuento: X%"
6. También acepta formatos como "SH001 x 2 (15% dscto)"
7. Si no hay email válido, usa "no-email@placeholder.com"
8. Si no hay teléfono, usa "No identificado"
9. Extrae cumpleaños en formato "D/M" si está presente
10. UN KIT VIAJERO = UN PRODUCTO (no shampoo + kit como dos productos)

EJEMPLOS DE KITS:
- "Kit viajero (con Shampoo herbal)" = 1 producto kit, NO shampoo + kit
- "Kit x5 (con Shampoo frutal)" = 5 kits, NO 5 shampoos + 5 kits

RESPONDE ÚNICAMENTE CON ESTE JSON (sin texto adicional):
{
  "productos": [
    {
      "codigo": "código_exacto_de_la_lista",
      "articulo": "nombre_exacto_del_articulo",
      "cantidad": 1,
      "descuento": 0
    }
  ],
  "factura": "N/A",
  "fecha": "fecha_actual",
  "cliente": "nombre_del_cliente",
  "telefono": "numero_telefono",
  "email": "email_valido",
  "fechaCumpleanos": "formato_D/M"
}
`;
  }
}