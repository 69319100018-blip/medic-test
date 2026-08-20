-- ============================================================
-- Medic Shift Log — ตารางฐานข้อมูล (รันครั้งเดียวใน Neon SQL Editor)
-- วิธีใช้: เปิด Neon Dashboard > เลือกโปรเจกต์ > SQL Editor
--          วางโค้ดทั้งหมดนี้แล้วกด Run
-- อัปเดตล่าสุด: เพิ่มตาราง stock_items สำหรับเมนูสต็อกอุปกรณ์
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

-- ============================================================
-- ใหม่: ตารางสต็อกอุปกรณ์ (ใช้กับ /api/stock)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,                      -- ชื่ออุปกรณ์
    quantity INTEGER NOT NULL DEFAULT 0,     -- จำนวนคงเหลือ (ชิ้น)
    min_quantity INTEGER NOT NULL DEFAULT 0, -- จำนวนขั้นต่ำที่ต้องมี (ใช้คำนวณ "ขาด")
    source TEXT DEFAULT '',                  -- แหล่งที่มา / ผู้จัดหา
    added_by TEXT DEFAULT '',                -- ชื่อคนเพิ่มรายการ (username ที่ล็อกอิน)
    manual_status TEXT DEFAULT 'auto',       -- สถานะที่ตั้งเอง: auto/ready/ordered/waiting/damaged
    date TEXT DEFAULT '',                    -- วันที่เพิ่ม (แบบไทย)
    time TEXT DEFAULT '',                    -- เวลาที่เพิ่ม (แบบไทย)
    updated_at TIMESTAMPTZ DEFAULT NOW(),    -- อัปเดตล่าสุด (เติม/เบิกสต็อก)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เผื่อฐานข้อมูลเดิมเคยสร้างตาราง stock_items ไว้ก่อนมีคอลัมน์นี้
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS manual_status TEXT DEFAULT 'auto';

-- ดัชนีช่วยให้เรียงรายการล่าสุดเร็วขึ้น (ไม่บังคับ แต่แนะนำ)
CREATE INDEX IF NOT EXISTS idx_stock_items_id_desc ON stock_items (id DESC);
CREATE INDEX IF NOT EXISTS idx_shift_events_username ON shift_events (username);
CREATE INDEX IF NOT EXISTS idx_fund_history_id_desc ON fund_history (id DESC);

-- ============================================================
-- ใหม่: ตารางประวัติการเบิกอุปกรณ์ (ใช้กับ /api/stock action=withdrawals)
-- บันทึกทุกครั้งที่มีการ "ใช้/เบิก" สต็อก (delta ติดลบ)
-- ดูได้เฉพาะแอดมิน/ผอ. ผ่านเมนู "ประวัติการเบิก"
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_withdrawals (
    id SERIAL PRIMARY KEY,
    item_id INTEGER,                 -- อ้างอิงถึง stock_items.id (อาจถูกลบภายหลังได้ จึงไม่ทำ FK บังคับ)
    item_name TEXT NOT NULL,         -- ชื่ออุปกรณ์ ณ เวลาที่เบิก (กันกรณีรายการถูกลบ/แก้ชื่อภายหลัง)
    requester TEXT NOT NULL,         -- ชื่อผู้เบิก (คนที่มาขอเบิกของจริง ๆ ไม่ใช่ผู้ล็อกอิน)
    username TEXT,                   -- บัญชีผู้ล็อกอินที่กดทำรายการ
    quantity INTEGER NOT NULL,       -- จำนวนที่เบิกออก (ค่าบวกเสมอ)
    date TEXT,                       -- วันที่แบบไทย
    time TEXT,                       -- เวลาแบบไทย
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_withdrawals_id_desc ON stock_withdrawals (id DESC);