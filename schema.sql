-- ============================================================
-- Medic Shift Log — ตารางฐานข้อมูล (รันครั้งเดียวใน Neon SQL Editor)
-- วิธีใช้: เปิด Neon Dashboard > เลือกโปรเจกต์ > SQL Editor
--          วางโค้ดทั้งหมดนี้แล้วกด Run
-- ============================================================

-- ตารางบันทึกเข้า-ออกเวร (เก็บทุก event ของทุกคน)
CREATE TABLE IF NOT EXISTS shift_events (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    type TEXT NOT NULL,
    datetime TIMESTAMPTZ,
    date TEXT,
    time TEXT,
    duration TEXT,
    out_time TEXT,
    is_forced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ตารางสถานะเงินกองกลาง (มีแถวเดียว id=1)
CREATE TABLE IF NOT EXISTS fund_state (
    id INT PRIMARY KEY,
    balance NUMERIC NOT NULL DEFAULT 70000,
    cash NUMERIC NOT NULL DEFAULT 40000,
    deposit NUMERIC NOT NULL DEFAULT 20000,
    reserve NUMERIC NOT NULL DEFAULT 10000
);

INSERT INTO fund_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ตารางประวัติฝาก/ถอนเงินกองกลาง
CREATE TABLE IF NOT EXISTS fund_history (
    id SERIAL PRIMARY KEY,
    username TEXT,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    note TEXT,
    date TEXT,
    time TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ตารางสต็อกอุปกรณ์
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_quantity INTEGER NOT NULL DEFAULT 0,
    source TEXT DEFAULT '',
    added_by TEXT DEFAULT '',
    manual_status TEXT DEFAULT 'auto',
    date TEXT DEFAULT '',
    time TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ตารางประวัติการเบิกอุปกรณ์ (มี price ตั้งแต่สร้าง)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_withdrawals (
    id SERIAL PRIMARY KEY,
    item_id INTEGER,
    item_name TEXT NOT NULL,
    requester TEXT NOT NULL,
    username TEXT,
    quantity INTEGER NOT NULL,
    price NUMERIC DEFAULT 0,
    date TEXT,
    time TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ถ้าตารางเดิมมีอยู่แล้วแต่ไม่มีคอลัมน์ price ให้รันบรรทัดนี้
ALTER TABLE stock_withdrawals ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;

-- ============================================================
-- ตารางทะเบียนรถ
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    plate TEXT NOT NULL,
    model TEXT NOT NULL,
    date TEXT,
    time TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ดัชนี
CREATE INDEX IF NOT EXISTS idx_stock_items_id_desc ON stock_items (id DESC);
CREATE INDEX IF NOT EXISTS idx_shift_events_username ON shift_events (username);
CREATE INDEX IF NOT EXISTS idx_fund_history_id_desc ON fund_history (id DESC);
CREATE INDEX IF NOT EXISTS idx_stock_withdrawals_id_desc ON stock_withdrawals (id DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_username ON vehicles (username);
CREATE INDEX IF NOT EXISTS idx_vehicles_id_desc ON vehicles (id DESC);

-- ============================================================
-- ตารางรายชื่อแพทย์ (ทุกคนดูได้ แอดมิน/ผอ. เพิ่ม-ลบได้)
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    note TEXT DEFAULT '',
    added_by TEXT DEFAULT '',
    date TEXT DEFAULT '',
    time TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_id_desc ON doctors (id DESC);