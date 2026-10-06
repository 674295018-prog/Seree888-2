// src/chatbot.ts
// AI Assistant Logic for Toy Car Booking & Fleet Management
import { BUSINESS_RULES } from './constants';

export interface VehicleInfo {
  id: string;
  code: string;
  name: string;
  category: string;
  max_weight_kg: number;
  min_age_years: number;
  has_remote: number;
  status: string;
  cycle_count: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Intelligent Rule-based Knowledge Matcher (Zero-latency Fallback & Guarantee)
 */
export function getKnowledgeResponse(userMessage: string, fleet: VehicleInfo[]): string {
  const query = userMessage.toLowerCase().trim();

  // 1. รถว่าง & สถานะฝูงรถปัจจุบัน (Real-time Fleet Status)
  if (
    query.includes('รถว่าง') ||
    query.includes('มีรถไหม') ||
    query.includes('มีรถมั้ย') ||
    query.includes('รถเหลือ') ||
    query.includes('สถานะรถ') ||
    query.includes('รถตอนนี้') ||
    query.includes('มีรถอะไรบ้าง')
  ) {
    const available = fleet.filter(v => v.status === 'AVAILABLE');
    const inUse = fleet.filter(v => v.status === 'IN_USE');
    const charging = fleet.filter(v => v.status === 'CHARGING');

    let reply = `🏎️ **รายงานสถานะรถ ณ ปัจจุบันครับ:**\n\n`;
    reply += `• **รถพร้อมให้บริการทันที:** ${available.length} คัน\n`;
    reply += `• **รถกำลังวิ่งในสนาม:** ${inUse.length} คัน\n`;
    reply += `• **รถกำลังชาร์จไฟ:** ${charging.length} คัน\n\n`;

    if (available.length > 0) {
      reply += `✨ **รายการรถที่พร้อมจองได้เลย:**\n`;
      available.forEach(v => {
        const remoteText = v.has_remote ? '🎮 มีรีโมทผู้ปกครอง' : '🚫 ไม่มีรีโมท';
        reply += `• **${v.name}** (${v.code}) — รองรับอายุ ${v.min_age_years} ปีขึ้นไป / หนักไม่เกิน ${v.max_weight_kg} กก. [${remoteText}]\n`;
      });
      reply += `\n💡 ท่านสามารถกดปุ่ม **"จองคันนี้"** บนหน้ารายการรถเพื่อล็อคคิวได้ทันทีเลยครับ!`;
    } else {
      reply += `⚠️ ขณะนี้รถทุกคันกำลังให้บริการหรือชาร์จไฟอยู่ แนะนำให้รอประมาณ 10-15 นาทีเพื่อรอรอบถัดไปนะครับ`;
    }
    return reply;
  }

  // 2. ราคา & อัตราค่าบริการ (Pricing & Deposit)
  if (
    query.includes('ราคา') ||
    query.includes('ค่าเช่า') ||
    query.includes('ค่าบริการ') ||
    query.includes('กี่บาท') ||
    query.includes('คิดเงินยังไง') ||
    query.includes('มัดจำ') ||
    query.includes('แพ็กเกจ')
  ) {
    const depositBaht = BUSINESS_RULES.PRICING.DEFAULT_DEPOSIT_CENTS / 100;
    const r15 = (BUSINESS_RULES.PRICING.DURATION_RATES[15] || 8000) / 100;
    const r30 = (BUSINESS_RULES.PRICING.DURATION_RATES[30] || 15000) / 100;
    const r60 = (BUSINESS_RULES.PRICING.DURATION_RATES[60] || 25000) / 100;

    return `💰 **อัตราค่าบริการและแพ็กเกจเวลาเช่ารถ:**\n\n` +
      `⏱️ **แพ็กเกจเวลา:**\n` +
      `• **15 นาที:** ${r15} บาท\n` +
      `• **30 นาที:** ${r30} บาท *(ยอดนิยม แนะนำเลยครับ ⭐)*\n` +
      `• **60 นาที:** ${r60} บาท *(สุดคุ้มสำหรับน้องๆ ที่ชอบขับยาวๆ)*\n\n` +
      `🔒 **เงินมัดจำกุญแจและรีโมท:**\n` +
      `• ${depositBaht} บาทต่อคัน\n` +
      `• *เงินมัดจำนี้จะได้รับคืนเต็มจำนวน 100% ทันทีที่นำรถมาคืนตรงเวลาครับ* ✨\n\n` +
      `💳 ชำระเงินง่ายๆ ด้วยการสแกน **PromptPay QR Code** ระบบตัดยอดอัตโนมัติทันทีครับ!`;
  }

  // 3. ค่าปรับ & เวลาผ่อนผัน (Overtime Penalty & Grace Period)
  if (
    query.includes('ค่าปรับ') ||
    query.includes('คืนช้า') ||
    query.includes('เกินเวลา') ||
    query.includes('ผ่อนผัน') ||
    query.includes('grace') ||
    query.includes('penalty')
  ) {
    const graceMin = BUSINESS_RULES.PRICING.GRACE_PERIOD_MINUTES;
    const penaltyPerMin = BUSINESS_RULES.PRICING.PENALTY_PER_MINUTE_CENTS / 100;

    return `⏱️ **กฎการคืนรถและอัตราค่าปรับ Overtime:**\n\n` +
      `🟢 **ระยะเวลาผ่อนผัน (Grace Period): ฟรี ${graceMin} นาทีแรก!**\n` +
      `• หากนำรถมาส่งคืนล่าช้าไม่เกิน ${graceMin} นาทีหลังจากหมดเวลา ระบบจะ**ไม่คิดค่าปรับใดๆ ทั้งสิ้น**ครับ 😊\n\n` +
      `🔴 **กรณีคืนช้าเกิน ${graceMin} นาที:**\n` +
      `• คิดค่าปรับ **นาทีละ ${penaltyPerMin} บาท** (นับตั้งแต่นาทีแรกที่เกินกำหนด)\n` +
      `• ค่าปรับจะถูกหักจากเงินมัดจำ (100 บาท) โดยอัตโนมัติ และคืนเงินมัดจำส่วนที่เหลือให้ลูกค้าทันทีครับ`;
  }

  // 4. แนะนำรถตามอายุ & น้ำหนัก (Age & Weight Recommendation)
  const ageMatch = query.match(/(\d+)\s*(ขวบ|ปี)/);
  const weightMatch = query.match(/(\d+)\s*(กก|กิโล|kg)/);

  if (ageMatch || weightMatch || query.includes('กี่ขวบ') || query.includes('น้ำหนัก') || query.includes('เด็กเล็ก') || query.includes('เด็กโต') || query.includes('เลือกรถ')) {
    const age = ageMatch ? parseInt(ageMatch[1], 10) : null;
    const weight = weightMatch ? parseInt(weightMatch[1], 10) : null;

    let reply = `🚗 **คำแนะนำในการเลือกรถของเล่นสำหรับน้องๆ:**\n\n`;

    if (age !== null || weight !== null) {
      reply += `🎯 **สำหรับน้องที่อายุ ${age !== null ? age + ' ขวบ' : 'ไม่ระบุ'} / น้ำหนัก ${weight !== null ? weight + ' กก.' : 'ไม่ระบุ'}:**\n\n`;

      const matchedCars = fleet.filter(v => {
        const ageOk = age === null || age >= v.min_age_years;
        const weightOk = weight === null || weight <= v.max_weight_kg;
        return ageOk && weightOk;
      });

      if (matchedCars.length > 0) {
        reply += `✅ **รถที่แนะนำและเหมาะกับน้อง:**\n`;
        matchedCars.forEach(v => {
          const remoteStr = v.has_remote ? '🎮 มีรีโมทคุมได้' : '🚫 คุมเอง (ไม่มีรีโมท)';
          reply += `• **${v.name}** (${v.category}) — รับน้ำหนักได้ถึง ${v.max_weight_kg} กก. [${remoteStr}]\n`;
        });
      } else {
        reply += `⚠️ หากน้องน้ำหนักเกิน 45 กก. อาจไม่สามารถขับขี่ได้เพื่อความปลอดภัยของน้องและตัวรถครับ\n`;
      }
    } else {
      reply += `• **เด็กเล็ก (2-3 ขวบ):** แนะนำ **Porsche 911** หรือ **Lamborghini Sian** มีระบบรีโมทคอนโทรลให้ผู้ปกครองช่วยบังคับอย่างปลอดภัย 🎮\n`;
      reply += `• **เด็กวัย 3-4 ขวบขึ้นไป:** ขับได้ทุกรุ่น! รวมถึง **BMW S1000RR Kids Moto** (มอเตอร์ไซค์ไฟฟ้า) 🏍️\n`;
      reply += `• **เด็กตัวโต / น้ำหนักเยอะ:** แนะนำ **Mercedes-Benz G63 AMG** (รับได้สูงสุด 45 กก.) หรือ **Jeep Wrangler** (รับได้ 40 กก.) บอดี้ใหญ่ นั่งสบาย แข็งแรงมากครับ 💪\n`;
    }

    reply += `\n🛡️ รถยนต์ 4 ล้อทุกคันของเรามีเข็มขัดนิรภัยและรีโมทตัดการทำงานฉุกเฉิน มั่นใจในความปลอดภัยได้ 100% ครับ!`;
    return reply;
  }

  // 5. แบตเตอรี่และการชาร์จ (Battery & Safety)
  if (
    query.includes('แบต') ||
    query.includes('ชาร์จ') ||
    query.includes('ความเร็ว') ||
    query.includes('ปลอดภัย') ||
    query.includes('อันตราย')
  ) {
    const maxCycles = BUSINESS_RULES.FLEET.MAX_CYCLES_BEFORE_CHARGING;
    const minCharge = BUSINESS_RULES.FLEET.MIN_CHARGING_MINUTES;

    return `⚡ **มาตรฐานความปลอดภัยและระบบแบตเตอรี่:**\n\n` +
      `• **การตัดรอบชาร์จ:** รถทุกคันเล่นได้สะสมสูงสุด **${maxCycles} รอบ** แล้วระบบจะล็อคเข้าสู่โหมดชาร์จไฟอัตโนมัติทันที\n` +
      `• **ระยะเวลาชาร์จมาตรฐาน:** อย่างน้อย **${minCharge} นาที** เพื่อให้กำลังไฟเต็มเปี่ยมและไม่เกิดเหตุแบตเตอรี่หมดระหว่างเล่น\n` +
      `• **ความเร็วปลอดภัย:** ถูกจำกัดความเร็วไว้ที่ความเร็วเดินเร็ว (Safe Speed 3-5 กม./ชม.) พร้อมระบบ Soft Start ออกตัวนุ่มนวลไม่กระชากครับ`;
  }

  // 6. วิธีการจอง & ชำระเงิน (How to book & payment)
  if (
    query.includes('วิธีจอง') ||
    query.includes('จองยังไง') ||
    query.includes('ขั้นตอน') ||
    query.includes('โอน') ||
    query.includes('qr') ||
    query.includes('พร้อมเพย์') ||
    query.includes('promptpay')
  ) {
    return `📝 **ขั้นตอนการจองรถของเล่นง่ายๆ ใน 4 สเต็ป:**\n\n` +
      `1️⃣ **เลือกรถ:** คลิกรถคันที่ต้องการจากหน้าแรก แล้วกดปุ่ม **"จองคันนี้"**\n` +
      `2️⃣ **กรอกข้อมูล:** ใส่ชื่อผู้ปกครอง, เบอร์โทรศัพท์, วันที่ และเวลาที่ต้องการเล่น\n` +
      `3️⃣ **กักสิทธิ์ & ชำระเงิน:** ระบบจะกักสิทธิ์รถให้ 5 นาที พร้อมแสดง **PromptPay QR Code** ให้สแกนจ่ายค่าเช่า + มัดจำ\n` +
      `4️⃣ **รับตั๋ว Booking Code:** นำรหัสตั๋วไปแสดงให้พนักงานที่สนามเพื่อปล่อยรถและเริ่มจับเวลาเล่นได้เลยครับ! 🏁`;
  }

  // 7. เวลาเปิดปิด / สถานที่ / ติดต่อ
  if (
    query.includes('เปิด') ||
    query.includes('ปิด') ||
    query.includes('เวลา') ||
    query.includes('กี่โมง') ||
    query.includes('อยู่ที่ไหน') ||
    query.includes('ติดต่อ')
  ) {
    return `📍 **ข้อมูลการให้บริการและเวลาเปิด-ปิด:**\n\n` +
      `🕒 **เวลาทำการ:** เปิดให้บริการทุกวัน เวลา 10:00 น. - 20:30 น.\n` +
      `🚩 **สถานที่:** ลานกิจกรรมสนามรถของเล่นไฟฟ้า ชั้น 2 โซน Play & Learn\n` +
      `📞 **ติดต่อสอบถาม:** สอบถามพนักงานประจำสนาม หรือแชทกับน้องรถด่วนตรงนี้ได้ตลอด 24 ชม. เลยครับ!`;
  }

  // 8. ทักทาย & คำถามทั่วไป (Greeting & Default)
  if (
    query.includes('สวัสดี') ||
    query.includes('หวัดดี') ||
    query.includes('hello') ||
    query.includes('hi') ||
    query.includes('บอท') ||
    query.includes('ช่วยอะไร')
  ) {
    return `👋 **สวัสดีครับ! ผมคือ "น้องรถด่วน AI" ผู้ช่วยอัจฉริยะประจำสนามรถของเล่นไฟฟ้าครับ 🏎️✨**\n\n` +
      `ยินดีช่วยเหลือคุณพ่อคุณแม่และน้องๆ ทุกท่านครับ สามารถพิมพ์สอบถามผมได้เลย เช่น:\n` +
      `• 🚗 *"มีรถว่างคันไหนบ้าง?"*\n` +
      `• 💰 *"ค่าเช่าและเงินมัดจำเท่าไหร่?"*\n` +
      `• ⏱️ *"เล่นเกินเวลามีค่าปรับยังไง?"*\n` +
      `• 👶 *"น้อง 3 ขวบ หนัก 18 กิโล แนะนำรุ่นไหนดี?"*\n` +
      `• 📝 *"ขั้นตอนการจองทำยังไง?"*\n\n` +
      `ต้องการทราบข้อมูลด้านไหน บอกผมได้เลยนะคร้าบ! 😊`;
  }

  // Default Fallback
  return `ขอบคุณสำหรับคำถามครับ! เกี่ยวกับเรื่อง **"${userMessage}"**\n\n` +
    `🏎️ ปัจจุบันเรามีรถของเล่นไฟฟ้าระดับพรีเมียมพร้อมให้บริการหลากหลายรุ่น (สปอร์ต, ออฟโรด 4x4, มอเตอร์ไซค์) พร้อมรีโมทคอนโทรลเพื่อความปลอดภัยของน้องๆ\n\n` +
    `💡 คุณพ่อคุณแม่สามารถถามข้อมูลเพิ่มเติมได้เลยครับ เช่น:\n` +
    `• สอบถามราคารถและแพ็กเกจเวลา (15, 30, 60 นาที)\n` +
    `• สอบถามรถที่ว่างอยู่ตอนนี้\n` +
    `• เลือกรถตามอายุและน้ำหนักของน้อง\n` +
    `• กฎการคืนรถและเงินมัดจำครับ 😊`;
}

/**
 * Hybrid Bot Response: Tries Cloudflare Workers AI first, falls back to Knowledge Matcher.
 */
export async function generateBotResponse(
  userMessage: string,
  fleet: VehicleInfo[],
  history: ChatMessage[] = [],
  envAi?: any
): Promise<string> {
  // If Cloudflare Workers AI is available, attempt generative AI response with grounded context
  if (envAi && typeof envAi.run === 'function') {
    try {
      const availableCars = fleet.filter(v => v.status === 'AVAILABLE').map(v => `${v.name} (${v.code}, max ${v.max_weight_kg}kg, min age ${v.min_age_years}y, remote: ${v.has_remote ? 'yes' : 'no'})`).join(', ');
      
      const systemPrompt = `You are "น้องรถด่วน AI", an enthusiastic, polite, and helpful Thai AI assistant for the Toy Car Booking & Fleet Management system.
Always reply in polite, natural Thai using cheerful particles like "ครับ", "นะคร้าบ".
Use formatting such as bullet points and emojis.

Current System Facts:
- Available cars right now: ${availableCars || 'No cars currently available'}
- Rental packages: 15 mins (80 THB), 30 mins (150 THB, recommended), 60 mins (250 THB)
- Security deposit: 100 THB (refundable upon on-time return)
- Grace period: 5 minutes free
- Late return penalty: 10 THB per minute after grace period, deducted from deposit
- Battery rule: Cars recharge every 3 sessions for at least 45 minutes
- Payment: PromptPay QR Code
- Opening hours: 10:00 - 20:30 daily

Answer the customer's question accurately using these facts. Keep answers concise, clear, and friendly.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-4), // keep last 4 context messages
        { role: 'user', content: userMessage }
      ];

      const aiResult: any = await envAi.run('@cf/meta/llama-3.1-8b-instruct', {
        messages,
        max_tokens: 500,
        temperature: 0.6
      });

      if (aiResult && aiResult.response) {
        return aiResult.response.trim();
      }
    } catch (err) {
      // Fallback silently to rule-based knowledge engine
      console.warn('Workers AI call failed, falling back to knowledge engine:', err);
    }
  }

  // Deterministic high-speed fallback
  return getKnowledgeResponse(userMessage, fleet);
}
