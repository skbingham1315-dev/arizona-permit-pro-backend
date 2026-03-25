/**
 * Maricopa County Building Permits (municipalities not covered by Phoenix open data)
 * Covers: Mesa, Chandler, Gilbert, Scottsdale, Tempe, Glendale, Peoria, Surprise, Avondale, etc.
 *
 * Maricopa County uses ISD (Integrated Services Division) portal:
 * https://aca-prod.accela.com/MARICOPACOUNTY/
 *
 * Mesa: https://data.mesaaz.gov/resource/[id].json  (Socrata)
 * Chandler: https://data.chandleraz.gov
 * Scottsdale: https://data.scottsdaleaz.gov
 */
const axios = require('axios');
const { pool } = require('../../db');

// Mesa Open Data - Building Permits
const MESA_API = 'https://data.mesaaz.gov/resource/i3k5-qpte.json';

// Scottsdale Open Data
const SCOTTSDALE_API = 'https://data.scottsdaleaz.gov/resource/72r6-4xrr.json';

function parseValue(val) {
  if (!val) return null;
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function normalizePermitType(type) {
  if (!type) return 'General Construction';
  const t = type.toUpperCase();
  if (t.includes('NEW') && (t.includes('RES') || t.includes('SFR') || t.includes('SINGLE'))) return 'Single Family - New Construction';
  if (t.includes('NEW') && t.includes('COM')) return 'Commercial - New Construction';
  if (t.includes('SOLAR') || t.includes('PV')) return 'Solar / PV Installation';
  if (t.includes('POOL') || t.includes('SPA')) return 'Swimming Pool / Spa';
  if (t.includes('ROOF')) return 'Roofing';
  if (t.includes('HVAC') || t.includes('MECH')) return 'HVAC / Mechanical';
  if (t.includes('PLUMB')) return 'Plumbing';
  if (t.includes('ELEC')) return 'Electrical';
  if (t.includes('ADU') || t.includes('ACCESSORY DWELL')) return 'Accessory Dwelling Unit (ADU)';
  if (t.includes('DEMO')) return 'Demolition';
  if (t.includes('ADD') || t.includes('RENOV') || t.includes('REMOD') || t.includes('ALTER')) return 'Renovation / Addition';
  if (t.includes('MULTI') || t.includes('APART') || t.includes('CONDO')) return 'Multi-Family Residential';
  return type;
}

async function fetchFromSocrata(apiUrl, cityName, county, daysBack) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().split('T')[0];

  let inserted = 0;
  let updated = 0;
  let offset = 0;
  const PAGE_SIZE = 1000;

  console.log(`[${cityName}] Fetching from ${apiUrl}...`);

  while (true) {
    try {
      const { data } = await axios.get(apiUrl, {
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
        const permitNumber = row.permit_number || row.permit_num || row.permitnumber;
        if (!permitNumber) continue;

        const lat = parseFloat(row.latitude || row.lat);
        const lng = parseFloat(row.longitude || row.long || row.lon);

        try {
          await pool.query(`
            INSERT INTO permits (
              permit_number, permit_type, status, description, address, city, county, zip,
              latitude, longitude, project_value, square_footage, issued_date,
              contractor_name, contractor_license, contractor_phone,
              owner_name, source, source_id, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
            ON CONFLICT (permit_number) DO UPDATE SET
              status = EXCLUDED.status,
              project_value = EXCLUDED.project_value,
              updated_at = NOW()
          `, [
            permitNumber,
            normalizePermitType(row.permit_type || row.work_type || row.work_class),
            (row.status || 'active').toLowerCase(),
            row.description || row.work_description || null,
            row.address || row.project_address || null,
            cityName, county,
            row.zip || row.postal_code || null,
            !isNaN(lat) ? lat : null,
            !isNaN(lng) ? lng : null,
            parseValue(row.valuation || row.estimated_value || row.project_value),
            parseInt(row.square_footage) || null,
            row.issued_date || row.issue_date || null,
            row.contractor_name || row.contractor || null,
            row.contractor_license || row.license_number || null,
            row.contractor_phone || null,
            row.owner_name || row.applicant_name || null,
            `${cityName} Open Data`,
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
      console.error(`[${cityName}] API error:`, err.message);
      break;
    }
  }

  console.log(`[${cityName}] Done. Inserted: ${inserted}, Updated: ${updated}`);
  return { inserted, updated };
}

async function fetchMaricopaPermits(daysBack = 90) {
  const results = { inserted: 0, updated: 0 };

  const sources = [
    { url: MESA_API, city: 'Mesa', county: 'Maricopa' },
    { url: SCOTTSDALE_API, city: 'Scottsdale', county: 'Maricopa' },
  ];

  for (const src of sources) {
    try {
      const r = await fetchFromSocrata(src.url, src.city, src.county, daysBack);
      results.inserted += r.inserted;
      results.updated += r.updated;
    } catch (err) {
      console.error(`[Maricopa/${src.city}] Error:`, err.message);
    }
  }

  return results;
}

module.exports = { fetchMaricopaPermits };
