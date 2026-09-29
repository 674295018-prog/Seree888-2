// tests/penalty.test.ts
import { describe, it, expect } from 'vitest';
import { BUSINESS_RULES } from '../src/constants';

function calculateSettlement(
  scheduledEndMs: number,
  actualReturnMs: number,
  durationMinutes: number
) {
  const startMs = scheduledEndMs - durationMinutes * 60 * 1000;
  const elapsedMinutes = Math.ceil((actualReturnMs - startMs) / 60000);
  const diffSeconds = Math.max(0, (actualReturnMs - scheduledEndMs) / 1000);
  const gracePeriodSeconds = BUSINESS_RULES.PRICING.GRACE_PERIOD_MINUTES * 60;

  let billableOvertimeMinutes = 0;
  let penaltyCents = 0;

  if (diffSeconds > gracePeriodSeconds) {
    const excessSeconds = diffSeconds - gracePeriodSeconds;
    billableOvertimeMinutes = Math.ceil(excessSeconds / 60);
    penaltyCents = billableOvertimeMinutes * BUSINESS_RULES.PRICING.PENALTY_PER_MINUTE_CENTS;
  }

  const depositCents = BUSINESS_RULES.PRICING.DEFAULT_DEPOSIT_CENTS;
  const netDepositRefundCents = Math.max(0, depositCents - penaltyCents);
  const additionalPaymentRequiredCents = Math.max(0, penaltyCents - depositCents);

  return {
    elapsedMinutes,
    billableOvertimeMinutes,
    penaltyCents,
    netDepositRefundCents,
    additionalPaymentRequiredCents,
  };
}

describe('Penalty & Grace Period Business Rules', () => {
  const baseScheduledEnd = new Date('2026-09-30T14:30:00.000Z').getTime();

  it('1. คืนรถตรงเวลา: ค่าปรับต้องเป็น 0 บาท คืนมัดจำเต็มจำนวน 100 บาท', () => {
    const returnTime = new Date('2026-09-30T14:30:00.000Z').getTime();
    const res = calculateSettlement(baseScheduledEnd, returnTime, 30);

    expect(res.billableOvertimeMinutes).toBe(0);
    expect(res.penaltyCents).toBe(0);
    expect(res.netDepositRefundCents).toBe(10000); // 100 THB
    expect(res.additionalPaymentRequiredCents).toBe(0);
  });

  it('2. คืนรถช้า 4 นาที 59 วินาที (ยังอยู่ใน Grace Period 5 นาที): ไม่คิดค่าปรับ', () => {
    const returnTime = new Date('2026-09-30T14:34:59.000Z').getTime();
    const res = calculateSettlement(baseScheduledEnd, returnTime, 30);

    expect(res.billableOvertimeMinutes).toBe(0);
    expect(res.penaltyCents).toBe(0);
    expect(res.netDepositRefundCents).toBe(10000);
  });

  it('3. คืนรถช้า 5 นาที 00 วินาทีพอดี: ไม่คิดค่าปรับ', () => {
    const returnTime = new Date('2026-09-30T14:35:00.000Z').getTime();
    const res = calculateSettlement(baseScheduledEnd, returnTime, 30);

    expect(res.billableOvertimeMinutes).toBe(0);
    expect(res.penaltyCents).toBe(0);
    expect(res.netDepositRefundCents).toBe(10000);
  });

  it('4. คืนรถช้า 5 นาที 01 วินาที (เกินมา 1 วินาที): ปัดเป็น 1 นาที คิดค่าปรับ 10 บาท คืนมัดจำ 90 บาท', () => {
    const returnTime = new Date('2026-09-30T14:35:01.000Z').getTime();
    const res = calculateSettlement(baseScheduledEnd, returnTime, 30);

    expect(res.billableOvertimeMinutes).toBe(1);
    expect(res.penaltyCents).toBe(1000); // 10 THB
    expect(res.netDepositRefundCents).toBe(9000); // 90 THB
  });

  it('5. คืนรถช้า 12 นาที (เกิน Grace Period 7 นาที): ค่าปรับ 70 บาท คืนมัดจำ 30 บาท', () => {
    const returnTime = new Date('2026-09-30T14:42:00.000Z').getTime();
    const res = calculateSettlement(baseScheduledEnd, returnTime, 30);

    expect(res.billableOvertimeMinutes).toBe(7);
    expect(res.penaltyCents).toBe(7000); // 70 THB
    expect(res.netDepositRefundCents).toBe(3000); // 30 THB
  });

  it('6. คืนรถช้า 20 นาที (เกิน Grace Period 15 นาที): ค่าปรับ 150 บาท ยึดมัดจำหมด และต้องจ่ายเพิ่ม 50 บาท', () => {
    const returnTime = new Date('2026-09-30T14:50:00.000Z').getTime();
    const res = calculateSettlement(baseScheduledEnd, returnTime, 30);

    expect(res.billableOvertimeMinutes).toBe(15);
    expect(res.penaltyCents).toBe(15000); // 150 THB
    expect(res.netDepositRefundCents).toBe(0); // มัดจำถูกหักหมด
    expect(res.additionalPaymentRequiredCents).toBe(5000); // จ่ายเพิ่ม 50 THB
  });
});
