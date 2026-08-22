// api/stock.js — API กลางสำหรับสต็อกอุปกรณ์ (ทุกคนเห็นรายการเดียวกัน)
// ทำงานบน Vercel Serverless Function เชื่อม Neon ผ่าน DATABASE_URL
//
// หมายเหตุ: ไฟล์นี้ไม่ได้อยู่ในไฟล์ที่อัปโหลดมาด้วย จึงสร้างขึ้นใหม่ให้ตรงกับ
// การเรียกใช้งานทั้งหมดใน app.js (add / adjust / set_status / remove) บวกของใหม่
// คือการบันทึก "ผู้เบิก" ทุกครั้งที่เบิกอุปกรณ์ และเมนูดูประวัติการเบิก (เฉพาะแอดมิน/ผอ.)
// ถ้าของจริงบนเซิร์ฟเวอร์มีโค้ดอื่นอยู่แล้ว ให้เทียบ/รวมกับไฟล์นี้ก่อนวางทับ
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// เฉพาะแอดมิน/ผอ. เท่านั้นที่จัดการสต็อกได้ (ไม่ใช่รองผอ.)
const ADMIN_USERS = ['talos blackagency'];
const TZ = 'Asia/Bangkok';

// เฉพาะแอดมิน/ผอ. เท่านั้นที่ดูประวัติการเบิกได้ (ให้ตรงกับ ADMIN_USERS ใน fund.js)
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
        quantity: r.quantity,
        minQuantity: r.min_quantity,
        source: r.source,
        addedBy: r.added_by,
        manualStatus: r.manual_status || 'auto',
        date: r.date,
        time: r.time
    };
}

export default async function handler(req, res) {
    try {
        // GET /api/stock            — รายการสต็อกทั้งหมด (รูปแบบเดิม)
        // GET /api/stock?view=withdrawals&username=xxx — ประวัติการเบิก (เฉพาะแอดมิน/ผอ.)
        if (req.method === 'GET') {
            if (req.query?.view === 'withdrawals') {
                const username = req.query.username || '';
                if (!ADMIN_USERS.includes(username)) {
                    return res.status(403).json({ error: 'เฉพาะแอดมินหรือ ผอ. เท่านั้นที่ดูประวัติการเบิกได้' });
                }
                const rows = await sql`
                    SELECT item_id, item_name, requester, username, quantity, date, time
                    FROM stock_withdrawals ORDER BY id DESC LIMIT 200`;
                return res.status(200).json(rows.map((r) => ({
                    itemId: r.item_id,
                    itemName: r.item_name,
                    requester: r.requester,
                    username: r.username,
                    quantity: r.quantity,
                    price: r.price,
                    date: r.date,
                    time: r.time
                })));
            }

            const rows = await sql`SELECT * FROM stock_items ORDER BY id DESC`;
            return res.status(200).json(rows.map(mapRow));
        }

        // POST /api/stock — { action: 'add' | 'adjust' | 'set_status' | 'remove', ... }
        if (req.method === 'POST') {
            const body = req.body || {};
            const { action } = body;

            if (action === 'add') {
                if (!ADMIN_USERS.includes(body.username)) {
                    return res.status(403).json({ error: 'เฉพาะแอดมินหรือ ผอ. เท่านั้นที่เพิ่มสต็อกได้' });
                }
                const { name, quantity, minQuantity, source, username, manualStatus } = body;
                const trimmedName = (name || '').trim();
                if (!trimmedName) {
                    return res.status(400).json({ error: 'กรุณากรอกชื่ออุปกรณ์' });
                }
                const t = thaiNow();
                const rows = await sql`
                    INSERT INTO stock_items (name, quantity, min_quantity, source, added_by, date, time)
                    VALUES (${trimmedName}, ${Math.max(0, Math.floor(Number(quantity) || 0))},
                            ${Math.max(0, Math.floor(Number(minQuantity) || 0))},
                            ${source || 'ไม่ระบุแหล่งที่มา'}, ${username || 'ไม่ระบุ'}, ${t.date}, ${t.time})
                    RETURNING *`;
                return res.status(200).json(mapRow(rows[0]));
            }

            if (action === 'adjust') {
                const { id, delta, requester, price, username } = body;
                const deltaValue = Math.floor(Number(delta));
                if (!id || !Number.isFinite(deltaValue) || deltaValue === 0) {
                    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
                }

                // เบิกออก (delta ติดลบ) ต้องระบุชื่อผู้เบิกเสมอ
                const isWithdraw = deltaValue < 0;
                const trimmedRequester = (requester || '').trim();
                if (isWithdraw && !trimmedRequester) {
                    return res.status(400).json({ error: 'กรุณาระบุชื่อผู้เบิก' });
                }

                const current = await sql`SELECT * FROM stock_items WHERE id = ${id}`;
                if (!current.length) {
                    return res.status(404).json({ error: 'ไม่พบรายการสต็อกนี้' });
                }
                const item = current[0];
                if (isWithdraw && Math.abs(deltaValue) > item.quantity) {
                    return res.status(409).json({ error: `คงเหลือเพียง ${item.quantity} ชิ้น` });
                }

                const rows = await sql`
                    UPDATE stock_items
                    SET quantity = GREATEST(0, quantity + ${deltaValue})
                    WHERE id = ${id}
                    RETURNING *`;

                if (isWithdraw) {
                    const t = thaiNow();
                    const itemPrice = price || 0;
                    await sql`
                        INSERT INTO stock_withdrawals (item_id, item_name, requester, username, quantity, price, date, time)
                        VALUES (${id}, ${item.name}, ${trimmedRequester}, ${username || 'ไม่ระบุ'},
                                ${Math.abs(deltaValue)}, ${itemPrice}, ${t.date}, ${t.time})`;
                }

                return res.status(200).json(mapRow(rows[0]));
            }

            if (action === 'set_status') {
                if (!ADMIN_USERS.includes(body.username)) {
                    return res.status(403).json({ error: 'เฉพาะแอดมินหรือ ผอ. เท่านั้นที่เปลี่ยนสถานะสต็อกได้' });
                }
                const { id, status } = body;
                if (!id || !status) {
                    return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
                }
                const rows = await sql`
                    UPDATE stock_items SET manual_status = ${status} WHERE id = ${id} RETURNING *`;
                if (!rows.length) return res.status(404).json({ error: 'ไม่พบรายการสต็อกนี้' });
                return res.status(200).json(mapRow(rows[0]));
            }

            if (action === 'remove') {
                if (!ADMIN_USERS.includes(body.username)) {
                    return res.status(403).json({ error: 'เฉพาะแอดมินหรือ ผอ. เท่านั้นที่ลบสต็อกได้' });
                }
                const { id } = body;
                if (!id) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
                await sql`DELETE FROM stock_items WHERE id = ${id}`;
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