// @ts-nocheck
export function createRedirectService({
  SESSION_COOKIE,
  crypto,
  parseCookies,
  prisma,
  prismaAny,
}) {
  const REDIRECT_MATCH_TYPES = ['EXACT', 'PREFIX', 'REGEX'];

  const normalizeRedirectString = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  };

  const normalizeRedirectPath = (value) => {
    const raw = normalizeRedirectString(value);
    if (!raw) {
      return '';
    }
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    if (raw.startsWith('/')) {
      return raw;
    }
    return `/${raw}`;
  };

  const normalizeRedirectPathForMatch = (value) => {
    const normalized = normalizeRedirectPath(value);
    if (!normalized) {
      return '/';
    }
    if (/^https?:\/\//i.test(normalized)) {
      try {
        const parsed = new URL(normalized);
        const path = parsed.pathname || '/';
        if (path.length > 1 && path.endsWith('/')) {
          return path.slice(0, -1);
        }
        return path;
      } catch (_error) {
        return normalized;
      }
    }
    const pathOnly = (() => {
      const withoutHash = normalized.split('#')[0] || '';
      const withoutQuery = withoutHash.split('?')[0] || '';
      return withoutQuery || '/';
    })();
    if (pathOnly.length > 1 && pathOnly.endsWith('/')) {
      return pathOnly.slice(0, -1);
    }
    return pathOnly;
  };

  const normalizeRedirectMatchType = (value) => {
    const raw = normalizeRedirectString(value).toUpperCase();
    if (REDIRECT_MATCH_TYPES.includes(raw)) {
      return raw;
    }
    return 'EXACT';
  };

  const normalizeRedirectStatusCode = (value) => {
    const parsed = Number(value);
    if (parsed === 301 || parsed === 302) {
      return parsed;
    }
    return 302;
  };

  const normalizeRedirectPriority = (value, fallback = 100) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.round(parsed));
  };

  const normalizeRedirectPercent = (value, fallback = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.min(100, Math.round(parsed)));
  };

  const normalizeRedirectCodeList = (value, mode) => {
    const rawList = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
    return Array.from(
      new Set(
        rawList
          .map((entry) => normalizeRedirectString(entry))
          .filter(Boolean)
          .map((entry) => (mode === 'upper' ? entry.toUpperCase() : entry.toLowerCase()))
      )
    );
  };

  const normalizeRedirectDate = (value, fieldName) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${fieldName} is invalid`);
    }
    return date;
  };

  const normalizeRedirectRuleInput = (payload, options = {}) => {
    const partial = Boolean(options.partial);
    const normalized = {};
    if (!partial || payload.name !== undefined) {
      const name = normalizeRedirectString(payload.name);
      if (!name) {
        throw new Error('name is required');
      }
      normalized.name = name;
    }
    if (!partial || payload.description !== undefined) {
      const description = normalizeRedirectString(payload.description);
      normalized.description = description || null;
    }
    if (!partial || payload.matchType !== undefined) {
      normalized.matchType = normalizeRedirectMatchType(payload.matchType);
    }
    if (!partial || payload.sourcePath !== undefined) {
      const matchType = normalizeRedirectMatchType(payload.matchType);
      const sourcePathRaw = normalizeRedirectString(payload.sourcePath);
      if (!sourcePathRaw) {
        throw new Error('sourcePath is required');
      }
      if (matchType === 'REGEX') {
        try {
          new RegExp(sourcePathRaw);
        } catch (_error) {
          throw new Error('sourcePath regex is invalid');
        }
        normalized.sourcePath = sourcePathRaw;
      } else {
        normalized.sourcePath = normalizeRedirectPathForMatch(sourcePathRaw);
      }
    }
    if (!partial || payload.targetPath !== undefined) {
      const targetPath = normalizeRedirectPath(payload.targetPath);
      if (!targetPath) {
        throw new Error('targetPath is required');
      }
      normalized.targetPath = targetPath;
    }
    if (!partial || payload.statusCode !== undefined) {
      normalized.statusCode = normalizeRedirectStatusCode(payload.statusCode);
    }
    if (!partial || payload.isActive !== undefined) {
      normalized.isActive = Boolean(payload.isActive);
    }
    if (!partial || payload.priority !== undefined) {
      normalized.priority = normalizeRedirectPriority(payload.priority, 100);
    }
    if (!partial || payload.countryCodes !== undefined) {
      normalized.countryCodes = normalizeRedirectCodeList(payload.countryCodes, 'upper');
    }
    if (!partial || payload.locales !== undefined) {
      normalized.locales = normalizeRedirectCodeList(payload.locales, 'lower');
    }
    if (!partial || payload.abTestPercent !== undefined) {
      normalized.abTestPercent = normalizeRedirectPercent(payload.abTestPercent, 0);
    }
    if (!partial || payload.abTestTargetPath !== undefined) {
      const abTargetPath = normalizeRedirectPath(payload.abTestTargetPath);
      normalized.abTestTargetPath = abTargetPath || null;
    }
    if (!partial || payload.startAt !== undefined) {
      normalized.startAt = normalizeRedirectDate(payload.startAt, 'startAt');
    }
    if (!partial || payload.endAt !== undefined) {
      normalized.endAt = normalizeRedirectDate(payload.endAt, 'endAt');
    }
    if (normalized.startAt && normalized.endAt && normalized.endAt < normalized.startAt) {
      throw new Error('endAt must be greater than startAt');
    }
    const abPercent =
      normalized.abTestPercent !== undefined
        ? normalized.abTestPercent
        : options.current?.abTestPercent || 0;
    const abTargetPath =
      normalized.abTestTargetPath !== undefined
        ? normalized.abTestTargetPath
        : options.current?.abTestTargetPath || null;
    if (abPercent > 0 && !abTargetPath) {
      throw new Error('abTestTargetPath is required when abTestPercent > 0');
    }
    return normalized;
  };

  const parseJsonTextList = (value, mode) => {
    const list = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed) ? parsed : [];
            } catch (_error) {
              return [];
            }
          })()
        : [];
    return normalizeRedirectCodeList(list, mode);
  };

  const toIsoOrNull = (value) => {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  };

  const serializeRedirectRule = (row) => ({
    id: row.id,
    name: normalizeRedirectString(row.name),
    description: normalizeRedirectString(row.description) || null,
    sourcePath: normalizeRedirectString(row.sourcePath),
    matchType: normalizeRedirectMatchType(row.matchType),
    targetPath: normalizeRedirectString(row.targetPath),
    statusCode: normalizeRedirectStatusCode(row.statusCode),
    isActive: Boolean(row.isActive),
    priority: normalizeRedirectPriority(row.priority, 100),
    countryCodes: parseJsonTextList(row.countryCodes, 'upper'),
    locales: parseJsonTextList(row.locales, 'lower'),
    abTestPercent: normalizeRedirectPercent(row.abTestPercent, 0),
    abTestTargetPath: normalizeRedirectString(row.abTestTargetPath) || null,
    startAt: toIsoOrNull(row.startAt),
    endAt: toIsoOrNull(row.endAt),
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  });

  const getRedirectRuleDelegate = () => prismaAny.redirectRule;

  const ensureRedirectRuleTable = async () => {
    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RedirectRule" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "sourcePath" TEXT NOT NULL,
      "matchType" TEXT NOT NULL DEFAULT 'EXACT',
      "targetPath" TEXT NOT NULL,
      "statusCode" INT NOT NULL DEFAULT 302,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "priority" INT NOT NULL DEFAULT 100,
      "countryCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "locales" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "abTestPercent" INT NOT NULL DEFAULT 0,
      "abTestTargetPath" TEXT,
      "startAt" TIMESTAMP(3),
      "endAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
    await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RedirectRule_active_priority_idx"
    ON "RedirectRule"("isActive", "priority", "createdAt");
  `);
  };

  const listRedirectRuleRows = async () => {
    const delegate = getRedirectRuleDelegate();
    if (delegate) {
      return delegate.findMany({
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      });
    }
    await ensureRedirectRuleTable();
    const rows = await prisma.$queryRaw`
    SELECT * FROM "RedirectRule"
    ORDER BY "priority" ASC, "createdAt" DESC
  `;
    return rows;
  };

  const getRedirectRuleRowById = async (id) => {
    const delegate = getRedirectRuleDelegate();
    if (delegate) {
      return delegate.findUnique({ where: { id } });
    }
    await ensureRedirectRuleTable();
    const rows = await prisma.$queryRaw`
    SELECT * FROM "RedirectRule"
    WHERE "id" = ${id}
    LIMIT 1
  `;
    return rows[0] || null;
  };

  const createRedirectRuleRow = async (payload) => {
    const normalized = normalizeRedirectRuleInput(payload, { partial: false });
    const id = crypto.randomUUID();
    const delegate = getRedirectRuleDelegate();
    if (delegate) {
      return delegate.create({
        data: {
          id,
          name: normalized.name,
          description: normalized.description,
          sourcePath: normalized.sourcePath,
          matchType: normalized.matchType,
          targetPath: normalized.targetPath,
          statusCode: normalized.statusCode,
          isActive: normalized.isActive ?? true,
          priority: normalized.priority ?? 100,
          countryCodes: normalized.countryCodes || [],
          locales: normalized.locales || [],
          abTestPercent: normalized.abTestPercent ?? 0,
          abTestTargetPath: normalized.abTestTargetPath || null,
          startAt: normalized.startAt,
          endAt: normalized.endAt,
        },
      });
    }
    await ensureRedirectRuleTable();
    const rows = await prisma.$queryRaw`
    INSERT INTO "RedirectRule" (
      "id", "name", "description", "sourcePath", "matchType", "targetPath", "statusCode",
      "isActive", "priority", "countryCodes", "locales", "abTestPercent", "abTestTargetPath",
      "startAt", "endAt", "createdAt", "updatedAt"
    )
    VALUES (
      ${id},
      ${normalized.name},
      ${normalized.description},
      ${normalized.sourcePath},
      ${normalized.matchType},
      ${normalized.targetPath},
      ${normalized.statusCode},
      ${normalized.isActive ?? true},
      ${normalized.priority ?? 100},
      CAST(${JSON.stringify(normalized.countryCodes || [])} AS jsonb),
      CAST(${JSON.stringify(normalized.locales || [])} AS jsonb),
      ${normalized.abTestPercent ?? 0},
      ${normalized.abTestTargetPath || null},
      ${normalized.startAt},
      ${normalized.endAt},
      NOW(),
      NOW()
    )
    RETURNING *
  `;
    return rows[0] || null;
  };

  const updateRedirectRuleRow = async (id, payload) => {
    const existingRow = await getRedirectRuleRowById(id);
    if (!existingRow) {
      return null;
    }
    const existing = serializeRedirectRule(existingRow);
    const normalized = normalizeRedirectRuleInput(payload, {
      partial: true,
      current: existing,
    });
    const next = {
      name: normalized.name ?? existing.name,
      description:
        normalized.description !== undefined ? normalized.description : existing.description,
      sourcePath: normalized.sourcePath ?? existing.sourcePath,
      matchType: normalized.matchType ?? existing.matchType,
      targetPath: normalized.targetPath ?? existing.targetPath,
      statusCode: normalized.statusCode ?? existing.statusCode,
      isActive: normalized.isActive !== undefined ? normalized.isActive : existing.isActive,
      priority: normalized.priority ?? existing.priority,
      countryCodes: normalized.countryCodes ?? existing.countryCodes,
      locales: normalized.locales ?? existing.locales,
      abTestPercent: normalized.abTestPercent ?? existing.abTestPercent,
      abTestTargetPath:
        normalized.abTestTargetPath !== undefined
          ? normalized.abTestTargetPath
          : existing.abTestTargetPath,
      startAt:
        normalized.startAt !== undefined
          ? normalized.startAt
          : existing.startAt
            ? new Date(existing.startAt)
            : null,
      endAt:
        normalized.endAt !== undefined
          ? normalized.endAt
          : existing.endAt
            ? new Date(existing.endAt)
            : null,
    };
    if (next.startAt && next.endAt && next.endAt < next.startAt) {
      throw new Error('endAt must be greater than startAt');
    }
    if (next.abTestPercent > 0 && !next.abTestTargetPath) {
      throw new Error('abTestTargetPath is required when abTestPercent > 0');
    }
    const delegate = getRedirectRuleDelegate();
    if (delegate) {
      return delegate.update({
        where: { id },
        data: {
          name: next.name,
          description: next.description,
          sourcePath: next.sourcePath,
          matchType: next.matchType,
          targetPath: next.targetPath,
          statusCode: next.statusCode,
          isActive: next.isActive,
          priority: next.priority,
          countryCodes: next.countryCodes,
          locales: next.locales,
          abTestPercent: next.abTestPercent,
          abTestTargetPath: next.abTestTargetPath || null,
          startAt: next.startAt,
          endAt: next.endAt,
        },
      });
    }
    await ensureRedirectRuleTable();
    const rows = await prisma.$queryRaw`
    UPDATE "RedirectRule"
    SET
      "name" = ${next.name},
      "description" = ${next.description},
      "sourcePath" = ${next.sourcePath},
      "matchType" = ${next.matchType},
      "targetPath" = ${next.targetPath},
      "statusCode" = ${next.statusCode},
      "isActive" = ${next.isActive},
      "priority" = ${next.priority},
      "countryCodes" = CAST(${JSON.stringify(next.countryCodes)} AS jsonb),
      "locales" = CAST(${JSON.stringify(next.locales)} AS jsonb),
      "abTestPercent" = ${next.abTestPercent},
      "abTestTargetPath" = ${next.abTestTargetPath || null},
      "startAt" = ${next.startAt},
      "endAt" = ${next.endAt},
      "updatedAt" = NOW()
    WHERE "id" = ${id}
    RETURNING *
  `;
    return rows[0] || null;
  };

  const deleteRedirectRuleRow = async (id) => {
    const delegate = getRedirectRuleDelegate();
    if (delegate) {
      const existing = await delegate.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        return false;
      }
      await delegate.delete({ where: { id } });
      return true;
    }
    await ensureRedirectRuleTable();
    const existingRows = await prisma.$queryRaw`
    SELECT "id" FROM "RedirectRule" WHERE "id" = ${id} LIMIT 1
  `;
    if (!existingRows.length) {
      return false;
    }
    await prisma.$executeRaw`
    DELETE FROM "RedirectRule" WHERE "id" = ${id}
  `;
    return true;
  };

  const normalizeLocaleForMatch = (value) =>
    normalizeRedirectString(value).toLowerCase();
  const normalizeCountryForMatch = (value) =>
    normalizeRedirectString(value).toUpperCase();

  const localeMatchesRule = (locale, ruleLocales) => {
    if (!ruleLocales.length) {
      return true;
    }
    if (!locale) {
      return false;
    }
    return ruleLocales.some((ruleLocale) => {
      const normalizedRule = normalizeLocaleForMatch(ruleLocale);
      return locale === normalizedRule || locale.startsWith(`${normalizedRule}-`);
    });
  };

  const countryMatchesRule = (countryCode, ruleCountries) => {
    if (!ruleCountries.length) {
      return true;
    }
    if (!countryCode) {
      return false;
    }
    return ruleCountries.includes(countryCode);
  };

  const hashToBucket = (seedValue) => {
    const digest = crypto.createHash('sha256').update(seedValue).digest('hex');
    const sample = digest.slice(0, 8);
    return parseInt(sample, 16) % 100;
  };

  const resolveRedirectDecision = (rules, context) => {
    const now = new Date();
    const normalizedPath = normalizeRedirectPathForMatch(context.path || '/');
    const normalizedLocale = normalizeLocaleForMatch(context.locale || '');
    const normalizedCountryCode = normalizeCountryForMatch(context.countryCode || '');
    const seed = normalizeRedirectString(context.seed) || 'anonymous';
    for (const rule of rules) {
      if (!rule.isActive) {
        continue;
      }
      const startAt = rule.startAt ? new Date(rule.startAt) : null;
      const endAt = rule.endAt ? new Date(rule.endAt) : null;
      if (startAt && now < startAt) {
        continue;
      }
      if (endAt && now > endAt) {
        continue;
      }
      if (!countryMatchesRule(normalizedCountryCode, rule.countryCodes || [])) {
        continue;
      }
      if (!localeMatchesRule(normalizedLocale, rule.locales || [])) {
        continue;
      }
      const matchType = normalizeRedirectMatchType(rule.matchType);
      let matched = false;
      if (matchType === 'EXACT') {
        matched = normalizeRedirectPathForMatch(rule.sourcePath) === normalizedPath;
      } else if (matchType === 'PREFIX') {
        matched = normalizedPath.startsWith(normalizeRedirectPathForMatch(rule.sourcePath));
      } else {
        try {
          matched = new RegExp(rule.sourcePath).test(normalizedPath);
        } catch (_error) {
          matched = false;
        }
      }
      if (!matched) {
        continue;
      }
      let targetPath = rule.targetPath;
      let abVariantApplied = false;
      if ((rule.abTestPercent || 0) > 0 && rule.abTestTargetPath) {
        const bucket = hashToBucket(`${seed}:${rule.id}`);
        if (bucket < rule.abTestPercent) {
          targetPath = rule.abTestTargetPath;
          abVariantApplied = true;
        }
      }
      if (!targetPath) {
        continue;
      }
      if (
        !/^https?:\/\//i.test(targetPath) &&
        normalizeRedirectPathForMatch(targetPath) === normalizedPath
      ) {
        continue;
      }
      return {
        matched: true,
        targetPath,
        statusCode: normalizeRedirectStatusCode(rule.statusCode),
        abVariantApplied,
        rule: {
          id: rule.id,
          name: rule.name,
          matchType: rule.matchType,
          sourcePath: rule.sourcePath,
        },
      };
    }
    return { matched: false };
  };

  const resolveRedirectByRequest = async (req) => {
    const pathParam = normalizeRedirectString(req.query.path) || '/';
    const localeParam = normalizeRedirectString(req.query.locale);
    const countryParam = normalizeRedirectString(req.query.countryCode || req.query.country);
    const seedParam = normalizeRedirectString(req.query.seed);
    const cookies = parseCookies(req.headers.cookie);
    const fallbackLocale =
      normalizeRedirectString(req.headers['accept-language'] || '').split(',')[0] || '';
    const resolvedLocale = localeParam || fallbackLocale;
    const resolvedCountryCode =
      countryParam ||
      normalizeRedirectString(req.headers['x-country-code'] || req.headers['cf-ipcountry']);
    const resolvedSeed =
      seedParam || cookies.mot_redirect_seed || cookies[SESSION_COOKIE] || 'anonymous';
    const rules = (await listRedirectRuleRows()).map(serializeRedirectRule);
    return resolveRedirectDecision(rules, {
      path: pathParam,
      locale: resolvedLocale,
      countryCode: resolvedCountryCode,
      seed: resolvedSeed,
    });
  };

  return {
    createRedirectRuleRow,
    deleteRedirectRuleRow,
    listRedirectRuleRows,
    resolveRedirectByRequest,
    serializeRedirectRule,
    updateRedirectRuleRow,
  };
}
