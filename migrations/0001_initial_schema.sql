-- 0001_initial_schema.sql
-- Migration สำหรับระบบจองรถของเล่น (Toy Car Booking & Fleet Management)
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
    slot_date TEXT NOT NULL,
    slot_start_time TEXT NOT NULL,
    slot_end_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (15, 30, 60)),
    status TEXT NOT NULL DEFAULT 'HOLD' CHECK (status IN ('HOLD', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    hold_expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT
);

-- Partial Unique Index ป้องกันการจองชนกัน (Double Booking)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_vehicle_slot 
ON bookings(vehicle_id, slot_date, slot_start_time)
WHERE status IN ('HOLD', 'CONFIRMED');

-- Index สำหรับค้นหา Slot ว่าง และกวาด Hold ที่หมดอายุ
CREATE INDEX IF NOT EXISTS idx_bookings_date_slot 
ON bookings (slot_date, slot_start_time, status);

CREATE INDEX IF NOT EXISTS idx_bookings_hold_cleanup 
ON bookings (status, hold_expires_at) 
WHERE status = 'HOLD';

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
    waived_penalty_cents INTEGER NOT NULL DEFAULT 0 CHECK (waived_penalty_cents >= 0),
    waive_reason TEXT,
    damage_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (damage_fee_cents >= 0),
    condition_before TEXT,
    condition_after TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'OVERDUE')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sessions_active_timer 
ON rental_sessions (status, scheduled_end_time) 
WHERE status = 'ACTIVE';

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
    gateway_ref TEXT UNIQUE,
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
-- 6. ตารางบันทึกประวัติการเปลี่ยนแปลง (Audit Logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('BOOKING', 'SESSION', 'VEHICLE', 'PAYMENT')),
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- -----------------------------------------------------------------------------
-- ข้อมูลเริ่มต้น (Seed Initial Toy Cars)
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO vehicles (id, code, name, category, max_weight_kg, min_age_years, has_remote, status, cycle_count) VALUES
('veh_01', 'CAR-01', 'Lamborghini Sian Mini (Red)', 'SPORTS', 30, 3, 1, 'AVAILABLE', 0),
('veh_02', 'CAR-02', 'Jeep Wrangler 4x4 (Desert Sand)', 'JEEP', 40, 4, 1, 'AVAILABLE', 0),
('veh_03', 'CAR-03', 'Porsche 911 GT3 (Speed Yellow)', 'SPORTS', 25, 2, 1, 'AVAILABLE', 0),
('veh_04', 'CAR-04', 'BMW S1000RR Kids Moto (Blue)', 'MOTORCYCLE', 25, 3, 0, 'AVAILABLE', 0),
('veh_05', 'CAR-05', 'Mercedes-Benz G63 AMG (Obsidian Black)', 'JEEP', 45, 3, 1, 'AVAILABLE', 0);
