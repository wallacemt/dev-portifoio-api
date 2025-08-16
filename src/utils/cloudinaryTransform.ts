export const optimizeCloudinary = (img: string): string => {
  //biome-ignore lint: this regex is correct
  return img.replace(/^.*\/upload\//, (match) => `${match}q_auto:low/c_scale,w_1200/f_webp/`);
};
