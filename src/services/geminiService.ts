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
    const prompt = this.buildPrompt(message, products);
    
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
        const errorText = await response.text();
        console.error('Error en la respuesta de Gemini:', response.status, errorText);
        return this.fallbackExtraction(message, products);
      }

      const data: GeminiResponse = await response.json();
      
      if (!data.candidates || !data.candidates[0]) {
        console.error('Respuesta inválida de Gemini:', data);
        return this.fallbackExtraction(message, products);
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
        
        // IMPORTANTE: Corregir precios después del parsing
        const correctedData = this.correctPricesAndCalculateIVA(parsedData, products);
        
        console.log('✅ Datos corregidos con precios reales:', correctedData);
        return correctedData;
        
      } catch (parseError) {
        console.error('Error al parsear respuesta de Gemini:', parseError);
        return this.fallbackExtraction(message, products);
      }
    } catch (error) {
      console.error('Error al llamar a Gemini:', error);
      return this.fallbackExtraction(message, products);
    }
  }

  private correctPricesAndCalculateIVA(data: any, products: ProductInfo[]): ExtractedData {
    const productosCorregidos = data.productos.map((producto: any) => {
      // Buscar el producto real en la lista con mejor matching
      let productoReal = this.findBestProductMatch(producto.articulo, producto.codigo || '', products);

      if (productoReal) {
        const cantidad = producto.cantidad || 1;
        const precioSinIva = productoReal.precio;
        
        // CORREGIDA: Fórmula correcta del IVA
        // El precio base YA incluye el IVA, necesitamos calcular el precio sin IVA
        const factorIva = 1 + (productoReal.impuesto / 100);
        const precioSinIvaReal = precioSinIva / factorIva;
        const valorIva = precioSinIvaReal * (productoReal.impuesto / 100);
        const total = precioSinIva * cantidad; // El precio total es el precio base * cantidad

        console.log(`💰 Calculando para ${productoReal.articulo}:`);
        console.log(`   - Precio con IVA (base): $${precioSinIva}`);
        console.log(`   - Precio sin IVA: $${precioSinIvaReal.toFixed(2)}`);
        console.log(`   - IVA (${productoReal.impuesto}%): $${valorIva.toFixed(2)}`);
        console.log(`   - Cantidad: ${cantidad}`);
        console.log(`   - Total: $${total.toFixed(2)}`);

        return {
          codigo: productoReal.codigo,
          articulo: productoReal.articulo,
          cantidad: cantidad,
          precioSinIva: Math.round(precioSinIvaReal),
          total: Math.round(total)
        };
      } else {
        console.warn(`⚠️ Producto no encontrado: ${producto.articulo} (código: ${producto.codigo})`);
        return {
          codigo: producto.codigo || 'N/A',
          articulo: producto.articulo,
          cantidad: producto.cantidad || 1,
          precioSinIva: 0,
          total: 0
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

  private findBestProductMatch(searchText: string, searchCode: string, products: ProductInfo[]): ProductInfo | null {
    const searchLower = searchText.toLowerCase();
    
    // 1. Búsqueda exacta por código
    if (searchCode) {
      const exactCodeMatch = products.find(p => p.codigo.toLowerCase() === searchCode.toLowerCase());
      if (exactCodeMatch) return exactCodeMatch;
    }

    // 2. Mapeo de alias comunes a productos
    const productAliases: { [key: string]: string[] } = {
      'shampoo herbal': ['shampoo', 'herbal'],
      'shampoo frutal': ['shampoo', 'frutal'], 
      'tratamiento': ['tratamiento', 'mascarilla'],
      'tónico de cannabis': ['tonico', 'cannabis'],
      'suero capilar': ['suero', 'capilar'],
      'exfoliante de café': ['exfoliante', 'cafe'],
      'styling cream': ['styling', 'cream', 'crema'],
      'termoprotector': ['termoprotector', 'termo']
    };

    // 3. Búsqueda por alias
    for (const [productKey, aliases] of Object.entries(productAliases)) {
      const matchesAllAliases = aliases.every(alias => searchLower.includes(alias.toLowerCase()));
      if (matchesAllAliases) {
        const product = products.find(p => 
          p.articulo.toLowerCase().includes(productKey) || 
          aliases.some(alias => p.articulo.toLowerCase().includes(alias))
        );
        if (product) return product;
      }
    }

    // 4. Búsqueda por palabras clave individuales
    const keywordMatches = products.filter(p => {
      const productLower = p.articulo.toLowerCase();
      const searchWords = searchLower.split(/\s+/);
      return searchWords.some(word => 
        word.length > 2 && productLower.includes(word)
      );
    });

    if (keywordMatches.length > 0) {
      // Retornar el que tenga más coincidencias
      return keywordMatches.reduce((best, current) => {
        const bestMatches = this.countWordMatches(searchLower, best.articulo.toLowerCase());
        const currentMatches = this.countWordMatches(searchLower, current.articulo.toLowerCase());
        return currentMatches > bestMatches ? current : best;
      });
    }

    // 5. Búsqueda difusa (similar)
    const fuzzyMatches = products.filter(p => 
      this.calculateSimilarity(searchLower, p.articulo.toLowerCase()) > 0.3
    );

    if (fuzzyMatches.length > 0) {
      return fuzzyMatches.reduce((best, current) => {
        const bestSim = this.calculateSimilarity(searchLower, best.articulo.toLowerCase());
        const currentSim = this.calculateSimilarity(searchLower, current.articulo.toLowerCase());
        return currentSim > bestSim ? current : best;
      });
    }

    return null;
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

  private fallbackExtraction(message: string, products: ProductInfo[]): ExtractedData {
    console.log('🔄 Usando extracción de fallback...');
    
    const lines = message.split('\n').map(line => line.trim()).filter(line => line);
    
    // Extraer cliente (primera línea que no sea email, teléfono o dirección)
    const cliente = lines.find(line => 
      !line.includes('@') && 
      !line.includes('CC') && 
      !line.includes('FC') && 
      !line.match(/^\d+/) && 
      !line.includes('Cra ') && 
      !line.includes('Calle ') &&
      !line.includes('PAGA') &&
      !line.includes('NO PAGA') &&
      line.length > 3
    ) || 'Cliente no identificado';
    
    const telefonoMatch = message.match(/(\d{3}\s?\d{3,4}\s?\d{4})/);
    const telefono = telefonoMatch ? telefonoMatch[1] : 'No identificado';
    
    const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : 'No identificado';
    
    const fechaMatch = message.match(/(\d{1,2}\s+de\s+\w+)/i);
    const fecha = fechaMatch ? fechaMatch[1] : new Date().toLocaleDateString('es-ES');
    
    // Extraer fecha de cumpleaños
    let fechaCumpleanos = '';
    const cumpleanosMatch = message.match(/FC\s+(\d{1,2})\s+de\s+(\w+)/i);
    if (cumpleanosMatch) {
      const dia = cumpleanosMatch[1];
      const mesNombre = cumpleanosMatch[2].toLowerCase();
      const meses: { [key: string]: number } = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
        'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
      };
      const mesNumero = meses[mesNombre];
      if (mesNumero) {
        fechaCumpleanos = `${dia}/${mesNumero}`;
      }
    }
    
    // Buscar línea de productos (generalmente después de los datos personales)
    const productLine = lines.find(line => 
      line.toLowerCase().includes('shampoo') ||
      line.toLowerCase().includes('tratamiento') ||
      line.toLowerCase().includes('tónico') ||
      line.toLowerCase().includes('suero') ||
      line.toLowerCase().includes('exfoliante') ||
      line.toLowerCase().includes('styling') ||
      line.toLowerCase().includes('termoprotector')
    );

    let productosEncontrados: ProductInfo[] = [];
    
    if (productLine) {
      console.log('📦 Línea de productos encontrada:', productLine);
      
      // Dividir por '+' y limpiar cada producto
      const productNames = productLine.split('+').map(name => name.trim());
      
      for (const productName of productNames) {
        const matchedProduct = this.findBestProductMatch(productName, '', products);
        if (matchedProduct) {
          productosEncontrados.push(matchedProduct);
          console.log(`✅ Producto encontrado: ${productName} -> ${matchedProduct.articulo}`);
        } else {
          console.warn(`❌ Producto no encontrado: ${productName}`);
        }
      }
    }
    
    // Si no se encontraron productos, usar productos por defecto
    if (productosEncontrados.length === 0) {
      productosEncontrados.push(...products.slice(0, 1));
      console.log('⚠️ Usando productos por defecto');
    }
    
    const productosConPrecios = productosEncontrados.map(producto => {
      const cantidad = 1;
      const factorIva = 1 + (producto.impuesto / 100);
      const precioSinIvaReal = producto.precio / factorIva;
      const total = producto.precio * cantidad;
      
      return {
        codigo: producto.codigo,
        articulo: producto.articulo,
        cantidad: cantidad,
        precioSinIva: Math.round(precioSinIvaReal),
        total: Math.round(total)
      };
    });
    
    return {
      productos: productosConPrecios,
      factura: 'N/A',
      fecha: fecha,
      cliente: cliente,
      telefono: telefono,
      email: email,
      fechaCumpleanos: fechaCumpleanos
    };
  }

  private buildPrompt(message: string, products: ProductInfo[]): string {
    const productsList = products.map(p => `${p.codigo}: ${p.articulo} - Precio: $${p.precio} (IVA: ${p.impuesto}%)`).join('\n');
    
    return `
Analiza el siguiente mensaje de Telegram y extrae la información solicitada. 

PRODUCTOS DISPONIBLES:
${productsList}

MENSAJE A ANALIZAR:
"${message}"

INSTRUCCIONES MUY IMPORTANTES:
1. Identifica TODOS los productos mencionados en el mensaje
2. Los productos pueden estar separados por "+" o en una sola línea
3. Busca coincidencias parciales inteligentes:
   - "Shampoo herbal" debe coincidir con productos que contengan "shampoo"
   - "Tratamiento" debe coincidir con productos que contengan "tratamiento" o "mascarilla"
   - "Tónico de Cannabis" debe coincidir con productos que contengan "tónico" y "cannabis"
   - "Suero Capilar" debe coincidir con productos que contengan "suero"
   - "Styling cream" debe coincidir con productos que contengan "styling" o "cream"
   - "Termoprotector" debe coincidir con productos que contengan "termoprotector"

4. USA SOLAMENTE productos que estén en la lista disponible
5. NO inventes códigos o nombres de productos
6. Si no encuentras un producto exacto, busca el más similar de la lista
7. NO incluyas precios en el JSON - se calcularán automáticamente

FORMATO DE RESPUESTA - Solo devuelve este JSON sin texto adicional:
{
  "productos": [
    {
      "codigo": "código_exacto_de_la_lista",
      "articulo": "nombre_exacto_del_articulo_de_la_lista",
      "cantidad": 1
    }
  ],
  "factura": "número de factura o 'N/A'",
  "fecha": "fecha en formato DD/MM/YYYY",
  "cliente": "nombre completo del cliente (sin CC)",
  "telefono": "número de teléfono",
  "email": "correo electrónico",
  "fechaCumpleanos": "fecha de cumpleaños en formato D/M"
}

EJEMPLOS DE CONVERSIÓN FECHAS CUMPLEAÑOS:
- "FC 19 de mayo" → "19/5"
- "FC 26 de septiembre" → "26/9"
- "FC 13 de abril" → "13/4"

RESPONDE ÚNICAMENTE CON EL JSON:
`;
  }
}