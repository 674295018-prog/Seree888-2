# เอกสารการตรวจสอบคุณภาพโค้ด: ระบบจองรถของเล่น (Code Quality Review Report)

> **มาตรฐานอ้างอิง:** Skill `06-code-quality`  
> **เป้าหมายการตรวจ:** Schema, SQL DDL, Zod Validation, Data Contracts, และตรรกะทางธุรกิจที่ออกแบบไว้  
> **เงื่อนไข:** **Review Only (ยังไม่มีการแก้ไขไฟล์โค้ดจริงในรอบนี้)**  
> **สถานะโปรเจกต์:** Pre-implementation Review (สเปกและโค้ดตัวอย่างในเอกสารสถาปัตยกรรม/ฐานข้อมูล/API)

---

## 1. บทสรุปการตรวจสอบ (Executive Summary)

จากการตรวจสอบพิมพ์เขียวโค้ด (Code Blueprints), SQL DDL สำหรับ Cloudflare D1, Zod Schemas, และตัวอย่าง Use Case ที่ระบุไว้ในเอกสาร:
- [`docs/requirements-toy-car-booking.md`](file:///c:/เสรี/docs/requirements-toy-car-booking.md)
- [`docs/software-architecture-toy-car-booking.md`](file:///c:/เสรี/docs/software-architecture-toy-car-booking.md)
- [`docs/database-design-toy-car-booking.md`](file:///c:/เสรี/docs/database-design-toy-car-booking.md)
- [`docs/api-design-toy-car-booking.md`](file:///c:/เสรี/docs/api-design-toy-car-booking.md)

พบข้อสังเกตและจุดที่ควรปรับปรุงด้านคุณภาพโค้ดรวม **7 ประเด็น** แบ่งตามระดับความสำคัญดังนี้:
- 🔴 **High Priority (ความถูกต้อง / Concurrency / ป้องกัน Bug):** 3 ประเด็น
- 🟡 **Medium Priority (ความสอดคล้อง / UX / การบำรุงรักษา):** 3 ประเด็น
- 🟢 **Low Priority (ความสม่ำเสมอของสไตล์โค้ด):** 1 ประเด็น

---

## 2. รายละเอียดข้อค้นพบ (Detailed Code Quality Findings)

---

### Finding 1: การใช้ค่าคงที่ลอยๆ (Magic Values) ในตรรกะการเงินและเวลา
* **ระดับความสำคัญ:** 🔴 High Priority
* **หมวดหมู่:** Maintainability / Code Smells / Coupling
* **ตำแหน่ง:** `docs/database-design-toy-car-booking.md` (Section 5.2) & `docs/api-design-toy-car-booking.md` (Section 3.3)
* **ปัญหา:**
  พบการ Hardcode ตัวเลขกฎธุรกิจกระจายอยู่ทั่วไป เช่น:
  - `300` (เวลา Hold Slot 5 นาทีใน Redis/D1)
  - `1000` (ค่าปรับนาทีละ 10 บาท หรือ 1,000 สตางค์)
  - `10000` (เงินมัดจำ 100 บาท หรือ 10,000 สตางค์)
  - `5` (Grace Period 5 นาที)
  - `3` (จำนวนรอบก่อนส่งชาร์จแบต)
* **ผลกระทบ:** หากร้านต้องการปรับค่ามัดจำหรือปรับอัตราค่าปรับ นักพัฒนาจะต้องตามแก้หลายจุด เสี่ยงต่อการลืมแก้บางไฟล์จนยอดเงินไม่ตรงกัน
* **ข้อเสนอแนะในการปรับปรุง:** สร้างไฟล์ศูนย์รวมค่าคงที่ทางธุรกิจ (`business-rules.constants.ts`)
* **ตัวอย่างการ Refactor (Before vs After):**

````carousel
```typescript
// ❌ ก่อนปรับปรุง: Hardcode ตัวเลขใน Controller / Use Case
const penaltyCents = overtimeMinutes * 1000;
const netRefundCents = 10000 - penaltyCents;
if (vehicle.cycleCount >= 3) {
  vehicle.status = 'CHARGING';
}
```
<!-- slide -->
```typescript
// ✅ หลังปรับปรุง: รวมไว้ใน Business Constants
export const BUSINESS_RULES = {
  BOOKING: {
    HOLD_TTL_SECONDS: 300, // 5 minutes
    MIN_ADVANCE_CANCEL_MINUTES: 15,
  },
  PRICING: {
    DEFAULT_DEPOSIT_CENTS: 10_000,      // 100.00 THB
    PENALTY_PER_MINUTE_CENTS: 1_000,   // 10.00 THB
    GRACE_PERIOD_MINUTES: 5,
  },
  FLEET: {
    MAX_CYCLES_BEFORE_CHARGING: 3,
    MIN_CHARGING_MINUTES: 45,
  }
} as const;

// เรียกใช้ผ่านค่าคงที่ที่มีความหมายชัดเจน
const penaltyCents = overtimeMinutes * BUSINESS_RULES.PRICING.PENALTY_PER_MINUTE_CENTS;
```
````

---

### Finding 2: ความไม่สอดคล้องกันของรูปแบบ Timestamp ใน SQLite D1 (Format Inconsistency)
* **ระดับความสำคัญ:** 🔴 High Priority
* **หมวดหมู่:** Correctness / Data Integrity
* **ตำแหน่ง:** `docs/database-design-toy-car-booking.md` (Section 2 & 5.1)
* **ปัญหา:**
  - ในคำสั่ง INSERT `bookings` มีการใช้ `datetime('now', '+5 minutes')` ซึ่งคืนค่าเป็น `YYYY-MM-DD HH:MM:SS` (ไม่มี `Z` ต่อท้าย)
  - แต่ในคอลัมน์ `created_at` ใช้ `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` ซึ่งเป็นมาตรฐาน ISO8601 UTC
* **ผลกระทบ:** SQLite เปรียบเทียบวันเวลาด้วย String Comparison (`TEXT`). การเปรียบเทียบข้อความที่รูปแบบต่างกัน เช่น `'2026-09-30 14:05:00' < '2026-09-30T14:05:00.000Z'` จะให้ผลลัพธ์ผิดพลาด ทำให้ Query เคลียร์ Hold 5 นาทีทำงานไม่ถูกต้อง
* **ข้อเสนอแนะในการปรับปรุง:** ใช้ฟังก์ชันแปลงวันเวลามาตรฐานเดียวกันทั้งหมด หรือส่งวันเวลาแบบ ISO8601 จาก TypeScript Application
* **ตัวอย่างการ Refactor (Before vs After):**

````carousel
```sql
-- ❌ ก่อนปรับปรุง: Format สองแบบไม่ตรงกัน
created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
hold_expires_at TEXT DEFAULT (datetime('now', '+5 minutes')) -- คืนค่า 'YYYY-MM-DD HH:MM:SS'
```
<!-- slide -->
```sql
-- ✅ หลังปรับปรุง: ใช้รูปแบบ ISO8601 UTC สม่ำเสมอ 100%
created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
hold_expires_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'))
```
````

---

### Finding 3: ปัญหาคอขวดของ Partial Unique Index เมื่อ Hold หมดอายุ (Zombie Locks)
* **ระดับความสำคัญ:** 🔴 High Priority
* **หมวดหมู่:** Correctness / Concurrency Edge Case
* **ตำแหน่ง:** `docs/database-design-toy-car-booking.md` (Section 2: `uq_active_vehicle_slot`)
* **ปัญหา:**
  ```sql
  CREATE UNIQUE INDEX uq_active_vehicle_slot 
  ON bookings(vehicle_id, slot_date, slot_start_time)
  WHERE status IN ('HOLD', 'CONFIRMED');
  ```
  หากลูกค้าคนที่ 1 กด Hold แล้วปิดหน้าต่างหนีไป เวลาผ่านไปเกิน 5 นาที แถวข้อมูลในตาราง `bookings` ยังคงมีสถานะเป็น `HOLD` อยู่ (เนื่องจากยังไม่มี Cron Worker มาสั่ง Update เป็น `CANCELLED`) ลูกค้าคนที่ 2 ที่พยายามจองรอบเดียวกันจะถูก Database Reject ด้วย Unique Constraint ทันที ทั้งๆ ที่สิทธิ์ของลูกค้าคนแรกหมดอายุไปแล้ว
* **ผลกระทบ:** เสียโอกาสทางธุรกิจ ลูกค้าคนถัดไปจองรอบว่างไม่ได้จนกว่าระบบจะกวาดข้อมูลทิ้ง
* **ข้อเสนอแนะในการปรับปรุง:**
  เพิ่มเงื่อนไขตรวจเช็กการแย่งจองในระดับ Application Query: หากพบแถวสถานะ `HOLD` ที่ `hold_expires_at < now()` ให้ระบบถือว่าหมดอายุและอนุญาตให้เขียนทับ (Atomic Upsert) หรือยกเลิกแถวเก่าทันที
* **ตัวอย่างการ Refactor (Before vs After):**

````carousel
```typescript
// ❌ ก่อนปรับปรุง: INSERT ทื่อๆ แล้วปล่อยให้ล้มเหลว
await db.prepare("INSERT INTO bookings (...) VALUES (...)").run();
```
<!-- slide -->
```typescript
// ✅ หลังปรับปรุง: เคลียร์ Hold ที่หมดอายุใน Transaction เดียวกันก่อนจอง
await db.batch([
  // 1. ปลดล็อค Hold ที่หมดอายุแล้วของ Slot นี้ทันที
  db.prepare(`
    UPDATE bookings 
    SET status = 'CANCELLED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE vehicle_id = ? AND slot_date = ? AND slot_start_time = ?
      AND status = 'HOLD' AND hold_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(vehicleId, slotDate, slotStartTime),

  // 2. จองสิทธิ์ใหม่
  db.prepare(`
    INSERT INTO bookings (...) VALUES (...)
  `).bind(...)
]);
```
````

---

### Finding 4: ขาดการตัดเศษวินาที (Rounding Policy) ในการคำนวณค่าปรับ Overtime
* **ระดับความสำคัญ:** 🟡 Medium Priority
* **หมวดหมู่:** Business Logic / Edge Cases
* **ตำแหน่ง:** `docs/database-design-toy-car-booking.md` Section 5.2
* **ปัญหา:**
  สูตรระบุว่า: `overtime = actual_minutes - scheduled_minutes - grace_period`  
  หากลูกค้าคืนรถช้า 5 นาที 20 วินาที (Grace period คือ 5 นาที 0 วินาที = เกินมา 20 วินาที):
  ระบบจะปัดขึ้นเป็น 1 นาที (คิดค่าปรับ 10 บาท) หรือปัดเศษทิ้ง (คิด 0 บาท)?
* **ผลกระทบ:** หากไม่มีกฎเกณฑ์ที่ระบุไว้ชัดเจนในโค้ด จะเกิดข้อพิพาทหน้าเคาน์เตอร์ระหว่างพนักงานกับผู้ปกครอง
* **ข้อเสนอแนะในการปรับปรุง:** กำหนด Rounding Policy ให้ชัดเจนใน Domain Function (เช่น ปัดเศษวินาทีลง `Math.floor` เพื่อให้เป็นคุณต่อลูกค้า หรือกำหนดเศษเกิน 30 วินาทีให้ปัดขึ้น)
* **ตัวอย่างการ Refactor:**

```typescript
export class PenaltyCalculator {
  static calculate(
    scheduledEnd: Date, 
    actualReturn: Date, 
    gracePeriodMinutes = BUSINESS_RULES.PRICING.GRACE_PERIOD_MINUTES
  ): PenaltyCalculationResult {
    const diffSeconds = Math.max(0, (actualReturn.getTime() - scheduledEnd.getTime()) / 1000);
    const gracePeriodSeconds = gracePeriodMinutes * 60;

    if (diffSeconds <= gracePeriodSeconds) {
      return { billableOvertimeMinutes: 0, penaltyCents: 0 };
    }

    const excessSeconds = diffSeconds - gracePeriodSeconds;
    // กฎ: ปัดเศษวินาทีเป็นนาทีเต็ม (Math.ceil) หรือปัดลง (Math.floor)
    const billableMinutes = Math.ceil(excessSeconds / 60);
    const penaltyCents = billableMinutes * BUSINESS_RULES.PRICING.PENALTY_PER_MINUTE_CENTS;

    return { billableOvertimeMinutes: billableMinutes, penaltyCents };
  }
}
```

---

### Finding 5: Zod Phone Regex ขาดการทำ Data Normalization
* **ระดับความสำคัญ:** 🟡 Medium Priority
* **หมวดหมู่:** Input Validation / Usability
* **ตำแหน่ง:** `docs/api-design-toy-car-booking.md` (Section 5)
* **ปัญหา:**
  Regex `/^0[689]\d{8}$/` ปฏิเสธเบอร์โทรทันทีหากลูกค้ากรอกแบบมีขีดคั่น เช่น `081-234-5678` หรือมีเว้นวรรค `081 234 5678` หรือกรอกรหัสประเทศ `+66812345678`
* **ผลกระทบ:** ลูกค้าบนมือถือมักใช้ Autocomplete ของระบบแป้นพิมพ์ ซึ่งอาจติดขีดคั่นมาด้วย ทำให้ส่งฟอร์มไม่ผ่านและเกิดความหงุดหงิด
* **ข้อเสนอแนะในการปรับปรุง:** ทำ `.transform()` ทำความสะอาดข้อความ (Sanitize) ตัดเครื่องหมายขีดและช่องว่างออกก่อน Validate Regex
* **ตัวอย่างการ Refactor (Before vs After):**

````carousel
```typescript
// ❌ ก่อนปรับปรุง: ปฏิเสธทันทีถ้ามีขีดหรือช่องว่าง
customer_phone: z.string().regex(/^0[689]\d{8}$/, 'เบอร์โทรศัพท์ไม่ถูกต้อง')
```
<!-- slide -->
```typescript
// ✅ หลังปรับปรุง: Sanitize ก่อนตรวจสอบ
customer_phone: z.string()
  .trim()
  .transform((val) => val.replace(/[\s-]/g, '').replace(/^\+66/, '0'))
  .pipe(z.string().regex(/^0[689]\d{8}$/, 'เบอร์โทรศัพท์ต้องเป็นเบอร์มือถือ 10 หลัก'))
```
````

---

### Finding 6: ขาดฟิลด์บันทึกเหตุผลการยกเว้นค่าปรับ (Waiver Auditability)
* **ระดับความสำคัญ:** 🟡 Medium Priority
* **หมวดหมู่:** Error Handling / Audit Trail
* **ตำแหน่ง:** `docs/database-design-toy-car-booking.md` (ตาราง `rental_sessions`)
* **ปัญหา:**
  ตาราง `rental_sessions` มีฟิลด์ `penalty_amount_cents` แต่หากพนักงานเห็นว่าลูกค้ามาช้าเพราะรถแบตเตอรี่เสื่อมวิ่งไม่ออก พนักงานอาจกดปรับค่าปรับเป็น 0 บาท โดยในระบบไม่มีฟิลด์ระบุเหตุผลว่าทำไมถึงละเว้นค่าปรับ
* **ผลกระทบ:** ตรวจสอบย้อนหลังยาก เสี่ยงต่อการทุจริต หรือไม่สามารถแยกแยะได้ว่าลูกค้าคืนตรงเวลาจริง หรือพนักงานละเว้นค่าปรับให้
* **ข้อเสนอแนะในการปรับปรุง:** เพิ่มคอลัมน์ `penalty_waived_cents` และ `waive_reason` ในตาราง `rental_sessions`

---

### Finding 7: ความไม่สอดคล้องของการใช้ Naming Casing ข้ามเลเยอร์
* **ระดับความสำคัญ:** 🟢 Low Priority
* **หมวดหมู่:** Readability / Naming Conventions
* **ตำแหน่ง:** `docs/api-design-toy-car-booking.md` vs `docs/software-architecture-toy-car-booking.md`
* **ปัญหา:**
  API JSON Payload ออกแบบเป็น `snake_case` (เช่น `vehicle_id`, `slot_date`) ในขณะที่ TypeScript Domain Entity / Use Case ใช้ `camelCase` (เช่น `vehicleId`, `slotDate`)
* **ผลกระทบ:** หากไม่มี Mapper Layer แปลงโครงสร้างอย่างชัดเจน อาจเกิดโค้ดแบบปนเปกัน (`obj.vehicle_id` ปนกับ `obj.vehicleId`) ซึ่งก่อให้เกิด Dead Code หรือ Bug ใน Runtime
* **ข้อเสนอแนะในการปรับปรุง:** กำหนด DTO Mapping Function หรือใช้ Zod Object Transformation ให้แปลงเป็น `camelCase` ทันทีที่ข้อมูลผ่าน Validation Middleware เข้าสู่ Application Layer

---

## 3. สรุปรายการข้อเสนอแนะและลำดับความสำคัญ (Prioritized Action Plan)

| ลำดับ | รายการ | ระดับ | ไฟล์เป้าหมายที่เกี่ยวข้อง |
|---|---|---|---|
| **1** | กำจัด Magic Numbers และรวมไว้ใน `BUSINESS_RULES` Constants | 🔴 High | `src/core/constants/business-rules.ts` |
| **2** | ทำ Timestamp Formatting ให้เป็น ISO8601 UTC มาตรฐานเดียวกันใน D1 | 🔴 High | `migrations/0001_initial_schema.sql` |
| **3** | แก้ไข Concurrency Zombie Lock ในการกักสิทธิ์จองรอบเวลา | 🔴 High | `src/modules/booking/application/HoldSlotUseCase.ts` |
| **4** | ประกาศ Rounding Policy ในการคิดค่าปรับวินาทีส่วนเกิน | 🟡 Medium | `src/modules/session/domain/PenaltyCalculator.ts` |
| **5** | เพิ่ม Phone Number Sanitization ใน Zod Validation | 🟡 Medium | `src/modules/booking/presentation/schemas.ts` |
| **6** | เพิ่ม Audit Field สำหรับการยกเว้นค่าปรับ (`waive_reason`) | 🟡 Medium | `migrations/0001_initial_schema.sql` |
| **7** | ทำ Auto-mapping ระหว่าง API `snake_case` กับ Domain `camelCase` | 🟢 Low | `src/core/presentation/dto-mapper.ts` |

---

## 4. สถานะและขั้นตอนถัดไป (Next Steps)
การตรวจสอบ Code Quality เสร็จสิ้นโดย **ไม่มีการแก้ไขโค้ดใดๆ** ตามข้อกำหนด พร้อมสำหรับขั้นตอน:
1. นำรายการข้อค้นพบทั้ง 7 ข้อนี้ไปปรับปรุงในการเริ่มเขียน Source Code จริง (Implementation)
2. **`07-testing-qa`**: สร้าง Test Strategy, Unit Test Cases, และ Edge Case Scenarios เพื่อทดสอบตามประเด็นที่พบในรายงานนี้
