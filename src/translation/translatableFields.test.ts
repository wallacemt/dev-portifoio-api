import { describe, expect, it } from "@jest/globals";
import { pickTranslatableFields } from "./translatableFields";

describe("pickTranslatableFields (skill)", () => {
  it("excludes title (proper noun) and includes subSkils", () => {
    const source = {
      title: "MySQL",
      subSkils: ["Consultas SQL", "Modelagem de dados"],
      stack: "backend",
      type: "database",
      image: "https://example.com/mysql.png",
    };

    expect(pickTranslatableFields("skill", source)).toEqual({
      subSkils: ["Consultas SQL", "Modelagem de dados"],
    });
  });
});
