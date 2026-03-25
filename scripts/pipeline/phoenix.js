/**
 * City of Phoenix Building Permits
 * Data source: Phoenix Open Data (Socrata)
 * Portal: https://www.phoenixopendata.com
 * Dataset: Development Services Building Permits
 * API: https://www.phoenixopendata.com/resource/pm44-qjy7.json
 */
const axios = require('axios');
const { pool } = require('../../db');

const PHOENIX_API = 'https://www.phoenixopendata.com/resource/pm44-qjy7.json';
const PAGE_SIZE = 1000;

function normalizePermitType(type) {
  if (!type) return 'General Construction';
  const t = type.toUpperCase();
  if (t.includes('NEW') && t.includes('RES')) return 'Single Family - New Construction';
  if (t.includes('NEW') && t.includes('COM')) return 'Commercial - New Construction';
  if (t.includes('SOLAR') || t.includes('PV')) return 'Solar / PV Installation';
  if (t.includes('POOL') || t.includes('SPA')) return 'Swimming Pool / Spa';
  if (t.includes('ROOF')) return 'Roofing';
  if (t.includes('HVAC') || t.includes('MECH') || t.includes('AIR')) return 'HVAC / Mechanical';
  if (t.includes('PLUMB')) return 'Plumbing';
  if (t.includes('ELEC')) return 'Electrical';
  if (t.includes('ADU') || t.includes('ACCESSORY')) return 'Accessory Dwelling Unit (ADU)';
  if (t.includes('DEMO')) return 'Demolition';
  if (t.includes('ADD') || t.includes('RENOV') || t.includes('REMOD')) return 'Renovation / Addition';
  if (t.includes('MULTI') || t.includes('APART') || t.includes('CONDO')) return 'Multi-Family Residential';
  if (t.includes('SIGN')) return 'Sign Permit';
  return type;
}

function parseValue(val) {
  if (!val) return null;
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function parsePhone(val) {
  if (!val) return null;
  const digits = String(val).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return val;
}

async function fetchPhoenixPermits(daysBack = 90) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split('T')[0];

  let inserted = 0;
  let updated = 0;
  let offset = 0;

  console.log(`[Phoenix] Fetching permits since ${sinceStr}...`);

  while (true) {
    const params = {
      $limit: PAGE_SIZE,
      $offset: offset,
      $order: 'issue_date DESC',
      $where: `issue_date >= '${sinceStr}'`,
    };

    const { data } = await axios.get(PHOENIX_API, { params, timeout: 30000 });
    if (!data.length) break;

    for (const row of data) {
      const permitNumber = row.permit_number || row.permitnumber || row.permit_num;
      if (!permitNumber) continue;

      const lat = parseFloat(row.latitude || row.lat || row.y);
      const lng = parseFloat(row.longitude || row.lng || row.x);

      const permit = {
        permit_number: permitNumber,
        permit_type: normalizePermitType(row.permit_type || row.permittype || row.work_class),
        status: (row.status || row.permit_status || 'active').toLowerCase(),
        description: row.description || row.work_description || null,
        address: row.address || row.location_address || null,
        city: 'Phoenix',
        county: 'Maricopa',
        zip: row.zip || row.postal_code || null,
        latitude: !isNaN(lat) ? lat : null,
        longitude: !isNaN(lng) ? lng : null,
        project_value: parseValue(row.valuation || row.project_value || row.estimated_value),
        square_footage: parseInt(row.square_footage || row.sqft) || null,
        issued_date: row.issue_date || row.issued_date || null,
        expires_date: row.expiration_date || null,
        contractor_name: row.contractor_name || row.contractor || null,
        contractor_license: row.contractor_license || row.license_number || null,
        contractor_phone: parsePhone(row.contractor_phone),
        contractor_email: row.contractor_email || null,
        owner_name: row.owner_name || row.applicant_name || null,
        owner_phone: parsePhone(row.owner_phone || row.applicant_phone),
        source: 'Phoenix Open Data',
        source_id: permitNumber,
      };

      try {
        const result = await pool.query(`
          INSERT INTO permits (
            permit_number, permit_type, status, description, address, city, county, zip,
            latitude, longitude, project_value, square_footage, issued_date, expires_date,
            contractor_name, contractor_license, contractor_phone, contractor_email,
            owner_name, owner_phone, source, source_id, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW())
          ON CONFLICT (permit_number) DO UPDATE SET
            status = EXCLUDED.status,
            project_value = EXCLUDED.project_value,
            contractor_name = EXCLUDED.contractor_name,
            contractor_phone = EXCLUDED.contractor_phone,
            contractor_email = EXCLUDED.contractor_email,
            updated_at = NOW()
          RETURNING (xmax = 0) AS is_insert
        `, [
          permit.permit_number, permit.permit_type, permit.status, permit.description,
          permit.address, permit.city, permit.county, permit.zip,
          permit.latitude, permit.longitude, permit.project_value, permit.square_footage,
          permit.issued_date, permit.expires_date,
          permit.contractor_name, permit.contractor_license, permit.contractor_phone, permit.contractor_email,
          permit.owner_name, permit.owner_phone, permit.source, permit.source_id,
        ]);
        if (result.rows[0]?.is_insert) inserted++;
        else updated++;
      } catch (err) {
        // Skip individual failures
      }
    }

    offset += data.length;
    if (data.length < PAGE_SIZE) break;
    console.log(`[Phoenix] Processed ${offset} records...`);
  }

  console.log(`[Phoenix] Done. Inserted: ${inserted}, Updated: ${updated}`);
  return { inserted, updated };
}

module.exports = { fetchPhoenixPermits };
