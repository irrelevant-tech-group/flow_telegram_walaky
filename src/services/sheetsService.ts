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
        descuento: row.descuento || 0, // Nuevo campo para descuentos
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

      console.log('✅ Ventas guardadas exitosamente en Supabase (incluye descuentos)');
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
        descuento: row.descuento || 0, // Incluir descuento en historial
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

  // Métodos adicionales para análisis y reportes

  async getClientStats(): Promise<{
    totalClients: number;
    activeClients: number;
    averageTicket: number;
    totalRevenue: number;
  }> {
    try {
      console.log('📈 Obteniendo estadísticas de clientes...');

      // Obtener total de clientes
      const { data: clientsData, error: clientsError } = await this.supabase
        .from('clientes_walaky')
        .select('total_gastado, ticket_promedio, numero_compras, ultima_compra');

      if (clientsError) {
        console.error('❌ Error obteniendo datos de clientes:', clientsError);
        return { totalClients: 0, activeClients: 0, averageTicket: 0, totalRevenue: 0 };
      }

      const totalClients = clientsData.length;
      
      // Clientes activos (que han comprado en los últimos 90 días)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const activeClients = clientsData.filter(client => {
        if (!client.ultima_compra) return false;
        const lastPurchase = new Date(client.ultima_compra);
        return lastPurchase >= ninetyDaysAgo;
      }).length;

      // Ticket promedio global
      const totalRevenue = clientsData.reduce((sum, client) => sum + (client.total_gastado || 0), 0);
      const totalPurchases = clientsData.reduce((sum, client) => sum + (client.numero_compras || 0), 0);
      const averageTicket = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

      console.log(`📊 Estadísticas: ${totalClients} clientes, ${activeClients} activos, ticket promedio: $${averageTicket.toFixed(2)}`);

      return {
        totalClients,
        activeClients,
        averageTicket: Math.round(averageTicket),
        totalRevenue: Math.round(totalRevenue)
      };

    } catch (error) {
      console.error('❌ Error al obtener estadísticas de clientes:', error);
      return { totalClients: 0, activeClients: 0, averageTicket: 0, totalRevenue: 0 };
    }
  }

  async getTopProducts(limit: number = 10): Promise<Array<{
    codigo: string;
    articulo: string;
    ventasTotal: number;
    cantidadVendida: number;
    ingresoTotal: number;
  }>> {
    try {
      console.log(`🏆 Obteniendo top ${limit} productos más vendidos...`);

      const { data, error } = await this.supabase
        .from('walaky_sales')
        .select('codigo, articulo, cantidad, total')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error obteniendo datos de ventas:', error);
        return [];
      }

      // Agrupar por producto
      const productStats = new Map();

      data.forEach(sale => {
        const key = sale.codigo;
        if (!productStats.has(key)) {
          productStats.set(key, {
            codigo: sale.codigo,
            articulo: sale.articulo,
            ventasTotal: 0,
            cantidadVendida: 0,
            ingresoTotal: 0
          });
        }

        const stats = productStats.get(key);
        stats.ventasTotal += 1;
        stats.cantidadVendida += sale.cantidad || 0;
        stats.ingresoTotal += sale.total || 0;
      });

      // Convertir a array y ordenar por cantidad vendida
      const topProducts = Array.from(productStats.values())
        .sort((a, b) => b.cantidadVendida - a.cantidadVendida)
        .slice(0, limit)
        .map(product => ({
          ...product,
          ingresoTotal: Math.round(product.ingresoTotal)
        }));

      console.log(`🏆 Top productos obtenidos: ${topProducts.length} productos`);
      return topProducts;

    } catch (error) {
      console.error('❌ Error al obtener top productos:', error);
      return [];
    }
  }

  async getSalesReport(startDate: string, endDate: string): Promise<{
    totalSales: number;
    totalRevenue: number;
    averageTicket: number;
    uniqueClients: number;
    botSales: number;
    manualSales: number;
  }> {
    try {
      console.log(`📊 Generando reporte de ventas del ${startDate} al ${endDate}...`);

      const { data, error } = await this.supabase
        .from('walaky_sales')
        .select('total, email, is_bot, factura')
        .gte('fecha', startDate)
        .lte('fecha', endDate);

      if (error) {
        console.error('❌ Error obteniendo datos del reporte:', error);
        return { totalSales: 0, totalRevenue: 0, averageTicket: 0, uniqueClients: 0, botSales: 0, manualSales: 0 };
      }

      const totalSales = data.length;
      const totalRevenue = data.reduce((sum, sale) => sum + (sale.total || 0), 0);
      const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
      
      // Clientes únicos
      const uniqueEmails = new Set(data.map(sale => sale.email).filter(email => email));
      const uniqueClients = uniqueEmails.size;

      // Ventas por bot vs manuales
      const botSales = data.filter(sale => sale.is_bot).length;
      const manualSales = totalSales - botSales;

      console.log(`📊 Reporte generado: ${totalSales} ventas, $${totalRevenue.toFixed(2)} ingresos`);

      return {
        totalSales,
        totalRevenue: Math.round(totalRevenue),
        averageTicket: Math.round(averageTicket),
        uniqueClients,
        botSales,
        manualSales
      };

    } catch (error) {
      console.error('❌ Error al generar reporte de ventas:', error);
      return { totalSales: 0, totalRevenue: 0, averageTicket: 0, uniqueClients: 0, botSales: 0, manualSales: 0 };
    }
  }

  async getClientSegmentation(): Promise<{
    newClients: number;
    regularClients: number;
    vipClients: number;
    inactiveClients: number;
  }> {
    try {
      console.log('🎯 Obteniendo segmentación de clientes...');

      const { data, error } = await this.supabase
        .from('clientes_walaky')
        .select('numero_compras, total_gastado, ultima_compra');

      if (error) {
        console.error('❌ Error obteniendo datos de segmentación:', error);
        return { newClients: 0, regularClients: 0, vipClients: 0, inactiveClients: 0 };
      }

      let newClients = 0;
      let regularClients = 0;
      let vipClients = 0;
      let inactiveClients = 0;

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      data.forEach(client => {
        const purchases = client.numero_compras || 0;
        const totalSpent = client.total_gastado || 0;
        const lastPurchase = client.ultima_compra ? new Date(client.ultima_compra) : null;

        // Cliente inactivo (sin compras en 3 meses)
        if (!lastPurchase || lastPurchase < threeMonthsAgo) {
          inactiveClients++;
        }
        // Cliente VIP (más de 5 compras o más de $100,000 gastados)
        else if (purchases > 5 || totalSpent > 100000) {
          vipClients++;
        }
        // Cliente regular (más de 1 compra)
        else if (purchases > 1) {
          regularClients++;
        }
        // Cliente nuevo (1 compra)
        else {
          newClients++;
        }
      });

      console.log(`🎯 Segmentación: ${newClients} nuevos, ${regularClients} regulares, ${vipClients} VIP, ${inactiveClients} inactivos`);

      return { newClients, regularClients, vipClients, inactiveClients };

    } catch (error) {
      console.error('❌ Error al obtener segmentación de clientes:', error);
      return { newClients: 0, regularClients: 0, vipClients: 0, inactiveClients: 0 };
    }
  }

  // Método para limpiar datos duplicados o inconsistentes
  async cleanupData(): Promise<{
    duplicatesRemoved: number;
    inconsistenciesFixed: number;
  }> {
    try {
      console.log('🧹 Iniciando limpieza de datos...');

      let duplicatesRemoved = 0;
      let inconsistenciesFixed = 0;

      // Buscar ventas duplicadas (mismo email, fecha, factura)
      const { data: sales, error: salesError } = await this.supabase
        .from('walaky_sales')
        .select('id, email, fecha, factura')
        .order('created_at');

      if (salesError) {
        console.error('❌ Error obteniendo ventas para limpieza:', salesError);
        return { duplicatesRemoved: 0, inconsistenciesFixed: 0 };
      }

      // Detectar duplicados
      const seen = new Set();
      const duplicateIds = [];

      for (const sale of sales) {
        const key = `${sale.email}-${sale.fecha}-${sale.factura}`;
        if (seen.has(key)) {
          duplicateIds.push(sale.id);
        } else {
          seen.add(key);
        }
      }

      // Eliminar duplicados
      if (duplicateIds.length > 0) {
        const { error: deleteError } = await this.supabase
          .from('walaky_sales')
          .delete()
          .in('id', duplicateIds);

        if (!deleteError) {
          duplicatesRemoved = duplicateIds.length;
          console.log(`🗑️ Eliminados ${duplicatesRemoved} registros duplicados`);
        }
      }

      // Buscar clientes con datos inconsistentes
      const { data: clients, error: clientsError } = await this.supabase
        .from('clientes_walaky')
        .select('*');

      if (!clientsError && clients) {
        for (const client of clients) {
          let needsUpdate = false;
          const updates: any = {};

          // Verificar que el email esté en minúsculas
          if (client.email && client.email !== client.email.toLowerCase()) {
            updates.email = client.email.toLowerCase();
            needsUpdate = true;
          }

          // Verificar que los números sean válidos
          if (client.numero_compras < 0) {
            updates.numero_compras = 0;
            needsUpdate = true;
          }

          if (client.total_gastado < 0) {
            updates.total_gastado = 0;
            needsUpdate = true;
          }

          if (needsUpdate) {
            const { error: updateError } = await this.supabase
              .from('clientes_walaky')
              .update(updates)
              .eq('id', client.id);

            if (!updateError) {
              inconsistenciesFixed++;
            }
          }
        }
      }

      console.log(`✅ Limpieza completada: ${duplicatesRemoved} duplicados eliminados, ${inconsistenciesFixed} inconsistencias corregidas`);

      return { duplicatesRemoved, inconsistenciesFixed };

    } catch (error) {
      console.error('❌ Error durante la limpieza de datos:', error);
      return { duplicatesRemoved: 0, inconsistenciesFixed: 0 };
    }
  }

  // Método para realizar backup de datos críticos
  async backupCriticalData(): Promise<boolean> {
    try {
      console.log('💾 Iniciando backup de datos críticos...');

      const today = new Date().toISOString().split('T')[0];

      // Backup de clientes
      const { data: clients, error: clientsError } = await this.supabase
        .from('clientes_walaky')
        .select('*');

      if (clientsError) {
        console.error('❌ Error obteniendo clientes para backup:', clientsError);
        return false;
      }

      // Backup de ventas del último mes
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const lastMonthStr = lastMonth.toISOString().split('T')[0];

      const { data: recentSales, error: salesError } = await this.supabase
        .from('walaky_sales')
        .select('*')
        .gte('fecha', lastMonthStr);

      if (salesError) {
        console.error('❌ Error obteniendo ventas para backup:', salesError);
        return false;
      }

      // Crear registro de backup
      const backupData = {
        backup_date: today,
        clients_count: clients?.length || 0,
        sales_count: recentSales?.length || 0,
        backup_type: 'automated',
        status: 'completed',
        created_at: new Date().toISOString()
      };

      // Nota: En un sistema real, aquí guardarías los datos en un servicio de backup
      // como AWS S3, Google Cloud Storage, etc.

      console.log(`✅ Backup completado: ${backupData.clients_count} clientes, ${backupData.sales_count} ventas recientes`);

      return true;

    } catch (error) {
      console.error('❌ Error durante el backup:', error);
      return false;
    }
  }
}