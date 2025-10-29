import('./src/config/database.js').then(async (m) => {
  const prisma = m.prisma || m.default?.prisma;
  
  try {
    console.log('Adding enum values...');
    
    await prisma.$executeRawUnsafe('ALTER TYPE "GimmickVariant" ADD VALUE IF NOT EXISTS \'JOKER\';');
    console.log('✅ Added JOKER to GimmickVariant');
    
    await prisma.$executeRawUnsafe('ALTER TYPE "StatsGimmickVariant" ADD VALUE IF NOT EXISTS \'JOKER\';');
    console.log('✅ Added JOKER to StatsGimmickVariant');
    
    await prisma.$executeRawUnsafe('ALTER TYPE "SpecialRule1" ADD VALUE IF NOT EXISTS \'SECRET_ASSASSIN\';');
    console.log('✅ Added SECRET_ASSASSIN to SpecialRule1');
    
    await prisma.$executeRawUnsafe('ALTER TYPE "SpecialRule2" ADD VALUE IF NOT EXISTS \'LOWBALL\';');
    console.log('✅ Added LOWBALL to SpecialRule2');
    
    await prisma.$executeRawUnsafe('ALTER TYPE "SpecialRule2" ADD VALUE IF NOT EXISTS \'HIGHBALL\';');
    console.log('✅ Added HIGHBALL to SpecialRule2');
    
    console.log('🎉 All enum values added successfully!');
    
  } catch (e) {
    console.error('❌ Error adding enum values:', e.message);
  } finally {
    await prisma.$disconnect();
  }
});
