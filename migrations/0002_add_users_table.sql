-- 0002_add_users_table.sql
-- เพิ่มตารางผู้ใช้งานและรองรับ Google OAuth Authentication

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    picture TEXT,
    role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('ADMIN', 'STAFF', 'CUSTOMER')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ให้สิทธิ์ seree999@gmail.com เป็น ADMIN ในระบบล่วงหน้า
INSERT OR REPLACE INTO users (id, email, name, picture, role)
VALUES ('usr_admin_seree', 'seree999@gmail.com', 'Seree (Admin)', '', 'ADMIN');
