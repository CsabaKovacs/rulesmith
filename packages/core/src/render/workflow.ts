/**
 * Agent Workflow Spec — capability-adaptive agent workflow generation.
 *
 * Produces a platform-independent workflow specification from a ProjectProfile,
 * then the render pipeline maps it to platform-specific outputs:
 * - Claude: .claude/agents/*.md subagent files
 * - Others: inline workflow sections in their instruction files
 */

import type { ProjectProfile } from "../profile/schema.js";

/* ------------------------------------------------------------------ */
/*  Schema                                                            */
/* ------------------------------------------------------------------ */

export type AgentRole = {
  /** Machine identifier, e.g. "code-reviewer" */
  id: string;
  /** Human-readable name shown in agent frontmatter */
  name: string;
  /** One-line purpose */
  description: string;
  /** When this agent should activate */
  triggerConditions: string[];
  /** Ordered methodology steps */
  methodology: string[];
  /** Stack-specific rules injected from profile */
  stackRules: string[];
  /** What this agent must NOT do */
  boundaries: string[];
};

export type WorkflowStep = {
  /** Step order (1-based) */
  order: number;
  /** What happens at this step */
  action: string;
  /** Which agent role performs it ("self" = main AI) */
  actor: string;
  /** Condition for running this step (undefined = always) */
  condition?: string;
};

export type AgentWorkflowSpec = {
  /** Workflow steps executed after code changes */
  postChangeWorkflow: WorkflowStep[];
  /** Agent role definitions */
  agents: AgentRole[];
  /** Build/test/lint commands for verification steps */
  verifyCommands: {
    test?: string;
    lint?: string;
    build?: string;
    format?: string;
  };
};

/* ------------------------------------------------------------------ */
/*  Builder                                                           */
/* ------------------------------------------------------------------ */

type StackRules = {
  codeReviewRules: string[];
  securityReviewRules: string[];
  simplifierRules: string[];
  testGuardRules: string[];
};

function buildStackRules(profile: ProjectProfile): StackRules {
  const codeReviewRules: string[] = [];
  const securityReviewRules: string[] = [];
  const simplifierRules: string[] = [];
  const testGuardRules: string[] = [];

  for (const lang of profile.languages) {
    if (lang.confidence < 0.4) continue;
    switch (lang.name) {
      case "php":
        codeReviewRules.push("Enforce PSR-12 coding standards and consistent type declarations.");
        securityReviewRules.push("Check for SQL injection via raw queries, XSS in Blade templates, and mass-assignment vulnerabilities.");
        simplifierRules.push("Consolidate repeated array/collection transformations into pipeline-style chains.");
        simplifierRules.push("Replace verbose if/else type-check blocks with match expressions (PHP 8+).");
        testGuardRules.push("PHPUnit is the expected test runner; check for `tests/` or `phpunit.xml`.");
        break;
      case "typescript":
      case "javascript":
        codeReviewRules.push("Enforce strict TypeScript usage where applicable; flag `any` types and missing return types on public APIs.");
        securityReviewRules.push("Check for prototype pollution, unsafe `eval`/`innerHTML`, and missing input sanitization.");
        simplifierRules.push("Replace verbose promise chains with async/await where it improves readability.");
        simplifierRules.push("Consolidate repeated type assertions into a single type guard function.");
        simplifierRules.push("Prefer `Array.method()` chains over manual for-loops when intent is clearer.");
        testGuardRules.push("Check for vitest, jest, or mocha test files matching changed modules.");
        testGuardRules.push("Exported function signature changes require corresponding test updates.");
        break;
      case "python":
        codeReviewRules.push("Enforce type hints on public functions and consistent import ordering.");
        securityReviewRules.push("Check for SQL injection via string formatting, SSRF in HTTP calls, and unsafe pickle/eval usage.");
        simplifierRules.push("Replace verbose loops with list/dict comprehensions where intent is clear.");
        simplifierRules.push("Consolidate repeated try/except blocks into context managers or decorator patterns.");
        testGuardRules.push("Check for pytest or unittest files in `tests/` matching changed modules.");
        break;
      case "go":
        codeReviewRules.push("Enforce explicit error handling (no silently discarded errors) and gofmt compliance.");
        securityReviewRules.push("Check for path traversal, unsafe template rendering, and unchecked type assertions.");
        simplifierRules.push("Replace verbose error-wrapping chains with `fmt.Errorf` with `%w` verb.");
        simplifierRules.push("Consolidate repeated nil-check-then-return patterns into helper functions only when 3+ occurrences exist.");
        testGuardRules.push("Check for `_test.go` files matching changed packages.");
        break;
      case "java":
      case "kotlin":
        codeReviewRules.push("Enforce consistent null-safety patterns and SOLID principles.");
        securityReviewRules.push("Check for deserialization vulnerabilities, SQL injection, and insecure random number generation.");
        simplifierRules.push("Replace verbose anonymous classes with lambdas where applicable.");
        simplifierRules.push("Consolidate repeated stream pipeline patterns into reusable collector utilities only when stable.");
        testGuardRules.push("Check for JUnit/TestNG test classes matching changed source files.");
        break;
      case "ruby":
        codeReviewRules.push("Enforce consistent method visibility and Rails conventions where applicable.");
        securityReviewRules.push("Check for mass-assignment, SQL injection via string interpolation, and command injection.");
        simplifierRules.push("Replace verbose conditionals with guard clauses and early returns.");
        testGuardRules.push("Check for RSpec/Minitest specs matching changed files.");
        break;
      case "dart":
        codeReviewRules.push("Enforce null-safety, consistent widget decomposition, and flutter analyze compliance.");
        securityReviewRules.push("Check for insecure storage of sensitive data and unsafe platform channel usage.");
        simplifierRules.push("Extract deeply nested widget trees into named widget classes when nesting exceeds 4 levels.");
        simplifierRules.push("Replace verbose null-check chains with cascade operators and null-aware operators.");
        testGuardRules.push("Check for widget tests and unit tests in `test/` matching changed lib files.");
        break;
      case "rust":
        codeReviewRules.push("Flag unnecessary `unsafe` blocks and ensure proper error propagation with `?` operator.");
        securityReviewRules.push("Check for unsafe memory access patterns, unchecked FFI boundaries, and panic in library code.");
        simplifierRules.push("Replace verbose match arms with `if let` or `let-else` where only one variant is handled.");
        simplifierRules.push("Consolidate repeated `.unwrap()` calls into proper `?` propagation.");
        testGuardRules.push("Check for `#[test]` functions in same module or `tests/` directory.");
        break;
    }
  }

  for (const fw of profile.frameworks) {
    if (fw.confidence < 0.4) continue;
    switch (fw.name) {
      case "laravel":
        codeReviewRules.push("Verify FormRequest usage for validation, proper service/action boundaries, and no business logic in controllers.");
        securityReviewRules.push("Verify middleware auth guards, CSRF protection, and proper use of Eloquent parameterized queries.");
        simplifierRules.push("Replace raw DB queries with Eloquent builder chains where intent is clearer.");
        simplifierRules.push("Consolidate repeated validation logic into FormRequest classes.");
        testGuardRules.push("Route/controller changes need feature test coverage; model changes need unit tests.");
        testGuardRules.push("Auth/permission middleware changes require regression test verification.");
        break;
      case "nextjs":
      case "react":
        codeReviewRules.push("Check for proper component decomposition, hook dependencies, and server/client boundary correctness.");
        securityReviewRules.push("Check for dangerouslySetInnerHTML usage, exposed API keys in client bundles, and SSRF in API routes.");
        simplifierRules.push("Extract repeated JSX patterns into small, focused components.");
        simplifierRules.push("Replace prop drilling through 3+ levels with context or composition patterns.");
        simplifierRules.push("Consolidate redundant useEffect chains into a single effect or custom hook.");
        testGuardRules.push("Component changes need rendering test updates; API route changes need integration tests.");
        break;
      case "express":
      case "node":
        codeReviewRules.push("Verify proper middleware ordering, async error handling, and consistent response patterns.");
        securityReviewRules.push("Check for missing helmet/CORS configuration, path traversal in file serving, and NoSQL injection.");
        simplifierRules.push("Consolidate repeated request validation into shared middleware.");
        simplifierRules.push("Replace nested callback-style error handling with async/await + centralized error handler.");
        testGuardRules.push("Route handler changes need integration test coverage; middleware changes need unit tests.");
        break;
      case "django":
        codeReviewRules.push("Verify proper use of Django ORM, class-based view patterns, and form validation.");
        securityReviewRules.push("Check for raw SQL queries, CSRF exemptions, and improper permission decorators.");
        simplifierRules.push("Replace repeated queryset filtering with custom manager methods.");
        testGuardRules.push("View changes need view test coverage; model changes need model test updates.");
        break;
      case "flutter":
        codeReviewRules.push("Verify proper state management patterns and widget tree efficiency.");
        simplifierRules.push("Extract repeated widget subtrees into stateless widget classes.");
        simplifierRules.push("Replace verbose setState calls with appropriate state management patterns.");
        testGuardRules.push("Widget changes need widget test coverage; state logic needs unit tests.");
        break;
      case "rails":
        codeReviewRules.push("Verify MVC boundaries, proper use of concerns, and ActiveRecord query patterns.");
        securityReviewRules.push("Check for mass-assignment, unscoped finds, and missing authentication before_actions.");
        simplifierRules.push("Replace repeated scope chains with named scopes on the model.");
        testGuardRules.push("Controller changes need request spec coverage; model changes need model spec updates.");
        break;
    }
  }

  if (codeReviewRules.length === 0) {
    codeReviewRules.push("Check for naming consistency, DRY violations, and unnecessary complexity.");
  }
  if (securityReviewRules.length === 0) {
    securityReviewRules.push("Check for common OWASP Top 10 vulnerabilities relevant to the detected stack.");
  }
  if (simplifierRules.length === 0) {
    simplifierRules.push("Look for verbose control flow that can be simplified without changing behavior.");
    simplifierRules.push("Consolidate repeated patterns only when 3+ concrete occurrences exist.");
  }
  if (testGuardRules.length === 0) {
    testGuardRules.push("Check for test files matching changed source modules.");
    testGuardRules.push("Public API changes require corresponding test updates.");
  }

  return { codeReviewRules, securityReviewRules, simplifierRules, testGuardRules };
}

export function buildAgentWorkflowSpec(profile: ProjectProfile): AgentWorkflowSpec {
  const { codeReviewRules, securityReviewRules, simplifierRules, testGuardRules } = buildStackRules(profile);

  const codeReviewer: AgentRole = {
    id: "code-reviewer",
    name: "Code Quality Reviewer",
    description: "Reviews changed files for code quality, convention adherence, and maintainability.",
    triggerConditions: [
      "After ANY code modification that affects application logic, architecture, data flow, or reusable components.",
      "Skip ONLY for documentation-only, config-only, or trivial text changes."
    ],
    methodology: [
      "Identify all changed files and understand the scope of the modification.",
      "Check adherence to project conventions defined in the rulebook.",
      "Evaluate naming consistency, readability, and pattern conformance.",
      "Flag unnecessary complexity, duplication, or DRY violations.",
      "Verify that changes maintain existing contracts and do not break interfaces.",
      "Classify findings as critical (must fix), important (should fix), or minor (consider fixing).",
      "Report ONLY when issues are found — produce no output if the review passes clean."
    ],
    stackRules: codeReviewRules,
    boundaries: [
      "Do NOT automatically apply fixes — report findings for the orchestrator to handle.",
      "Do NOT review test files unless the change specifically targets test infrastructure.",
      "Ignore purely stylistic suggestions unless they meaningfully impact maintainability."
    ]
  };

  const securityReviewer: AgentRole = {
    id: "security-reviewer",
    name: "Security Reviewer",
    description: "Reviews changed files for security vulnerabilities and unsafe patterns.",
    triggerConditions: [
      "When changes touch: request/input handling, authentication or authorization, database queries or persistence, file upload or access, HTML rendering or user-generated content, external API calls or webhooks, or secrets/tokens/sensitive data.",
      "Skip when changes are purely internal logic with no external surface."
    ],
    methodology: [
      "Identify security-relevant changes in the diff.",
      "Check for injection risks (SQL, XSS, command injection, LDAP, etc.).",
      "Verify access control: authentication guards, authorization checks, CSRF protection.",
      "Check for sensitive data exposure in logs, responses, or client bundles.",
      "Evaluate input validation completeness at system boundaries.",
      "Check for unsafe defaults, missing security headers, or insecure configurations.",
      "Classify findings as critical (block merge), important (fix before deploy), or minor (track).",
      "Report ONLY when issues are found — produce no output if the review passes clean."
    ],
    stackRules: securityReviewRules,
    boundaries: [
      "Do NOT apply fixes — security changes require explicit human approval.",
      "Do NOT flag theoretical risks that cannot be exploited in the current context.",
      "Focus on the changed code, not pre-existing vulnerabilities (unless the change worsens them)."
    ]
  };

  const codeSimplifier: AgentRole = {
    id: "code-simplifier",
    name: "Code Simplifier",
    description: "Simplifies recently changed code for clarity and maintainability while preserving external behavior.",
    triggerConditions: [
      "After code modifications that introduce new logic, refactor existing code, or add significant complexity.",
      "Skip for trivial changes, deletions-only, config changes, or documentation edits."
    ],
    methodology: [
      "Identify recently changed functions, classes, and modules.",
      "Look for unnecessarily verbose control flow that can be simplified.",
      "Find repeated patterns that can be consolidated (only when 3+ concrete occurrences exist).",
      "Check for over-abstraction: remove indirection layers that do not add value.",
      "Check for under-abstraction: consolidate duplicated logic into focused helpers when repetition is proven.",
      "Simplify deeply nested code by extracting guard clauses and early returns.",
      "Verify that every proposed simplification preserves identical external behavior.",
      "Prefer clarity over cleverness — readable code beats short code.",
      "Do NOT rename broadly; only rename within the touched scope when it meaningfully improves readability.",
      "Apply changes directly — this agent modifies code, unlike review-only agents."
    ],
    stackRules: simplifierRules,
    boundaries: [
      "NEVER change external behavior, public API contracts, or observable side effects.",
      "Do NOT expand scope beyond the recently changed files.",
      "Do NOT introduce new dependencies or architectural patterns.",
      "Do NOT refactor code that was not part of the recent change.",
      "If unsure whether a simplification preserves behavior, skip it and report it instead."
    ]
  };

  const testGuard: AgentRole = {
    id: "test-guard",
    name: "Test Guard",
    description: "Evaluates test coverage for recent changes, identifies missing tests, and flags regression risks.",
    triggerConditions: [
      "After ANY code modification that changes application logic, adds features, or modifies public interfaces.",
      "Skip for documentation-only, style-only, or config-only changes that do not affect runtime behavior."
    ],
    methodology: [
      "Identify all changed files and the nature of each change (new feature, bug fix, refactor, API change).",
      "For each changed module, check if corresponding test files exist.",
      "Evaluate whether existing tests cover the changed code paths.",
      "Flag missing test coverage: new public functions without tests, changed branches without assertions.",
      "Assess regression risk: changes to shared utilities, auth flows, or data models are high-risk.",
      "Check that test commands are configured and runnable.",
      "Classify findings as: missing (no test exists), incomplete (test exists but doesn't cover change), regression-risk (existing test may break).",
      "Report ONLY when gaps are found — produce no output if coverage is adequate."
    ],
    stackRules: testGuardRules,
    boundaries: [
      "Do NOT write tests — only identify gaps and recommend what should be tested.",
      "Do NOT flag missing tests for trivial getters, configuration, or generated code.",
      "Do NOT require 100% coverage — focus on behavioral contracts and high-risk paths.",
      "Focus on the changed code, not pre-existing coverage gaps."
    ]
  };

  const postChangeWorkflow: WorkflowStep[] = [
    {
      order: 1,
      action: "Run linter to catch style and static analysis issues.",
      actor: "self",
      condition: profile.build.commands.lint ? undefined : "Skip if no lint command is configured."
    },
    {
      order: 2,
      action: "Run code quality review on all changed files.",
      actor: "code-reviewer"
    },
    {
      order: 3,
      action: "Run security review on changed files that touch security-sensitive areas.",
      actor: "security-reviewer",
      condition: "Only when changes touch request handling, auth, database, file access, external APIs, or sensitive data."
    },
    {
      order: 4,
      action: "If any reviewer reports critical findings, fix them before continuing.",
      actor: "self"
    },
    {
      order: 5,
      action: "Run code simplifier on changed files to improve clarity and reduce unnecessary complexity.",
      actor: "code-simplifier",
      condition: "When changes introduce new logic or significant complexity. Skip for trivial or deletion-only changes."
    },
    {
      order: 6,
      action: "Run test suite to verify no regressions (including any simplifier changes).",
      actor: "self",
      condition: profile.build.commands.test ? undefined : "Skip if no test command is configured."
    },
    {
      order: 7,
      action: "Evaluate test coverage for the final code and flag missing tests or regression risks.",
      actor: "test-guard"
    },
    {
      order: 8,
      action: "If any reviewer reports important findings, present them to the user for decision.",
      actor: "self"
    }
  ];

  return {
    postChangeWorkflow,
    agents: [codeReviewer, securityReviewer, codeSimplifier, testGuard],
    verifyCommands: {
      test: profile.build.commands.test,
      lint: profile.build.commands.lint,
      build: profile.build.commands.build,
      format: profile.build.commands.format
    }
  };
}
