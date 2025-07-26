const fs = require('fs');
const path = require('path');

// Simple image optimization script
// This would need sharp or similar library for actual optimization
// For now, we'll create a manifest of images to preload

const cardsDir = path.join(__dirname, '../public/cards');
const outputFile = path.join(__dirname, '../src/utils/card-manifest.ts');

const cardFiles = fs.readdirSync(cardsDir)
  .filter(file => file.endsWith('.png'))
  .sort();

const manifest = `// Auto-generated card manifest for preloading
export const CARD_IMAGES = ${JSON.stringify(cardFiles, null, 2)};

export const preloadCardImages = () => {
  return CARD_IMAGES.map(filename => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(\`Failed to load \${filename}\`));
      img.src = \`/cards/\${filename}\`;
    });
  });
};
`;

fs.writeFileSync(outputFile, manifest);
console.log(`Generated card manifest with ${cardFiles.length} images`); 