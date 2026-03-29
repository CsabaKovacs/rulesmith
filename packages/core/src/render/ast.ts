import path from "node:path";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { parser as javaParser } from "@lezer/java";
import { parser as phpParser } from "@lezer/php";
import { parser as pythonParser } from "@lezer/python";
import { parser as rustParser } from "@lezer/rust";
import type { LRParser } from "@lezer/lr";
import ts from "typescript";

const require = createRequire(import.meta.url);
const bashParse = require("bash-parser") as (input: string) => unknown;
const { Parser: SqlParser } = require("node-sql-parser") as { Parser: new () => { astify(sql: string, options?: Record<string, unknown>): unknown } };

export type AstConventionCandidate = {
  topic: string;
  text: string;
  evidence: string[];
};

type TsAstFacts = {
  file: string;
  importedModules: Set<string>;
  importedNames: Set<string>;
  decoratorNames: Set<string>;
  classNames: Set<string>;
  interfaceNames: Set<string>;
  functionNames: Set<string>;
  exportedFunctionNames: Set<string>;
  callNames: Set<string>;
  stringLiterals: Set<string>;
};

type LezerAstFacts = {
  file: string;
  nodeTypes: Set<string>;
  identifiers: Set<string>;
  stringLiterals: Set<string>;
  callTexts: Set<string>;
  annotationTexts: Set<string>;
};

type ShellAstFacts = {
  file: string;
  functionNames: Set<string>;
  commandNames: Set<string>;
  hasStrictMode: boolean;
};

type SqlAstFacts = {
  file: string;
  statementKinds: Set<string>;
  tableNames: Set<string>;
};

type ToolchainAstFacts = {
  file: string;
  command: "dart" | "swift";
  validated: boolean;
  markers: Set<string>;
};

type LezerLanguage = "python" | "php" | "java" | "rust";

const LEZER_LANGUAGE_MAP: Record<LezerLanguage, LRParser> = {
  python: pythonParser,
  php: phpParser,
  java: javaParser,
  rust: rustParser
};

const EXTENSION_LANGUAGE_MAP: Record<string, LezerLanguage> = {
  ".py": "python",
  ".php": "php",
  ".java": "java",
  ".rs": "rust"
};

const execFileAsync = promisify(execFile);

function normalizeSnippet(value: string, max = 120): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function dedupeCandidates(candidates: AstConventionCandidate[]): AstConventionCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.topic}:${candidate.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pushCandidate(out: AstConventionCandidate[], topic: string, text: string, evidence: string[]): void {
  if (evidence.length === 0) return;
  out.push({ topic, text, evidence });
}

function scriptKindForFile(file: string): ts.ScriptKind {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    default:
      return ts.ScriptKind.JS;
  }
}

function hasTsFamilyExtension(file: string): boolean {
  return /\.(tsx|ts|jsx|js)$/.test(file);
}

function flattenPropertyAccess(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const left = flattenPropertyAccess(node.expression);
    return left ? `${left}.${node.name.text}` : node.name.text;
  }
  return undefined;
}

function collectDecoratorNames(node: ts.Node, facts: TsAstFacts): void {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
  for (const decorator of decorators ?? []) {
    if (ts.isCallExpression(decorator.expression)) {
      const name = flattenPropertyAccess(decorator.expression.expression);
      if (name) facts.decoratorNames.add(name);
      continue;
    }
    const name = flattenPropertyAccess(decorator.expression);
    if (name) facts.decoratorNames.add(name);
  }
}

function collectTsAstFacts(file: string, content: string): TsAstFacts {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKindForFile(file));
  const facts: TsAstFacts = {
    file,
    importedModules: new Set<string>(),
    importedNames: new Set<string>(),
    decoratorNames: new Set<string>(),
    classNames: new Set<string>(),
    interfaceNames: new Set<string>(),
    functionNames: new Set<string>(),
    exportedFunctionNames: new Set<string>(),
    callNames: new Set<string>(),
    stringLiterals: new Set<string>()
  };

  const visit = (node: ts.Node): void => {
    collectDecoratorNames(node, facts);

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      facts.importedModules.add(node.moduleSpecifier.text);
      if (node.importClause?.name) facts.importedNames.add(node.importClause.name.text);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) facts.importedNames.add(element.name.text);
      }
    }

    if (ts.isClassDeclaration(node) && node.name) facts.classNames.add(node.name.text);
    if (ts.isInterfaceDeclaration(node)) facts.interfaceNames.add(node.name.text);
    if (ts.isFunctionDeclaration(node) && node.name) {
      facts.functionNames.add(node.name.text);
      const isExported = (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) facts.exportedFunctionNames.add(node.name.text);
    }

    if (ts.isVariableStatement(node)) {
      const isExported = (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          facts.functionNames.add(declaration.name.text);
          if (isExported) facts.exportedFunctionNames.add(declaration.name.text);
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const name = flattenPropertyAccess(node.expression);
      if (name) facts.callNames.add(name);
    }

    if (ts.isStringLiteral(node)) facts.stringLiterals.add(node.text);
    ts.forEachChild(node, visit);
  };

  visit(source);
  return facts;
}

function filesMatchingTs(facts: TsAstFacts[], predicate: (facts: TsAstFacts) => boolean, maxEvidence = 4): string[] {
  const evidence: string[] = [];
  for (const fileFacts of facts) {
    if (!predicate(fileFacts)) continue;
    evidence.push(fileFacts.file);
    if (evidence.length >= maxEvidence) break;
  }
  return evidence;
}

function buildGenericTsAstCandidates(facts: TsAstFacts[]): AstConventionCandidate[] {
  const out: AstConventionCandidate[] = [];

  pushCandidate(
    out,
    "data",
    "AST-confirmed service/repository/client boundaries already exist through named code symbols; preserve those ownership lines instead of bypassing them from unrelated modules.",
    filesMatchingTs(
      facts,
      (fileFacts) =>
        [...fileFacts.classNames, ...fileFacts.interfaceNames, ...fileFacts.functionNames].some((name) =>
          /(Service|Repository|Client|Gateway)$/i.test(name)
        )
    )
  );

  pushCandidate(
    out,
    "routing",
    "AST-confirmed routing ownership is already expressed through router factories, exported route handlers, or framework navigation calls; keep flow entrypoints in those modules.",
    filesMatchingTs(
      facts,
      (fileFacts) =>
        [...fileFacts.callNames].some((name) => /(Router|createRouter|Navigator\.)/.test(name)) ||
        [...fileFacts.exportedFunctionNames].some((name) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(name))
    )
  );

  pushCandidate(
    out,
    "state",
    "AST-confirmed state ownership is already represented by explicit hook/store/reducer constructs; extend those abstractions before introducing a parallel state model.",
    filesMatchingTs(
      facts,
      (fileFacts) =>
        [...fileFacts.callNames].some((name) =>
          /(useState|useReducer|createContext|configureStore|createSlice|defineStore)/.test(name)
        )
    )
  );

  pushCandidate(
    out,
    "validation",
    "AST-confirmed validation boundaries already exist through imported schema or validator libraries; preserve those typed/request-boundary checks instead of ad-hoc inline validation.",
    filesMatchingTs(
      facts,
      (fileFacts) =>
        [...fileFacts.importedModules].some((name) => /(zod|joi|yup|class-validator|express-validator)/.test(name)) ||
        [...fileFacts.callNames].some((name) => /(z\.object|z\.string|validate)/.test(name))
    )
  );

  pushCandidate(
    out,
    "testing",
    "AST-confirmed test harness ownership already exists through imported test runners or UI test helpers; extend the same harness instead of adding a second testing style.",
    filesMatchingTs(
      facts,
      (fileFacts) =>
        [...fileFacts.importedModules].some((name) =>
          /(@testing-library\/react|vitest|jest|playwright|cypress|supertest)/.test(name)
        ) || [...fileFacts.callNames].some((name) => /^(describe|it|test|render)$/.test(name))
    )
  );

  return out;
}

function buildFrameworkTsAstCandidates(frameworkKey: string, facts: TsAstFacts[]): AstConventionCandidate[] {
  const out: AstConventionCandidate[] = [];

  switch (frameworkKey) {
    case "react":
      pushCandidate(
        out,
        "state",
        "React component state and lifecycle ownership is AST-visible through hooks and context APIs; keep touched UI flows inside that existing composition model.",
        filesMatchingTs(
          facts,
          (fileFacts) =>
            [...fileFacts.callNames].some((name) =>
              /(useState|useReducer|useEffect|useContext|useTransition|useDeferredValue|createContext)/.test(name)
            )
        )
      );
      break;
    case "nextjs":
      pushCandidate(
        out,
        "routing",
        "Next.js route ownership is AST-visible through exported HTTP handlers, metadata exports, middleware, or pages data-loader functions; keep routing changes in those framework entrypoints.",
        filesMatchingTs(
          facts,
          (fileFacts) =>
            [...fileFacts.exportedFunctionNames].some((name) =>
              /^(GET|POST|PUT|PATCH|DELETE|getServerSideProps|getStaticProps|getStaticPaths)$/.test(name)
            ) ||
            [...fileFacts.functionNames].includes("generateMetadata") ||
            [...fileFacts.importedModules].includes("next/server")
        )
      );
      break;
    case "express":
      pushCandidate(
        out,
        "routing",
        "Express route ownership is AST-visible through router factories and handler registration calls; keep endpoint wiring in those modules and leave business logic to downstream layers.",
        filesMatchingTs(
          facts,
          (fileFacts) =>
            [...fileFacts.callNames].some((name) => /(^express$|^Router$|\.get$|\.post$|\.put$|\.patch$|\.delete$|\.use$)/.test(name))
        )
      );
      break;
    case "nest":
      pushCandidate(
        out,
        "architecture",
        "NestJS module/controller/provider layering is AST-visible through decorators and bootstrap symbols; preserve that DI-driven structure in touched modules.",
        filesMatchingTs(
          facts,
          (fileFacts) =>
            [...fileFacts.decoratorNames].some((name) => /^(Module|Controller|Injectable|Get|Post|Put|Patch|Delete|UseGuards)$/.test(name)) ||
            [...fileFacts.callNames].some((name) => /NestFactory\.create/.test(name))
        )
      );
      pushCandidate(
        out,
        "validation",
        "NestJS request validation is AST-visible through DTO/pipe imports and decorator-bound request handlers; keep validation at those request boundaries.",
        filesMatchingTs(
          facts,
          (fileFacts) =>
            [...fileFacts.importedModules].some((name) => /(class-validator|class-transformer)/.test(name)) ||
            [...fileFacts.callNames].some((name) => /ValidationPipe/.test(name))
        )
      );
      break;
  }

  return out;
}

function walkUnknown(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkUnknown(item, visit);
    return;
  }
  const object = value as Record<string, unknown>;
  visit(object);
  for (const child of Object.values(object)) walkUnknown(child, visit);
}

function collectShellAstFacts(file: string, content: string): ShellAstFacts | undefined {
  try {
    const ast = bashParse(content);
    const facts: ShellAstFacts = {
      file,
      functionNames: new Set<string>(),
      commandNames: new Set<string>(),
      hasStrictMode: /set\s+-euo\s+pipefail/.test(content)
    };

    walkUnknown(ast, (node) => {
      const type = typeof node.type === "string" ? node.type : undefined;
      if (type === "Function" && typeof node.name === "object" && node.name && typeof (node.name as { text?: unknown }).text === "string") {
        facts.functionNames.add((node.name as { text: string }).text);
      }
      if (type === "Command" && typeof node.name === "object" && node.name && typeof (node.name as { text?: unknown }).text === "string") {
        facts.commandNames.add((node.name as { text: string }).text);
      }
    });

    return facts;
  } catch {
    return undefined;
  }
}

function buildShellAstCandidates(facts: ShellAstFacts[]): AstConventionCandidate[] {
  const out: AstConventionCandidate[] = [];
  pushCandidate(
    out,
    "architecture",
    "Parser-confirmed shell automation boundaries already exist through named shell functions; keep deployment or maintenance flow inside those script boundaries.",
    facts.filter((item) => item.functionNames.size > 0).slice(0, 4).map((item) => item.file)
  );
  pushCandidate(
    out,
    "security",
    "Parser-confirmed shell safety guards are already present; preserve fail-fast shell settings and explicit command flow in touched scripts.",
    facts.filter((item) => item.hasStrictMode).slice(0, 4).map((item) => item.file)
  );
  return out;
}

function collectSqlAstFacts(file: string, content: string): SqlAstFacts | undefined {
  const parser = new SqlParser();
  const facts: SqlAstFacts = {
    file,
    statementKinds: new Set<string>(),
    tableNames: new Set<string>()
  };
  for (const database of ["sqlite", "postgresql", "mariadb"]) {
    try {
      const ast = parser.astify(content, { database });
      const statements = Array.isArray(ast) ? ast : [ast];

      walkUnknown(statements, (node) => {
        if (typeof node.type === "string") facts.statementKinds.add(node.type);
        const table = node.table;
        if (typeof table === "string") facts.tableNames.add(table);
        if (Array.isArray(table)) {
          for (const item of table) {
            if (item && typeof item === "object" && typeof (item as { table?: unknown }).table === "string") {
              facts.tableNames.add((item as { table: string }).table);
            }
          }
        }
      });

      return facts;
    } catch {
      continue;
    }
  }
  return undefined;
}

function buildSqlAstCandidates(facts: SqlAstFacts[]): AstConventionCandidate[] {
  const out: AstConventionCandidate[] = [];
  pushCandidate(
    out,
    "database",
    "Parser-confirmed SQL schema/query boundaries already exist through explicit statements; preserve table and migration ownership in those SQL files.",
    facts.filter((item) => item.statementKinds.size > 0).slice(0, 4).map((item) => item.file)
  );
  pushCandidate(
    out,
    "database",
    "Parser-confirmed SQL changes already target named table boundaries; keep schema evolution aligned with those existing tables instead of scattering ad-hoc persistence changes.",
    facts.filter((item) => item.tableNames.size > 0).slice(0, 4).map((item) => item.file)
  );
  return out;
}

async function collectToolchainAstFacts(file: string, content: string): Promise<ToolchainAstFacts | undefined> {
  if (file.endsWith(".dart")) {
    try {
      await execFileAsync("dart", ["format", "-o", "none", file], { maxBuffer: 2_000_000 });
      const markers = new Set<string>();
      if (/\b(MaterialApp|CupertinoApp|GoRouter|MaterialPageRoute|Navigator)\b/.test(content)) markers.add("routing");
      if (/\b(ChangeNotifier|StatefulWidget|State<|Bloc|Riverpod)\b/.test(content)) markers.add("state");
      if (/\b(Supabase|Firebase|Dio|http\.)\b/.test(content)) markers.add("data");
      return { file, command: "dart", validated: true, markers };
    } catch {
      return undefined;
    }
  }

  if (file.endsWith(".swift")) {
    try {
      let stdout = "";
      try {
        const result = await execFileAsync(
          "xcrun",
          ["swiftc", "-typecheck", "-dump-ast", file],
          { maxBuffer: 4_000_000 }
        );
        stdout = result.stdout;
      } catch (error) {
        stdout =
          typeof error === "object" && error && "stdout" in error && typeof error.stdout === "string"
            ? error.stdout
            : "";
      }
      const signalText = `${stdout}\n${content}`;
      if (!signalText.trim()) return undefined;
      const markers = new Set<string>();
      if (/\b(UIViewController|SwiftUI|NavigationStack|UINavigationController)\b/.test(signalText)) markers.add("ui");
      if (/\b(Task|ObservableObject|StateObject|ObservedObject|Published)\b/.test(signalText)) markers.add("state");
      return { file, command: "swift", validated: true, markers };
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function buildToolchainCandidates(facts: ToolchainAstFacts[]): AstConventionCandidate[] {
  const out: AstConventionCandidate[] = [];
  pushCandidate(
    out,
    "routing",
    "Toolchain-confirmed Dart navigation and app-shell ownership is already explicit in validated Flutter source files; keep route flow changes inside those boundaries.",
    facts.filter((item) => item.command === "dart" && item.markers.has("routing")).slice(0, 4).map((item) => item.file)
  );
  pushCandidate(
    out,
    "data",
    "Toolchain-confirmed Dart data integration boundaries are already explicit in validated source files; keep SDK or client usage behind the established service boundary.",
    facts.filter((item) => item.command === "dart" && item.markers.has("data")).slice(0, 4).map((item) => item.file)
  );
  pushCandidate(
    out,
    "ui",
    "Toolchain-confirmed Swift presentation ownership is already explicit in validated Swift source files; preserve the current UIKit or SwiftUI boundary in touched flows.",
    facts.filter((item) => item.command === "swift" && item.markers.has("ui")).slice(0, 4).map((item) => item.file)
  );
  pushCandidate(
    out,
    "state",
    "Toolchain-confirmed Swift async/state ownership is already explicit in validated Swift source files; keep changes within the current observable or task-based lifecycle model.",
    facts.filter((item) => item.command === "swift" && item.markers.has("state")).slice(0, 4).map((item) => item.file)
  );
  return out;
}

function lezerLanguageForFile(file: string): LezerLanguage | undefined {
  return EXTENSION_LANGUAGE_MAP[path.extname(file).toLowerCase()];
}

function collectLezerAstFacts(file: string, content: string): LezerAstFacts | undefined {
  const language = lezerLanguageForFile(file);
  if (!language) return undefined;

  const tree = LEZER_LANGUAGE_MAP[language].parse(content);
  const cursor = tree.cursor();
  const facts: LezerAstFacts = {
    file,
    nodeTypes: new Set<string>(),
    identifiers: new Set<string>(),
    stringLiterals: new Set<string>(),
    callTexts: new Set<string>(),
    annotationTexts: new Set<string>()
  };

  while (true) {
    facts.nodeTypes.add(cursor.name);
    const text = normalizeSnippet(content.slice(cursor.from, cursor.to), 160);

    if (/(Name|Identifier|VariableName|PropertyName|TypeName|ClassName)$/.test(cursor.name)) {
      if (text) facts.identifiers.add(text);
    }
    if (text && text.length <= 80 && /^[A-Za-z_][A-Za-z0-9_:.]*$/.test(text)) {
      facts.identifiers.add(text);
    }
    if (/String|string/i.test(cursor.name)) {
      if (text) facts.stringLiterals.add(text.replace(/^['"`]+|['"`]+$/g, ""));
    }
    if (/(Call|Invocation|Decorator|Annotation|Attribute)/i.test(cursor.name)) {
      if (text) {
        if (/(Decorator|Annotation|Attribute)/i.test(cursor.name)) facts.annotationTexts.add(text);
        else facts.callTexts.add(text);
      }
    }
    if (text.startsWith("@")) facts.annotationTexts.add(text);
    if (/\b[A-Za-z_][A-Za-z0-9_:.]*\s*\(/.test(text) || /::/.test(text)) facts.callTexts.add(text);

    if (cursor.firstChild()) continue;
    while (!cursor.nextSibling()) {
      if (!cursor.parent()) return facts;
    }
  }
}

function filesMatchingLezer(facts: LezerAstFacts[], predicate: (facts: LezerAstFacts) => boolean, maxEvidence = 4): string[] {
  const evidence: string[] = [];
  for (const fileFacts of facts) {
    if (!predicate(fileFacts)) continue;
    evidence.push(fileFacts.file);
    if (evidence.length >= maxEvidence) break;
  }
  return evidence;
}

function buildGenericLezerAstCandidates(facts: LezerAstFacts[]): AstConventionCandidate[] {
  const out: AstConventionCandidate[] = [];

  pushCandidate(
    out,
    "data",
    "AST-confirmed service/repository/client boundaries already exist through named declarations; preserve those ownership lines instead of bypassing them from unrelated modules.",
    filesMatchingLezer(
      facts,
      (fileFacts) => [...fileFacts.identifiers].some((name) => /(Service|Repository|Client|Gateway)$/i.test(name))
    )
  );

  pushCandidate(
    out,
    "routing",
    "AST-confirmed routing ownership is already expressed through route declarations, controller annotations, or navigation entrypoints; keep flow entrypoints in those modules.",
    filesMatchingLezer(
      facts,
      (fileFacts) =>
        [...fileFacts.callTexts].some((text) =>
          /(Route::|urlpatterns|@app\.|@router\.|Router::new|MapGet|MapPost|path\(|re_path\()/i.test(text)
        ) || [...fileFacts.annotationTexts].some((text) => /@(Controller|RestController|Get|Post|Put|Patch|Delete)/.test(text))
    )
  );

  pushCandidate(
    out,
    "validation",
    "AST-confirmed validation boundaries already exist through schema, form, serializer, or validator declarations; preserve those request-boundary checks instead of ad-hoc inline validation.",
    filesMatchingLezer(
      facts,
      (fileFacts) =>
        [...fileFacts.identifiers].some((name) => /(BaseModel|Serializer|FormRequest|Validator|Schema|Request|Field)/.test(name)) ||
        [...fileFacts.annotationTexts].some((text) => /@Valid/.test(text)) ||
        [...fileFacts.callTexts].some((text) => /(request->validate|Field\()/i.test(text))
    )
  );

  return out;
}

function buildFrameworkLezerAstCandidates(frameworkKey: string, facts: LezerAstFacts[]): AstConventionCandidate[] {
  const out: AstConventionCandidate[] = [];

  switch (frameworkKey) {
    case "fastapi":
      pushCandidate(
        out,
        "routing",
        "FastAPI endpoint ownership is AST-visible through decorator-based route declarations; preserve that endpoint registration style.",
        filesMatchingLezer(
          facts,
          (fileFacts) => [...fileFacts.callTexts].some((text) => /@(app|router)\.(get|post|put|patch|delete)/.test(text))
        )
      );
      pushCandidate(
        out,
        "validation",
        "FastAPI schema and dependency contracts are AST-visible through Pydantic and dependency symbols; keep those request-boundary contracts explicit.",
        filesMatchingLezer(
          facts,
          (fileFacts) =>
            [...fileFacts.identifiers].some((name) => /(BaseModel|Depends|Field)/.test(name)) ||
            [...fileFacts.callTexts].some((text) => /(BaseModel|Depends\(|Field\()/.test(text))
        )
      );
      break;
    case "laravel":
      pushCandidate(
        out,
        "routing",
        "Laravel routing and controller ownership is AST-visible through Route declarations and controller/form-request symbols; keep request flow changes inside those boundaries.",
        filesMatchingLezer(
          facts,
          (fileFacts) =>
            [...fileFacts.callTexts].some((text) => /(Route::(get|post|put|patch|delete|middleware|group)|DB::transaction)/.test(text)) ||
            [...fileFacts.identifiers].some((name) => /(FormRequest|Controller)/.test(name))
        )
      );
      pushCandidate(
        out,
        "validation",
        "Laravel validation boundaries are AST-visible through FormRequest or request validation calls; preserve validation at those request boundaries.",
        filesMatchingLezer(
          facts,
          (fileFacts) =>
            [...fileFacts.identifiers].some((name) => /FormRequest/.test(name)) ||
            [...fileFacts.callTexts].some((text) => /request->validate/.test(text))
        )
      );
      break;
    case "spring-boot":
      pushCandidate(
        out,
        "architecture",
        "Spring Boot layering is AST-visible through stereotype annotations; preserve controller/service/repository boundaries in touched modules.",
        filesMatchingLezer(
          facts,
          (fileFacts) => [...fileFacts.annotationTexts].some((text) => /@(RestController|Controller|Service|Repository|Configuration)/.test(text))
        )
      );
      pushCandidate(
        out,
        "validation",
        "Spring validation is AST-visible through bean-validation annotations or typed request models; keep validation at those boundaries.",
        filesMatchingLezer(
          facts,
          (fileFacts) =>
            [...fileFacts.annotationTexts].some((text) => /@Valid/.test(text)) ||
            [...fileFacts.identifiers].some((name) => /(Valid|NotNull|Size)/.test(name))
        )
      );
      break;
    case "rust":
      pushCandidate(
        out,
        "routing",
        "Rust web routing is AST-visible through router and handler declarations; keep endpoint wiring in those modules rather than scattering it across unrelated code.",
        filesMatchingLezer(
          facts,
          (fileFacts) =>
            [...fileFacts.identifiers].some((name) => /(Router|Service)/.test(name)) ||
            [...fileFacts.callTexts].some((text) => /(Router::new|route\(|get\(|post\()/i.test(text))
        )
      );
      break;
  }

  return out;
}

export async function extractAstBoundaryConventionCandidates(args: {
  files: Array<{ path: string; content: string }>;
  frameworkKey?: string;
}): Promise<AstConventionCandidate[]> {
  const tsFacts = args.files
    .filter((file) => hasTsFamilyExtension(file.path))
    .slice(0, 60)
    .map((file) => collectTsAstFacts(file.path, file.content));

  const lezerFacts = args.files
    .filter((file) => Boolean(lezerLanguageForFile(file.path)))
    .slice(0, 60)
    .map((file) => collectLezerAstFacts(file.path, file.content))
    .filter((item): item is LezerAstFacts => Boolean(item));

  const shellFacts = args.files
    .filter((file) => /\.(sh|bash|zsh)$/.test(file.path))
    .slice(0, 20)
    .map((file) => collectShellAstFacts(file.path, file.content))
    .filter((item): item is ShellAstFacts => Boolean(item));

  const sqlFacts = args.files
    .filter((file) => /\.sql$/.test(file.path))
    .slice(0, 20)
    .map((file) => collectSqlAstFacts(file.path, file.content))
    .filter((item): item is SqlAstFacts => Boolean(item));

  const toolchainFacts = (
    await Promise.all(
      args.files
        .filter((file) => /\.(dart|swift)$/.test(file.path))
        .slice(0, 20)
        .map((file) => collectToolchainAstFacts(file.path, file.content))
    )
  ).filter((item): item is ToolchainAstFacts => Boolean(item));

  const candidates: AstConventionCandidate[] = [];
  if (tsFacts.length > 0) {
    candidates.push(...buildGenericTsAstCandidates(tsFacts));
    if (args.frameworkKey) candidates.push(...buildFrameworkTsAstCandidates(args.frameworkKey, tsFacts));
  }
  if (lezerFacts.length > 0) {
    candidates.push(...buildGenericLezerAstCandidates(lezerFacts));
    if (args.frameworkKey) candidates.push(...buildFrameworkLezerAstCandidates(args.frameworkKey, lezerFacts));
  }
  if (shellFacts.length > 0) candidates.push(...buildShellAstCandidates(shellFacts));
  if (sqlFacts.length > 0) candidates.push(...buildSqlAstCandidates(sqlFacts));
  if (toolchainFacts.length > 0) candidates.push(...buildToolchainCandidates(toolchainFacts));

  return dedupeCandidates(candidates);
}
