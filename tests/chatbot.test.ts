// tests/chatbot.test.ts
import { describe, it, expect } from 'vitest';
import { getKnowledgeResponse, VehicleInfo } from '../src/chatbot';

const mockFleet: VehicleInfo[] = [
  {
    id: 'veh_01',
    code: 'CAR-01',
    name: 'Lamborghini Sian Mini (Red)',
    category: 'SPORTS',
    max_weight_kg: 30,
    min_age_years: 3,
    has_remote: 1,
    status: 'AVAILABLE',
    cycle_count: 0
  },
  {
    id: 'veh_02',
    code: 'CAR-02',
    name: 'Jeep Wrangler 4x4 (Desert Sand)',
    category: 'JEEP',
    max_weight_kg: 40,
    min_age_years: 4,
    has_remote: 1,
    status: 'IN_USE',
    cycle_count: 1
  },
  {
    id: 'veh_03',
    code: 'CAR-03',
    name: 'Porsche 911 GT3 (Speed Yellow)',
    category: 'SPORTS',
    max_weight_kg: 25,
    min_age_years: 2,
    has_remote: 1,
    status: 'AVAILABLE',
    cycle_count: 0
  }
];

describe('AI Chatbot Knowledge Engine', () => {
  it('should answer greetings with friendly introduction', () => {
    const res = getKnowledgeResponse('สวัสดีครับบอท', mockFleet);
    expect(res).toContain('น้องรถด่วน AI');
    expect(res).toContain('ผู้ช่วยอัจฉริยะ');
  });

  it('should report live fleet status correctly', () => {
    const res = getKnowledgeResponse('ตอนนี้มีรถว่างกี่คันครับ', mockFleet);
    expect(res).toContain('**รถพร้อมให้บริการทันที:** 2 คัน');
    expect(res).toContain('**รถกำลังวิ่งในสนาม:** 1 คัน');
    expect(res).toContain('Lamborghini Sian Mini (Red)');
    expect(res).toContain('Porsche 911 GT3 (Speed Yellow)');
  });

  it('should explain pricing and deposit details', () => {
    const res = getKnowledgeResponse('ค่าเช่ารถราคาเท่าไหร่ มีค่ามัดจำไหม', mockFleet);
    expect(res).toContain('**15 นาที:** 80 บาท');
    expect(res).toContain('**30 นาที:** 150 บาท');
    expect(res).toContain('**60 นาที:** 250 บาท');
    expect(res).toContain('100 บาทต่อคัน');
  });

  it('should explain grace period and overtime penalty', () => {
    const res = getKnowledgeResponse('ถ้าคืนรถช้าโดนปรับเท่าไหร่ มีผ่อนผันไหม', mockFleet);
    expect(res).toContain('ฟรี 5 นาทีแรก');
    expect(res).toContain('นาทีละ 10 บาท');
    expect(res).toContain('หักจากเงินมัดจำ');
  });

  it('should recommend vehicles based on age and weight', () => {
    const resAge2 = getKnowledgeResponse('เด็ก 2 ขวบ เล่นคันไหนได้บ้าง', mockFleet);
    expect(resAge2).toContain('Porsche 911 GT3');

    const resHeavy = getKnowledgeResponse('เด็กหนัก 35 กิโล เล่นคันไหนได้', mockFleet);
    expect(resHeavy).toContain('Jeep Wrangler');
  });

  it('should explain battery charging rules', () => {
    const res = getKnowledgeResponse('กฎการชาร์จแบตเตอรี่เป็นอย่างไร', mockFleet);
    expect(res).toContain('3 รอบ');
    expect(res).toContain('45 นาที');
  });

  it('should explain booking steps', () => {
    const res = getKnowledgeResponse('ขั้นตอนการจองรถทำอย่างไร', mockFleet);
    expect(res).toContain('PromptPay QR Code');
    expect(res).toContain('Booking Code');
  });
});
