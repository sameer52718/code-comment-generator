const esprima = require("esprima");
const ts = require("typescript");
const fs = require("fs").promises;
const path = require("path");

// Load configuration
async function loadConfig(configPath) {
  try {
    const config = await fs.readFile(configPath, "utf-8");
    return JSON.parse(config);
  } catch (error) {
    return {
      commentStyle: "jsdoc", // Default to JSDoc
      includeInline: true,
      outputDir: "output",
    };
  }
}

// Analyze code and generate comments
async function generateComments(filePath, configPath = "./code-comment-config.json") {
  try {
    const config = await loadConfig(configPath);
    const code = await fs.readFile(filePath, "utf-8");
    const isTypeScript = filePath.endsWith(".ts") || filePath.endsWith(".tsx");

    // Parse code based on file type
    const sourceFile = ts.createSourceFile(path.basename(filePath), code, ts.ScriptTarget.Latest, true);

    let commentedCode = code.split("\n");
    const comments = [];

    // Create a TypeScript program for type checking
    const program = ts.createProgram([filePath], { target: ts.ScriptTarget.Latest });
    const checker = program.getTypeChecker();

    // Traverse TypeScript AST
    ts.forEachChild(sourceFile, (node) => {
      traverseAST(node, (n, parent) => {
        if (n.kind === ts.SyntaxKind.FunctionDeclaration) {
          const comment = generateFunctionComment(n, config, sourceFile, checker);
          const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line;
          comments.push({ line, comment });
        } else if (n.kind === ts.SyntaxKind.VariableStatement && config.includeInline) {
          // Only comment top-level variables, skip function-scoped ones for now
          if (!isInsideFunction(parent)) {
            const comment = generateVariableComment(n, config, sourceFile);
            const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line;
            comments.push({ line, comment });
          }
        } else if (n.kind === ts.SyntaxKind.VariableDeclaration && config.includeInline) {
          // Handle function-scoped variables
          if (isInsideFunction(parent)) {
            const comment = generateVariableComment(n, config, sourceFile);
            const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line;
            comments.push({ line, comment });
          }
        }
      });
    });

    // If JavaScript, parse with esprima
    if (!isTypeScript) {
      const ast = esprima.parseScript(code, { loc: true, jsx: true });
      traverseEsprimaAST(ast, (node) => {
        if (node.type === "FunctionDeclaration") {
          const comment = generateEsprimaFunctionComment(node, config);
          const line = node.loc.start.line - 1;
          comments.push({ line, comment });
        } else if (node.type === "VariableDeclaration" && config.includeInline) {
          const comment = generateEsprimaVariableComment(node, config);
          const line = node.loc.start.line - 1;
          comments.push({ line, comment });
        }
      });
    }

    // Insert comments into code
    comments.sort((a, b) => b.line - a.line);
    for (const { line, comment } of comments) {
      commentedCode.splice(line, 0, ...comment.split("\n"));
    }

    // Write output
    await fs.mkdir(config.outputDir, { recursive: true });
    const outputPath = path.join(config.outputDir, `commented_${path.basename(filePath)}`);
    await fs.writeFile(outputPath, commentedCode.join("\n"));
    console.log(`Commented code written to ${outputPath}`);
    return commentedCode.join("\n");
  } catch (error) {
    console.error("Error generating comments:", error.message);
    throw error;
  }
}

// Check if a node is inside a function
function isInsideFunction(node) {
  while (node) {
    if (
      node.kind === ts.SyntaxKind.FunctionDeclaration ||
      node.kind === ts.SyntaxKind.ArrowFunction ||
      node.kind === ts.SyntaxKind.MethodDeclaration
    ) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

// Traverse TypeScript AST with parent tracking
function traverseAST(node, callback, parent = null) {
  if (!node) return;
  callback(node, parent);
  ts.forEachChild(node, (child) => traverseAST(child, callback, node));
}

// Traverse Esprima AST
function traverseEsprimaAST(node, callback) {
  if (!node) return;
  callback(node);
  for (const key in node) {
    if (node[key] && typeof node[key] === "object") {
      traverseEsprimaAST(node[key], callback);
    } else if (Array.isArray(node[key])) {
      node[key].forEach((child) => traverseEsprimaAST(child, callback));
    }
  }
}

// Generate JSDoc comment for TypeScript function
function generateFunctionComment(node, config, sourceFile, checker) {
  const name = node.name ? node.name.getText(sourceFile) : "anonymous";

  // Get parameter types
  const params = node.parameters
    ? node.parameters
        .map((param) => {
          const paramName = param.name.getText(sourceFile);
          let paramType = "any";
          if (param.type) {
            paramType = checker.typeToString(
              checker.getTypeAtLocation(param.type),
              param,
              ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
            );
          } else {
            // Fallback to inferred type
            const inferredType = checker.getTypeAtLocation(param);
            paramType =
              checker.typeToString(
                inferredType,
                param,
                ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
              ) || "any";
          }
          return config.commentStyle === "jsdoc"
            ? `@param {${paramType}} ${paramName} - Parameter ${paramName}`
            : `// Param: ${paramName} (${paramType})`;
        })
        .join("\n")
    : "";

  // Get return type
  let returnType = "any";
  if (node.type) {
    returnType = checker.typeToString(
      checker.getTypeAtLocation(node.type),
      node,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
    );
  }

  if (config.commentStyle === "jsdoc") {
    return `/**
 * ${name} - Function to perform its intended operation.
${params}
 * @returns {${returnType}} Result of the function.
 */`;
  }
  return `// ${name}: Function to perform its intended operation.\n${params}`;
}

// Generate inline comment for TypeScript variable
function generateVariableComment(node, config, sourceFile) {
  const varName =
    node.kind === ts.SyntaxKind.VariableStatement
      ? node.declarationList.declarations[0].name.getText(sourceFile)
      : node.name.getText(sourceFile);
  return `// ${varName}: Stores relevant data for the operation.`;
}

// Generate JSDoc comment for JavaScript function (esprima)
function generateEsprimaFunctionComment(node, config) {
  const name = node.id ? node.id.name : "anonymous";

  const params = node.params
    .map((param) => {
      let paramName = "unknown";
      if (param.type === "Identifier") {
        paramName = param.name;
      } else if (param.type === "AssignmentPattern" && param.left.type === "Identifier") {
        paramName = param.left.name;
      }

      return config.commentStyle === "jsdoc"
        ? ` * @param {any} ${paramName} - Parameter ${paramName}`
        : `// Param: ${paramName}`;
    })
    .join("\n");

  if (config.commentStyle === "jsdoc") {
    return `/**
   * ${name} - Function to perform its intended operation.
  ${params}
   * @returns {any} Result of the function.
   */`;
  }

  return `// ${name}: Function to perform its intended operation.\n${params}`;
}

// Generate inline comment for JavaScript variable (esprima)
function generateEsprimaVariableComment(node, config) {
  const varName = node.declarations[0].id.name;
  return `// ${varName}: Stores relevant data for the operation.`;
}

// Export main function
module.exports = { generateComments };
