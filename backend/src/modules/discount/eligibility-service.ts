// @ts-nocheck
export function createDiscountEligibilityService({
  FIRST_ORDER_ONLY_DISCOUNT_ERROR,
  FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE,
  normalizeCode,
  normalizeEmail,
  prisma,
}) {
  const hasPaidOrConfirmedOrder = async (params) => {
    const identityFilters = [];
    if (params.customerId) {
      identityFilters.push({ customerId: params.customerId });
    }
    if (params.userId) {
      identityFilters.push({ userId: params.userId });
    }
    const normalizedCustomerEmail = normalizeEmail(params.customerEmail);
    if (normalizedCustomerEmail) {
      identityFilters.push({ customer: { email: normalizedCustomerEmail } });
      identityFilters.push({ user: { email: normalizedCustomerEmail } });
    }
    if (identityFilters.length === 0) {
      return false;
    }
    const where = {
      AND: [
        { OR: identityFilters },
        {
          OR: [{ paymentStatus: 'completed' }, { status: 'CONFIRMED' }],
        },
      ],
    };
    if (params.excludeOrderId) {
      where.AND.push({ id: { not: params.excludeOrderId } });
    }
    const existingOrder = await prisma.order.findFirst({
      where,
      select: { id: true },
    });
    return Boolean(existingOrder);
  };

  const resolveFirstOrderOnlyDiscountError = (summary, appliedCode) => {
    if (!normalizeCode(appliedCode)) {
      return null;
    }
    if (summary.appliedCode) {
      return null;
    }
    if (
      Array.isArray(summary.messages) &&
      summary.messages.includes(FIRST_ORDER_ONLY_NOT_APPLIED_MESSAGE)
    ) {
      return FIRST_ORDER_ONLY_DISCOUNT_ERROR;
    }
    return null;
  };

  return {
    hasPaidOrConfirmedOrder,
    resolveFirstOrderOnlyDiscountError,
  };
}
