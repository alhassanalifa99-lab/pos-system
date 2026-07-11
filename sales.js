import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    // GET /api/sales?companyId=acme-001  -> sales history for reports
    if (req.method === 'GET') {
      const { companyId } = req.query;
      if (!companyId) return res.status(400).json({ error: 'companyId is required' });

      const sales = await sql`
        SELECT * FROM sales WHERE company_id = ${companyId} ORDER BY sale_date DESC
      `;
      return res.status(200).json(sales);
    }

    // POST /api/sales  -> complete a sale (records the sale AND decrements stock)
    if (req.method === 'POST') {
      const { companyId, cashierId, cashierName, total, items } = req.body;
      if (!companyId || total == null || !items || items.length === 0) {
        return res.status(400).json({ error: 'companyId, total, and items are required' });
      }

      // Record the sale
      const [sale] = await sql`
        INSERT INTO sales (company_id, cashier_id, cashier_name, total, items)
        VALUES (${companyId}, ${cashierId || null}, ${cashierName || null}, ${total}, ${JSON.stringify(items)})
        RETURNING *
      `;

      // Decrement stock for each item sold
      for (const item of items) {
        await sql`
          UPDATE products
          SET stock = stock - ${item.quantity}
          WHERE id = ${item.id} AND company_id = ${companyId}
        `;
      }

      return res.status(201).json(sale);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
