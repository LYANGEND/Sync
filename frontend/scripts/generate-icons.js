import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../public');
const SOURCE_ICON = path.join(PUBLIC_DIR, 'logo.svg');

async function generateIcons() {
  console.log('Generating PWA icons...');

  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('Source icon not found:', SOURCE_ICON);
    process.exit(1);
  }

  const sizes = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
  ];

  try {
    for (const icon of sizes) {
      await sharp(SOURCE_ICON)
        .resize(icon.size, icon.size)
        .png()
        .toFile(path.join(PUBLIC_DIR, icon.name));
      console.log(`Generated ${icon.name}`);
    }
    
    // Generate favicon.ico (using 32x32 png as source if needed, but sharp can't write .ico directly easily without plugins, 
    // so we'll just stick to PNG favicons which are supported by Vite/Modern browsers, 
    // or we can just copy the 32x32 png to favicon.ico if we want to be hacky, but let's just use the pngs in the HTML)
    
    console.log('Icon generation complete!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

generateIcons();
