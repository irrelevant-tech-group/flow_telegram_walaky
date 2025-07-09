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
        }
        
        const cleanJsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (cleanJsonMatch && !jsonMatch) {
          jsonText = cleanJsonMatch[0];
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
      // Buscar el producto real en la lista
      const productoReal = products.find(p => 
        p.codigo === producto.codigo || 
        p.articulo.toLowerCase().includes(producto.articulo.toLowerCase()) ||
        producto.articulo.toLowerCase().includes(p.articulo.toLowerCase())
      );

      if (productoReal) {
        const cantidad = producto.cantidad || 1;
        const precioSinIva = productoReal.precio;
        const porcentajeIva = productoReal.impuesto / 100;
        const valorIva = precioSinIva * porcentajeIva;
        const total = (precioSinIva + valorIva) * cantidad;

        console.log(`💰 Calculando para ${productoReal.articulo}:`);
        console.log(`   - Precio sin IVA: $${precioSinIva}`);
        console.log(`   - IVA (${productoReal.impuesto}%): $${valorIva.toFixed(2)}`);
        console.log(`   - Cantidad: ${cantidad}`);
        console.log(`   - Total: $${total.toFixed(2)}`);

        return {
          codigo: productoReal.codigo,
          articulo: productoReal.articulo,
          cantidad: cantidad,
          precioSinIva: precioSinIva,
          total: total
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
      email: data.email
    };
  }

  private fallbackExtraction(message: string, products: ProductInfo[]): ExtractedData {
    console.log('🔄 Usando extracción de fallback...');
    
    const lines = message.split('\n');
    
    const cliente = lines.find(line => line.trim() && !line.includes('@') && !line.includes('CC'))?.trim() || 'Cliente no identificado';
    
    const telefonoMatch = message.match(/(\d{3}\s?\d{3,4}\s?\d{4})/);
    const telefono = telefonoMatch ? telefonoMatch[1] : 'No identificado';
    
    const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : 'No identificado';
    
    const fechaMatch = message.match(/(\d{1,2}\s+de\s+\w+)/i);
    const fecha = fechaMatch ? fechaMatch[1] : new Date().toLocaleDateString('es-ES');
    
    // Buscar productos con mejor lógica
    const productosEncontrados: ProductInfo[] = [];
    
    const messageLower = message.toLowerCase();
    
    // Buscar productos específicos mencionados
    products.forEach(product => {
      const articuloLower = product.articulo.toLowerCase();
      if (messageLower.includes(articuloLower)) {
        productosEncontrados.push(product);
      }
    });
    
    // Si no encontramos productos específicos, buscar por palabras clave
    if (productosEncontrados.length === 0) {
      if (messageLower.includes('shampoo')) {
        const shampoo = products.find(p => p.articulo.toLowerCase().includes('shampoo'));
        if (shampoo) productosEncontrados.push(shampoo);
      }
      
      if (messageLower.includes('kit')) {
        const kitMatch = messageLower.match(/kit\s*(\d+)/);
        if (kitMatch) {
          const kitNumber = kitMatch[1].padStart(3, '0');
          const kit = products.find(p => p.articulo.toLowerCase().includes(`kit ${kitNumber}`));
          if (kit) productosEncontrados.push(kit);
        }
      }
    }
    
    // Si aún no hay productos, usar productos por defecto
    if (productosEncontrados.length === 0) {
      productosEncontrados.push(...products.slice(0, 1));
    }
    
    const productosConPrecios = productosEncontrados.map(producto => {
      const cantidad = 1;
      const precioSinIva = producto.precio;
      const porcentajeIva = producto.impuesto / 100;
      const valorIva = precioSinIva * porcentajeIva;
      const total = (precioSinIva + valorIva) * cantidad;
      
      return {
        codigo: producto.codigo,
        articulo: producto.articulo,
        cantidad: cantidad,
        precioSinIva: precioSinIva,
        total: total
      };
    });
    
    return {
      productos: productosConPrecios,
      factura: 'N/A',
      fecha: fecha,
      cliente: cliente,
      telefono: telefono,
      email: email
    };
  }

  private buildPrompt(message: string, products: ProductInfo[]): string {
    const productsList = products.map(p => `${p.codigo}: ${p.articulo} - Precio: $${p.precio} (IVA: ${p.impuesto}%)`).join('\n');
    
    return `
Analiza el siguiente mensaje de Telegram y extrae la información solicitada. 

Productos disponibles:
${productsList}

Mensaje a analizar:
"${message}"

Extrae la siguiente información y devuélvela ÚNICAMENTE en formato JSON válido:

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
  "cliente": "nombre completo del cliente",
  "telefono": "número de teléfono",
  "email": "correo electrónico"
}

INSTRUCCIONES IMPORTANTES:
1. Busca EXACTAMENTE los productos mencionados en la lista de productos disponibles
2. Usa el código y artículo EXACTOS de la lista
3. NO incluyas precios en el JSON - esos se calcularán automáticamente
4. Si mencionan "Shampoo 500ml", busca exactamente ese producto en la lista
5. Si mencionan "Kit 002", busca exactamente ese producto en la lista
6. Solo incluye productos que realmente aparezcan en la lista disponible

Responde ÚNICAMENTE con el JSON, sin texto adicional.
`;
  }
}