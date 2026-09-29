-- 0003_add_password_to_users.sql
-- เพิ่มคอลัมน์ password_hash และ password_salt สำหรับระบบ Login & สมัครสมาชิก

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
