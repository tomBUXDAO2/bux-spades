import('./src/config/database.js').then(async (m) => {
  const prisma = m.prisma || m.default?.prisma;
  
  try {
    console.log('Checking enum values...');
    
    const gimmick = await prisma.$queryRawUnsafe("SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid WHERE t.typname='GimmickVariant' ORDER BY e.enumsortorder;");
    console.log('GimmickVariant values:', gimmick.map(r=>r.enumlabel));
    
    const stats = await prisma.$queryRawUnsafe("SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid WHERE t.typname='StatsGimmickVariant' ORDER BY e.enumsortorder;");
    console.log('StatsGimmickVariant values:', stats.map(r=>r.enumlabel));
    
    // Check what should be there based on the schema
    const expectedGimmick = ['SUICIDE', 'BID4NIL', 'BID3', 'BIDHEARTS', 'CRAZY_ACES', 'JOKER'];
    const expectedStats = ['SUICIDE', 'BID4NIL', 'BID3', 'BIDHEARTS', 'CRAZY_ACES', 'JOKER'];
    
    const currentGimmick = gimmick.map(r=>r.enumlabel);
    const currentStats = stats.map(r=>r.enumlabel);
    
    const missingGimmick = expectedGimmick.filter(v => !currentGimmick.includes(v));
    const missingStats = expectedStats.filter(v => !currentStats.includes(v));
    
    console.log('Missing from GimmickVariant:', missingGimmick);
    console.log('Missing from StatsGimmickVariant:', missingStats);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
});
