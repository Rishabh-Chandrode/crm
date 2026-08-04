import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const LOCAL_DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/crm';
const LIVE_DB_URL = process.argv[2];
const LIVE_USER_ID = process.argv[3];

if (!LIVE_DB_URL || !LIVE_USER_ID) {
  console.error("Usage: node migrate_to_neon.js <NEON_DB_URL> <LIVE_USER_ID>");
  process.exit(1);
}

const localPool = new Pool({ connectionString: LOCAL_DB_URL });
const livePool = new Pool({ connectionString: LIVE_DB_URL, ssl: { rejectUnauthorized: false } });

async function migrate() {
  console.log("Starting migration...");
  
  const localClient = await localPool.connect();
  const liveClient = await livePool.connect();
  
  try {
    await liveClient.query('BEGIN');
    
    // 1. Fetch companies
    console.log("Fetching local companies...");
    const { rows: companies } = await localClient.query('SELECT * FROM companies');
    console.log(`Found ${companies.length} companies.`);
    
    const companyIdMap = {}; // local_id -> live_id
    
    // 2. Insert companies to live
    for (const company of companies) {
      const { id, name, website, industry, created_at, updated_at } = company;
      
      const res = await liveClient.query(`
        INSERT INTO companies (name, website, industry, created_at, updated_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (lower(name)) DO UPDATE 
        SET website = EXCLUDED.website, industry = EXCLUDED.industry, updated_at = EXCLUDED.updated_at
        RETURNING id
      `, [name, website, industry, created_at, updated_at, LIVE_USER_ID]);
      
      companyIdMap[id] = res.rows[0].id;
    }
    console.log("Companies migrated.");
    
    // 3. Fetch prospects
    console.log("Fetching local prospects...");
    const { rows: prospects } = await localClient.query('SELECT * FROM prospects');
    console.log(`Found ${prospects.length} prospects.`);
    
    // 4. Insert prospects to live
    let insertedProspects = 0;
    for (const prospect of prospects) {
      const { 
        id, company_id, email, job_title, linkedin_url, phone, 
        notes, created_at, updated_at, first_name, last_name, role_category 
      } = prospect;
      
      const liveCompanyId = company_id ? companyIdMap[company_id] : null;
      
      await liveClient.query(`
        INSERT INTO prospects (
          email, job_title, linkedin_url, phone, notes, created_at, updated_at, 
          first_name, last_name, role_category, company_id, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (lower(email)) DO UPDATE 
        SET job_title = EXCLUDED.job_title, 
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            company_id = EXCLUDED.company_id,
            updated_at = EXCLUDED.updated_at
      `, [
        email, job_title, linkedin_url, phone, notes, created_at, updated_at,
        first_name, last_name, role_category, liveCompanyId, LIVE_USER_ID
      ]);
      insertedProspects++;
    }
    
    await liveClient.query('COMMIT');
    console.log(`Migration successful! Migrated ${companies.length} companies and ${insertedProspects} prospects.`);
    
  } catch (err) {
    await liveClient.query('ROLLBACK');
    console.error("Migration failed, rolled back.", err);
  } finally {
    localClient.release();
    liveClient.release();
    localPool.end();
    livePool.end();
  }
}

migrate();
