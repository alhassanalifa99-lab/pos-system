import { neon } from '@neondatabase/serverless';

// DATABASE_URL is set in Vercel → Settings → Environment Variables
// Use the POOLED connection string (has "-pooler" in the hostname)
export const sql = neon(process.env.DATABASE_URL);