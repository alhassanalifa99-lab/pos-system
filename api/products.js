import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    // GET /api/products?companyId=acme-001
    if (req.method === 'GET') {
      const { companyId } = req.query;
      if (!companyId) return res.status(400).json({ error: 'companyId is required' });

      const products = await sql`
        SELECT * FROM products WHERE company_id = ${companyId} ORDER BY created_at DESC
      `;
      return res.status(200).json(products);
    }

    // POST /api/products  -> add a product
    if (req.method === 'POST') {
      const { companyId, name, category, cost, price, stock } = req.body;
      if (!companyId || !name || price == null || stock == null) {
        return res.status(400).json({ error: 'companyId, name, price, and stock are required' });
      }

      const [product] = await sql`
        INSERT INTO products (company_id, name, category, cost, price, stock)
        VALUES (${companyId}, ${name}, ${category || 'General'}, ${cost || 0}, ${price}, ${stock})
        RETURNING *
      `;
      return res.status(201).json(product);
    }

    // PUT /api/products  -> edit a product, or bulk-adjust stock after a sale
    if (req.method === 'PUT') {
      const { id, name, category, cost, price, stock } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      const [product] = await sql`
        UPDATE products
        SET name = ${name}, category = ${category}, cost = ${cost}, price = ${price}, stock = ${stock}
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json(product);
    }

    // DELETE /api/products?id=5
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id is required' });

      await sql`DELETE FROM products WHERE id = ${id}`;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}