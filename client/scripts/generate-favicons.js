import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputImage = path.join(__dirname, '../public/bux-spades.png');
const outputDir = path.join(__dirname, '../public/favicon_io');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Define the favicon sizes we need
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 }
];

async function generateFavicons() {
  console.log('🔄 Generating favicons from bux-spades.png...');
  
  try {
    for (const { name, size } of sizes) {
      const outputPath = path.join(outputDir, name);
      
      console.log(`📱 Generating ${name} (${size}x${size})...`);
      
      await sharp(inputImage)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 31, g: 41, b: 55, alpha: 1 } // #1f2937 background
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated ${name}`);
    }
    
    // Also generate favicon.ico (16x16, 32x32, 48x48)
    console.log('📱 Generating favicon.ico...');
    await sharp(inputImage)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 31, g: 41, b: 55, alpha: 1 }
      })
      .png()
      .toFile(path.join(__dirname, '../public/favicon.ico'));
    
    console.log('✅ Generated favicon.ico');
    
    // Update the main favicon.ico in the root public directory
    await sharp(inputImage)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 31, g: 41, b: 55, alpha: 1 }
      })
      .png()
      .toFile(path.join(__dirname, '../public/favicon.ico'));
    
    console.log('✅ Updated main favicon.ico');
    
    console.log('🎉 All favicons generated successfully!');
    
  } catch (error) {
    console.error('❌ Error generating favicons:', error);
    process.exit(1);
  }
}

generateFavicons(); 