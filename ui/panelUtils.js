/**
 * Pick the utilization value to display in the panel for a provider.
 * Prefers the 5-hour window if present; otherwise the highest utilization.
 * Returns null if there are no windows.
 */
export function pickPanelUtilization(windows) {
    if (!windows || windows.length === 0) return null;
    const fiveHour = windows.find(w => w.id === 'five_hour');
    if (fiveHour) return fiveHour.utilization;
    return Math.max(...windows.map(w => w.utilization));
}
