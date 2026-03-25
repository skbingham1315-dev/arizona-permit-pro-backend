require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool, initSchema } = require('../db');

const AZ_CITIES = [
  { city: 'Phoenix',    county: 'Maricopa', lat: 33.4484, lng: -112.0740 },
  { city: 'Scottsdale', county: 'Maricopa', lat: 33.4942, lng: -111.9261 },
  { city: 'Mesa',       county: 'Maricopa', lat: 33.4152, lng: -111.8315 },
  { city: 'Chandler',   county: 'Maricopa', lat: 33.3062, lng: -111.8413 },
  { city: 'Tempe',      county: 'Maricopa', lat: 33.4255, lng: -111.9400 },
  { city: 'Gilbert',    county: 'Maricopa', lat: 33.3528, lng: -111.7890 },
  { city: 'Peoria',     county: 'Maricopa', lat: 33.5806, lng: -112.2374 },
  { city: 'Glendale',   county: 'Maricopa', lat: 33.5387, lng: -112.1860 },
  { city: 'Surprise',   county: 'Maricopa', lat: 33.6292, lng: -112.3679 },
  { city: 'Avondale',   county: 'Maricopa', lat: 33.4356, lng: -112.3497 },
  { city: 'Goodyear',   county: 'Maricopa', lat: 33.4353, lng: -112.3576 },
  { city: 'Queen Creek',county: 'Maricopa', lat: 33.2487, lng: -111.6343 },
  { city: 'Tucson',     county: 'Pima',     lat: 32.2226, lng: -110.9747 },
  { city: 'Marana',     county: 'Pima',     lat: 32.4366, lng: -111.2132 },
  { city: 'Oro Valley', county: 'Pima',     lat: 32.3909, lng: -110.9665 },
  { city: 'Flagstaff',  county: 'Coconino', lat: 35.1983, lng: -111.6513 },
  { city: 'Prescott',   county: 'Yavapai',  lat: 34.5400, lng: -112.4685 },
  { city: 'Yuma',       county: 'Yuma',     lat: 32.6927, lng: -114.6277 },
  { city: 'Casa Grande',county: 'Pinal',    lat: 32.8795, lng: -111.7574 },
  { city: 'Sedona',     county: 'Yavapai',  lat: 34.8697, lng: -111.7609 },
];

const PERMIT_TYPES = [
  { type: 'Single Family - New Construction', minVal: 250000, maxVal: 1800000, sqftMin: 1400, sqftMax: 4500 },
  { type: 'Commercial - New Construction',    minVal: 500000, maxVal: 8000000, sqftMin: 3000, sqftMax: 40000 },
  { type: 'Renovation / Addition',            minVal: 15000,  maxVal: 350000,  sqftMin: 200,  sqftMax: 2000 },
  { type: 'Roofing',                          minVal: 8000,   maxVal: 85000,   sqftMin: null, sqftMax: null },
  { type: 'Solar / PV Installation',          minVal: 12000,  maxVal: 65000,   sqftMin: null, sqftMax: null },
  { type: 'Swimming Pool / Spa',              minVal: 40000,  maxVal: 150000,  sqftMin: null, sqftMax: null },
  { type: 'HVAC / Mechanical',                minVal: 5000,   maxVal: 45000,   sqftMin: null, sqftMax: null },
  { type: 'Electrical',                       minVal: 3000,   maxVal: 35000,   sqftMin: null, sqftMax: null },
  { type: 'Plumbing',                         minVal: 3500,   maxVal: 40000,   sqftMin: null, sqftMax: null },
  { type: 'Accessory Dwelling Unit (ADU)',    minVal: 80000,  maxVal: 280000,  sqftMin: 400,  sqftMax: 1200 },
  { type: 'Multi-Family Residential',         minVal: 800000, maxVal: 6000000, sqftMin: 5000, sqftMax: 60000 },
  { type: 'Demolition',                       minVal: 5000,   maxVal: 80000,   sqftMin: null, sqftMax: null },
  { type: 'Commercial Renovation / TI',       minVal: 25000,  maxVal: 500000,  sqftMin: 500,  sqftMax: 15000 },
];

const CONTRACTORS = [
  { name: 'Desert Sun Construction LLC',      license: 'ROC-245891', phone: '(602) 555-0142', email: 'projects@desertsunconstruction.com' },
  { name: 'Arizona Premier Builders',         license: 'ROC-189023', phone: '(480) 555-0287', email: 'bids@azpremierbuilders.com' },
  { name: 'Sonoran Roofing & Exteriors',      license: 'ROC-334512', phone: '(623) 555-0319', email: 'estimates@sonoranroofing.com' },
  { name: 'Southwest Solar Solutions',        license: 'ROC-412089', phone: '(520) 555-0461', email: 'solar@swsolar.com' },
  { name: 'AZ Pool & Spa Specialists',        license: 'ROC-298765', phone: '(480) 555-0538', email: 'pools@azpoolspa.com' },
  { name: 'High Desert Mechanical Inc',       license: 'ROC-178934', phone: '(602) 555-0674', email: 'hvac@highdesertmech.com' },
  { name: 'Valley Wide Electrical Services',  license: 'ROC-356120', phone: '(480) 555-0712', email: 'service@valleywideelec.com' },
  { name: 'Cactus Country Plumbing',          license: 'ROC-223445', phone: '(623) 555-0859', email: 'cactusplumbing@gmail.com' },
  { name: 'Pinnacle Builders Group',          license: 'ROC-401234', phone: '(602) 555-0926', email: 'info@pinnaclebuilders.com' },
  { name: 'Sun State Construction Co',        license: 'ROC-167809', phone: '(480) 555-0165', email: 'sunstateconstruction@outlook.com' },
  { name: 'Copper State Contracting',         license: 'ROC-389012', phone: '(520) 555-0234', email: 'bids@copperstatecontract.com' },
  { name: 'Red Rock Builders LLC',            license: 'ROC-445678', phone: '(928) 555-0398', email: 'redrock.builders@gmail.com' },
  { name: 'Saguaro General Contractors',      license: 'ROC-312456', phone: '(602) 555-0487', email: 'saguarogc@gmail.com' },
  { name: 'Arizona Green Builders',           license: 'ROC-278901', phone: '(480) 555-0573', email: 'info@azgreenbuilders.com' },
  { name: 'Thunderbird Construction Inc',     license: 'ROC-198234', phone: '(623) 555-0641', email: 'thunder@tbconstruction.com' },
];

const STREETS = [
  'N 35th Ave', 'E Camelback Rd', 'W Thomas Rd', 'S Rural Rd', 'N Scottsdale Rd',
  'E Ray Rd', 'W Chandler Blvd', 'N Val Vista Dr', 'E Baseline Rd', 'W McDowell Rd',
  'N 7th St', 'E Southern Ave', 'W Peoria Ave', 'N Litchfield Rd', 'E Guadalupe Rd',
  'W Bell Rd', 'N Dobson Rd', 'E Warner Rd', 'W Glendale Ave', 'N Power Rd',
  'E Broadway Blvd', 'W Speedway Blvd', 'N Oracle Rd', 'E Grant Rd', 'W Ina Rd',
];

const OWNER_NAMES = [
  'Johnson Investments LLC', 'Garcia Family Trust', 'Williams Properties',
  'Anderson Development Group', 'Martinez Holdings LLC', 'Smith Real Estate Trust',
  'Davis Construction Inc', 'Wilson Properties LLC', 'Taylor Family LLC',
  'Thomas & Associates', 'Hernandez Group LLC', 'Moore Investments',
  'Jackson Properties', 'White Development Co', 'Harris Real Estate LLC',
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 6) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - rand(0, daysBack));
  return d.toISOString().split('T')[0];
}

function generatePermitNumber(city, index) {
  const prefix = city.slice(0, 3).toUpperCase();
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(index + 10000).padStart(6, '0')}`;
}

async function seed() {
  await initSchema();

  console.log('Clearing existing seed data...');
  await pool.query("DELETE FROM permits WHERE source = 'Seed Data'");

  const permits = [];
  let index = 0;

  // Generate ~120 realistic permits spread across AZ
  for (let i = 0; i < 120; i++) {
    const location = randItem(AZ_CITIES);
    const permitDef = randItem(PERMIT_TYPES);
    const contractor = randItem(CONTRACTORS);
    const owner = randItem(OWNER_NAMES);

    const streetNum = rand(100, 9999);
    const street = randItem(STREETS);
    const address = `${streetNum} ${street}`;

    const value = rand(permitDef.minVal, permitDef.maxVal);
    const sqft = permitDef.sqftMin ? rand(permitDef.sqftMin, permitDef.sqftMax) : null;

    // Add slight coordinate variation so markers don't stack
    const lat = location.lat + randFloat(-0.05, 0.05, 4);
    const lng = location.lng + randFloat(-0.05, 0.05, 4);

    permits.push({
      permit_number: generatePermitNumber(location.city, index++),
      permit_type: permitDef.type,
      status: rand(0, 9) > 1 ? 'active' : 'pending',
      description: `${permitDef.type} - ${address}, ${location.city}`,
      address,
      city: location.city,
      county: location.county,
      zip: String(rand(85001, 86556)),
      latitude: lat,
      longitude: lng,
      project_value: value,
      square_footage: sqft,
      issued_date: randDate(180),
      contractor_name: contractor.name,
      contractor_license: contractor.license,
      contractor_phone: contractor.phone,
      contractor_email: contractor.email,
      owner_name: owner,
      owner_phone: `(${rand(480, 928)}) ${rand(200, 999)}-${String(rand(1000, 9999))}`,
      source: 'Seed Data',
      source_id: `SEED-${index}`,
    });
  }

  console.log(`Inserting ${permits.length} seed permits...`);

  for (const p of permits) {
    await pool.query(`
      INSERT INTO permits (
        permit_number, permit_type, status, description, address, city, county, zip,
        latitude, longitude, project_value, square_footage, issued_date,
        contractor_name, contractor_license, contractor_phone, contractor_email,
        owner_name, owner_phone, source, source_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (permit_number) DO NOTHING
    `, [
      p.permit_number, p.permit_type, p.status, p.description, p.address,
      p.city, p.county, p.zip, p.latitude, p.longitude,
      p.project_value, p.square_footage, p.issued_date,
      p.contractor_name, p.contractor_license, p.contractor_phone, p.contractor_email,
      p.owner_name, p.owner_phone, p.source, p.source_id,
    ]);
  }

  console.log(`Seed complete. ${permits.length} permits inserted.`);
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
