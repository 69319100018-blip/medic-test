// api/fund.js — API กลางสำหรับเงินกองกลาง (ทุกคนเห็นยอดเดียวกัน)
// ทำงานบน Vercel Serverless Function เชื่อม Neon ผ่าน DATABASE_URL
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const TZ = 'Asia/Bangkok';

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

            const row = state[0] || { balance: 70000, cash: 40000, deposit: 20000, reserve: 10000 };
            return res.status(200).json({
                balance: row.balance,
                allocations: { cash: row.cash, deposit: row.deposit, reserve: row.reserve },
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

        // POST /api/fund — { action: 'deposit' | 'withdraw', amount, note, username }
        if (req.method === 'POST') {
            const { action, amount, note, username } = req.body || {};
            const value = Number(amount);
            if (!['deposit', 'withdraw'].includes(action) || !Number.isFinite(value) || value <= 0) {
                return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
            }

            const state = await sql`SELECT balance::float8 AS balance FROM fund_state WHERE id = 1`;
            const balance = state[0]?.balance ?? 0;
            if (action === 'withdraw' && value > balance) {
                return res.status(409).json({ error: 'ยอดเงินในกองกลางไม่เพียงพอ' });
            }

            const delta = action === 'deposit' ? value : -value;
            await sql`
                UPDATE fund_state
                SET balance = balance + ${delta}, cash = cash + ${delta}
                WHERE id = 1`;

            const t = thaiNow();
            const typeText = action === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน';
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
