# เอกสารการออกแบบฐานข้อมูล: ระบบจองรถของเล่น (Database Design Specification)
## แพลตฟอร์มเป้าหมาย: Cloudflare D1 (Serverless Edge SQLite) & Cloudflare Workers

> **มาตรฐานอ้างอิง:** Skill `04-database-design`  
> **อ้างอิงระบบ:**  
> - Requirements: [`docs/requirements-toy-car-booking.md`](file:///c:/เสรี/docs/requirements-toy-car-booking.md)  
> - Software Architecture: [`docs/software-architecture-toy-car-booking.md`](file:///c:/เสรี/docs/software-architecture-toy-car-booking.md)  
> **Database Engine:** **Cloudflare D1** (Serverless SQLite at the Edge with Global Read Replicas & Time Travel)

---

## 1. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    VEHICLES ||--o{ BOOKINGS : "has reservations"
    VEHICLES ||--o{ RENTAL_SESSIONS : "operates in"
    VEHICLES ||--o{ BATTERY_LOGS : "logs charging"
    
    BOOKINGS ||--o| RENTAL_SESSIONS : "initiates"
    BOOKINGS ||--o{ PAYMENT_TRANSACTIONS : "involves"
    
    RENTAL_SESSIONS ||--o{ AUDIT_LOGS : "audits state"
    RENTAL_SESSIONS ||--o| PAYMENT_TRANSACTIONS : "settles penalty/refund"

    VEHICLES {
        text id PK "ULID / UUID"
        text code UK "เช่น CAR-01"
        text name "ชื่อรุ่นรถ"
        text category "SPORTS, JEEP, MOTORCYCLE"
        integer max_weight_kg "น้ำหนักสูงสุดที่รับได้"
        integer min_age_years "อายุขั้นต่ำ"
        integer has_remote "1=มีรีโมท, 0=ไม่มี"
        text status "AVAILABLE, IN_USE, CHARGING, MAINTENANCE"
        integer cycle_count "รอบเล่นสะสม (รีเซ็ตเมื่อชาร์จ)"
        text created_at "ISO8601"
        text updated_at "ISO8601"
    }

    BOOKINGS {
        text id PK "ULID / UUID"
        text booking_code UK "เช่น BK-20260929-001"
        text vehicle_id FK
        text customer_name "ชื่อผู้ปกครอง"
        text customer_phone "เบอร์โทรศัพท์"
        text slot_date "YYYY-MM-DD"
        text slot_start_time "HH:MM"
        text slot_end_time "HH:MM"
        integer duration_minutes "15, 30, 60"
        text status "HOLD, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW"
        text hold_expires_at "เวลาหมดอายุกักสิทธิ์ 5 นาที"
        text created_at "ISO8601"
        text updated_at "ISO8601"
    }

    RENTAL_SESSIONS {
        text id PK "ULID / UUID"
        text booking_id FK UK
        text vehicle_id FK
        text staff_checkin_id "รหัสพนักงานปล่อยรถ"
        text staff_checkout_id "รหัสพนักงานรับคืน"
        text start_time "เวลาปล่อยรถจริง"
        text scheduled_end_time "เวลาครบกำหนด"
        text actual_return_time "เวลาคืนรถจริง"
        integer grace_period_minutes "เกณฑ์ผ่อนผัน (Default 5)"
        integer overtime_minutes "จำนวนนาทีที่เกิน"
        integer penalty_amount_cents "ค่าปรับ (สตางค์)"
        integer damage_fee_cents "ค่าเสียหาย (สตางค์)"
        text condition_before "สภาพก่อนเล่น"
        text condition_after "สภาพหลังคืน"
        text status "ACTIVE, COMPLETED, OVERDUE"
        text created_at "ISO8601"
        text updated_at "ISO8601"
    }

    PAYMENT_TRANSACTIONS {
        text id PK "ULID / UUID"
        text booking_id FK
        text session_id FK "nullable"
        text transaction_type "RENTAL_FEE, DEPOSIT, PENALTY_DEDUCTION, REFUND"
        integer amount_cents "จำนวนเงิน (สตางค์)"
        text payment_method "PROMPTPAY, CASH"
        text status "PENDING, SUCCESS, FAILED, REFUNDED"
        text gateway_ref UK "เลขอ้างอิง Gateway (Idempotency)"
        text paid_at "ISO8601"
        text created_at "ISO8601"
    }

    BATTERY_LOGS {
        text id PK "ULID"
        text vehicle_id FK
        integer cycle_count_at_charge "รอบเล่นสะสมก่อนชาร์จ"
        text staff_id "พนักงานที่เสียบชาร์จ"
        text started_at "เวลาเริ่มชาร์จ"
        text completed_at "เวลาชาร์จเสร็จ"
        text status "CHARGING, COMPLETED"
    }

    AUDIT_LOGS {
        text id PK "ULID"
        text entity_type "BOOKING, SESSION, VEHICLE, PAYMENT"
        text entity_id "ID ของแถวข้อมูล"
        text action "CHECK_IN, CHECK_OUT, PENALTY_OVERRIDE"
        text performed_by "User/Staff ID"
        text payload_json "Snapshot ข้อมูล JSON"
        text created_at "ISO8601"
    }
```

---

## 2. Cloudflare D1 SQL Schema (DDL)

คำสั่ง SQL DDL นี้รองรับไวยากรณ์ SQLite ของ Cloudflare D1 โดยตรง จัดเก็บค่าเงินเป็น **Cents/สตางค์ (INTEGER)** เพื่อป้องกันปัญหา Floating-point Rounding และจัดเก็บวันเวลาเป็น **ISO8601 Text UTC**:

```sql
-- เปิดใช้งาน Foreign Key Constraints ใน SQLite
PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- 1. ตารางรถของเล่น (Vehicles)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('SPORTS', 'JEEP', 'MOTORCYCLE', 'TRUCK')),
    max_weight_kg INTEGER NOT NULL CHECK (max_weight_kg > 0),
    min_age_years INTEGER NOT NULL DEFAULT 2 CHECK (min_age_years >= 1),
    has_remote INTEGER NOT NULL DEFAULT 1 CHECK (has_remote IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'IN_USE', 'CHARGING', 'MAINTENANCE')),
    cycle_count INTEGER NOT NULL DEFAULT 0 CHECK (cycle_count >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- -----------------------------------------------------------------------------
-- 2. ตารางการจองรอบเวลา (Bookings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    booking_code TEXT NOT NULL UNIQUE,
    vehicle_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    slot_date TEXT NOT NULL, -- รูปแบบ YYYY-MM-DD
    slot_start_time TEXT NOT NULL, -- รูปแบบ HH:MM (24h)
    slot_end_time TEXT NOT NULL,   -- รูปแบบ HH:MM (24h)
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (15, 30, 60)),
    status TEXT NOT NULL DEFAULT 'HOLD' CHECK (status IN ('HOLD', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    hold_expires_at TEXT, -- ISO8601: Timestamp สิ้นสุดการกักสิทธิ์ 5 นาที
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT
);

-- Unique Constraint ป้องกัน Double Booking (รถ 1 คัน ห้ามมี Confirmed/Hold ชนกันในวันและเวลาเดียวกัน)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_vehicle_slot 
ON bookings(vehicle_id, slot_date, slot_start_time)
WHERE status IN ('HOLD', 'CONFIRMED');

-- -----------------------------------------------------------------------------
-- 3. ตารางรอบการเช่าและจับเวลาจริง (Rental Sessions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rental_sessions (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL UNIQUE,
    vehicle_id TEXT NOT NULL,
    staff_checkin_id TEXT NOT NULL,
    staff_checkout_id TEXT,
    start_time TEXT NOT NULL,
    scheduled_end_time TEXT NOT NULL,
    actual_return_time TEXT,
    grace_period_minutes INTEGER NOT NULL DEFAULT 5 CHECK (grace_period_minutes >= 0),
    overtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
    penalty_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (penalty_amount_cents >= 0),
    damage_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (damage_fee_cents >= 0),
    condition_before TEXT,
    condition_after TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'OVERDUE')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 4. ตารางธุรกรรมการเงินและเงินมัดจำ (Payment Transactions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    session_id TEXT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('RENTAL_FEE', 'DEPOSIT', 'PENALTY_DEDUCTION', 'DEPOSIT_REFUND')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('PROMPTPAY', 'CASH')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
    gateway_ref TEXT UNIQUE, -- รหัสอ้างอิงจาก Omise/GBPrimePay (Idempotency Key)
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    FOREIGN KEY (session_id) REFERENCES rental_sessions(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 5. ตารางประวัติการชาร์จแบตเตอรี่ (Battery Charging Logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battery_logs (
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    cycle_count_at_charge INTEGER NOT NULL,
    staff_id TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'CHARGING' CHECK (status IN ('CHARGING', 'COMPLETED')),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 6. ตารางบันทึกประวัติการเปลี่ยนแปลงและหลักฐาน (Audit Logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('BOOKING', 'SESSION', 'VEHICLE', 'PAYMENT')),
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    payload_json TEXT NOT NULL, -- Snapshot ข้อมูลก่อน-หลังเปลี่ยนแปลง
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

---

## 3. Data Dictionary (พจนานุกรมข้อมูล)

### 3.1 ตาราง `vehicles`
| ฟิลด์ | ชนิดข้อมูล | เงื่อนไข (Constraints) | คำอธิบาย |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | รหัสอ้างอิงสากล (ULID เพื่อเรียงลำดับเวลาได้) |
| `code` | TEXT | NOT NULL, UNIQUE | รหัสย่อที่ติดบนตัวรถ เช่น `CAR-01` |
| `name` | TEXT | NOT NULL | ชื่อรุ่นรถ เช่น "Lamborghini Sian Mini Red" |
| `category` | TEXT | NOT NULL, CHECK | หมวดหมู่: `SPORTS`, `JEEP`, `MOTORCYCLE`, `TRUCK` |
| `max_weight_kg` | INTEGER | NOT NULL, CHECK (>0) | น้ำหนักเด็กสูงสุดที่ปลอดภัย (กก.) |
| `min_age_years` | INTEGER | NOT NULL, DEFAULT 2 | เกณฑ์อายุขั้นต่ำ |
| `has_remote` | INTEGER | NOT NULL, 0 หรือ 1 | มีรีโมทควบคุมสำหรับผู้ปกครองหรือไม่ |
| `status` | TEXT | NOT NULL, CHECK | สถานะ: `AVAILABLE`, `IN_USE`, `CHARGING`, `MAINTENANCE` |
| `cycle_count` | INTEGER | NOT NULL, DEFAULT 0 | รอบการเล่นสะสมตั้งแต่ชาร์จครั้งล่าสุด (ถ้าครบ 3 รอบ จะถูกส่งชาร์จ) |

### 3.2 ตาราง `bookings`
| ฟิลด์ | ชนิดข้อมูล | เงื่อนไข (Constraints) | คำอธิบาย |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | รหัสการจอง (ULID) |
| `booking_code` | TEXT | NOT NULL, UNIQUE | รหัสสำหรับสแกนหน้าร้าน เช่น `BK-20260929-001` |
| `vehicle_id` | TEXT | NOT NULL, FK | รหัสรถที่เลือกจอง |
| `customer_name` | TEXT | NOT NULL | ชื่อผู้ปกครอง |
| `customer_phone` | TEXT | NOT NULL | เบอร์โทรศัพท์สำหรับแจ้งเตือน SMS/LINE |
| `slot_date` | TEXT | NOT NULL | วันที่จอง รูปแบบ `YYYY-MM-DD` |
| `slot_start_time` | TEXT | NOT NULL | เวลาเริ่มต้น เช่น `14:00` |
| `slot_end_time` | TEXT | NOT NULL | เวลาสิ้นสุด เช่น `14:30` |
| `duration_minutes` | INTEGER | NOT NULL, CHECK (15, 30, 60) | ความยาวรอบเวลา |
| `status` | TEXT | NOT NULL, CHECK | สถานะ: `HOLD`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW` |
| `hold_expires_at` | TEXT | NULLABLE | เวลาหมดอายุ 5 นาที หากชำระเงินไม่ทัน |

### 3.3 ตาราง `rental_sessions`
| ฟิลด์ | ชนิดข้อมูล | เงื่อนไข (Constraints) | คำอธิบาย |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | รหัสรอบการเช่าจริง (ULID) |
| `booking_id` | TEXT | NOT NULL, UNIQUE, FK | อ้างอิงใบจอง (1 จองต่อ 1 รอบเช่า) |
| `vehicle_id` | TEXT | NOT NULL, FK | อ้างอิงตัวรถ |
| `staff_checkin_id` | TEXT | NOT NULL | รหัสพนักงานที่กดปล่อยรถ |
| `staff_checkout_id` | TEXT | NULLABLE | รหัสพนักงานที่ตรวจรับคืน |
| `start_time` | TEXT | NOT NULL | เวลาที่กด Check-in เริ่มเล่นจริง |
| `scheduled_end_time`| TEXT | NOT NULL | เวลาที่ต้องนำรถมาคืน |
| `actual_return_time` | TEXT | NULLABLE | เวลาที่นำรถมาคืนที่เคาน์เตอร์จริง |
| `grace_period_minutes`| INTEGER | NOT NULL, DEFAULT 5 | เวลาผ่อนผัน (นาที) ที่ไม่คิดค่าปรับ |
| `overtime_minutes` | INTEGER | NOT NULL, DEFAULT 0 | จำนวนนาทีส่วนเกินที่คิดค่าปรับ |
| `penalty_amount_cents`| INTEGER| NOT NULL, DEFAULT 0 | ยอดค่าปรับ (10 บาท/นาที = 1,000 สตางค์/นาที) |
| `damage_fee_cents` | INTEGER | NOT NULL, DEFAULT 0 | ค่าเสียหายตัวรถ/รีโมท (ถ้ามี) |
| `status` | TEXT | NOT NULL, CHECK | `ACTIVE`, `COMPLETED`, `OVERDUE` |

---

## 4. Indexing Strategy & Query Optimization

เนื่องจาก Cloudflare D1 เป็น SQLite ที่ทำงานบน Edge การสร้าง Index ที่สอดคล้องกับ High-frequency Access Pattern จะช่วยให้ Query รวดเร็วระดับ Sub-millisecond:

```sql
-- 1. ค้นหา Slot ว่างตามวันที่และช่วงเวลา (High-frequency: Customer Catalog View)
CREATE INDEX IF NOT EXISTS idx_bookings_date_slot 
ON bookings (slot_date, slot_start_time, status);

-- 2. ค้นหารอบการจองที่หมดเวลา Hold 5 นาที เพื่อกวาดทิ้ง (Hold Cleaner Worker)
CREATE INDEX IF NOT EXISTS idx_bookings_hold_cleanup 
ON bookings (status, hold_expires_at) 
WHERE status = 'HOLD';

-- 3. ค้นหา Session ที่กำลัง Active เพื่อจับเวลาและส่ง Alert 5 นาทีล่วงหน้า (Timer Worker)
CREATE INDEX IF NOT EXISTS idx_sessions_active_timer 
ON rental_sessions (status, scheduled_end_time) 
WHERE status = 'ACTIVE';

-- 4. ค้นหารถที่พร้อมใช้งานตามหมวดหมู่ (Fleet Filter)
CREATE INDEX IF NOT EXISTS idx_vehicles_status_category 
ON vehicles (status, category);

-- 5. ค้นหาประวัติธุรกรรมตาม Booking ID (Payment Reconciliation)
CREATE INDEX IF NOT EXISTS idx_payments_booking_id 
ON payment_transactions (booking_id, status);
```

---

## 5. Transaction Rules & Concurrency บน Cloudflare Edge

Cloudflare D1 ทำงานแบบ Single Primary Writer และ Multi-Region Read Replicas:

### 1. การกักสิทธิ์จองรถ (Hold Slot) แบบ Atomic
ใน Cloudflare Workers เราใช้ `d1.batch()` เพื่อให้คำสั่ง SQL ทำงานภายใต้ **Single Atomic Transaction** ที่ระดับฐานข้อมูล:

```typescript
// ตัวอย่าง Transaction Batch บน Cloudflare Worker เพื่อป้องกัน Double Booking
const results = await env.DB.batch([
  // คำสั่งที่ 1: ตรวจสอบและแทรกการจอง (จะ Fail อัตโนมัติถ้าชน Partial Unique Index)
  env.DB.prepare(`
    INSERT INTO bookings (
      id, booking_code, vehicle_id, customer_name, customer_phone,
      slot_date, slot_start_time, slot_end_time, duration_minutes,
      status, hold_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'HOLD', datetime('now', '+5 minutes'))
  `).bind(bookingId, code, vehicleId, name, phone, date, start, end, duration),

  // คำสั่งที่ 2: บันทึก Transaction สำหรับมัดจำและค่าเช่าเบื้องต้น
  env.DB.prepare(`
    INSERT INTO payment_transactions (
      id, booking_id, transaction_type, amount_cents, payment_method, status
    ) VALUES (?, ?, 'RENTAL_FEE', ?, 'PROMPTPAY', 'PENDING')
  `).bind(txId, bookingId, totalCents)
]);
```

### 2. การจัดการ Check-out และคำนวณค่าปรับแบบลดความเสี่ยง
เมื่อพนักงานกด Check-out:
1. ดึง `scheduled_end_time` และ `grace_period_minutes` จาก `rental_sessions`
2. คำนวณ `overtime = max(0, actual_minutes - scheduled_minutes - grace_period)`
3. คำนวณค่าปรับ `penalty = overtime * 1000` (10 บาท = 1,000 สตางค์)
4. อัปเดต `rental_sessions` และเพิ่ม `cycle_count` ของ `vehicles` ใน `batch()` เดียวกัน
5. หาก `cycle_count >= 3` จะตั้งค่า `vehicles.status = 'CHARGING'` ทันที

---

## 6. Cloudflare D1 Migration & Deployment Plan

### 6.1 โครงสร้างไฟล์สำหรับ Wrangler CLI
```text
project-root/
├── wrangler.toml                 # กำหนดค่า Cloudflare D1 Binding
└── migrations/
    ├── 0001_initial_schema.sql   # DDL สร้างตารางและ Constraints
    ├── 0002_add_indexes.sql      # สร้างดัชนี (Indexes)
    └── 0003_seed_vehicles.sql    # ข้อมูลเริ่มต้นสำหรับรถของเล่น
```

### 6.2 การตั้งค่า `wrangler.toml`
```toml
name = "toy-car-booking-api"
main = "src/index.ts"
compatibility_date = "2026-09-29"

[[d1_databases]]
binding = "DB"
database_name = "toy_car_prod_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
migrations_dir = "migrations"
```

### 6.3 คำสั่ง Migration ผ่าน Wrangler CLI
```bash
# ทดสอบรัน Migration บนเครื่อง Local (Local SQLite Emulator)
npx wrangler d1 migrations apply toy_car_prod_db --local

# นำส่ง Migration ขึ้น Cloudflare D1 Production จริง
npx wrangler d1 migrations apply toy_car_prod_db --remote

# การ Backup ข้อมูล (Export SQL Dump)
npx wrangler d1 export toy_car_prod_db --remote --output="./backup_$(date +%Y%m%d).sql"
```

### 6.4 กลยุทธ์การ Rollback (Time Travel)
Cloudflare D1 มาพร้อมฟีเจอร์ **Time Travel** ในตัว:
* หากเกิดข้อผิดพลาดจากการ Deploy Migration สามารถย้อนเวลาฐานข้อมูลกลับไปยัง Bookmark หรือ Timestamp ที่ระบุก่อนหน้านั้นได้ทันทีโดยไม่ต้อง Restore Dump:
  ```bash
  npx wrangler d1 time-travel restore toy_car_prod_db --timestamp="2026-09-29T18:00:00Z"
  ```

---

## 7. ข้อจำกัดของ Cloudflare D1 และการบริหารความเสี่ยง (Performance & Limits)

| ข้อจำกัดของ Cloudflare D1 | ผลกระทบต่อระบบ | แนวทางการออกแบบเพื่อแก้ปัญหา (Mitigation) |
|---|---|---|
| **Single-Writer Bottleneck** (การเขียนข้อมูลต้องส่งไปที่ Primary Region) | Latency ในการบันทึกข้อมูล (Write) อาจอยู่ที่ 50-150ms หากเรียกข้ามทวีป | บูธเช่ารถของเล่นตั้งอยู่ในประเทศไทย จึงกำหนด Primary Region ของ D1 ในภูมิภาคเอเชีย (Singapore/Tokyo) เพื่อให้ Latency ต่ำสุด |
| **ขนาดฐานข้อมูล (D1 Limit: สูงสุด 50GB)** | ข้อมูลเติบโตตามจำนวนรูปภาพสภาพรถ | **ไม่เก็บรูปภาพใน D1:** ภาพถ่ายสภาพรถตอน Check-in/Check-out ให้เก็บใน **Cloudflare R2** แล้วเก็บเฉพาะ Object Key (URL) ในตาราง `rental_sessions` |
| **Concurrency Lock บน SQLite** | หากมีคำสั่งเขียนพร้อมกันจำนวนมหาศาล อาจเกิด Lock Contention | ใช้ **Cloudflare Workers KV** สำหรับการกักสิทธิ์ชั่วคราว (Hold Lock 5 นาที) เพื่อลดภาระการเขียนลง D1 ให้เหลือเฉพาะตอนที่ชำระเงินสำเร็จจริง |

---

## 8. ขั้นตอนถัดไป (Next Steps)
การออกแบบฐานข้อมูลบน Cloudflare D1 ชุดนี้สมบูรณ์และพร้อมสำหรับ:
1. **`05-api-design`**: ออกแบบ RESTful API Endpoints ที่เชื่อมต่อกับ Schema ชุดนี้ (OpenAPI / TypeBox / Hono RPC)
2. **Implementation**: นำไฟล์ DDL ไปใส่ในโฟลเดอร์ `migrations/` เพื่อเตรียม Deploy ด้วย Cloudflare Workers และ Wrangler
