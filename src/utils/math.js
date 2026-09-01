export const degToRad = (deg) => (deg * 2 * Math.PI) / 360;
export const radToDeg = (rad) => (rad * 360) / (2 * Math.PI);
export const normalizeAngle = (a) => ((a % 360) + 360) % 360;
export const reverseAngle = (a) => (a + 180) % 360;
