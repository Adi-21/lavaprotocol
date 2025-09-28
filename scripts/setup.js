#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔥 Lava Protocol Frontend Setup');
console.log('================================\n');

// Check if .env.local exists
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env.local from template...');
  const envExample = fs.readFileSync(path.join(process.cwd(), 'env.example'), 'utf8');
  fs.writeFileSync(envPath, envExample);
  console.log('✅ .env.local created');
} else {
  console.log('✅ .env.local already exists');
}

// Check if abis folder exists
const abisPath = path.join(process.cwd(), 'abis');
if (!fs.existsSync(abisPath)) {
  console.log('📁 Creating abis folder...');
  fs.mkdirSync(abisPath);
  console.log('✅ abis folder created');
} else {
  console.log('✅ abis folder already exists');
}

console.log('\n🚀 Setup complete! Next steps:');
console.log('1. Update .env.local with your configuration');
console.log('2. Add your contract ABIs to the abis/ folder');
console.log('3. Update contract addresses in lib/contracts.ts');
console.log('4. Run npm run dev to start the development server');
console.log('\n📚 See README.md for detailed instructions');
