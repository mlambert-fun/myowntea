// @ts-nocheck
export function registerTranslationRoutes(app, deps) {
  const {
    getAllowedTranslationFields,
    prisma,
    sanitizeEntityTranslationValue,
  } = deps;

  const TRANSLATABLE_ENTITY_TYPES = [
    'INGREDIENT',
    'PRODUCT',
    'PRODUCT_OPTION',
    'PRODUCT_OPTION_VALUE',
    'BLEND',
    'BLEND_LISTING',
  ];

  const normalizeTranslatableEntityType = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return TRANSLATABLE_ENTITY_TYPES.includes(normalized) ? normalized : null;
  };

  const normalizeTranslationLocale = (value) => {
    const normalized = String(value || '')
      .trim()
      .replace(/_/g, '-')
      .toLowerCase();
    if (!normalized) {
      return null;
    }
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)) {
      return null;
    }
    return normalized;
  };

  app.get('/api/admin/translations', async (req, res) => {
    try {
      const entityType = normalizeTranslatableEntityType(req.query.entityType);
      const entityId = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : '';
      const locale = normalizeTranslationLocale(req.query.locale);
      const field = typeof req.query.field === 'string' ? req.query.field.trim() : '';
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize || '50'), 10) || 50));
      const where = {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(locale ? { locale } : {}),
        ...(field ? { field } : {}),
      };
      const [totalCount, rows] = await Promise.all([
        prisma.entityTranslation.count({ where }),
        prisma.entityTranslation.findMany({
          where,
          orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }, { field: 'asc' }, { locale: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      res.json({
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        items: rows,
      });
    } catch (error) {
      console.error('Error listing translations:', error);
      res.status(500).json({ error: 'Failed to fetch translations' });
    }
  });

  app.post('/api/admin/translations/upsert', async (req, res) => {
    try {
      const entityType = normalizeTranslatableEntityType(req.body?.entityType);
      const entityId = typeof req.body?.entityId === 'string' ? req.body.entityId.trim() : '';
      const locale = normalizeTranslationLocale(req.body?.locale);
      const values = req.body?.values && typeof req.body.values === 'object' ? req.body.values : null;
      if (!entityType) {
        return res.status(400).json({ error: 'entityType is invalid' });
      }
      if (!entityId) {
        return res.status(400).json({ error: 'entityId is required' });
      }
      if (!locale) {
        return res.status(400).json({ error: 'locale is invalid' });
      }
      if (!values) {
        return res.status(400).json({ error: 'values is required' });
      }
      const fieldEntries = Object.entries(values);
      if (fieldEntries.length === 0) {
        return res.status(400).json({ error: 'values must contain at least one field' });
      }
      const upserts = fieldEntries.map(([field, rawValue]) => {
        const normalizedField = String(field || '').trim();
        if (!normalizedField) {
          throw new Error('TRANSLATION_FIELD_REQUIRED');
        }
        const sanitizedValue = sanitizeEntityTranslationValue(entityType, normalizedField, rawValue);
        return prisma.entityTranslation.upsert({
          where: {
            entityType_entityId_field_locale: {
              entityType,
              entityId,
              field: normalizedField,
              locale,
            },
          },
          create: {
            entityType,
            entityId,
            field: normalizedField,
            locale,
            value: sanitizedValue,
          },
          update: {
            value: sanitizedValue,
          },
        });
      });
      const rows = await prisma.$transaction(upserts);
      res.json({
        ok: true,
        count: rows.length,
        items: rows,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'TRANSLATION_FIELD_NOT_ALLOWED') {
          return res.status(400).json({ error: 'One or more fields are not allowed for this entityType' });
        }
        if (error.message === 'TRANSLATION_VALUE_REQUIRED') {
          return res.status(400).json({ error: 'One or more translation values are invalid' });
        }
        if (error.message === 'TRANSLATION_VALUE_ARRAY_REQUIRED') {
          return res.status(400).json({ error: 'One or more translation values must be arrays of strings' });
        }
        if (error.message === 'TRANSLATION_FIELD_REQUIRED') {
          return res.status(400).json({ error: 'Field name is required' });
        }
      }
      console.error('Error upserting translations:', error);
      res.status(500).json({ error: 'Failed to upsert translations' });
    }
  });

  app.delete('/api/admin/translations/:id', async (req, res) => {
    try {
      await prisma.entityTranslation.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting translation:', error);
      res.status(500).json({ error: 'Failed to delete translation' });
    }
  });

  app.get('/api/admin/translations/config', async (_req, res) => {
    const entities = TRANSLATABLE_ENTITY_TYPES.map((entityType) => ({
      entityType,
      fields: getAllowedTranslationFields(entityType),
    }));
    res.json({ entities });
  });
}
