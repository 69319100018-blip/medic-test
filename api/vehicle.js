// api/vehicle.js — API กลางสำหรับทะเบียนรถของแพทย์แต่ละคน
// ทุกคนเพิ่ม/ลบรถของตัวเองได้ แอดมิน/ผอ. ดู (และลบ) รถของทุกคนได้
// ทำงานบน Vercel Serverless Function เชื่อม Neon ผ่าน DATABASE_URL
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const TZ = 'Asia/Bangkok';

// ให้ตรงกับ ADMIN_USERS ใน fund.js / stock.js
const ADMIN_USERS = ['talos blackagency'];

function thaiNow() {
    const now = new Date();
    return {
        date: now.toLocaleDateString('th-TH', { timeZone: TZ }),
        time: now.toLocaleTimeString('th-TH', { hour12: false, timeZone: TZ })
    };
}

function mapRow(r) {
    return {
        id: r.id,
        username: r.username,
        plate: r.plate,
        model: r.model,
        date: r.date,
        time: r.time
    };
}

export default async function handler(req, res) {
    try {
        // GET /api/vehicle — คืนรถทั้งหมดของทุกคน (ฝั่งหน้าเว็บกรองแสดงตามสิทธิ์เอง)
        if (req.method === 'GET') {
            const rows = await sql`SELECT * FROM vehicles ORDER BY id DESC`;
            return res.status(200).json(rows.map(mapRow));
        }

        // POST /api/vehicle — { action: 'add' | 'remove', ... }
        if (req.method === 'POST') {
            const body = req.body || {};
            const { action } = body;

            if (action === 'add') {
                const { username, plate, model } = body;
                const trimmedPlate = (plate || '').trim();
                const trimmedModel = (model || '').trim();
                if (!username || !trimmedPlate || !trimmedModel) {
                    return res.status(400).json({ error: 'กรุณากรอกเลขทะเบียนและรุ่นรถให้ครบ' });
                }
                const t = thaiNow();
                const rows = await sql`
                    INSERT INTO vehicles (username, plate, model, date, time)
                    VALUES (${username}, ${trimmedPlate}, ${trimmedModel}, ${t.date}, ${t.time})
                    RETURNING *`;
                return res.status(200).json(mapRow(rows[0]));
            }

            if (action === 'remove') {
                const { id, username } = body;
                if (!id || !username) {
                    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
                }
                const existing = await sql`SELECT * FROM vehicles WHERE id = ${id}`;
                if (!existing.length) {
                    return res.status(404).json({ error: 'ไม่พบรายการรถนี้' });
                }
                // ลบได้เฉพาะเจ้าของรถเอง หรือแอดมิน/ผอ.
                const isOwner = existing[0].username === username;
                const isAdminUser = ADMIN_USERS.includes(username);
                if (!isOwner && !isAdminUser) {
                    return res.status(403).json({ error: 'ลบได้เฉพาะรถของตัวเอง หรือแอดมิน/ผอ. เท่านั้น' });
                }
                await sql`DELETE FROM vehicles WHERE id = ${id}`;
                return res.status(200).json({ ok: true });
            }

            return res.status(400).json({ error: 'action ไม่ถูกต้อง' });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).end();
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'เซิร์ฟเวอร์มีปัญหา: ' + err.message });
    }
}