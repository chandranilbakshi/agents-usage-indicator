/**
 * Map a 0-100 utilization value to a CSS class for colour coding.
 * Shared by the popup window rows and the panel mini-bar.
 */
export function getUsageClass(utilization) {
    if (utilization >= 90) return 'usage-critical';
    if (utilization >= 70) return 'usage-high';
    if (utilization >= 40) return 'usage-medium';
    return 'usage-low';
}
