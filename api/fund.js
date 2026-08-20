// api/fund.js — API กลางสำหรับเงินกองกลาง (ทุกคนเห็นยอดเดียวกัน)
// ทำงานบน Vercel Serverless Function เชื่อม Neon ผ่าน DATABASE_URL
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const TZ = 'Asia/Bangkok';

// เฉพาะแอดมิน/ผอ. เท่านั้นที่เพิ่มเงินฝากและเงินสำรองได้
const ADMIN_USERS = ['talos blackagency'];

function thaiNow() {
    const now = new Date();
    return {
        date: now.toLocaleDateString('th-TH', { timeZone: TZ }),
        time: now.toLocaleTimeString('th-TH', { hour12: false, timeZone: TZ })
    };
}

export default async function handler(req, res) {
    try {
        // GET /api/fund — ดึงยอดเงิน + ประวัติ ในรูปแบบเดียวกับ localStorage เดิม
        if (req.method === 'GET') {
            const state = await sql`
                SELECT balance::float8 AS balance, cash::float8 AS cash,
                       deposit::float8 AS deposit, reserve::float8 AS reserve
                FROM fund_state WHERE id = 1`;
            const history = await sql`
                SELECT username, type, amount::float8 AS amount, note, date, time
                FROM fund_history ORDER BY id DESC LIMIT 50`;

            // รายรับสะสม/รายจ่ายสะสม — คำนวณจากประวัติทั้งหมด ไม่ใช่แค่ 50 รายการล่าสุด
            const totalsRow = await sql`
                SELECT
                    COALESCE(SUM(amount) FILTER (WHERE type IN ('ฝากเงิน', 'เพิ่มเงินฝาก', 'เพิ่มเงินสำรอง')), 0)::float8 AS income,
                    COALESCE(SUM(amount) FILTER (WHERE type = 'ถอนเงิน'), 0)::float8 AS expense
                FROM fund_history`;

            const row = state[0] || { balance: 70000, cash: 40000, deposit: 20000, reserve: 10000 };
            const totals = totalsRow[0] || { income: 0, expense: 0 };
            return res.status(200).json({
                balance: row.balance,
                allocations: { cash: row.cash, deposit: row.deposit, reserve: row.reserve },
                totals: { income: totals.income, expense: totals.expense },
                history: history.map((h) => ({
                    username: h.username,
                    type: h.type,
                    amount: h.amount,
                    note: h.note || 'ไม่มีหมายเหตุ',
                    date: h.date,
                    time: h.time
                }))
            });
        }

        // POST /api/fund — { action: 'deposit' | 'withdraw' | 'add_deposit' | 'add_reserve', amount, note, username }
        if (req.method === 'POST') {
            const { action, amount, note, username } = req.body || {};
            const value = Number(amount);
            const validActions = ['deposit', 'withdraw', 'add_deposit', 'add_reserve'];
            if (!validActions.includes(action) || !Number.isFinite(value) || value <= 0) {
                return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
            }

            // เพิ่มเงินฝาก/เงินสำรอง — เฉพาะแอดมิน/ผอ. เท่านั้น
            if ((action === 'add_deposit' || action === 'add_reserve') && !ADMIN_USERS.includes(username)) {
                return res.status(403).json({ error: 'เฉพาะแอดมินหรือ ผอ. เท่านั้นที่ทำรายการนี้ได้' });
            }

            const state = await sql`
                SELECT balance::float8 AS balance, cash::float8 AS cash, reserve::float8 AS reserve
                FROM fund_state WHERE id = 1`;
            const balance = state[0]?.balance ?? 0;
            if (action === 'withdraw' && value > balance) {
                return res.status(409).json({ error: 'ยอดเงินในกองกลางไม่เพียงพอ' });
            }

            const t = thaiNow();
            let typeText;

            if (action === 'deposit') {
                await sql`
                    UPDATE fund_state
                    SET balance = balance + ${value}, cash = cash + ${value}
                    WHERE id = 1`;
                typeText = 'ฝากเงิน';
            } else if (action === 'withdraw') {
                // ถอนเงิน: หักจาก "เงินสด" ก่อน ถ้าเงินสดไม่พอ ส่วนที่ขาดจะไปหักจาก "เงินสำรอง"
                // เพื่อไม่ให้ยอดเงินสดติดลบ (เงินฝากจะไม่ถูกแตะต้องจากการถอนปกติ)
                const cash = state[0]?.cash ?? 0;
                const reserve = state[0]?.reserve ?? 0;
                const cashDeduct = Math.min(value, cash);
                const reserveDeduct = Math.min(value - cashDeduct, reserve);
                await sql`
                    UPDATE fund_state
                    SET balance = balance - ${value},
                        cash = cash - ${cashDeduct},
                        reserve = reserve - ${reserveDeduct}
                    WHERE id = 1`;
                typeText = 'ถอนเงิน';
            } else if (action === 'add_deposit') {
                await sql`
                    UPDATE fund_state
                    SET balance = balance + ${value}, deposit = deposit + ${value}
                    WHERE id = 1`;
                typeText = 'เพิ่มเงินฝาก';
            } else if (action === 'add_reserve') {
                await sql`
                    UPDATE fund_state
                    SET balance = balance + ${value}, reserve = reserve + ${value}
                    WHERE id = 1`;
                typeText = 'เพิ่มเงินสำรอง';
            }

            await sql`
                INSERT INTO fund_history (username, type, amount, note, date, time)
                VALUES (${username || 'ไม่ระบุ'}, ${typeText}, ${value}, ${note || 'ไม่มีหมายเหตุ'}, ${t.date}, ${t.time})`;

            return res.status(200).json({ ok: true });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).end();
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'เซิร์ฟเวอร์มีปัญหา: ' + err.message });
    }
}