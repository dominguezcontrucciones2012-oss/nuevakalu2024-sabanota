import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'uploads', 'products_db.json');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(dbPath)) {
  console.log('No products_db.json found');
  process.exit(0);
}

const products = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Generate beautiful SVGs
const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316'];

let updated = 0;
for (const p of products) {
  const color1 = colors[Math.floor(Math.random() * colors.length)];
  const color2 = colors[Math.floor(Math.random() * colors.length)];
  const initial = p.name ? p.name.substring(0, 2).toUpperCase() : '??';
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="grad-${p.id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#grad-${p.id})" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="120" font-weight="900" fill="#ffffff">${initial}</text>
  </svg>`;
  
  const filename = `product-${p.id}-${Date.now()}.svg`;
  fs.writeFileSync(path.join(uploadsDir, filename), svg);
  p.imageUrl = `/uploads/${filename}`;
  updated++;
}

if (updated > 0) {
  fs.writeFileSync(dbPath, JSON.stringify(products, null, 2));
  console.log(`Updated ${updated} products with SVGs.`);
} else {
  console.log('No products needed an image.');
}
