export const pickTranslatable = (obj: Object): Object =>  {
    if (obj == null || typeof obj !== "object") return obj;

  const result: any = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj) as (keyof typeof obj)[]) if (key in obj) {
    const val = obj[key];
    if (
      ["id", "_id", "createdAt", "updatedAt", "techs", "screenshots"].some((f) =>
        key.includes(f)
      )
    ) {
      result[key] = val;
    } else if (typeof val === "string") {
      result[key] = val;
    } else if (typeof val === "object") {
      result[key] = pickTranslatable(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}