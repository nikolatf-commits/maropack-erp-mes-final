import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'src/App.jsx',
  'src/config/navigation.js',
  'src/supabase.js',
  'SUPABASE_SCHEMA_FULL_SYSTEM.sql',
  'supabase/migrations/999_final_production_migration.sql',
  'docs/FINAL_PRODUCTION_RUNBOOK.md'
];

let ok = true;
for (const rel of required) {
  const exists = fs.existsSync(path.join(root, rel));
  console.log(`${exists ? '✅' : '❌'} ${rel}`);
  if (!exists) ok = false;
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
console.log(`\nPackage: ${pkg.name} ${pkg.version}`);
console.log('Env required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');

if (!ok) process.exit(1);
