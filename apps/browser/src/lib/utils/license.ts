import * as m from '$lib/paraglide/messages';

/**
 * Maps license URL patterns to their localized names.
 * Returns the localized license name if recognized, otherwise returns the original URL.
 */

type LicensePattern = {
  pattern: string;
  getMessage: () => string;
};

const LICENSE_PATTERNS: LicensePattern[] = [
  // CC0 / Public Domain
  { pattern: 'publicdomain/zero/1.0', getMessage: () => m.license_cc0_1_0() },
  {
    pattern: 'publicdomain/mark/1.0',
    getMessage: () => m.license_cc_pdm_1_0(),
  },

  // CC BY (Attribution)
  { pattern: 'licenses/by/4.0', getMessage: () => m.license_cc_by_4_0() },
  { pattern: 'licenses/by/3.0', getMessage: () => m.license_cc_by_3_0() },

  // CC BY-SA (Attribution-ShareAlike)
  { pattern: 'licenses/by-sa/4.0', getMessage: () => m.license_cc_by_sa_4_0() },
  { pattern: 'licenses/by-sa/3.0', getMessage: () => m.license_cc_by_sa_3_0() },

  // CC BY-NC (Attribution-NonCommercial)
  { pattern: 'licenses/by-nc/4.0', getMessage: () => m.license_cc_by_nc_4_0() },

  // CC BY-ND (Attribution-NoDerivatives)
  { pattern: 'licenses/by-nd/4.0', getMessage: () => m.license_cc_by_nd_4_0() },

  // CC BY-NC-SA (Attribution-NonCommercial-ShareAlike)
  {
    pattern: 'licenses/by-nc-sa/4.0',
    getMessage: () => m.license_cc_by_nc_sa_4_0(),
  },

  // CC BY-NC-ND (Attribution-NonCommercial-NoDerivatives)
  {
    pattern: 'licenses/by-nc-nd/4.0',
    getMessage: () => m.license_cc_by_nc_nd_4_0(),
  },
];

/**
 * Get the localized license name for a given license URL.
 * @param url - The license URL
 * @returns The localized license name, or the original URL if not recognized
 */
export function getLicenseName(url: string): string {
  const match = LICENSE_PATTERNS.find((license) =>
    url.includes(license.pattern),
  );
  return match ? match.getMessage() : url;
}
