// src/constants.ts
// รวมศูนย์ค่าคงที่ทางธุรกิจตามคำแนะนำของ Skill 06-code-quality

export const BUSINESS_RULES = {
  BOOKING: {
    HOLD_TTL_SECONDS: 300, // กักสิทธิ์ 5 นาที
    HOLD_TTL_MS: 300 * 1000,
  },
  PRICING: {
    DEFAULT_DEPOSIT_CENTS: 10_000, // เงินมัดจำ 100.00 บาท (10,000 สตางค์)
    PENALTY_PER_MINUTE_CENTS: 1_000, // ค่าปรับนาทีละ 10.00 บาท (1,000 สตางค์)
    GRACE_PERIOD_MINUTES: 5, // ผ่อนผันการคืนรถล่าช้า 5 นาที
    DURATION_RATES: {
      15: 8_000,  // 15 นาที = 80 บาท
      30: 15_000, // 30 นาที = 150 บาท
      60: 25_000, // 60 นาที = 250 บาท
    } as Record<number, number>,
  },
  FLEET: {
    MAX_CYCLES_BEFORE_CHARGING: 3, // เล่นสะสมได้สูงสุด 3 รอบ ก่อนต้องชาร์จไฟ
    MIN_CHARGING_MINUTES: 45,
  }
} as const;
