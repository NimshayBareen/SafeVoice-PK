'use strict';
// Demo data for presentations: one administrator, three VERIFIED sample lawyers and one sample victim.
// All accounts are fictional and use the password in DEMO_PASSWORD (default below). Never use this on a real deployment.
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { seedKnowledgeBase } = require('../src/kb/seed');

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo#Pass2026!';
const LAWYERS = [
  { email: 'lawyer.a@demo.safevoice.pk', name: 'Adv. Sample Lawyer A', bar: 'DEMO-0001', city: 'Lahore', langs: ['ur', 'en'], fee: 'PRO_BONO', cats: ['CYBER_HARASSMENT', 'IMAGE_ABUSE', 'DOMESTIC_VIOLENCE'], bio: 'Sample profile. Cybercrime and family matters.' },
  { email: 'lawyer.b@demo.safevoice.pk', name: 'Adv. Sample Lawyer B', bar: 'DEMO-0002', city: 'Rawalpindi', langs: ['ur', 'pa'], fee: 'MIXED', cats: ['CYBER_HARASSMENT', 'FRAUD_IMPERSONATION'], bio: 'Sample profile. Online fraud and harassment.' },
  { email: 'lawyer.c@demo.safevoice.pk', name: 'Adv. Sample Lawyer C', bar: 'DEMO-0003', city: 'Islamabad', langs: ['en', 'ur'], fee: 'PAID', cats: ['CHILD_ABUSE', 'IMAGE_ABUSE'], bio: 'Sample profile. Child protection matters.' },
];

(async () => {
  try {
    await seedKnowledgeBase(pool);
    const hash = await bcrypt.hash(PASSWORD, 12);
    const user = async (email, role, alias, name, city) => {
      const r = await pool.query(
        `INSERT INTO users (email, password_hash, role, alias, full_name, status, city) VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'ACTIVE', failed_login_count = 0, locked_until = NULL RETURNING user_id`, [email, hash, role, alias, name, city]);
      return r.rows[0].user_id;
    };
    const admin = await user('admin@demo.safevoice.pk', 'ADMIN', 'Administrator', null, null);
    await user('victim@demo.safevoice.pk', 'VICTIM', 'BlueBird', null, 'Lahore');
    for (const l of LAWYERS) {
      const uid = await user(l.email, 'LAWYER', null, l.name, l.city);
      const lp = await pool.query(
        `INSERT INTO lawyer_profiles (user_id, full_name, bar_council_no, bar_council_name, city, languages, fee_type, bio, verification_status, verified_by, verified_at)
         VALUES ($1,$2,$3,'Demo Bar Council',$4,$5,$6,$7,'VERIFIED',$8,now())
         ON CONFLICT (user_id) DO UPDATE SET verification_status = 'VERIFIED' RETURNING lawyer_id`, [uid, l.name, l.bar, l.city, l.langs, l.fee, l.bio, admin]);
      await pool.query('DELETE FROM lawyer_specialisations WHERE lawyer_id = $1', [lp.rows[0].lawyer_id]);
      await pool.query('INSERT INTO lawyer_specialisations (lawyer_id, category_id) SELECT $1::uuid, category_id FROM case_categories WHERE code = ANY($2::text[])', [lp.rows[0].lawyer_id, l.cats]);
    }
    console.log('Demo accounts ready (password for all: ' + PASSWORD + '):');
    console.log('  admin    admin@demo.safevoice.pk');
    console.log('  victim   victim@demo.safevoice.pk');
    LAWYERS.forEach((l) => console.log('  advocate ' + l.email + '  (' + l.name + ', ' + l.city + ')'));
  } catch (e) { console.error('Seed failed:', e.message); process.exitCode = 1; } finally { await pool.end(); }
})();
