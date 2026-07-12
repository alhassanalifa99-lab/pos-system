import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    // GET /api/staff?companyId=acme-001  -> list staff for a company (used to populate login dropdown)
    if (req.method === 'GET') {
      const { companyId } = req.query;
      if (!companyId) return res.status(400).json({ error: 'companyId is required' });

      const staff = await sql`
        SELECT id, name FROM staff_users WHERE company_id = ${companyId} ORDER BY created_at ASC
      `;
      // Note: PIN is never returned here — verify it via /api/staff-login instead
      return res.status(200).json(staff);
    }

    // POST /api/staff  -> add a new staff login
    if (req.method === 'POST') {
      const { companyId, name, pin } = req.body;
      if (!companyId || !name || !pin) {
        return res.status(400).json({ error: 'companyId, name, and pin are required' });
      }

      const duplicate = await sql`
        SELECT id FROM staff_users WHERE company_id = ${companyId} AND LOWER(name) = LOWER(${name})
      `;
      if (duplicate.length > 0) {
        return res.status(409).json({ error: 'A staff user with that name already exists' });
      }

      const [staffMember] = await sql`
        INSERT INTO staff_users (company_id, name, pin)
        VALUES (${companyId}, ${name}, ${pin})
        RETURNING id, name
      `;
      return res.status(201).json(staffMember);
    }

    // DELETE /api/staff?id=5
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });

      await sql`DELETE FROM staff_users WHERE id = ${id}`;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}