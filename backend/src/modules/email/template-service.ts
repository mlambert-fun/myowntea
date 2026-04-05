// @ts-nocheck
export function createEmailTemplateService({
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  WEB_BASE_URL,
  t,
  toJsonObjectRecord,
  toNonEmptyStringOrNull,
  toStatusOrNull,
}) {
  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const buildCustomerEmailTemplate = (params) => {
    const title = toNonEmptyStringOrNull(params.title) || 'My Own Tea';
    const greeting = toNonEmptyStringOrNull(params.greeting) || 'Bonjour,';
    const previewText = toNonEmptyStringOrNull(params.previewText) || '';
    const ctaLabel = toNonEmptyStringOrNull(params.ctaLabel);
    const ctaUrl = toNonEmptyStringOrNull(params.ctaUrl);
    const secondaryCtaLabel = toNonEmptyStringOrNull(params.secondaryCtaLabel);
    const secondaryCtaUrl = toNonEmptyStringOrNull(params.secondaryCtaUrl);
    const unsubscribeUrl = toNonEmptyStringOrNull(params.unsubscribeUrl);
    const footnote = toNonEmptyStringOrNull(params.footnote);
    const accentColor = toNonEmptyStringOrNull(params.accentColor) || '#C9A962';
    const logoUrl =
      toNonEmptyStringOrNull(process.env.EMAIL_LOGO_URL) ||
      `${WEB_BASE_URL}/myowntea_logo.png`;
    const supportContactUrl = `${WEB_BASE_URL}/contact`;
    const paragraphs = (Array.isArray(params.paragraphs) ? params.paragraphs : [])
      .map((line) => toNonEmptyStringOrNull(line))
      .filter(Boolean);
    const infoRows = (Array.isArray(params.infoRows) ? params.infoRows : [])
      .map((row) => ({
        label: toNonEmptyStringOrNull(row?.label),
        value: toNonEmptyStringOrNull(row?.value),
      }))
      .filter((row) => Boolean(row.label && row.value));
    const detailsTextLines = (Array.isArray(params.detailsTextLines)
      ? params.detailsTextLines
      : [])
      .map((line) => toNonEmptyStringOrNull(line))
      .filter(Boolean);
    const detailsHtml = toNonEmptyStringOrNull(params.detailsHtml);
    const preHeaderHtml = previewText
      ? `<div style="display:none!important;visibility:hidden;opacity:0;overflow:hidden;height:0;width:0;line-height:1px;">
      ${escapeHtml(previewText)}
    </div>`
      : '';
    const infoRowsHtml =
      infoRows.length > 0
        ? `
      <table role="presentation" width="100%" style="border-collapse:collapse;margin:18px 0;border:1px solid #E5E0D5;border-radius:10px;overflow:hidden;">
        ${infoRows
          .map(
            (row) => `
            <tr>
              <td style="padding:10px 12px;background:#F9F7F2;color:#6B7280;font-size:12px;font-weight:600;width:38%;">${escapeHtml(row.label)}</td>
              <td style="padding:10px 12px;color:#1F2937;font-size:13px;">${escapeHtml(row.value)}</td>
            </tr>
          `
          )
          .join('')}
      </table>
    `
        : '';
    const ctaHtml =
      ctaLabel && ctaUrl
        ? `
      <div style="margin:22px 0 10px 0;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#414C16;color:#FAF8F3;padding:12px 18px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700;">
          ${escapeHtml(ctaLabel)}
        </a>
      </div>
    `
        : '';
    const secondaryCtaHtml =
      secondaryCtaLabel && secondaryCtaUrl
        ? `<p style="margin:0 0 10px 0;"><a href="${escapeHtml(secondaryCtaUrl)}" style="color:#8B6B2E;text-decoration:underline;font-size:13px;">${escapeHtml(secondaryCtaLabel)}</a></p>`
        : '';
    const unsubscribeHtml = unsubscribeUrl
      ? `<p style="margin:8px 0 0 0;font-size:11px;color:#9CA3AF;">Email marketing: <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9CA3AF;">Se d\u00e9sinscrire</a></p>`
      : '';
    const html = `
    <html lang="fr">
      <body style="margin:0;padding:0;background:#F5F1E8;">
        ${preHeaderHtml}
        <table role="presentation" width="100%" style="border-collapse:collapse;background:#F5F1E8;padding:20px 0;">
          <tr>
            <td align="center" style="padding:12px;">
              <table role="presentation" width="100%" style="max-width:640px;border-collapse:collapse;">
                <tr>
                  <td style="background:#C9A962;color:#414C16;padding:16px 20px;border-radius:14px 14px 0 0;">
                    <table role="presentation" style="border-collapse:collapse;">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;">
                          <img src="${escapeHtml(logoUrl)}" alt="My Own Tea" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:10px;object-fit:contain;background:#FFFFFF;" />
                        </td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">My Own Tea</p>
                          <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(title)}</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background:#FFFFFF;border:1px solid #E5E0D5;border-top:none;border-radius:0 0 14px 14px;padding:20px;">
                    <p style="margin:0 0 14px 0;color:#111827;font-size:15px;font-weight:600;">${escapeHtml(greeting)}</p>
                    ${paragraphs
                      .map(
                        (line) =>
                          `<p style="margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(line)}</p>`
                      )
                      .join('')}
                    ${infoRowsHtml}
                    ${detailsHtml || ''}
                    ${ctaHtml}
                    ${secondaryCtaHtml}
                    ${
                      footnote
                        ? `<p style="margin:14px 0 0 0;font-size:12px;color:#6B7280;line-height:1.5;">${escapeHtml(footnote)}</p>`
                        : ''
                    }
                    <hr style="border:none;border-top:1px solid #E5E0D5;margin:18px 0;" />
                    <p style="margin:0;font-size:12px;color:#6B7280;">${escapeHtml(t("backend.index.email_support_text"))} <a href="${escapeHtml(supportContactUrl)}" style="color:#8B6B2E;text-decoration:underline;">${escapeHtml(t("backend.index.email_support_cta"))}</a></p>
                    ${unsubscribeHtml}
                    <p style="margin:10px 0 0 0;font-size:11px;color:#9CA3AF;">\u00a9 ${new Date().getFullYear()} My Own Tea</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
    void accentColor;
    const textLines = [
      title,
      '',
      greeting,
      '',
      ...paragraphs,
      ...(infoRows.length > 0 ? ['', ...infoRows.map((row) => `${row.label}: ${row.value}`)] : []),
      ...(detailsTextLines.length > 0 ? ['', ...detailsTextLines] : []),
      ...(ctaLabel && ctaUrl ? ['', `${ctaLabel}:`, ctaUrl] : []),
      ...(secondaryCtaLabel && secondaryCtaUrl
        ? ['', `${secondaryCtaLabel}:`, secondaryCtaUrl]
        : []),
      ...(footnote ? ['', footnote] : []),
      '',
      `${t("backend.index.email_support_text")} ${t("backend.index.email_support_cta")}: ${supportContactUrl}`,
      ...(unsubscribeUrl
        ? [`Se d\u00e9sinscrire (emails marketing): ${unsubscribeUrl}`]
        : []),
    ];
    return { html, text: textLines.join('\n') };
  };

  const buildPasswordResetEmail = (params) => {
    const safeName = toNonEmptyStringOrNull(params.firstName) || 'Bonjour';
    const content = buildCustomerEmailTemplate({
      title: t("backend.index.reinitialisation_password"),
      previewText: `Lien valable ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes`,
      greeting: `${safeName},`,
      paragraphs: [
        t("backend.index.nous_avons_recu"),
        `Pour votre s\u00e9curit\u00e9, ce lien est valable ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes.`,
        t("backend.index.vous_etes_pas_3"),
      ],
      ctaLabel: t("backend.index.reset_my_password"),
      ctaUrl: params.resetUrl,
      footnote: t("backend.index.mesure_securite_transferez"),
    });
    return { text: content.text, html: content.html };
  };

  const ORDER_STATUS_LABELS_FR = {
    PENDING: t("backend.index.attente_payment"),
    CONFIRMED: t("backend.index.confirmed"),
    PROCESSING: t("backend.index.preparation"),
    SHIPPED: t("backend.index.shipped"),
    DELIVERED: t("backend.index.delivered"),
    CANCELLED: t("backend.index.canceled"),
    REFUNDED: t("backend.index.refunded"),
  };

  const formatEuroFromCents = (valueCents) => {
    const numeric = Number(valueCents || 0);
    const amount = Number.isFinite(numeric) ? numeric / 100 : 0;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const normalizeEmailSubscriptionIntervalCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    const normalized = Math.round(parsed);
    return normalized === 2 || normalized === 3 ? normalized : 1;
  };

  const formatEmailSubscriptionCadence = (intervalCount) => {
    if (intervalCount === 2) {
      return t("backend.index.subscription_every_two_months");
    }
    if (intervalCount === 3) {
      return t("backend.index.subscription_every_three_months");
    }
    return t("backend.index.subscription_every_month");
  };

  const buildOrderItemSubscriptionSummary = (item, snapshot) => {
    const normalizedItemType = toNonEmptyStringOrNull(item?.itemType);
    const purchaseMode = toNonEmptyStringOrNull(snapshot?.purchaseMode);
    const subscriptionSetup = toJsonObjectRecord(snapshot?.subscriptionSetup);
    const subscription = toJsonObjectRecord(snapshot?.subscription);
    const isSubscription =
      normalizedItemType === 'SUBSCRIPTION' ||
      purchaseMode === 'SUBSCRIPTION' ||
      Object.keys(subscriptionSetup).length > 0 ||
      Object.keys(subscription).length > 0;
    if (!isSubscription) {
      return null;
    }
    const intervalCount = normalizeEmailSubscriptionIntervalCount(
      subscriptionSetup.intervalCount ??
        subscription.intervalCount ??
        snapshot?.intervalCount
    );
    return `${t("backend.index.subscription_label")} - ${formatEmailSubscriptionCadence(intervalCount)}`;
  };

  const resolveOrderSubtotalDiscountCents = (order) => {
    const discountLines = Array.isArray(order?.appliedDiscounts)
      ? order.appliedDiscounts
      : [];
    if (discountLines.length === 0) {
      return Math.max(0, Math.round(Number(order?.discountTotalCents) || 0));
    }
    return discountLines.reduce((sum, line) => {
      const type =
        typeof line?.type === 'string' ? line.type.trim().toUpperCase() : '';
      if (type === 'FREE_SHIPPING') {
        return sum;
      }
      return sum + Math.max(0, Math.round(Number(line?.amountCents) || 0));
    }, 0);
  };

  const resolveOrderSubtotalCents = (order) => {
    if (Number.isFinite(Number(order?.subtotalCents))) {
      return Math.max(0, Math.round(Number(order.subtotalCents)));
    }
    const items = Array.isArray(order?.items) ? order.items : [];
    return items.reduce((sum, item) => {
      const lineSubtotalCents = Number(item?.lineSubtotalCents);
      if (Number.isFinite(lineSubtotalCents)) {
        return sum + Math.max(0, Math.round(lineSubtotalCents));
      }
      const lineTotalCents = Number(item?.lineTotalCents);
      if (Number.isFinite(lineTotalCents)) {
        return sum + Math.max(0, Math.round(lineTotalCents));
      }
      const qty = Math.max(1, Number(item?.qty || item?.quantity || 1));
      const unitPrice = Number(item?.price || 0);
      if (Number.isFinite(unitPrice)) {
        return sum + Math.max(0, Math.round(unitPrice * 100 * qty));
      }
      return sum;
    }, 0);
  };

  const buildOrderFinancialSummaryRows = (order) => {
    const subtotalCents = resolveOrderSubtotalCents(order);
    const shippingCents = Math.max(0, Math.round(Number(order?.shippingCents) || 0));
    const discountCents = resolveOrderSubtotalDiscountCents(order);
    const totalCents = Number.isFinite(Number(order?.totalCents))
      ? Math.max(0, Math.round(Number(order.totalCents)))
      : Math.max(0, subtotalCents + shippingCents - discountCents);
    return [
      {
        label: t("backend.index.email_order_summary_subtotal"),
        value: formatEuroFromCents(subtotalCents),
        emphasized: false,
      },
      {
        label: t("backend.index.email_order_summary_shipping"),
        value:
          shippingCents > 0
            ? formatEuroFromCents(shippingCents)
            : t("backend.index.email_order_summary_free"),
        emphasized: false,
      },
      ...(discountCents > 0
        ? [
            {
              label: t("backend.index.email_order_summary_discount"),
              value: `-${formatEuroFromCents(discountCents)}`,
              emphasized: false,
            },
          ]
        : []),
      {
        label: t("backend.index.email_order_summary_total"),
        value: formatEuroFromCents(totalCents),
        emphasized: true,
      },
    ];
  };

  const buildOrderItemsSummary = (order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (items.length === 0) {
      return [];
    }
    return items.slice(0, 6).map((item) => {
      const snapshot = toJsonObjectRecord(item.snapshot);
      const title =
        toNonEmptyStringOrNull(snapshot.title) ||
        toNonEmptyStringOrNull(item.ingredientName) ||
        'Article';
      const qty = Math.max(1, Number(item.qty || item.quantity || 1));
      const lineTotal = Number.isFinite(Number(item.lineTotalCents))
        ? Number(item.lineTotalCents)
        : Math.max(0, Math.round(Number(item.price || 0) * 100 * qty));
      const subscriptionSummary = buildOrderItemSubscriptionSummary(item, snapshot);
      const subscriptionSuffix = subscriptionSummary
        ? ` - ${subscriptionSummary}`
        : '';
      return `${title} x${qty}${subscriptionSuffix} (${formatEuroFromCents(lineTotal)})`;
    });
  };

  const buildOrderNotificationEmailContent = (params) => {
    const safeFirstName =
      toNonEmptyStringOrNull(params.order?.customer?.firstName) || 'Bonjour';
    const orderNumber =
      toNonEmptyStringOrNull(params.order?.orderNumber) ||
      t("backend.index.order_2");
    const status = toStatusOrNull(params.order?.status);
    const statusLabel =
      ORDER_STATUS_LABELS_FR[status || 'PENDING'] ||
      t("backend.index.update_day");
    const totalCents = Number.isFinite(Number(params.order?.totalCents))
      ? Number(params.order.totalCents)
      : Math.max(0, Math.round(Number(params.order?.total || 0) * 100));
    const trackingUrl =
      toNonEmptyStringOrNull(params.order?.trackingUrl) ||
      toNonEmptyStringOrNull(params.order?.shipment?.trackingUrl) ||
      null;
    const orderUrl = params.order?.id
      ? `${WEB_BASE_URL}/account/order/${params.order.id}`
      : `${WEB_BASE_URL}/account/orders`;
    const itemsSummary = buildOrderItemsSummary(params.order);
    const financialSummaryRows = buildOrderFinancialSummaryRows(params.order);
    const subjectByType = {
      ORDER_CONFIRMED: `Commande ${orderNumber} confirm\u00e9e`,
      ORDER_PROCESSING: `Commande ${orderNumber} en pr\u00e9paration`,
      ORDER_SHIPPED: `Commande ${orderNumber} exp\u00e9di\u00e9e`,
      ORDER_DELIVERED: `Commande ${orderNumber} livr\u00e9e`,
      ORDER_CANCELLED: `Commande ${orderNumber} annul\u00e9e`,
      ORDER_REFUNDED: `Commande ${orderNumber} rembours\u00e9e`,
    };
    const statusDetailByType = {
      ORDER_CONFIRMED: t("backend.index.payment_valid_nous"),
      ORDER_PROCESSING: t("backend.index.order_actuellement_preparation"),
      ORDER_SHIPPED: t("backend.index.parcel_summer_remis"),
      ORDER_DELIVERED: t("backend.index.order_marquee_comme"),
      ORDER_CANCELLED: t("backend.index.order_summer_canceled"),
      ORDER_REFUNDED: t("backend.index.remboursement_order_summer"),
    };
    const titleByType = {
      ORDER_CONFIRMED: t("backend.index.order_confirmed"),
      ORDER_PROCESSING: t("backend.index.order_preparation"),
      ORDER_SHIPPED: t("backend.index.order_shipped"),
      ORDER_DELIVERED: t("backend.index.order_delivered"),
      ORDER_CANCELLED: t("backend.index.order_canceled"),
      ORDER_REFUNDED: t("backend.index.order_refunded"),
    };
    const accentByType = {
      ORDER_CONFIRMED: '#C9A962',
      ORDER_PROCESSING: '#8B6B2E',
      ORDER_SHIPPED: '#0D9488',
      ORDER_DELIVERED: '#15803D',
      ORDER_CANCELLED: '#B91C1C',
      ORDER_REFUNDED: '#C2410C',
    };
    const subject =
      subjectByType[params.type] ||
      `Mise \u00e0 jour commande ${orderNumber}`;
    const detailsHtml =
      itemsSummary.length > 0 || financialSummaryRows.length > 0
        ? `
        <div style="margin:14px 0 0 0;padding:12px;border:1px solid #E5E0D5;border-radius:10px;background:#FCFBF8;">
          ${
            itemsSummary.length > 0
              ? `
          <p style="margin:0 0 8px 0;color:#6B7280;font-size:12px;font-weight:600;">${escapeHtml(t("backend.index.email_order_items_title"))}</p>
          <ul style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:1.6;">
            ${itemsSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
          </ul>
          `
              : ''
          }
          ${
            financialSummaryRows.length > 0
              ? `
          <table role="presentation" width="100%" style="border-collapse:collapse;${
            itemsSummary.length > 0
              ? 'margin-top:14px;padding-top:12px;border-top:1px solid #E5E0D5;'
              : ''
          }">
            ${financialSummaryRows
              .map(
                (row) => `
                <tr>
                  <td style="padding:4px 0;color:${row.emphasized ? '#111827' : '#6B7280'};font-size:${row.emphasized ? '14px' : '13px'};font-weight:${row.emphasized ? '700' : '500'};">${escapeHtml(row.label)}</td>
                  <td align="right" style="padding:4px 0;color:${row.emphasized ? '#111827' : '#1F2937'};font-size:${row.emphasized ? '14px' : '13px'};font-weight:${row.emphasized ? '700' : '600'};">${escapeHtml(row.value)}</td>
                </tr>
              `
              )
              .join('')}
          </table>
          `
              : ''
          }
        </div>
      `
        : '';
    const primaryCtaUrl =
      params.type === 'ORDER_SHIPPED' && trackingUrl ? trackingUrl : orderUrl;
    const primaryCtaLabel =
      params.type === 'ORDER_SHIPPED' && trackingUrl
        ? t("backend.index.suivre_my_parcel")
        : t("backend.index.view_my_order");
    const content = buildCustomerEmailTemplate({
      title: titleByType[params.type] || t("backend.index.update_day_order"),
      previewText: `${orderNumber} - ${statusLabel}`,
      greeting: `${safeFirstName},`,
      paragraphs: [
        statusDetailByType[params.type] ||
          `Le statut de votre commande est maintenant: ${statusLabel}.`,
        t("backend.index.vous_pouvez_consulter"),
      ],
      infoRows: [
        { label: t("backend.index.order"), value: orderNumber },
        { label: 'Statut', value: statusLabel },
        { label: 'Montant total', value: formatEuroFromCents(totalCents) },
      ],
      detailsHtml,
      detailsTextLines: [
        ...(itemsSummary.length > 0
          ? [t("backend.index.email_order_items_title_text"), ...itemsSummary]
          : []),
        ...(financialSummaryRows.length > 0
          ? [
              ...(itemsSummary.length > 0 ? [''] : []),
              t("backend.index.email_order_summary_title"),
              ...financialSummaryRows.map((row) => `${row.label}: ${row.value}`),
            ]
          : []),
      ],
      ctaLabel: primaryCtaLabel,
      ctaUrl: primaryCtaUrl,
      secondaryCtaLabel:
        trackingUrl && primaryCtaUrl !== trackingUrl
          ? t("backend.index.link_tracking_carrier")
          : null,
      secondaryCtaUrl:
        trackingUrl && primaryCtaUrl !== trackingUrl ? trackingUrl : null,
      footnote:
        params.type === 'ORDER_CANCELLED' || params.type === 'ORDER_REFUNDED'
          ? t("backend.index.vous_avez_question")
          : null,
      accentColor: accentByType[params.type] || '#C9A962',
    });
    return {
      subject,
      text: content.text,
      html: content.html,
    };
  };

  return {
    buildCustomerEmailTemplate,
    buildOrderNotificationEmailContent,
    buildPasswordResetEmail,
    escapeHtml,
    resolveOrderSubtotalDiscountCents,
  };
}
