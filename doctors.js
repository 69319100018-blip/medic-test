// api/doctors.js — API รายชื่อแพทย์
// ทุกคนอ่านได้ แอดมิน/ผอ. เท่านั้นที่เพิ่ม/ลบได้
// ทำงานบน Vercel Serverless Function เชื่อม Neon ผ่าน DATABASE_URL
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const TZ = 'Asia/Bangkok';

// ให้ตรงกับ ADMIN_USERS ใน fund.js / stock.js / vehicle.js
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
        name: r.name,
        role: r.role || '',
        note: r.note || '',
        addedBy: r.added_by || '',
        date: r.date,
        time: r.time
    };
}

export default async function handler(req, res) {
    try {
        // GET /api/doctors — คืนรายชื่อแพทย์ทั้งหมด (ทุกคนดูได้)
        if (req.method === 'GET') {
            const rows = await sql`SELECT * FROM doctors ORDER BY id DESC`;
            return res.status(200).json(rows.map(mapRow));
        }

        // POST /api/doctors — { action: 'add' | 'remove', ... }
        if (req.method === 'POST') {
            const body = req.body || {};
            const { action, username } = body;

            if (!username || !ADMIN_USERS.includes(username)) {
                return res.status(403).json({ error: 'เฉพาะแอดมินและผู้อำนวยการเท่านั้นที่จัดการรายชื่อแพทย์ได้' });
            }

            if (action === 'add') {
                const name = (body.name || '').trim();
                const role = (body.role || '').trim();
                const note = (body.note || '').trim();
                if (!name) {
                    return res.status(400).json({ error: 'กรุณากรอกชื่อแพทย์' });
                }
                const t = thaiNow();
                const rows = await sql`
                    INSERT INTO doctors (name, role, note, added_by, date, time)
                    VALUES (${name}, ${role}, ${note}, ${username}, ${t.date}, ${t.time})
                    RETURNING *`;
                return res.status(200).json(mapRow(rows[0]));
            }

            if (action === 'remove') {
                const { id } = body;
                if (!id) {
                    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
                }
                const existing = await sql`SELECT id FROM doctors WHERE id = ${id}`;
                if (!existing.length) {
                    return res.status(404).json({ error: 'ไม่พบรายชื่อนี้' });
                }
                await sql`DELETE FROM doctors WHERE id = ${id}`;
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
