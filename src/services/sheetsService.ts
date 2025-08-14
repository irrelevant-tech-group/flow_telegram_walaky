const { google } = require('googleapis');
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ProductInfo, SheetRow, ClientInfo, ClientUpdate } from '../types';

export class SheetsService {
  private sheets: any;
  private auth: any;
  private supabase: SupabaseClient;

  constructor() {
    // Configurar Google Sheets (solo para productos)
    this.auth = new google.auth.GoogleAuth({
      keyFile: './creds.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });

    // Configurar Supabase (para ventas y clientes)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Conexión a Supabase establecida');
  }

  // PRODUCTOS - Se mantiene en Google Sheets
  async getProductsFromSheet(): Promise<ProductInfo[]> {
    const PRODUCTS_SHEET_ID = process.env.PRODUCTS_SHEET_ID;
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCTS_SHEET_ID,
        range: 'A:D',
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return [];

      const products = rows.slice(1).map((row: any[]) => {
        const precioStr = (row[3] || '0').toString().replace(/[$,]/g, '');
        const impuestoStr = (row[2] || '19%').toString().replace('%', '');
        
        return {
          codigo: row[0] || '',
          articulo: row[1] || '',
          impuesto: parseFloat(impuestoStr) || 19,
          precio: parseFloat(precioStr) || 0,
        };
      });

      console.log('📋 Productos cargados desde Google Sheets:');
      products.slice(0, 5).forEach(p => {
        console.log(`  ${p.codigo}: ${p.articulo} - $${p.precio} (IVA: ${p.impuesto}%)`);
      });
      console.log(`  ... y ${products.length - 5} productos más`);

      return products;
    } catch (error) {
      console.error('Error al obtener productos:', error);
      return [];
    }
  }

  // VENTAS - Ahora se guarda en Supabase
  async insertDataToSheet(data: SheetRow[]): Promise<boolean> {
    try {
      console.log('💾 Guardando ventas en Supabase...');
      
      const ventasData = data.map(row => ({
        codigo: row.codigo,
        articulo: row.articulo,
        cantidad: row.cantidad,
        precio_sin_iva: row.precioSinIva,
        total: row.total,
        factura: row.factura,
        fecha: row.fecha,
        cliente: row.cliente,
        telefono: row.telefono,
        email: row.email,
        is_bot: true,
        created_at: new Date().toISOString()
      }));

      const { data: insertedData, error } = await this.supabase
        .from('walaky_sales')
        .insert(ventasData);

      if (error) {
        console.error('❌ Error insertando ventas en Supabase:', error);
        return false;
      }

      console.log('✅ Ventas guardadas exitosamente en Supabase (marcadas como bot=true)');
      return true;
    } catch (error) {
      console.error('❌ Error al insertar datos en Supabase:', error);
      return false;
    }
  }

  // CLIENTES - Ahora se maneja en Supabase
  async getClientByEmail(email: string): Promise<ClientInfo | null> {
    try {
      console.log(`🔍 Buscando cliente con email: ${email}`);
      
      const { data, error } = await this.supabase
        .from('clientes_walaky')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No se encontró el cliente
          console.log('👤 Cliente no encontrado en Supabase');
          return null;
        }
        console.error('❌ Error buscando cliente:', error);
        return null;
      }

      console.log('✅ Cliente encontrado en Supabase');
      return {
        id: data.sheet_id || '',
        nombre: data.nombre || '',
        cedula: data.cedula || '',
        email: data.email || '',
        fechaCumpleanos: data.fecha_cumpleanos || '',
        numeroCompras: data.numero_compras || 0,
        totalGastado: data.total_gastado || 0,
        ticketPromedio: data.ticket_promedio || 0,
        productosUnicos: data.productos_unicos || 0,
        frecuenciaCompra: data.frecuencia_compra_dias || 0,
        primeraCompra: data.primera_compra || '',
        ultimaCompra: data.ultima_compra || '',
      };

    } catch (error) {
      console.error('❌ Error al buscar cliente en Supabase:', error);
      return null;
    }
  }

  async updateClient(email: string, updates: ClientUpdate): Promise<boolean> {
    try {
      console.log(`🔄 Actualizando cliente con email: ${email}`);
      
      const updateData = {
        numero_compras: updates.numeroCompras,
        total_gastado: updates.totalGastado,
        ticket_promedio: updates.ticketPromedio,
        productos_unicos: updates.productosUnicos,
        frecuencia_compra_dias: updates.frecuenciaCompra,
        primera_compra: updates.primeraCompra,
        ultima_compra: updates.ultimaCompra,
        updated_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('clientes_walaky')
        .update(updateData)
        .eq('email', email.toLowerCase());

      if (error) {
        console.error('❌ Error actualizando cliente:', error);
        return false;
      }

      console.log('✅ Cliente actualizado exitosamente en Supabase');
      return true;
    } catch (error) {
      console.error('❌ Error al actualizar cliente en Supabase:', error);
      return false;
    }
  }

  async addNewClient(clientInfo: ClientInfo): Promise<boolean> {
    try {
      console.log('➕ Agregando nuevo cliente a Supabase...');
      
      const newClientData = {
        sheet_id: clientInfo.id,
        nombre: clientInfo.nombre,
        cedula: clientInfo.cedula,
        email: clientInfo.email.toLowerCase(),
        fecha_cumpleanos: clientInfo.fechaCumpleanos,
        numero_compras: clientInfo.numeroCompras,
        total_gastado: clientInfo.totalGastado,
        ticket_promedio: clientInfo.ticketPromedio,
        productos_unicos: clientInfo.productosUnicos,
        frecuencia_compra_dias: clientInfo.frecuenciaCompra,
        primera_compra: clientInfo.primeraCompra,
        ultima_compra: clientInfo.ultimaCompra,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('clientes_walaky')
        .insert([newClientData]);

      if (error) {
        console.error('❌ Error agregando cliente:', error);
        return false;
      }

      console.log('✅ Nuevo cliente agregado exitosamente a Supabase');
      return true;
    } catch (error) {
      console.error('❌ Error al agregar nuevo cliente a Supabase:', error);
      return false;
    }
  }

  async getNextClientId(): Promise<string> {
    try {
      console.log('🔢 Obteniendo próximo ID de cliente...');
      
      const { data, error } = await this.supabase
        .from('clientes_walaky')
        .select('sheet_id')
        .order('sheet_id', { ascending: false })
        .limit(1);

      if (error) {
        console.error('❌ Error obteniendo último ID:', error);
        return '001';
      }

      if (!data || data.length === 0) {
        console.log('📝 No hay clientes, empezando con ID 001');
        return '001';
      }

      const lastId = data[0].sheet_id;
      const numericId = parseInt(lastId) || 0;
      const nextId = (numericId + 1).toString().padStart(3, '0');
      
      console.log(`🔢 Próximo ID de cliente: ${nextId} (último ID: ${lastId})`);
      return nextId;

    } catch (error) {
      console.error('❌ Error al obtener próximo ID de cliente:', error);
      return '001';
    }
  }

  async getClientPurchaseHistory(email: string): Promise<SheetRow[]> {
    try {
      console.log(`📊 Obteniendo historial de compras para: ${email}`);
      
      const { data, error } = await this.supabase
        .from('walaky_sales')
        .select('*')
        .eq('email', email.toLowerCase())
        .order('fecha', { ascending: false });

      if (error) {
        console.error('❌ Error obteniendo historial:', error);
        return [];
      }

      const purchaseHistory = data.map(row => ({
        codigo: row.codigo || '',
        articulo: row.articulo || '',
        cantidad: row.cantidad || 0,
        precioSinIva: row.precio_sin_iva || 0,
        total: row.total || 0,
        factura: row.factura || '',
        fecha: row.fecha || '',
        cliente: row.cliente || '',
        telefono: row.telefono || '',
        email: row.email || '',
        isBot: row.is_bot || false,
      }));

      console.log(`📊 Historial obtenido: ${purchaseHistory.length} compras`);
      return purchaseHistory;
    } catch (error) {
      console.error('❌ Error al obtener historial de compras:', error);
      return [];
    }
  }

  // Método para verificar la conexión con Supabase
  async testSupabaseConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('walaky_sales')
        .select('id')
        .limit(1);

      if (error) {
        console.error('❌ Error conectando con Supabase:', error);
        return false;
      }

      console.log('✅ Conexión con Supabase verificada');
      return true;
    } catch (error) {
      console.error('❌ Error verificando conexión con Supabase:', error);
      return false;
    }
  }
}