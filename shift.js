// api/shift.js — API กลางสำหรับระบบเข้า-ออกเวร (ทุกคนอ่าน/เขียนที่เดียวกัน)
// ทำงานบน Vercel Serverless Function เชื่อม Neon ผ่าน DATABASE_URL
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const TZ = 'Asia/Bangkok';

function thaiNow() {
    const now = new Date();
    return {
        now,
        date: now.toLocaleDateString('th-TH', { timeZone: TZ }),
        time: now.toLocaleTimeString('th-TH', { hour12: false, timeZone: TZ })
    };
}

function calcDuration(checkinDatetime, now) {
    const diffMin = Math.max(0, Math.floor((now - new Date(checkinDatetime)) / 60000));
    const hours = Math.floor(diffMin / 60);
    const minutes = diffMin % 60;
    return hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

export default async function handler(req, res) {
    try {
        // GET /api/shift — ดึงบันทึกเวรของทุกคน ในรูปแบบเดียวกับ localStorage เดิม
        if (req.method === 'GET') {
            const rows = await sql`SELECT * FROM shift_events ORDER BY id ASC`;
            const log = {};
            for (const r of rows) {
                const entry = { type: r.type, time: r.time, date: r.date };
                if (r.datetime) entry.datetime = new Date(r.datetime).toISOString();
                if (r.duration) entry.duration = r.duration;
                if (r.out_time) entry.outTime = r.out_time;
                if (r.is_forced) entry.isForced = true;
                (log[r.username] = log[r.username] || []).push(entry);
            }
            return res.status(200).json(log);
        }

        // POST /api/shift — { action: 'checkin' | 'checkout' | 'forceout', username }
        if (req.method === 'POST') {
            const { action, username } = req.body || {};
            if (!username || !action) {
                return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
            }

            // เช็กว่าค้างเวรอยู่ไหม: event ล่าสุดของคนนี้คือ 'เข้าเวร' หรือเปล่า
            const last = await sql`
                SELECT id, type, datetime FROM shift_events
                WHERE username = ${username} ORDER BY id DESC LIMIT 1`;
            const openShift = (last.length && last[0].type === 'เข้าเวร') ? last[0] : null;
            const t = thaiNow();

            if (action === 'checkin') {
                if (openShift) return res.status(409).json({ error: 'เข้าเวรอยู่แล้ว' });
                await sql`
                    INSERT INTO shift_events (username, type, datetime, date, time)
                    VALUES (${username}, 'เข้าเวร', ${t.now.toISOString()}, ${t.date}, ${t.time})`;
                return res.status(200).json({ ok: true });
            }

            if (action === 'checkout' || action === 'forceout') {
                if (!openShift) return res.status(409).json({ error: 'ไม่พบเวรที่ค้างอยู่' });
                const duration = calcDuration(openShift.datetime, t.now);
                const isForced = action === 'forceout';
                await sql`
                    UPDATE shift_events SET duration = ${duration}, out_time = ${t.time}
                    WHERE id = ${openShift.id}`;
                await sql`
                    INSERT INTO shift_events (username, type, date, time, duration, is_forced)
                    VALUES (${username}, 'ออกเวร', ${t.date}, ${t.time}, ${duration}, ${isForced})`;
                return res.status(200).json({ ok: true, duration });
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
