import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
const cardsDir = path.join(publicDir, 'cards');
const optimizedDir = path.join(publicDir, 'optimized');

// Ensure optimized directory exists
if (!fs.existsSync(optimizedDir)) {
  fs.mkdirSync(optimizedDir, { recursive: true });
}

// Ensure optimized cards directory exists
const optimizedCardsDir = path.join(optimizedDir, 'cards');
if (!fs.existsSync(optimizedCardsDir)) {
  fs.mkdirSync(optimizedCardsDir, { recursive: true });
}

async function optimizeCardImages() {
  console.log('🃏 Optimizing card images...');
  
  try {
    const cardFiles = fs.readdirSync(cardsDir).filter(file => file.endsWith('.png'));
    
    for (const file of cardFiles) {
      const inputPath = path.join(cardsDir, file);
      const outputPath = path.join(optimizedCardsDir, file);
      
      console.log(`📱 Optimizing ${file}...`);
      
      await sharp(inputPath)
        .resize(200, 280, { // Reasonable size for cards
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png({
          quality: 85,
          compressionLevel: 9,
          progressive: true
        })
        .toFile(outputPath);
      
      // Get file sizes for comparison
      const originalSize = fs.statSync(inputPath).size;
      const optimizedSize = fs.statSync(outputPath).size;
      const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
      
      console.log(`✅ ${file}: ${(originalSize / 1024).toFixed(1)}KB → ${(optimizedSize / 1024).toFixed(1)}KB (${savings}% smaller)`);
    }
    
    console.log('🎉 All card images optimized!');
    
  } catch (error) {
    console.error('❌ Error optimizing card images:', error);
  }
}

async function optimizeLogo() {
  console.log('🖼️ Optimizing logo...');
  
  try {
    const inputPath = path.join(publicDir, 'bux-spades.png');
    const outputPath = path.join(optimizedDir, 'bux-spades.png');
    
    console.log('📱 Optimizing bux-spades.png...');
    
    await sharp(inputPath)
      .resize(512, 512, { // Reasonable size for logo
        fit: 'contain',
        background: { r: 31, g: 41, b: 55, alpha: 1 } // #1f2937 background
      })
      .png({
        quality: 90,
        compressionLevel: 9,
        progressive: true
      })
      .toFile(outputPath);
    
    // Get file sizes for comparison
    const originalSize = fs.statSync(inputPath).size;
    const optimizedSize = fs.statSync(outputPath).size;
    const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
    
    console.log(`✅ Logo: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(optimizedSize / 1024 / 1024).toFixed(1)}MB (${savings}% smaller)`);
    
    console.log('🎉 Logo optimized!');
    
  } catch (error) {
    console.error('❌ Error optimizing logo:', error);
  }
}

async function createImagePreloader() {
  console.log('📦 Creating image preloader...');
  
  try {
    const cardFiles = fs.readdirSync(cardsDir).filter(file => file.endsWith('.png'));
    const cardPaths = cardFiles.map(file => `/optimized/cards/${file}`);
    
    const preloaderContent = `
// Auto-generated image preloader
export const preloadImages = () => {
  const images = [
    '/optimized/bux-spades.png',
    ...${JSON.stringify(cardPaths, null, 2)}
  ];
  
  images.forEach(src => {
    const img = new Image();
    img.src = src;
  });
  
  console.log('🖼️ Preloading', images.length, 'images...');
};

// Preload on module load
preloadImages();
`;

    const preloaderPath = path.join(__dirname, '../src/utils/imagePreloader.ts');
    fs.writeFileSync(preloaderPath, preloaderContent);
    
    console.log('✅ Image preloader created!');
    
  } catch (error) {
    console.error('❌ Error creating image preloader:', error);
  }
}

async function main() {
  console.log('🚀 Starting image optimization...');
  
  await optimizeCardImages();
  await optimizeLogo();
  await createImagePreloader();
  
  console.log('🎉 All optimizations complete!');
}

main(); 