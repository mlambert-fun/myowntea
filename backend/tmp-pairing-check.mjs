import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const rows = await prisma.ingredient.findMany({ take: 1, select: { id: true, pairing: true } });
  console.log(JSON.stringify(rows));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
