export const optimizeCloudinary = (img: string): string => {
  const optimizedImg = img.replace(
    //biome-ignore lint: this regex is correct
    /^.*\/upload\//,
    (match) => `${match}q_auto:low/c_scale,w_1200/f_webp/`
  );

  return optimizedImg.includes("q_auto:low/c_scale,w_1200/f_webp") ? optimizedImg : img;
};
