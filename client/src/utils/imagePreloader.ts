
// Auto-generated image preloader
export const preloadImages = () => {
  const images = [
    '/optimized/bux-spades.png',
    ...[
  "/optimized/cards/10C.png",
  "/optimized/cards/10D.png",
  "/optimized/cards/10H.png",
  "/optimized/cards/10S.png",
  "/optimized/cards/2C.png",
  "/optimized/cards/2D.png",
  "/optimized/cards/2H.png",
  "/optimized/cards/2S.png",
  "/optimized/cards/3C.png",
  "/optimized/cards/3D.png",
  "/optimized/cards/3H.png",
  "/optimized/cards/3S.png",
  "/optimized/cards/4C.png",
  "/optimized/cards/4D.png",
  "/optimized/cards/4H.png",
  "/optimized/cards/4S.png",
  "/optimized/cards/5C.png",
  "/optimized/cards/5D.png",
  "/optimized/cards/5H.png",
  "/optimized/cards/5S.png",
  "/optimized/cards/6C.png",
  "/optimized/cards/6D.png",
  "/optimized/cards/6H.png",
  "/optimized/cards/6S.png",
  "/optimized/cards/7C.png",
  "/optimized/cards/7D.png",
  "/optimized/cards/7H.png",
  "/optimized/cards/7S.png",
  "/optimized/cards/8C.png",
  "/optimized/cards/8D.png",
  "/optimized/cards/8H.png",
  "/optimized/cards/8S.png",
  "/optimized/cards/9C.png",
  "/optimized/cards/9D.png",
  "/optimized/cards/9H.png",
  "/optimized/cards/9S.png",
  "/optimized/cards/AC.png",
  "/optimized/cards/AD.png",
  "/optimized/cards/AH.png",
  "/optimized/cards/AS.png",
  "/optimized/cards/JC.png",
  "/optimized/cards/JD.png",
  "/optimized/cards/JH.png",
  "/optimized/cards/JS.png",
  "/optimized/cards/KC.png",
  "/optimized/cards/KD.png",
  "/optimized/cards/KH.png",
  "/optimized/cards/KS.png",
  "/optimized/cards/QC.png",
  "/optimized/cards/QD.png",
  "/optimized/cards/QH.png",
  "/optimized/cards/QS.png",
  "/optimized/cards/blue_back.png"
]
  ];
  
  images.forEach(src => {
    const img = new Image();
    img.src = src;
  });
  
  console.log('🖼️ Preloading', images.length, 'images...');
};

// Preload on module load
preloadImages();
