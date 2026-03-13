export const calculateVpd = (temperatureAir: number, temperatureLeaf: number, relativeHumidity: number): number => {
  const svpAir = calculateSvp(temperatureAir);
  const svpLeaf = calculateSvp(temperatureLeaf);

  // Calculate leaf corrected vapor pressure deficit (VPD) in kPa
  const vpd = svpLeaf - svpAir * (relativeHumidity / 100);

  return parseFloat(vpd.toFixed(2));
};

// Calculate saturation vapor pressure (SVP) in kPa using Tetens formula
const calculateSvp = (temperature: number): number => 0.6108 * Math.exp((17.2694 * temperature) / (temperature + 237.3));
