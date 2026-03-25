require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchPhoenixPermits } = require('./phoenix');
const { fetchMaricopaPermits } = require('./maricopa');
const { fetchPimaPermits } = require('./pima');

async function runPipeline(daysBack = 90) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Arizona Permit Pro - Data Pipeline`);
  console.log(`Fetching permits from last ${daysBack} days`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));

  const totals = { inserted: 0, updated: 0, errors: 0 };

  const sources = [
    { name: 'Phoenix', fn: () => fetchPhoenixPermits(daysBack) },
    { name: 'Maricopa County Cities', fn: () => fetchMaricopaPermits(daysBack) },
    { name: 'Pima County / Tucson', fn: () => fetchPimaPermits(daysBack) },
  ];

  for (const source of sources) {
    try {
      const result = await source.fn();
      totals.inserted += result.inserted || 0;
      totals.updated += result.updated || 0;
    } catch (err) {
      console.error(`[Pipeline] ${source.name} failed:`, err.message);
      totals.errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Pipeline Complete');
  console.log(`Total Inserted: ${totals.inserted}`);
  console.log(`Total Updated:  ${totals.updated}`);
  console.log(`Errors:         ${totals.errors}`);
  console.log(`Finished: ${new Date().toISOString()}`);
  console.log('='.repeat(50) + '\n');

  return totals;
}

// Run directly if called as a script
if (require.main === module) {
  const daysBack = parseInt(process.argv[2]) || 90;
  runPipeline(daysBack)
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { runPipeline };
