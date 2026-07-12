import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    // GET /api/company?companyId=acme-001  -> look up a company (used at login)
    if (req.method === 'GET') {
      const { companyId } = req.query;
      if (!companyId) return res.status(400).json({ error: 'companyId is required' });

      const [company] = await sql`
        SELECT company_id, company_name FROM companies WHERE company_id = ${companyId}
      `;
      if (!company) return res.status(404).json({ error: 'Company not found' });
      return res.status(200).json(company);
    }

    // POST /api/company  -> manager signup, creates a new company
    if (req.method === 'POST') {
      const { companyName, companyId, securityPin } = req.body;
      if (!companyName || !companyId) {
        return res.status(400).json({ error: 'companyName and companyId are required' });
      }

      const existing = await sql`SELECT id FROM companies WHERE company_id = ${companyId}`;
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Company ID already taken' });
      }

      const [company] = await sql`
        INSERT INTO companies (company_id, company_name, security_pin)
        VALUES (${companyId}, ${companyName}, ${securityPin || null})
        RETURNING company_id, company_name
      `;
      return res.status(201).json(company);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}