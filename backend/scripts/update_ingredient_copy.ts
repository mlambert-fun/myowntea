import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CopyRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  angle: string;
  description: string;
  longDescription: string;
};

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IN_FILE = path.resolve(__dirname, '..', '..', 'ingredient_copy.generated.json');

async function main() {
  const raw = await fs.readFile(IN_FILE, 'utf8');
  const payload = JSON.parse(raw) as CopyRow[];

  let total = payload.length;
  let filled = 0;
  let ignored = 0;
  const errors: Array<{ id: string; name: string; message: string }> = [];

  for (const row of payload) {
    try {
      if (!row.id || !row.description || !row.longDescription) {
        ignored += 1;
        continue;
      }

      await prisma.ingredient.update({
        where: { id: row.id },
        data: {
          description: row.description,
          longDescription: row.longDescription,
        },
      });

      filled += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('Record to update not found')) {
        ignored += 1;
      } else {
        errors.push({ id: row.id, name: row.name, message });
      }
    }
  }

  console.log('Ingredient copy update report');
  console.log(`- total: ${total}`);
  console.log(`- remplis: ${filled}`);
  console.log(`- ignores: ${ignored}`);
  console.log(`- erreurs: ${errors.length}`);

  if (errors.length > 0) {
    console.log('Error details:');
    errors.forEach((e) => {
      console.log(`  - ${e.id} (${e.name}): ${e.message}`);
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
