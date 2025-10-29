import('./src/config/database.js').then(async (m) => {
  const prisma = m.prisma || m.default?.prisma;
  
  try {
    console.log('Checking database schema...');
    
    const cols = await prisma.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='Game' AND column_name LIKE '%special%' ORDER BY column_name;");
    console.log('Special columns:', cols);
    
    const enums = await prisma.$queryRawUnsafe("SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;");
    console.log('Existing enums:', enums);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
});
