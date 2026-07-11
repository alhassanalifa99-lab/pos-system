import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, companyId, staffId, pin } = req.body;
    // type: 'staff' or 'manager'

    if (!companyId || !pin) {
      return res.status(400).json({ error: 'companyId and pin are required' });
    }

    if (type === 'manager') {
      // Manager login only checks the company's own PIN, not a staff PIN
      const [company] = await sql`
        SELECT company_id, security_pin FROM companies WHERE company_id = ${companyId}
      `;
      if (!company || company.security_pin !== pin) {
        return res.status(401).json({ error: 'Incorrect company ID or manager PIN' });
      }
      return res.status(200).json({ success: true });
    }

    // Staff login
    if (!staffId) return res.status(400).json({ error: 'staffId is required for staff login' });

    const [staffMember] = await sql`
      SELECT id, name, pin FROM staff_users
      WHERE company_id = ${companyId} AND id = ${staffId}
    `;
    if (!staffMember || staffMember.pin !== pin) {
      return res.status(401).json({ error: 'Incorrect user or PIN' });
    }

    return res.status(200).json({ id: staffMember.id, name: staffMember.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
