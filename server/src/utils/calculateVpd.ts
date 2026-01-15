export const calculateVpd = (temperatureC: number, relativeHumidity: number): number => {
  // Calculate saturation vapor pressure (SVP) in kPa using Tetens formula
  const svp = 0.6108 * Math.exp((17.2694 * temperatureC) / (temperatureC + 237.3));

  // Calculate vapor pressure deficit (VPD) in kPa
  const vpd = svp * (1 - relativeHumidity / 100);

  return parseFloat(vpd.toFixed(2));
};
