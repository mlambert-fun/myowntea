export default {
  migrate: {
    url: process.env.DATABASE_URL,
    schema: 'backend/prisma/schema.prisma'
  }
};
