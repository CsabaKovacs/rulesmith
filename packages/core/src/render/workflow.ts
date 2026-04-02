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

function buildStackRules(profile: ProjectProfile): {
  codeReviewRules: string[];
  securityReviewRules: string[];
} {
  const codeReviewRules: string[] = [];
  const securityReviewRules: string[] = [];

  for (const lang of profile.languages) {
    if (lang.confidence < 0.4) continue;
    switch (lang.name) {
      case "php":
        codeReviewRules.push("Enforce PSR-12 coding standards and consistent type declarations.");
        securityReviewRules.push("Check for SQL injection via raw queries, XSS in Blade templates, and mass-assignment vulnerabilities.");
        break;
      case "typescript":
      case "javascript":
        codeReviewRules.push("Enforce strict TypeScript usage where applicable; flag `any` types and missing return types on public APIs.");
        securityReviewRules.push("Check for prototype pollution, unsafe `eval`/`innerHTML`, and missing input sanitization.");
        break;
      case "python":
        codeReviewRules.push("Enforce type hints on public functions and consistent import ordering.");
        securityReviewRules.push("Check for SQL injection via string formatting, SSRF in HTTP calls, and unsafe pickle/eval usage.");
        break;
      case "go":
        codeReviewRules.push("Enforce explicit error handling (no silently discarded errors) and gofmt compliance.");
        securityReviewRules.push("Check for path traversal, unsafe template rendering, and unchecked type assertions.");
        break;
      case "java":
      case "kotlin":
        codeReviewRules.push("Enforce consistent null-safety patterns and SOLID principles.");
        securityReviewRules.push("Check for deserialization vulnerabilities, SQL injection, and insecure random number generation.");
        break;
      case "ruby":
        codeReviewRules.push("Enforce consistent method visibility and Rails conventions where applicable.");
        securityReviewRules.push("Check for mass-assignment, SQL injection via string interpolation, and command injection.");
        break;
      case "dart":
        codeReviewRules.push("Enforce null-safety, consistent widget decomposition, and flutter analyze compliance.");
        securityReviewRules.push("Check for insecure storage of sensitive data and unsafe platform channel usage.");
        break;
      case "rust":
        codeReviewRules.push("Flag unnecessary `unsafe` blocks and ensure proper error propagation with `?` operator.");
        securityReviewRules.push("Check for unsafe memory access patterns, unchecked FFI boundaries, and panic in library code.");
        break;
    }
  }

  for (const fw of profile.frameworks) {
    if (fw.confidence < 0.4) continue;
    switch (fw.name) {
      case "laravel":
        codeReviewRules.push("Verify FormRequest usage for validation, proper service/action boundaries, and no business logic in controllers.");
        securityReviewRules.push("Verify middleware auth guards, CSRF protection, and proper use of Eloquent parameterized queries.");
        break;
      case "nextjs":
      case "react":
        codeReviewRules.push("Check for proper component decomposition, hook dependencies, and server/client boundary correctness.");
        securityReviewRules.push("Check for dangerouslySetInnerHTML usage, exposed API keys in client bundles, and SSRF in API routes.");
        break;
      case "express":
      case "node":
        codeReviewRules.push("Verify proper middleware ordering, async error handling, and consistent response patterns.");
        securityReviewRules.push("Check for missing helmet/CORS configuration, path traversal in file serving, and NoSQL injection.");
        break;
      case "django":
        codeReviewRules.push("Verify proper use of Django ORM, class-based view patterns, and form validation.");
        securityReviewRules.push("Check for raw SQL queries, CSRF exemptions, and improper permission decorators.");
        break;
      case "flutter":
        codeReviewRules.push("Verify proper state management patterns and widget tree efficiency.");
        break;
      case "rails":
        codeReviewRules.push("Verify MVC boundaries, proper use of concerns, and ActiveRecord query patterns.");
        securityReviewRules.push("Check for mass-assignment, unscoped finds, and missing authentication before_actions.");
        break;
    }
  }

  if (codeReviewRules.length === 0) {
    codeReviewRules.push("Check for naming consistency, DRY violations, and unnecessary complexity.");
  }
  if (securityReviewRules.length === 0) {
    securityReviewRules.push("Check for common OWASP Top 10 vulnerabilities relevant to the detected stack.");
  }

  return { codeReviewRules, securityReviewRules };
}

export function buildAgentWorkflowSpec(profile: ProjectProfile): AgentWorkflowSpec {
  const { codeReviewRules, securityReviewRules } = buildStackRules(profile);

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

  const postChangeWorkflow: WorkflowStep[] = [
    {
      order: 1,
      action: "Run test suite to verify no regressions.",
      actor: "self",
      condition: profile.build.commands.test ? undefined : "Skip if no test command is configured."
    },
    {
      order: 2,
      action: "Run linter to catch style and static analysis issues.",
      actor: "self",
      condition: profile.build.commands.lint ? undefined : "Skip if no lint command is configured."
    },
    {
      order: 3,
      action: "Run code quality review on all changed files.",
      actor: "code-reviewer"
    },
    {
      order: 4,
      action: "Run security review on changed files that touch security-sensitive areas.",
      actor: "security-reviewer",
      condition: "Only when changes touch request handling, auth, database, file access, external APIs, or sensitive data."
    },
    {
      order: 5,
      action: "If any reviewer reports critical findings, fix them before marking the task as complete.",
      actor: "self"
    },
    {
      order: 6,
      action: "If any reviewer reports important findings, present them to the user for decision.",
      actor: "self"
    }
  ];

  return {
    postChangeWorkflow,
    agents: [codeReviewer, securityReviewer],
    verifyCommands: {
      test: profile.build.commands.test,
      lint: profile.build.commands.lint,
      build: profile.build.commands.build,
      format: profile.build.commands.format
    }
  };
}
