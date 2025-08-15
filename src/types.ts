export interface ProductInfo {
  codigo: string;
  articulo: string;
  impuesto: number;
  precio: number;
}

export interface ExtractedData {
  productos: Array<{
    codigo: string;
    articulo: string;
    cantidad: number;
    precioSinIva: number;
    total: number;
    descuento?: number; // Nuevo campo para descuentos
  }>;
  factura: string;
  fecha: string;
  cliente: string;
  telefono: string;
  email: string;
  fechaCumpleanos: string;
}

export interface SheetRow {
  codigo: string;
  articulo: string;
  cantidad: number;
  precioSinIva: number;
  total: number;
  factura: string;
  fecha: string;
  cliente: string;
  telefono: string;
  email: string;
  isBot?: boolean;
  descuento?: number; // Nuevo campo para descuentos
}

export interface ClientInfo {
  id: string;
  nombre: string;
  cedula: string;
  email: string;
  fechaCumpleanos: string;
  numeroCompras: number;
  totalGastado: number;
  ticketPromedio: number;
  productosUnicos: number;
  frecuenciaCompra: number;
  primeraCompra: string;
  ultimaCompra: string;
}

export interface ClientUpdate {
  numeroCompras: number;
  totalGastado: number;
  ticketPromedio: number;
  productosUnicos: number;
  frecuenciaCompra: number;
  primeraCompra: string;
  ultimaCompra: string;
}

// Nuevos tipos para validación
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  confidence: number; // 0-100 confianza en la extracción
}

export interface ProcessingStats {
  messagesProcessed: number;
  successfulExtractions: number;
  fallbackExtractions: number;
  emergencyExtractions: number;
  averageConfidence: number;
}