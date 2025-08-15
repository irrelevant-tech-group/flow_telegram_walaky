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
    // Preprocesar el mensaje para normalizar formato
    const normalizedMessage = this.normalizeMessage(message);
    
    // Intentar extracción con formato estructurado primero
    let extractedData = this.tryStructuredExtraction(normalizedMessage, products);
    
    if (extractedData) {
      console.log('✅ Extracción estructurada exitosa');
      return extractedData;
    }
    
    // Si falla, usar Gemini AI como respaldo
    console.log('🤖 Intentando extracción con Gemini AI...');
    extractedData = await this.tryGeminiExtraction(normalizedMessage, products);
    
    if (extractedData) {
      console.log('✅ Extracción con Gemini exitosa');
      return extractedData;
    }
    
    // Como último recurso, usar extracción de emergencia
    console.log('🔄 Usando extracción de emergencia...');
    return this.emergencyExtraction(normalizedMessage, products);
  }

  private normalizeMessage(message: string): string {
    // Normalizar espacios y saltos de línea
    let normalized = message.trim().replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n');
    
    // Convertir formatos comunes a formato estándar
    normalized = normalized
      .replace(/cliente\s*:?\s*/gi, '[CLIENTE]\n')
      .replace(/productos?\s*:?\s*/gi, '[PRODUCTOS]\n')
      .replace(/contacto\s*:?\s*/gi, '[CONTACTO]\n')
      .replace(/teléfono\s*:?\s*/gi, 'Teléfono: ')
      .replace(/email\s*:?\s*/gi, 'Email: ')
      .replace(/cumpleaños\s*:?\s*/gi, '[CUMPLEAÑOS]\n')
      .replace(/notas?\s*:?\s*/gi, '[NOTAS]\n');
    
    return normalized;
  }

  private tryStructuredExtraction(message: string, products: ProductInfo[]): ExtractedData | null {
    try {
      console.log('🔍 Intentando extracción estructurada...');
      
      const sections = this.parseSections(message);
      
      // Validar que tenga las secciones mínimas
      if (!sections.CLIENTE || !sections.PRODUCTOS || !sections.CONTACTO) {
        console.log('❌ Faltan secciones obligatorias para extracción estructurada');
        return null;
      }

      // Extraer información del cliente
      const clientInfo = this.extractClientInfo(sections.CLIENTE);
      if (!clientInfo.nombre) {
        console.log('❌ No se pudo extraer nombre del cliente');
        return null;
      }

      // Extraer productos
      const productosExtracted = this.extractProducts(sections.PRODUCTOS, products);
      if (productosExtracted.length === 0) {
        console.log('❌ No se pudieron extraer productos');
        return null;
      }

      // Extraer contacto
      const contactInfo = this.extractContactInfo(sections.CONTACTO);
      if (!contactInfo.telefono || !contactInfo.email) {
        console.log('❌ Información de contacto incompleta');
        return null;
      }

      // Extraer cumpleaños (opcional)
      const fechaCumpleanos = sections.CUMPLEAÑOS ? 
        this.extractBirthday(sections.CUMPLEAÑOS) : '';

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
      console.error('Error en extracción estructurada:', error);
      return null;
    }
  }

  private parseSections(message: string): { [key: string]: string } {
    const sections: { [key: string]: string } = {};
    
    // Buscar secciones marcadas con []
    const sectionRegex = /\[([^\]]+)\]\s*\n((?:(?!\[)[^\n]*\n?)*)/gi;
    let match;
    
    while ((match = sectionRegex.exec(message)) !== null) {
      const sectionName = match[1].toUpperCase();
      const sectionContent = match[2].trim();
      sections[sectionName] = sectionContent;
    }

    // Si no hay secciones marcadas, intentar extracción por líneas
    if (Object.keys(sections).length === 0) {
      return this.parseLineByLine(message);
    }

    return sections;
  }

  private parseLineByLine(message: string): { [key: string]: string } {
    const lines = message.split('\n').map(l => l.trim()).filter(l => l);
    const sections: { [key: string]: string } = {};
    
    let clientLines: string[] = [];
    let productLines: string[] = [];
    let contactLines: string[] = [];
    
    for (const line of lines) {
      if (this.isClientLine(line)) {
        clientLines.push(line);
      } else if (this.isProductLine(line)) {
        productLines.push(line);
      } else if (this.isContactLine(line)) {
        contactLines.push(line);
      }
    }
    
    if (clientLines.length > 0) sections.CLIENTE = clientLines.join('\n');
    if (productLines.length > 0) sections.PRODUCTOS = productLines.join('\n');
    if (contactLines.length > 0) sections.CONTACTO = contactLines.join('\n');
    
    return sections;
  }

  private isClientLine(line: string): boolean {
    return /CC\s*\d+/i.test(line) || 
           (!line.includes('@') && !line.includes('x ') && !line.match(/^\d+/) && line.length > 3);
  }

  private isProductLine(line: string): boolean {
    return /\w+\s*x\s*\d+/i.test(line) || 
           /\w{2,}\d{3}\s*x?\s*\d*/i.test(line);
  }

  private isContactLine(line: string): boolean {
    return line.includes('@') || 
           /\d{3}\s*\d{3,4}\s*\d{4}/.test(line) ||
           /teléfono|email|tel:/i.test(line);
  }

  private extractClientInfo(clientSection: string): { nombre: string; cedula: string } {
    const lines = clientSection.split('\n').map(l => l.trim()).filter(l => l);
    
    let nombre = '';
    let cedula = '';
    
    for (const line of lines) {
      const cedulaMatch = line.match(/CC\s*(\d+)/i);
      if (cedulaMatch) {
        cedula = cedulaMatch[1];
        // El nombre podría estar en la misma línea o en otra
        const nombreEnLinea = line.replace(/CC\s*\d+/i, '').trim();
        if (nombreEnLinea && !nombre) {
          nombre = nombreEnLinea;
        }
      } else if (!nombre && line.length > 3 && !line.includes('@')) {
        nombre = line;
      }
    }
    
    return { nombre, cedula };
  }

  private extractProducts(productSection: string, products: ProductInfo[]): Array<{
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
      const producto = this.parseProductLine(line, products);
      if (producto) {
        productosExtracted.push(producto);
      }
    }
    
    return productosExtracted;
  }

  private parseProductLine(line: string, products: ProductInfo[]): any | null {
    // Formato: CODIGO x CANTIDAD [DESCUENTO: X%]
    const productMatch = line.match(/(\w+)\s*x\s*(\d+)(?:\s*\[DESCUENTO:\s*(\d+)%\])?/i);
    
    if (productMatch) {
      const codigo = productMatch[1].toUpperCase();
      const cantidad = parseInt(productMatch[2]);
      const descuento = productMatch[3] ? parseInt(productMatch[3]) : 0;
      
      // Buscar producto por código exacto
      let productoReal = products.find(p => p.codigo.toUpperCase() === codigo);
      
      // Si no se encuentra por código, buscar por similitud
      if (!productoReal) {
        productoReal = this.findBestProductMatch(codigo, '', products);
      }
      
      if (productoReal) {
        const precioBase = productoReal.precio;
        const precioConDescuento = precioBase * (1 - descuento / 100);
        const factorIva = 1 + (productoReal.impuesto / 100);
        const precioSinIva = precioConDescuento / factorIva;
        const total = precioConDescuento * cantidad;
        
        return {
          codigo: productoReal.codigo,
          articulo: productoReal.articulo,
          cantidad: cantidad,
          precioSinIva: Math.round(precioSinIva),
          total: Math.round(total),
          descuento: descuento
        };
      }
    }
    
    return null;
  }

  private extractContactInfo(contactSection: string): { telefono: string; email: string } {
    const lines = contactSection.split('\n').map(l => l.trim()).filter(l => l);
    
    let telefono = '';
    let email = '';
    
    for (const line of lines) {
      const telefonoMatch = line.match(/(\d{3}\s*\d{3,4}\s*\d{4})/);
      if (telefonoMatch && !telefono) {
        telefono = telefonoMatch[1];
      }
      
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch && !email) {
        email = emailMatch[1];
      }
    }
    
    return { telefono, email };
  }

  private extractBirthday(birthdaySection: string): string {
    const lines = birthdaySection.split('\n').map(l => l.trim()).filter(l => l);
    
    for (const line of lines) {
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
      
      // Formato alternativo DD/MM
      const fechaNumericaMatch = line.match(/FC:?\s*(\d{1,2})\/(\d{1,2})/);
      if (fechaNumericaMatch) {
        return `${fechaNumericaMatch[1]}/${fechaNumericaMatch[2]}`;
      }
    }
    
    return '';
  }

  private async tryGeminiExtraction(message: string, products: ProductInfo[]): Promise<ExtractedData | null> {
    const prompt = this.buildImprovedPrompt(message, products);
    
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
            temperature: 0.1,
            topK: 1,
            topP: 1,
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
      console.log('🤖 Respuesta de Gemini:', generatedText);
      
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
        
        // Validar que los datos sean válidos
        if (this.validateExtractedData(correctedData)) {
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

  private emergencyExtraction(message: string, products: ProductInfo[]): ExtractedData {
    console.log('🆘 Ejecutando extracción de emergencia...');
    
    const lines = message.split('\n').map(line => line.trim()).filter(line => line);
    
    // Buscar cliente de forma más agresiva
    let cliente = 'Cliente no identificado';
    for (const line of lines) {
      if (!line.includes('@') && !line.includes('x ') && !line.match(/^\d+/) && line.length > 5) {
        cliente = line.replace(/CC\s*\d+/i, '').trim();
        if (cliente.length > 3) break;
      }
    }
    
    // Buscar teléfono
    const telefonoMatch = message.match(/(\d{3}\s*\d{3,4}\s*\d{4})/);
    const telefono = telefonoMatch ? telefonoMatch[1] : 'No identificado';
    
    // Buscar email
    const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : 'no-email@placeholder.com';
    
    // Usar producto por defecto si no se puede identificar ninguno
    const productoPorDefecto = products.length > 0 ? products[0] : {
      codigo: 'DEFAULT',
      articulo: 'Producto por defecto',
      precio: 10000,
      impuesto: 19
    };
    
    const factorIva = 1 + (productoPorDefecto.impuesto / 100);
    const precioSinIva = productoPorDefecto.precio / factorIva;
    
    return {
      productos: [{
        codigo: productoPorDefecto.codigo,
        articulo: productoPorDefecto.articulo,
        cantidad: 1,
        precioSinIva: Math.round(precioSinIva),
        total: Math.round(productoPorDefecto.precio)
      }],
      factura: 'N/A',
      fecha: this.getCurrentDate(),
      cliente: cliente,
      telefono: telefono,
      email: email,
      fechaCumpleanos: ''
    };
  }

  private validateExtractedData(data: ExtractedData): boolean {
    // Validaciones básicas
    if (!data.cliente || data.cliente === 'Cliente no identificado') return false;
    if (!data.email || !data.email.includes('@')) return false;
    if (!data.telefono || data.telefono === 'No identificado') return false;
    if (!data.productos || data.productos.length === 0) return false;
    
    // Validar que al menos un producto tenga precio válido
    const hasValidProduct = data.productos.some(p => p.total > 0);
    if (!hasValidProduct) return false;
    
    return true;
  }

  private getCurrentDate(): string {
    const now = new Date();
    return now.toLocaleDateString('es-ES');
  }

  // Mejora en el método findBestProductMatch
private findBestProductMatch(searchText: string, searchCode: string, products: ProductInfo[]): ProductInfo | null {
  const searchLower = searchText.toLowerCase().trim();
  
  // 1. Si viene un código, buscarlo primero
  if (searchCode && searchCode.trim()) {
    const exactCodeMatch = products.find(p => p.codigo.toLowerCase() === searchCode.toLowerCase());
    if (exactCodeMatch) return exactCodeMatch;
  }

  // 2. Mapeo inteligente de términos comerciales comunes
  const smartMappings: { [key: string]: string[] } = {
    'shampoo': ['shampoo', 'champú', 'champu'],
    'tratamiento': ['tratamiento', 'mascarilla', 'mask', 'acondicionador'],
    'suero': ['suero', 'serum'],
    'tónico': ['tonico', 'tónico', 'locion', 'loción'],
    'exfoliante': ['exfoliante', 'scrub', 'peeling'],
    'crema': ['crema', 'cream', 'styling'],
    'aceite': ['aceite', 'oil'],
    'gel': ['gel'],
    'mousse': ['mousse', 'espuma'],
    'spray': ['spray', 'atomizador'],
    'termoprotector': ['termoprotector', 'termo', 'protector'],
    'cannabis': ['cannabis', 'hemp', 'canabis'],
    'café': ['cafe', 'café', 'coffee'],
    'herbal': ['herbal', 'hierbas', 'natural'],
    'frutal': ['frutal', 'frutas', 'frutales']
  };

  // 3. Búsqueda inteligente por palabras clave
  for (const product of products) {
    const productLower = product.articulo.toLowerCase();
    
    // Verificar coincidencias directas de palabras
    const searchWords = searchLower.split(/\s+/).filter(w => w.length > 2);
    let matchCount = 0;
    
    for (const word of searchWords) {
      // Buscar la palabra directamente
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
    
    // Si coincide con al menos el 60% de las palabras, es un buen match
    if (matchCount / searchWords.length >= 0.6) {
      console.log(`✅ Producto encontrado por palabras clave: "${searchText}" -> ${product.articulo}`);
      return product;
    }
  }

  // 4. Búsqueda difusa para typos y variaciones
  const fuzzyMatches = products.map(product => ({
    product,
    similarity: this.calculateFuzzyMatch(searchLower, product.articulo.toLowerCase())
  })).filter(match => match.similarity > 0.4)
    .sort((a, b) => b.similarity - a.similarity);

  if (fuzzyMatches.length > 0) {
    console.log(`✅ Producto encontrado por similitud: "${searchText}" -> ${fuzzyMatches[0].product.articulo}`);
    return fuzzyMatches[0].product;
  }

  // 5. Último recurso: buscar por palabras sueltas
  for (const word of searchLower.split(/\s+/).filter(w => w.length > 3)) {
    const partialMatch = products.find(p => 
      p.articulo.toLowerCase().includes(word)
    );
    if (partialMatch) {
      console.log(`⚠️ Producto encontrado por palabra parcial: "${word}" -> ${partialMatch.articulo}`);
      return partialMatch;
    }
  }

  console.warn(`❌ No se encontró producto para: "${searchText}"`);
  return null;
}

private calculateFuzzyMatch(search: string, target: string): number {
  // Implementación mejorada de similitud
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

  private countWordMatches(search: string, target: string): number {
    const searchWords = search.split(/\s+/).filter(w => w.length > 2);
    return searchWords.filter(word => target.includes(word)).length;
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
      // Buscar el producto real en la lista con mejor matching
      let productoReal = this.findBestProductMatch(producto.articulo, producto.codigo || '', products);

      if (productoReal) {
        const cantidad = producto.cantidad || 1;
        const descuento = producto.descuento || 0;
        const precioBase = productoReal.precio;
        
        // Aplicar descuento al precio base
        const precioConDescuento = precioBase * (1 - descuento / 100);
        
        // CORREGIDA: Fórmula correcta del IVA
        // El precio base YA incluye el IVA, necesitamos calcular el precio sin IVA
        const factorIva = 1 + (productoReal.impuesto / 100);
        const precioSinIvaReal = precioConDescuento / factorIva;
        const valorIva = precioSinIvaReal * (productoReal.impuesto / 100);
        const total = precioConDescuento * cantidad; // El precio total es el precio con descuento * cantidad

        console.log(`💰 Calculando para ${productoReal.articulo}:`);
        console.log(`   - Precio base: $${precioBase}`);
        console.log(`   - Descuento: ${descuento}%`);
        console.log(`   - Precio con descuento: $${precioConDescuento.toFixed(2)}`);
        console.log(`   - Precio sin IVA: $${precioSinIvaReal.toFixed(2)}`);
        console.log(`   - IVA (${productoReal.impuesto}%): $${valorIva.toFixed(2)}`);
        console.log(`   - Cantidad: ${cantidad}`);
        console.log(`   - Total: $${total.toFixed(2)}`);

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

  private buildImprovedPrompt(message: string, products: ProductInfo[]): string {
    const productsList = products.map(p => `${p.codigo}: ${p.articulo} - Precio: $${p.precio} (IVA: ${p.impuesto}%)`).join('\n');
    
    return `
SISTEMA DE EXTRACCIÓN DE DATOS PARA PEDIDOS

PRODUCTOS DISPONIBLES:
${productsList}

MENSAJE A ANALIZAR:
"${message}"

INSTRUCCIONES ESTRICTAS:
1. Extrae TODA la información del mensaje, incluso si el formato no es perfecto
2. NUNCA retornes null - siempre intenta extraer al menos datos básicos
3. Si falta información, usa valores por defecto razonables
4. Para productos, busca coincidencias por código O por nombre similar
5. Los descuentos pueden estar indicados como [DESCUENTO: X%] o de otras formas
6. Si no hay email válido, usa "no-email@placeholder.com"
7. Si no hay teléfono, usa "No identificado"
8. Si un producto tiene descuento, inclúyelo en el campo "descuento"

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