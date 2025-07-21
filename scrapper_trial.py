import http.client
import ssl
import json
import anthropic
import time
import random
from typing import List, Dict, Optional
import re
from datetime import datetime

class WhatsAppScraperClaude:
    def __init__(self, instance_id: str, token: str, claude_api_key: str):
        self.instance_id = instance_id
        self.token = token
        self.base_url = "api.ultramsg.com"
        
        # Configurar Claude
        self.claude_client = anthropic.Anthropic(api_key=claude_api_key)
        
        # Configuración de seguridad mejorada
        self.whatsapp_delay_min = 5
        self.whatsapp_delay_max = 8
        self.claude_delay = 1
        self.checkpoint_delay = 8
        
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
            'output_price_per_1m': 4.00   # $1.25 por 1M output tokens
        }
    
    def track_claude_usage(self, response, request_type: str):
        """Rastrea el uso de tokens y costos de Claude"""
        try:
            # Extraer información de uso de la respuesta
            usage = response.usage
            input_tokens = usage.input_tokens
            output_tokens = usage.output_tokens
            
            # Actualizar contadores
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
        
        print("\n" + "💰" * 50)
        print("                RESUMEN DE COSTOS CLAUDE API")
        print("💰" * 50)
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
        print(f"   💰 COSTO TOTAL: ${costs['total_cost']:.4f}")
        print()
        print(f"📋 DESGLOSE POR REQUEST:")
        print(f"   🔍 Costo promedio verificación: ${costs['total_cost']/max(self.cost_tracking['verification_requests'], 1):.4f}")
        print(f"   📝 Costo promedio formateo: ${costs['total_cost']/max(self.cost_tracking['format_requests'], 1):.4f}")
        print(f"   🏷️  Costo promedio CRM: ${costs['total_cost']/max(self.cost_tracking['crm_extraction_requests'], 1):.4f}")
        print("💰" * 50)
        
        # Proyección para volumen mayor
        if costs['total_requests'] > 0:
            cost_per_message = costs['total_cost'] / costs['total_requests']
            print(f"📊 PROYECCIONES:")
            print(f"   💡 Costo por mensaje procesado: ${cost_per_message:.4f}")
            print(f"   📈 Costo estimado 100 mensajes: ${cost_per_message * 100:.2f}")
            print(f"   📈 Costo estimado 1000 mensajes: ${cost_per_message * 1000:.2f}")
            print("💰" * 50)
        
    def safe_delay(self, min_seconds: int, max_seconds: int, message: str = ""):
        """Implementa un delay aleatorio para parecer más humano"""
        delay = random.uniform(min_seconds, max_seconds)
        if message:
            print(f"🛡️  {message} - Esperando {delay:.1f}s...")
        time.sleep(delay)
        
    def get_messages(self, chat_id: str, limit: int = 20) -> List[Dict]:
        """Obtiene mensajes del grupo de WhatsApp con protección anti-bloqueo"""
        try:
            print(f"📥 Obteniendo {limit} mensajes de WhatsApp...")
            
            self.safe_delay(
                self.whatsapp_delay_min, 
                self.whatsapp_delay_max,
                "Protección anti-bloqueo WhatsApp"
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
            self.safe_delay(3, 4, "Cooldown post-WhatsApp")
            
            return messages_data if isinstance(messages_data, list) else []
        except Exception as e:
            print(f"❌ Error WhatsApp: {e}")
            time.sleep(30)
            return []
    
    def quick_filter_message(self, message_text: str) -> bool:
        """Pre-filtro rápido para evitar llamadas innecesarias a Claude"""
        if not message_text or len(message_text.strip()) < 30:
            return False
            
        # Indicadores fuertes de que SÍ es un pedido
        strong_indicators = ['cc ', 'fc ', 'cédula', 'cedula', 'paga', 'envío', 'entrega']
        product_indicators = ['shampoo', 'kit', 'tratamiento', 'sérum', 'serum', 'styling', 'tónico']
        location_indicators = ['barrio', 'calle', 'carrera', 'medellín', 'bogotá', 'cali', 'ant']
        contact_indicators = ['@', 'gmail', 'hotmail', 'llamar', 'escribir']
        
        # Indicadores negativos claros
        negative_indicators = [
            'este pedido es diferente', 'no, es el mismo', 'hola', 'gracias',
            'envíos nacionales', 'guía', '¿podrías ayudarme?', 'esperando',
            'hola ana', 'espero estés bien', 'ayudarme con esta guía'
        ]
        
        text_lower = message_text.lower()
        
        # Si tiene indicadores negativos claros, rechazar
        if any(neg in text_lower for neg in negative_indicators):
            return False
            
        # Contar indicadores positivos
        strong_count = sum(1 for indicator in strong_indicators if indicator in text_lower)
        product_count = sum(1 for indicator in product_indicators if indicator in text_lower)
        location_count = sum(1 for indicator in location_indicators if indicator in text_lower)
        contact_count = sum(1 for indicator in contact_indicators if indicator in text_lower)
        
        # Criterio: necesita al menos 2 tipos diferentes de indicadores
        indicator_types = sum([
            strong_count > 0,
            product_count > 0, 
            location_count > 0,
            contact_count > 0
        ])
        
        return indicator_types >= 2 and strong_count >= 1
    
    def is_order_message(self, message_text: str) -> bool:
        """Usa Claude para determinar si un mensaje es un pedido válido con tracking de costos"""
        # Primero, pre-filtro rápido
        if not self.quick_filter_message(message_text):
            return False
            
        prompt = f"""Analiza si este mensaje de WhatsApp es un PEDIDO DE PRODUCTOS válido.

PEDIDO VÁLIDO contiene:
- Nombre de persona
- Documento (CC/cédula)
- Dirección
- Productos
- Info de pago/contacto

NO SON PEDIDOS:
- Conversaciones/preguntas
- Confirmaciones simples
- Mensajes administrativos

Mensaje: "{message_text[:500]}..."

Responde SOLO: "SI" o "NO" """

        for attempt in range(3):
            try:
                response = self.claude_client.messages.create(
                    model="claude-3-5-haiku-20241022",
                    max_tokens=5,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=15.0
                )
                
                # TRACKING DE COSTOS
                self.track_claude_usage(response, 'verification')
                
                result = response.content[0].text.strip().upper()
                time.sleep(0.5)
                return result == "SI"
                
            except Exception as e:
                print(f"⚠️ Intento {attempt+1}/3 falló: {str(e)[:50]}...")
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                else:
                    print(f"🔄 Usando filtro básico como fallback")
                    return self.quick_filter_message(message_text) and len(message_text.split('\n')) >= 5
    
    def format_with_claude(self, message_text: str) -> str:
        """Formatear con tracking de costos"""
        prompt = f"""Extrae información de este pedido en formato exacto:

[Nombre completo]
CC [número cédula]
FC [fecha]
[dirección completa]
Barrio [barrio]
[ciudad, departamento]
[teléfono con notas]
[email]
[productos completos]
[estado de pago completo]

Mensaje: {message_text}

Mantén TODOS los detalles originales:"""
        
        for attempt in range(3):
            try:
                response = self.claude_client.messages.create(
                    model="claude-3-5-haiku-20241022",
                    max_tokens=800,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=20.0
                )
                
                # TRACKING DE COSTOS
                self.track_claude_usage(response, 'format')
                
                time.sleep(self.claude_delay)
                return response.content[0].text.strip()
                
            except Exception as e:
                print(f"⚠️ Formateo intento {attempt+1}/3: {str(e)[:30]}...")
                if attempt < 2:
                    wait_time = 3 + (attempt * 2)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"❌ Formateo falló completamente")
                    return None
    
    def extract_crm_data_with_ai(self, formatted_message: str) -> Dict[str, str]:
        """Extrae datos CRM usando Claude AI con tracking de costos"""
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

        for attempt in range(3):
            try:
                response = self.claude_client.messages.create(
                    model="claude-3-5-haiku-20241022",
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}],
                    timeout=15.0
                )
                
                # TRACKING DE COSTOS
                self.track_claude_usage(response, 'crm_extraction')
                
                result = response.content[0].text.strip()
                
                # Intentar parsear JSON
                try:
                    # Limpiar posibles markdown o texto extra
                    if "```json" in result:
                        result = result.split("```json")[1].split("```")[0]
                    elif "```" in result:
                        result = result.split("```")[1].split("```")[0]
                    
                    crm_data = json.loads(result)
                    
                    # Validar que tenga las claves esperadas
                    expected_keys = ['nombre', 'cedula', 'email', 'fecha_cumpleanos']
                    if all(key in crm_data for key in expected_keys):
                        time.sleep(0.5)
                        return crm_data
                    else:
                        print(f"⚠️ JSON incompleto en intento {attempt+1}")
                        
                except json.JSONDecodeError:
                    print(f"⚠️ Error JSON en intento {attempt+1}: {result[:50]}...")
                
                if attempt < 2:
                    time.sleep(1)
                    continue
                    
            except Exception as e:
                print(f"⚠️ Error extracción CRM intento {attempt+1}/3: {str(e)[:30]}...")
                if attempt < 2:
                    time.sleep(2)
                    continue
        
        # Fallback: devolver estructura vacía
        print(f"❌ Extracción CRM falló - usando datos vacíos")
        return {
            'nombre': '',
            'cedula': '',
            'email': '',
            'fecha_cumpleanos': ''
        }
    
    def scrape_and_format_messages_test(self, chat_id: str, limit: int = 20) -> List[str]:
        """Versión optimizada de prueba con tracking de costos"""
        print(f"\n🧪 MODO PRUEBA AI-POWERED - {limit} mensajes")
        print(f"🚀 Chat: {chat_id}")
        print(f"🧠 Pre-filtro + Claude verificación + Claude formateo + Claude CRM")
        print(f"💰 Tracking de costos activado")
        print()
        
        messages = self.get_messages(chat_id, limit)
        if not messages:
            return []
        
        print(f"📊 {len(messages)} mensajes obtenidos\n")
        
        formatted_messages = []
        processed_count = 0
        skipped_count = 0
        error_count = 0
        
        for i, message in enumerate(messages, 1):
            message_text = message.get('body', '')
            
            if not message_text or len(message_text.strip()) < 20:
                skipped_count += 1
                continue
            
            print(f"🔍 {i}/{len(messages)} | {message_text[:60]}...")
            
            # Pre-filtro rápido
            if not self.quick_filter_message(message_text):
                print(f"⚡ Pre-filtro: NO es pedido")
                skipped_count += 1
                continue
            
            # Verificación con Claude
            if self.is_order_message(message_text):
                print(f"🧠 Claude: ES pedido → Formateando...")
                
                formatted_message = self.format_with_claude(message_text)
                
                if formatted_message:
                    formatted_messages.append(formatted_message)
                    processed_count += 1
                    
                    first_line = formatted_message.split('\n')[0] if formatted_message else 'N/A'
                    print(f"✅ Pedido {processed_count}: {first_line[:50]}...")
                    
                    # Checkpoint cada 3 mensajes para pruebas
                    if processed_count % 3 == 0:
                        print(f"🔄 Checkpoint: {processed_count} pedidos")
                        # Mostrar costo parcial
                        partial_cost = self.calculate_total_cost()
                        print(f"💰 Costo parcial: ${partial_cost['total_cost']:.4f}")
                        time.sleep(5)
                else:
                    error_count += 1
                    print(f"❌ Error al formatear")
            else:
                print(f"🧠 Claude: NO es pedido")
                skipped_count += 1
            
            print()
        
        # Estadísticas finales
        total_analyzed = len(messages)
        success_rate = (processed_count / total_analyzed * 100) if total_analyzed > 0 else 0
        
        print(f"🎉 PRUEBA COMPLETADA!")
        print(f"📊 Estadísticas:")
        print(f"   📝 Total analizado: {total_analyzed}")
        print(f"   ✅ Pedidos procesados: {processed_count}")
        print(f"   ⏭️  Mensajes saltados: {skipped_count}")
        print(f"   ❌ Errores: {error_count}")
        print(f"   📈 Tasa éxito: {success_rate:.1f}%")
        
        return formatted_messages
    
    def save_test_results_ai(self, formatted_messages: List[str]):
        """Guarda resultados optimizados con extracción AI y tracking de costos"""
        # Pedidos
        with open("PRUEBA_AI_pedidos.txt", 'w', encoding='utf-8') as f:
            f.write("=" * 60 + "\n")
            f.write("        PRUEBA AI-POWERED - PEDIDOS\n")
            f.write("=" * 60 + "\n\n")
            
            for i, message in enumerate(formatted_messages, 1):
                f.write(f"=== PEDIDO {i} ===\n{message}\n\n{'='*50}\n\n")
        
        # CRM con extracción AI
        print(f"\n🧠 Extrayendo datos CRM con Claude AI...")
        crm_records = []
        
        for i, msg in enumerate(formatted_messages, 1):
            print(f"🔄 Extrayendo CRM {i}/{len(formatted_messages)}...")
            crm_data = self.extract_crm_data_with_ai(msg)
            if crm_data['nombre']:  # Solo agregar si tiene nombre
                crm_records.append(crm_data)
            time.sleep(0.5)  # Pequeño delay entre extracciones
        
        # Guardar CRM con información de costos
        costs = self.calculate_total_cost()
        with open("PRUEBA_AI_crm.txt", 'w', encoding='utf-8') as f:
            f.write("=" * 60 + "\n")
            f.write("         CRM WALAKY - AI POWERED\n")
            f.write("=" * 60 + "\n\n")
            f.write(f"Total clientes: {len(crm_records)}\n")
            f.write(f"Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")
            f.write(f"Extraído con: Claude AI (sin regex)\n")
            f.write(f"Costo total sesión: ${costs['total_cost']:.4f}\n")
            f.write(f"Requests totales: {costs['total_requests']}\n\n")
            
            for i, record in enumerate(crm_records, 1):
                f.write(f"CLIENTE {i:03d}\n")
                f.write(f"Nombre: {record['nombre']}\n")
                f.write(f"Cédula: {record['cedula']}\n")
                f.write(f"Email: {record['email']}\n")
                f.write(f"Cumpleaños: {record['fecha_cumpleanos']}\n\n")
        
        print(f"\n📁 Archivos generados:")
        print(f"   • PRUEBA_AI_pedidos.txt")
        print(f"   • PRUEBA_AI_crm.txt")
        
        # Estadísticas CRM
        emails_validos = len([r for r in crm_records if '@' in r.get('email', '')])
        cedulas_validas = len([r for r in crm_records if r.get('cedula')])
        fechas_validas = len([r for r in crm_records if r.get('fecha_cumpleanos')])
        
        print(f"\n📊 CRM AI: {len(crm_records)} clientes")
        print(f"   📧 Emails válidos: {emails_validos}")
        print(f"   🆔 Cédulas válidas: {cedulas_validas}")
        print(f"   🎂 Fechas válidas: {fechas_validas}")

# EJECUCIÓN OPTIMIZADA CON AI Y TRACKING DE COSTOS
if __name__ == "__main__":
    # Configuración
    INSTANCE_ID = "instance106153"
    TOKEN = "b4azkwiyillsz4dr5ggg"
    CHAT_ID = "573217003970-1604414717@g.us"
    CLAUDE_API_KEY = "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"
    
    print("🤖💰" * 15)
    print("  PRUEBA AI-POWERED + TRACKING COSTOS")
    print("🤖💰" * 15)
    
    scraper = WhatsAppScraperClaude(INSTANCE_ID, TOKEN, CLAUDE_API_KEY)
    
    # Ejecutar prueba con AI completa
    formatted_messages = scraper.scrape_and_format_messages_test(CHAT_ID, limit=20)
    
    if formatted_messages:
        scraper.save_test_results_ai(formatted_messages)
        
        print(f"\n=== MUESTRA DE RESULTADOS AI ===")
        for i, message in enumerate(formatted_messages[:2], 1):
            print(f"\nPEDIDO {i}:")
            print(message[:200] + "..." if len(message) > 200 else message)
            
        # MOSTRAR RESUMEN COMPLETO DE COSTOS
        scraper.print_cost_summary()
        
        print(f"\n🚀 ¡Extracción AI completada! Revisa los archivos y costos.")
    else:
        print("\n❌ No se procesaron pedidos. Revisar configuración.")
        # Mostrar costos aunque no haya pedidos
        scraper.print_cost_summary()