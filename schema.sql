-- ============================================================
-- Medic Shift Log — ตารางฐานข้อมูล (รันครั้งเดียวใน Neon SQL Editor)
-- วิธีใช้: เปิด Neon Dashboard > เลือกโปรเจกต์ > SQL Editor
--          วางโค้ดทั้งหมดนี้แล้วกด Run
-- ============================================================

-- ตารางบันทึกเข้า-ออกเวร (เก็บทุก event ของทุกคน)
CREATE TABLE IF NOT EXISTS shift_events (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,          -- เช่น 'talos blackagency'
    type TEXT NOT NULL,              -- 'เข้าเวร' หรือ 'ออกเวร'
    datetime TIMESTAMPTZ,            -- เวลาจริงตอนเข้าเวร (ใช้คำนวณชั่วโมง)
    date TEXT,                       -- วันที่แบบไทย
    time TEXT,                       -- เวลาแบบไทย
    duration TEXT,                   -- เช่น '2 ชม. 30 นาที'
    out_time TEXT,                   -- เวลาออกเวร
    is_forced BOOLEAN DEFAULT FALSE, -- ถูกบังคับออกเวรหรือไม่
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

-- ใส่ค่าเริ่มต้น (ยอดเริ่มต้น 70,000 บาท เหมือนโค้ดเดิม)
INSERT INTO fund_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ตารางประวัติฝาก/ถอนเงินกองกลาง
CREATE TABLE IF NOT EXISTS fund_history (
    id SERIAL PRIMARY KEY,
    username TEXT,                   -- ใครเป็นคนทำรายการ
    type TEXT NOT NULL,              -- 'ฝากเงิน' หรือ 'ถอนเงิน'
    amount NUMERIC NOT NULL,
    note TEXT,
    date TEXT,
    time TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
