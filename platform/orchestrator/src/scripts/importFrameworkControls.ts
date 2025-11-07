import { importFrameworkControls, countFrameworkControls } from '../lib/framework-import/import-frameworks';

async function run() {
  try {
    console.log('Seeding framework control registry...');
    await importFrameworkControls();
    const total = await countFrameworkControls();
    console.log(`✔ Imported controls successfully. Total controls in registry: ${total}`);
    process.exit(0);
  } catch (error) {
    console.error('✖ Failed to seed framework controls:', error);
    process.exit(1);
  }
}

run();
