/**
 * Pima County / Tucson Building Permits
 * Covers: Tucson, Marana, Sahuarita, Oro Valley, South Tucson
 *
 * Tucson Open Data (Socrata): https://gisdata.pima.gov
 * City of Tucson: https://www.tucsonaz.gov/open-data
 * Tucson permits API: https://opendata.tucsonaz.gov/resource/[id].json
 */
const axios = require('axios');
const { pool } = require('../../db');

const TUCSON_API = 'https://opendata.tucsonaz.gov/resource/nt5i-c8kb.json';

function parseValue(val) {
  if (!val) return null;
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function normalizePermitType(type) {
  if (!type) return 'General Construction';
  const t = type.toUpperCase();
  if (t.includes('NEW') && (t.includes('RES') || t.includes('SFR'))) return 'Single Family - New Construction';
  if (t.includes('NEW') && t.includes('COM')) return 'Commercial - New Construction';
  if (t.includes('SOLAR') || t.includes('PV')) return 'Solar / PV Installation';
  if (t.includes('POOL') || t.includes('SPA')) return 'Swimming Pool / Spa';
  if (t.includes('ROOF')) return 'Roofing';
  if (t.includes('HVAC') || t.includes('MECH')) return 'HVAC / Mechanical';
  if (t.includes('PLUMB')) return 'Plumbing';
  if (t.includes('ELEC')) return 'Electrical';
  if (t.includes('ADU')) return 'Accessory Dwelling Unit (ADU)';
  if (t.includes('DEMO')) return 'Demolition';
  if (t.includes('ADD') || t.includes('RENOV') || t.includes('ALTER')) return 'Renovation / Addition';
  if (t.includes('MULTI') || t.includes('APART')) return 'Multi-Family Residential';
  return type;
}

async function fetchPimaPermits(daysBack = 90) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split('T')[0];

  let inserted = 0;
  let updated = 0;
  let offset = 0;
  const PAGE_SIZE = 1000;

  console.log(`[Pima/Tucson] Fetching permits since ${sinceStr}...`);

  while (true) {
    try {
      const { data } = await axios.get(TUCSON_API, {
        params: {
          $limit: PAGE_SIZE,
          $offset: offset,
          $order: 'issued_date DESC',
          $where: `issued_date >= '${sinceStr}'`,
        },
        timeout: 30000,
      });

      if (!data.length) break;

      for (const row of data) {
        const permitNumber = row.permit_number || row.permit_num || row.case_number;
        if (!permitNumber) continue;

        const lat = parseFloat(row.latitude || row.lat);
        const lng = parseFloat(row.longitude || row.lon);

        try {
          await pool.query(`
            INSERT INTO permits (
              permit_number, permit_type, status, description, address, city, county, zip,
              latitude, longitude, project_value, square_footage, issued_date,
              contractor_name, contractor_license, owner_name, source, source_id, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
            ON CONFLICT (permit_number) DO UPDATE SET
              status = EXCLUDED.status,
              project_value = EXCLUDED.project_value,
              updated_at = NOW()
          `, [
            permitNumber,
            normalizePermitType(row.permit_type || row.work_class),
            (row.status || 'active').toLowerCase(),
            row.description || null,
            row.address || row.site_address || null,
            row.city || 'Tucson',
            'Pima',
            row.zip || null,
            !isNaN(lat) ? lat : null,
            !isNaN(lng) ? lng : null,
            parseValue(row.valuation || row.job_value),
            parseInt(row.square_footage) || null,
            row.issued_date || null,
            row.contractor_name || null,
            row.contractor_license || null,
            row.owner_name || row.applicant || null,
            'Tucson Open Data',
            permitNumber,
          ]);
          inserted++;
        } catch {
          updated++;
        }
      }

      offset += data.length;
      if (data.length < PAGE_SIZE) break;
    } catch (err) {
      console.error('[Pima/Tucson] API error:', err.message);
      break;
    }
  }

  console.log(`[Pima/Tucson] Done. Inserted: ${inserted}, Updated: ${updated}`);
  return { inserted, updated };
}

module.exports = { fetchPimaPermits };
