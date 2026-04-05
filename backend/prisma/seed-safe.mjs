import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  const shouldSeedCatalog = process.argv.includes('--catalog');
  if (shouldSeedCatalog && process.env.NODE_ENV === 'production') {
    throw new Error('Catalog fixture seeding is disabled in production.');
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || 'admin@myowntea.com';
  const configuredAdminPassword = process.env.ADMIN_PASSWORD?.trim() || null;
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  const bootstrapPassword = configuredAdminPassword || (!existingAdmin
    ? crypto.randomBytes(18).toString('base64url')
    : null);

  if (existingAdmin) {
    if (bootstrapPassword) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          passwordHash: await bcrypt.hash(bootstrapPassword, 10),
          role: 'ADMIN',
        },
      });
      console.log('Admin user updated:', adminEmail);
    } else {
      console.log('Existing admin kept as-is:', adminEmail);
    }
  } else {
    if (!bootstrapPassword) {
      throw new Error('ADMIN_PASSWORD is required to create the bootstrap admin.');
    }

    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(bootstrapPassword, 10),
        role: 'ADMIN',
      },
    });
    console.log('Admin user created:', adminEmail);
  }

  if (bootstrapPassword) {
    console.log(`Bootstrap admin password for ${adminEmail}: ${bootstrapPassword}`);
    console.log('Configure Google Authenticator at first admin login to finalize access.');
  }

  if (!shouldSeedCatalog) {
    console.log('Catalog fixtures skipped. Run `npm run prisma:seed:catalog` to seed catalog fixtures explicitly.');
    console.log('🌱 Seed completed!');
    return;
  }

  console.log('Catalog fixture seeding explicitly enabled.');
  const { seedCatalogFixtures } = await import('./seed-catalog.mjs');
  await seedCatalogFixtures(prisma);
  console.log('🌱 Seed completed!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
