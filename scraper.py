import http.client
import ssl
import json
import anthropic
import time
import random
from typing import List, Dict, Optional
import re
from datetime import datetime

class WhatsAppScraperClaudeProduction:
    def __init__(self, instance_id: str, token: str, claude_api_key: str):
        self.instance_id = instance_id
        self.token = token
        self.base_url = "api.ultramsg.com"
        
        # Configurar Claude
        self.claude_client = anthropic.Anthropic(api_key=claude_api_key)
        
        # Configuración de seguridad MÁXIMA para producción
        self.whatsapp_delay_min = 15
        self.whatsapp_delay_max = 25
        self.claude_delay = 2
        self.checkpoint_delay = 45
        
        # CONTADOR DE COSTOS CLAUDE
        self.cost_tracking = {
            'input_tokens': 0,
            'output_tokens': 0,
            'total_requests': 0,
            'verification_requests': 0,
            'format_requests': 0,
            'crm_extraction_requests': 0
        }
        
        # Precios Claude 3.5 Haiku (por 1M tokens)
        self.claude_prices = {
            'input_price_per_1m': 0.80,   # $0.25 por 1M input tokens
            'output_price_per_1m': 4.00  # $1.25 por 1M output tokens
        }
    
    def track_claude_usage(self, response, request_type: str):
        """Rastrea el uso de tokens y costos de Claude"""
        try:
            usage = response.usage
            input_tokens = usage.input_tokens
            output_tokens = usage.output_tokens
            
            self.cost_tracking['input_tokens'] += input_tokens
            self.cost_tracking['output_tokens'] += output_tokens
            self.cost_tracking['total_requests'] += 1
            self.cost_tracking[f'{request_type}_requests'] += 1
            
            print(f"💰 {request_type}: {input_tokens} in + {output_tokens} out tokens")
            
        except Exception as e:
            print(f"⚠️ Error tracking usage: {e}")
    
    def calculate_total_cost(self) -> Dict[str, float]:
        """Calcula el costo total de la sesión"""
        input_cost = (self.cost_tracking['input_tokens'] / 1_000_000) * self.claude_prices['input_price_per_1m']
        output_cost = (self.cost_tracking['output_tokens'] / 1_000_000) * self.claude_prices['output_price_per_1m']
        total_cost = input_cost + output_cost
        
        return {
            'input_cost': input_cost,
            'output_cost': output_cost,
            'total_cost': total_cost,
            'input_tokens': self.cost_tracking['input_tokens'],
            'output_tokens': self.cost_tracking['output_tokens'],
            'total_requests': self.cost_tracking['total_requests']
        }
    
    def print_cost_summary(self):
        """Imprime resumen detallado de costos"""
        costs = self.calculate_total_cost()
        
        print("\n" + "💰" * 60)
        print("                      RESUMEN DE COSTOS CLAUDE API - PRODUCCIÓN")
        print("💰" * 60)
        print(f"📊 ESTADÍSTICAS DE USO:")
        print(f"   🔢 Total requests: {costs['total_requests']}")
        print(f"   🔍 Verificaciones: {self.cost_tracking['verification_requests']}")
        print(f"   📝 Formateos: {self.cost_tracking['format_requests']}")
        print(f"   🏷️  Extracciones CRM: {self.cost_tracking['crm_extraction_requests']}")
        print()
        print(f"📈 TOKENS UTILIZADOS:")
        print(f"   📥 Input tokens: {costs['input_tokens']:,}")
        print(f"   📤 Output tokens: {costs['output_tokens']:,}")
        print(f"   📊 Total tokens: {costs['input_tokens'] + costs['output_tokens']:,}")
        print()
        print(f"💵 COSTOS DETALLADOS:")
        print(f"   📥 Input cost: ${costs['input_cost']:.4f}")
        print(f"   📤 Output cost: ${costs['output_cost']:.4f}")
        print(f"   💰 COSTO TOTAL SESIÓN: ${costs['total_cost']:.4f}")
        print()
        if costs['total_requests'] > 0:
            cost_per_message = costs['total_cost'] / costs['total_requests']
            print(f"📊 EFICIENCIA:")
            print(f"   💡 Costo por mensaje procesado: ${cost_per_message:.4f}")
            print(f"   📈 Costo estimado 100 mensajes: ${cost_per_message * 100:.2f}")
            print(f"   📈 Costo estimado 1000 mensajes: ${cost_per_message * 1000:.2f}")
        print("💰" * 60)
        
    def safe_delay(self, min_seconds: int, max_seconds: int, message: str = ""):
        """Implementa un delay aleatorio para parecer más humano"""
        delay = random.uniform(min_seconds, max_seconds)
        if message:
            print(f"🛡️  {message} - Esperando {delay:.1f}s...")
        time.sleep(delay)
        
    def get_messages(self, chat_id: str, limit: int = 1000) -> List[Dict]:
        """Obtiene mensajes del grupo de WhatsApp con protección anti-bloqueo MÁXIMA"""
        try:
            print(f"📥 Obteniendo {limit} mensajes de WhatsApp...")
            
            self.safe_delay(
                self.whatsapp_delay_min, 
                self.whatsapp_delay_max,
                "Protección anti-bloqueo WhatsApp MÁXIMA"
            )
            
            conn = http.client.HTTPSConnection(self.base_url, context=ssl._create_unverified_context())
            headers = {'content-type': "application/x-www-form-urlencoded"}
            
            endpoint = f"/{self.instance_id}/chats/messages?token={self.token}&chatId={chat_id}&limit={limit}"
            conn.request("GET", endpoint, headers=headers)
            
            res = conn.getresponse()
            data = res.read()
            messages_data = json.loads(data.decode("utf-8"))
            conn.close()
            
            print(f"✅ {len(messages_data) if isinstance(messages_data, list) else 0} mensajes obtenidos")
            
            self.safe_delay(10, 15, "Cooldown post-WhatsApp EXTENDIDO")
            
            return messages_data if isinstance(messages_data, list) else []
        except Exception as e:
            print(f"❌ Error WhatsApp: {e}")
            print("🛡️  Esperando 120 segundos antes de reintentar...")
            time.sleep(120)
            return []
    
    def quick_filter_message(self, message_text: str) -> bool:
        """Pre-filtro inteligente para reducir llamadas a Claude"""
        if not message_text or len(message_text.strip()) < 30:
            return False
            
        strong_indicators = ['cc ', 'fc ', 'cédula', 'cedula', 'paga', 'envío', 'entrega']
        product_indicators = ['shampoo', 'kit', 'tratamiento', 'sérum', 'serum', 'styling', 'tónico']
        location_indicators = ['barrio', 'calle', 'carrera', 'medellín', 'bogotá', 'cali', 'ant']
        contact_indicators = ['@', 'gmail', 'hotmail', 'llamar', 'escribir']
        
        negative_indicators = [
            'este pedido es diferente', 'no, es el mismo', 'hola', 'gracias',
            'envíos nacionales', 'guía', '¿podrías ayudarme?', 'esperando',
            'hola ana', 'espero estés bien', 'ayudarme con esta guía'
        ]
        
        text_lower = message_text.lower()
        
        if any(neg in text_lower for neg in negative_indicators):
            return False
            
        strong_count = sum(1 for indicator in strong_indicators if indicator in text_lower)
        product_count = sum(1 for indicator in product_indicators if indicator in text_lower)
        location_count = sum(1 for indicator in location_indicators if indicator in text_lower)
        contact_count = sum(1 for indicator in contact_indicators if indicator in text_lower)
        
        indicator_types = sum([
            strong_count > 0,
            product_count > 0, 
            location_count > 0,
            contact_count > 0
        ])
        
        return indicator_types >= 2 and strong_count >= 1
    
    def is_order_message(self, message_text: str) -> bool:
        """Determina si un mensaje es un pedido con máxima robustez"""
        if not self.quick_filter_message(message_text):
            return False
            
        prompt = f"""Analiza si este mensaje de WhatsApp es un PEDIDO DE PRODUCTOS válido.

PEDIDO VÁLIDO debe tener:
- Nombre de persona
- Documento (CC/cédula)  
- Dirección de entrega
- Productos (shampoo, kit, tratamiento, etc.)
- Info de pago/contacto

NO SON PEDIDOS:
- Conversaciones/preguntas
- Confirmaciones administrativas
- Mensajes sobre envíos nacionales
- Respuestas cortas

Mensaje: "{message_text[:600]}"

Responde SOLO: "SI" o "NO" """

        for attempt in range(4):
            try:
                response = self.claude_client.messages.create(
                    model="claude-3-5-sonnet-20240620",
                    max_tokens=5,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=20.0
                )
                
                self.track_claude_usage(response, 'verification')
                
                result = response.content[0].text.strip().upper()
                time.sleep(1)
                return result == "SI"
                
            except Exception as e:
                error_msg = str(e).lower()
                print(f"⚠️ Verificación intento {attempt+1}/4: {str(e)[:50]}...")
                
                if attempt < 3:
                    if "timeout" in error_msg:
                        wait_time = 8 + (attempt * 4)
                    elif "rate" in error_msg:
                        wait_time = 15 + (attempt * 5)
                    else:
                        wait_time = 5 + (attempt * 3)
                    
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"🔄 Usando pre-filtro como fallback final")
                    return (self.quick_filter_message(message_text) and 
                            len(message_text.split('\n')) >= 5 and
                            'cc ' in message_text.lower())
    
    def format_with_claude(self, message_text: str) -> str:
        """Formatear pedido con máxima robustez"""
        prompt = f"""Extrae información de este pedido de WhatsApp en formato exacto:

[Nombre completo de la persona]
CC [número completo de cédula]
FC [fecha completa]
[dirección completa con número y apartamento]
Barrio [nombre del barrio]
[ciudad completa con departamento]
[teléfono completo con notas]
[email completo]
[productos completos con cantidades]
[estado de pago completo con detalles]

REGLAS:
- Mantén TODOS los detalles originales
- Copia direcciones exactas
- Incluye notas de teléfono
- Conserva información de pago completa

Mensaje original:
{message_text}

Formatea manteniendo TODOS los detalles:"""
        
        for attempt in range(4):
            try:
                response = self.claude_client.messages.create(
                    model="claude-3-5-sonnet-20240620",
                    max_tokens=1000,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=25.0
                )
                
                self.track_claude_usage(response, 'format')
                
                time.sleep(self.claude_delay)
                return response.content[0].text.strip()
                
            except Exception as e:
                error_msg = str(e).lower()
                print(f"⚠️ Formateo intento {attempt+1}/4: {str(e)[:40]}...")
                
                if attempt < 3:
                    if "timeout" in error_msg:
                        wait_time = 10 + (attempt * 5)
                    elif "rate" in error_msg:
                        wait_time = 20 + (attempt * 10)
                    else:
                        wait_time = 7 + (attempt * 4)
                    
                    print(f"⏳ Esperando {wait_time}s antes del siguiente intento...")
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"❌ Formateo falló después de 4 intentos")
                    return None
        return None
    
    def extract_crm_data_with_ai(self, formatted_message: str) -> Dict[str, str]:
        """Extrae datos CRM usando Claude AI con máxima robustez"""
        prompt = f"""Del siguiente pedido formateado, extrae ÚNICAMENTE estos 4 datos específicos:

Pedido:
{formatted_message}

Extrae y responde SOLO en este formato JSON:
{{
    "nombre": "nombre completo de la persona (solo el nombre, sin títulos ni anotaciones)",
    "cedula": "número de cédula sin CC (solo números)",
    "email": "dirección de email completa",
    "fecha_cumpleanos": "fecha de cumpleaños (FC) tal como aparece"
}}

REGLAS:
- Si no encuentras algún dato, pon ""
- Para nombre: solo el nombre de la persona, sin (*Inter*), (*Distribuidora*), etc.
- Para cédula: solo los números, sin "CC"
- Para fecha: tal como aparece después de FC
- Responde SOLO el JSON, nada más"""

        for attempt in range(4):
            try:
                response = self.claude_client.messages.create(
                    model="claude-3-5-sonnet-20240620",
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=20.0
                )
                
                self.track_claude_usage(response, 'crm_extraction')
                
                result = response.content[0].text.strip()
                
                try:
                    if "```json" in result:
                        result = result.split("```json")[1].split("```")[0]
                    elif "```" in result:
                        result = result.split("```")[1].split("```")[0]
                    
                    crm_data = json.loads(result)
                    
                    expected_keys = ['nombre', 'cedula', 'email', 'fecha_cumpleanos']
                    if all(key in crm_data for key in expected_keys):
                        time.sleep(0.5)
                        return crm_data
                    else:
                        print(f"⚠️ JSON incompleto en intento {attempt+1}")
                        
                except json.JSONDecodeError:
                    print(f"⚠️ Error JSON en intento {attempt+1}: {result[:50]}...")
                
                if attempt < 3:
                    time.sleep(2 + attempt)
                    continue
                    
            except Exception as e:
                print(f"⚠️ Error extracción CRM intento {attempt+1}/4: {str(e)[:30]}...")
                if attempt < 3:
                    time.sleep(3 + attempt)
                    continue
        
        print(f"❌ Extracción CRM falló - usando datos vacíos")
        return {
            'nombre': '',
            'cedula': '',
            'email': '',
            'fecha_cumpleanos': ''
        }
    
    def scrape_and_format_messages_production(self, chat_id: str, limit: int = 1000, start_from: int = 0) -> List[str]:
        """RUTINA OFICIAL DE PRODUCCIÓN - Máxima seguridad, robustez y tracking"""
        print("🏭" * 30)
        print("                           RUTINA OFICIAL DE PRODUCCIÓN WALAKY")
        print("🏭" * 30)
        print(f"🚀 Iniciando scraping ULTRA-SEGURO del chat {chat_id}")
        print(f"🛡️  Configuración de seguridad MÁXIMA:")
        print(f"   - Delay WhatsApp: {self.whatsapp_delay_min}-{self.whatsapp_delay_max}s")
        print(f"   - Delay Claude: {self.claude_delay}s")
        print(f"   - Checkpoints: {self.checkpoint_delay}s")
        print(f"🧠 Pre-filtro + Claude con 4 reintentos c/u + Extracción AI")
        print(f"💰 Tracking de costos completo activado")
        print(f"📊 Procesando hasta {limit} mensajes")
        print()
        
        # UNA SOLA llamada a WhatsApp
        messages = self.get_messages(chat_id, limit)
        
        if not messages:
            print("❌ No se pudieron obtener mensajes.")
            return []
        
        print(f"📊 {len(messages)} mensajes obtenidos de WhatsApp")
        print(f"🔄 Comenzando análisis inteligente de producción...\n")
        
        formatted_messages = []
        processed_count = 0
        skipped_count = 0
        error_count = 0
        prefilter_rejected = 0
        
        # Cargar progreso previo
        try:
            with open('progreso_produccion_final.txt', 'r', encoding='utf-8') as f:
                content = f.read()
                if content.strip():
                    formatted_messages = content.split('=== PEDIDO SEPARADOR ===\n')
                    formatted_messages = [m.strip() for m in formatted_messages if m.strip()]
                    processed_count = len(formatted_messages)
                    print(f"📥 Cargados {processed_count} pedidos previamente procesados")
                    print()
        except FileNotFoundError:
            print("📝 Iniciando procesamiento de producción desde cero\n")
        
        # Procesar cada mensaje
        for i, message in enumerate(messages[start_from:], start_from):
            if i < processed_count:
                continue
                
            message_text = message.get('body', '')
            
            if not message_text or len(message_text.strip()) < 20:
                skipped_count += 1
                continue
            
            print(f"🔍 Mensaje {i+1}/{len(messages)}")
            print(f"📄 {message_text[:80]}...")
            
            # PASO 1: Pre-filtro rápido
            if not self.quick_filter_message(message_text):
                print(f"⚡ Pre-filtro: RECHAZADO")
                prefilter_rejected += 1
                time.sleep(0.3)
                print()
                continue
            
            print(f"⚡ Pre-filtro: APROBADO → Verificando con Claude...")
            
            # PASO 2: Verificación con Claude
            if self.is_order_message(message_text):
                print(f"🧠 Claude: ES PEDIDO → Formateando...")
                
                # PASO 3: Formatear
                formatted_message = self.format_with_claude(message_text)
                
                if formatted_message:
                    formatted_messages.append(formatted_message)
                    processed_count += 1
                    
                    # Guardar progreso inmediatamente
                    try:
                        with open('progreso_produccion_final.txt', 'w', encoding='utf-8') as f:
                            f.write('\n=== PEDIDO SEPARADOR ===\n'.join(formatted_messages))
                    except Exception as e:
                        print(f"⚠️ Error guardando progreso: {e}")
                    
                    first_line = formatted_message.split('\n')[0] if formatted_message else 'N/A'
                    print(f"✅ PEDIDO {processed_count}: {first_line}")
                    
                    # Checkpoint cada 5 pedidos
                    if processed_count % 5 == 0:
                        partial_cost = self.calculate_total_cost()
                        print(f"\n🔄 CHECKPOINT: {processed_count} pedidos procesados")
                        print(f"💰 Costo parcial: ${partial_cost['total_cost']:.4f}")
                        self.safe_delay(
                            self.checkpoint_delay, 
                            self.checkpoint_delay + 20,
                            f"Pausa estratégica checkpoint"
                        )
                        print()
                else:
                    error_count += 1
                    print(f"❌ ERROR AL FORMATEAR - Continuando...")
            else:
                print(f"🧠 Claude: NO ES PEDIDO")
                skipped_count += 1
            
            # Delay entre mensajes
            if processed_count % 5 != 0:
                self.safe_delay(4, 8, "Delay seguridad producción")
            
            print()
        
        # Estadísticas finales
        total_analyzed = len(messages)
        efficiency = (processed_count / total_analyzed * 100) if total_analyzed > 0 else 0
        
        print("🎉" * 30)
        print("                         PROCESAMIENTO DE PRODUCCIÓN COMPLETADO")
        print("🎉" * 30)
        print(f"📊 ESTADÍSTICAS FINALES:")
        print(f"   📝 Total mensajes: {total_analyzed}")
        print(f"   ⚡ Pre-filtro rechazó: {prefilter_rejected}")
        print(f"   ✅ Pedidos procesados: {processed_count}")
        print(f"   ⏭️ Mensajes saltados: {skipped_count}")
        print(f"   ❌ Errores: {error_count}")
        print(f"   📈 Eficiencia: {efficiency:.1f}%")
        print(f"🛡️ Número WhatsApp PROTEGIDO con delays de seguridad")
        
        return formatted_messages
    
    def generate_final_crm_file(self, formatted_messages: List[str]):
        """Genera CRM final de producción con extracción AI"""
        print(f"\n🧠 Extrayendo datos CRM con Claude AI para {len(formatted_messages)} pedidos...")
        crm_records = []
        
        for i, msg in enumerate(formatted_messages, 1):
            print(f"🔄 Extrayendo CRM {i}/{len(formatted_messages)}...")
            crm_data = self.extract_crm_data_with_ai(msg)
            if crm_data['nombre']:
                crm_records.append(crm_data)
            
            # Delay entre extracciones para no saturar
            if i % 10 == 0:
                print(f"💰 Costo parcial CRM: ${self.calculate_total_cost()['total_cost']:.4f}")
                time.sleep(3)
            else:
                time.sleep(1)
        
        # Guardar CRM final con información completa
        costs = self.calculate_total_cost()
        filename = f"CRM_WALAKY_PRODUCCION_FINAL_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("=" * 80 + "\n")
            f.write("                                CRM WALAKY - PRODUCCIÓN OFICIAL FINAL\n")
            f.write("=" * 80 + "\n\n")
            
            f.write(f"Total de clientes: {len(crm_records)}\n")
            f.write(f"Fecha de extracción: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")
            f.write(f"Procesado con: Claude AI + Filtros inteligentes + Extracción AI\n")
            f.write(f"Costo total sesión: ${costs['total_cost']:.4f}\n")
            f.write(f"Requests totales: {costs['total_requests']}\n\n")
            f.write("=" * 80 + "\n\n")
            
            for i, record in enumerate(crm_records, 1):
                f.write(f"CLIENTE {i:03d}\n")
                f.write("-" * 30 + "\n")
                f.write(f"Nombre: {record['nombre']}\n")
                f.write(f"Cédula: {record['cedula']}\n")
                f.write(f"Email: {record['email']}\n")
                f.write(f"Fecha cumpleaños: {record['fecha_cumpleanos']}\n")
                f.write("\n")
        
        print(f"\n📊 CRM FINAL OFICIAL generado: {filename}")
        print(f"👥 {len(crm_records)} clientes procesados")
        
        # Estadísticas CRM
        if crm_records:
            emails_validos = len([r for r in crm_records if '@' in r.get('email', '')])
            cedulas_validas = len([r for r in crm_records if r.get('cedula')])
            fechas_validas = len([r for r in crm_records if r.get('fecha_cumpleanos') and r['fecha_cumpleanos']])
            
            print(f"📧 Emails válidos: {emails_validos} ({emails_validos/len(crm_records)*100:.1f}%)")
            print(f"🆔 Cédulas válidas: {cedulas_validas} ({cedulas_validas/len(crm_records)*100:.1f}%)")
            print(f"🎂 Fechas cumpleaños: {fechas_validas} ({fechas_validas/len(crm_records)*100:.1f}%)")
        
        return filename
    
    def save_final_production_files(self, formatted_messages: List[str]):
        """Guarda archivos finales de producción"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Pedidos completos
        pedidos_filename = f"PEDIDOS_WALAKY_PRODUCCION_FINAL_{timestamp}.txt"
        with open(pedidos_filename, 'w', encoding='utf-8') as f:
            f.write("=" * 80 + "\n")
            f.write("                             PEDIDOS WALAKY - PRODUCCIÓN OFICIAL FINAL\n")
            f.write("=" * 80 + "\n\n")
            f.write(f"Total pedidos: {len(formatted_messages)}\n")
            f.write(f"Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")
            f.write(f"Procesado con máxima seguridad y robustez\n\n")
            f.write("=" * 80 + "\n\n")
            
            for i, message in enumerate(formatted_messages, 1):
                f.write(f"=== PEDIDO {i:03d} ===\n")
                f.write(message)
                f.write("\n\n" + "="*60 + "\n\n")
        
        print(f"📁 PEDIDOS FINALES guardados: {pedidos_filename}")
        
        # Generar CRM con AI
        crm_filename = self.generate_final_crm_file(formatted_messages)
        
        return pedidos_filename, crm_filename

# EJECUCIÓN OFICIAL DE PRODUCCIÓN
if __name__ == "__main__":
    # Configuración OFICIAL DE PRODUCCIÓN
    INSTANCE_ID = "instance106153"
    TOKEN = "b4azkwiyillsz4dr5ggg"
    CHAT_ID = "573217003970-1604414717@g.us"
    CLAUDE_API_KEY = "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"
    
    print("🏭" * 40)
    print("                              WALAKY WHATSAPP SCRAPER")
    print("                                   PRODUCCIÓN OFICIAL")
    print("🏭" * 40)
    print()
    print("🛡️ MÁXIMA SEGURIDAD - Protección anti-bloqueo WhatsApp")
    print("🧠 INTELIGENCIA ARTIFICIAL - Pre-filtro + Claude + Extracción AI")
    print("💾 GUARDADO AUTOMÁTICO - Progreso protegido en tiempo real")
    print("💰 TRACKING COMPLETO - Costos detallados de toda la operación")
    print("🔄 SISTEMA DE RETRY - 4 intentos por operación con backoff inteligente")
    print()
    
    # Crear scraper de producción
    scraper = WhatsAppScraperClaudeProduction(INSTANCE_ID, TOKEN, CLAUDE_API_KEY)
    
    # Ejecutar rutina oficial de producción
    formatted_messages = scraper.scrape_and_format_messages_production(CHAT_ID, limit=1000)
    
    # Generar archivos oficiales finales
    if formatted_messages:
        print(f"\n🔄 Generando archivos finales de producción...")
        pedidos_file, crm_file = scraper.save_final_production_files(formatted_messages)
        
        # MOSTRAR RESUMEN COMPLETO DE COSTOS
        scraper.print_cost_summary()
        
        print(f"\n🎯 RESUMEN EJECUTIVO FINAL:")
        print(f"✅ {len(formatted_messages)} pedidos procesados exitosamente")
        print(f"📁 Archivos generados:")
        print(f"   • {pedidos_file}")
        print(f"   • {crm_file}")
        print(f"💾 Progreso guardado en: progreso_produccion_final.txt")
        print(f"\n🚀 ¡MISIÓN DE PRODUCCIÓN COMPLETADA EXITOSAMENTE!")
        print(f"🏆 Sistema ejecutado con máxima seguridad y precisión")
        print(f"💼 Datos listos para uso empresarial")
        
        # Mostrar muestra de primeros resultados
        print(f"\n=== MUESTRA DE PRIMEROS 3 PEDIDOS PROCESADOS ===")
        for i, message in enumerate(formatted_messages[:3], 1):
            print(f"\nPEDIDO {i}:")
            lines = message.split('\n')
            for line in lines[:5]:  # Mostrar solo primeras 5 líneas
                print(f"   {line}")
            if len(lines) > 5:
                print(f"   ... (+{len(lines)-5} líneas más)")
            print("-" * 60)
            
    else:
        print("\n❌ No se procesaron pedidos en producción.")
        print("🔍 Revisar configuración de la API o contenido del grupo.")
        # Mostrar costos aunque no haya pedidos
        scraper.print_cost_summary()
        
    print("\n" + "🏭" * 40)
    print("                              FIN DE EJECUCIÓN DE PRODUCCIÓN")
    print("🏭" * 40)