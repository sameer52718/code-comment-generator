const { generateComments } = require("../src/index");
const fs = require("fs").promises;
const path = require("path");

describe("TypeScript Type Inference", () => {
  it("should generate JSDoc with correct parameter types", async () => {
    const testFile = path.join(__dirname, "sample.ts");
    await fs.writeFile(testFile, "function multiply(x: number, y: number): number { return x * y; }");
    await generateComments(testFile, path.join(__dirname, "../code-comment-config.json"));
    const output = await fs.readFile(path.join(__dirname, "../output/commented_sample.ts"), "utf-8");
    expect(output).toContain("@param {number} x");
    expect(output).toContain("@param {number} y");
    expect(output).toContain("@returns {number}");
  });
});
