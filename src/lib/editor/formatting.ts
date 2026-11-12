/**
 * Formats an ISO timestamp identically during server rendering and browser
 * hydration.
 *
 * A fixed locale and UTC time zone are intentional. Relying on the host's
 * locale made the server emit a 12-hour value while the browser emitted a
 * 24-hour value, which caused React to discard the rendered editor tree.
 *
 * @param timestamp - ISO-8601 timestamp stored on a version snapshot.
 * @returns A stable 24-hour time, or a placeholder for invalid input.
 */
export const formatSnapshotTime = (timestamp: string): string => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }

  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
};
