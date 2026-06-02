/**
 * MVP feature gates for the driver app.
 *
 * During the MVP, admins set up the driver, perform KYC and add Mobile Money
 * details on behalf of the driver. The driver-facing screens for these flows
 * are temporarily hidden so the experience stays focused.
 *
 * Flip these to `false` once self-service onboarding is enabled again.
 */
export const MVP_HIDE_DRIVER_KYC = true;
export const MVP_HIDE_DRIVER_MOBILE_MONEY = true;
