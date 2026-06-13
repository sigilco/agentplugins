/**
 * buildHandlerInvocation() — TDD RED phase tests
 *
 * These tests define the expected behavior of the buildHandlerInvocation()
 * function for the OpenCode adapter.
 *
 * Tests cover:
 *   - Inline handler: generates async IIFE with proper context variable
 *   - Command handler: generates Bun.$ backtick syntax with proper escaping
 *   - HTTP handler: generates fetch() with URL and headers from handler config
 *   - Unsupported handler type: throws or returns error code
 */

import { describe, it, expect } from "vitest";
import type {
  HookHandler,
  InlineHookHandler,
  CommandHookHandler,
  HttpHookHandler,
  UniversalHookName,
} from "@agentplugin/core";
import { buildHandlerInvocation } from "../src/handler-invocation";

// ─── Test Factories ───────────────────────────────────────────────────────────

const inlineHandler = (fn?: string): InlineHookHandler => ({
  type: "inline",
  handler: async (ctx) => {
    // Default impl — will be toString'd in tests
    void ctx;
    return {};
  },
});

const commandHandler = (command = "echo 'hello'"): CommandHookHandler => ({
  type: "command",
  command,
});

const httpHandler = (
  url = "https://example.com/hook",
  headers?: Record<string, string>
): HttpHookHandler => ({
  type: "http",
  url,
  headers,
});

const UNSUPPORTED_HANDLER: HookHandler = {
  type: "file" as any,
  // @ts-expect-error — intentionally unsupported for testing
} as HookHandler;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildHandlerInvocation()", () => {
  const HOOK_NAME: UniversalHookName = "preToolUse";
  const CONTEXT_VAR = "args";

  describe("inline handler", () => {
    it("returns code that calls the handler function", () => {
      const handler = inlineHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should contain an async IIFE invocation
      expect(code).toContain("await");
      expect(code).toContain("handler");
    });

    it("passes correct context variable (from hook args, not undefined ctx)", () => {
      const handler = inlineHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // The context variable should be used at the call site, not hardcoded 'ctx'
      // This is the key bug fix: ctx was undefined in event hook scope
      // The call should look like: (handler)(args) not (handler)(ctx)
      expect(code).toContain(`})(${CONTEXT_VAR})`);
    });

    it("includes error handling wrapper", () => {
      const handler = inlineHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should include try/catch or error handling
      expect(code).toContain("try");
      expect(code).toContain("catch");
    });

    it("returns result from handler invocation", () => {
      const handler = inlineHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      expect(code).toContain("return");
    });

    it("uses 8 spaces for inner body indentation", () => {
      const handler = inlineHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Check that generated code structure has proper indentation
      // Key structural lines should be at 8 spaces (the INDENT level)
      const lines = code.split("\n");

      // The try { line should be at INDENT level
      const tryLine = lines.find((l) => l.trim().startsWith("try {"));
      expect(tryLine).toBeDefined();
      expect(tryLine?.match(/^(\s*)/)?.[1]?.length).toBe(8);

      // The closing } catch (error) { should be at INDENT level
      const catchLine = lines.find((l) => l.trim().startsWith("} catch"));
      expect(catchLine).toBeDefined();
      expect(catchLine?.match(/^(\s*)/)?.[1]?.length).toBe(8);

      // Comments should be at INDENT level
      const commentLine = lines.find((l) => l.trim().startsWith("//"));
      expect(commentLine).toBeDefined();
      expect(commentLine?.match(/^(\s*)/)?.[1]?.length).toBe(8);
    });
  });

  describe("command handler", () => {
    it("returns Bun.$ backtick syntax wrapping", () => {
      const handler = commandHandler("echo 'hello world'");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should use Bun.$ with backticks
      expect(code).toContain("Bun.$`");
      expect(code).toContain("`");
    });

    it("command string is properly included", () => {
      const handler = commandHandler("echo 'test command'");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // The command itself should be in the generated code
      expect(code).toContain("echo 'test command'");
    });

    it("captures stdout from command execution", () => {
      const handler = commandHandler("ls -la");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should capture stdout
      expect(code).toContain("stdout");
    });

    it("returns stdout as result", () => {
      const handler = commandHandler("pwd");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should return stdout
      expect(code).toContain("return");
      expect(code).toContain("stdout");
    });

    it("uses 8 spaces for inner body indentation", () => {
      const handler = commandHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      const lines = code.split("\n");
      for (const line of lines) {
        if (line.trim().length > 0) {
          const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;
          // All lines should have at least 8 spaces (some may have more due to nesting)
          expect(leadingSpaces).toBeGreaterThanOrEqual(8);
        }
      }
    });
  });

  describe("http handler", () => {
    it("returns fetch() wrapping", () => {
      const handler = httpHandler("https://example.com/hook");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should use fetch
      expect(code).toContain("fetch(");
    });

    it("URL is extracted from handler config", () => {
      const handler = httpHandler("https://example.com/my-hook");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // The URL should appear in the generated code
      expect(code).toContain("https://example.com/my-hook");
    });

    it("headers are extracted from handler config as JSON", () => {
      const handler = httpHandler("https://example.com/hook", {
        "Content-Type": "application/json",
        Authorization: "Bearer token123",
      });
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Headers should be JSON.stringified
      expect(code).toContain("JSON.stringify");
      expect(code).toContain("Content-Type");
      expect(code).toContain("Authorization");
    });

    it("uses POST method", () => {
      const handler = httpHandler("https://example.com/hook");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should use POST method
      expect(code).toContain('method: "POST"');
    });

    it("body is JSON.stringify of context variable", () => {
      const handler = httpHandler("https://example.com/hook");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Body should use the context variable
      expect(code).toContain(`JSON.stringify(${CONTEXT_VAR})`);
    });

    it("returns response.json() as result", () => {
      const handler = httpHandler("https://example.com/hook");
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should return the parsed response
      expect(code).toContain("response.json()");
    });

    it("handles undefined headers gracefully", () => {
      const handler = httpHandler("https://example.com/hook", undefined);
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Should not break when headers is undefined
      expect(code).toContain("fetch(");
      expect(code).toContain("https://example.com/hook");
    });

    it("uses 8 spaces for inner body indentation", () => {
      const handler = httpHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      const lines = code.split("\n");
      for (const line of lines) {
        if (line.trim().length > 0) {
          const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;
          // All lines should have at least 8 spaces (some may have more due to nesting)
          expect(leadingSpaces).toBeGreaterThanOrEqual(8);
        }
      }
    });
  });

  describe("unsupported handler type", () => {
    it("throws or returns error code", () => {
      const code = buildHandlerInvocation(
        UNSUPPORTED_HANDLER,
        HOOK_NAME,
        CONTEXT_VAR
      );

      // Should either throw or return error code
      expect(
        code.includes("throw") || code.includes("Error")
      ).toBeTruthy();
    });

    it("includes the handler type in error message", () => {
      const code = buildHandlerInvocation(
        UNSUPPORTED_HANDLER,
        HOOK_NAME,
        CONTEXT_VAR
      );

      // Should mention unsupported type
      expect(code).toContain("Unsupported");
      expect(code).toContain("file");
    });
  });

  describe("type discrimination via handler.type", () => {
    it("uses handler.type property for type checking", () => {
      const inlineCode = buildHandlerInvocation(inlineHandler(), HOOK_NAME, CONTEXT_VAR);
      const commandCode = buildHandlerInvocation(commandHandler(), HOOK_NAME, CONTEXT_VAR);
      const httpCode = buildHandlerInvocation(httpHandler(), HOOK_NAME, CONTEXT_VAR);

      // Each should generate distinct code patterns
      expect(inlineCode).toContain("await");
      expect(commandCode).toContain("Bun.$`");
      expect(httpCode).toContain("fetch(");

      // No cross-contamination
      expect(inlineCode).not.toContain("Bun.$`");
      expect(commandCode).not.toContain("fetch(");
      expect(httpCode).not.toContain("Bun.$`");
    });
  });

  describe("generated code is valid TypeScript", () => {
    it("inline handler generates syntactically valid code", () => {
      const handler = inlineHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      // Code should have balanced braces
      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });

    it("command handler generates syntactically valid code", () => {
      const handler = commandHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });

    it("http handler generates syntactically valid code", () => {
      const handler = httpHandler();
      const code = buildHandlerInvocation(handler, HOOK_NAME, CONTEXT_VAR);

      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });
  });
});
