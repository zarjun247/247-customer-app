import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  IllegalStateTransitionError,
  LEGAL_COMMAND_STATES,
  type CommandState,
} from "./commandStateMachine";

describe("commandStateMachine", () => {
  describe("canTransition — legal transitions", () => {
    it("in_flight → completed via handler_success", () => {
      expect(canTransition("in_flight", "completed", "handler_success")).toBe(
        true
      );
    });

    it("in_flight → failed via handler_failure", () => {
      expect(canTransition("in_flight", "failed", "handler_failure")).toBe(
        true
      );
    });

    it("completed → compensated via compensation_run", () => {
      expect(
        canTransition("completed", "compensated", "compensation_run")
      ).toBe(true);
    });

    it("failed → compensated via compensation_run", () => {
      expect(canTransition("failed", "compensated", "compensation_run")).toBe(
        true
      );
    });
  });

  describe("canTransition — illegal transitions", () => {
    it("completed → failed is not allowed", () => {
      expect(canTransition("completed", "failed", "handler_failure")).toBe(
        false
      );
    });

    it("failed → completed is not allowed", () => {
      expect(canTransition("failed", "completed", "handler_success")).toBe(
        false
      );
    });

    it("compensated → in_flight is not allowed", () => {
      expect(canTransition("compensated", "in_flight", "handler_success")).toBe(
        false
      );
    });

    it("in_flight → compensated is not allowed", () => {
      expect(
        canTransition("in_flight", "compensated", "compensation_run")
      ).toBe(false);
    });

    it("in_flight → completed with wrong trigger", () => {
      expect(canTransition("in_flight", "completed", "handler_failure")).toBe(
        false
      );
    });

    it("in_flight → failed with wrong trigger", () => {
      expect(canTransition("in_flight", "failed", "handler_success")).toBe(
        false
      );
    });

    it("completed → completed self-loop", () => {
      expect(canTransition("completed", "completed", "handler_success")).toBe(
        false
      );
    });

    it("failed → failed self-loop", () => {
      expect(canTransition("failed", "failed", "handler_failure")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("does not throw for a legal transition", () => {
      expect(() =>
        assertTransition("in_flight", "completed", "handler_success")
      ).not.toThrow();
    });

    it("throws IllegalStateTransitionError for an illegal transition", () => {
      expect(() =>
        assertTransition("completed", "failed", "handler_failure")
      ).toThrow(IllegalStateTransitionError);
    });

    it("error message contains from/to/trigger", () => {
      let caught: Error | undefined;
      try {
        assertTransition("compensated", "in_flight", "handler_success");
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).toBeInstanceOf(IllegalStateTransitionError);
      expect(caught?.message).toContain("compensated");
      expect(caught?.message).toContain("in_flight");
      expect(caught?.message).toContain("handler_success");
    });

    it("IllegalStateTransitionError has correct name", () => {
      expect(() =>
        assertTransition("failed", "completed", "handler_success")
      ).toThrow(
        expect.objectContaining({ name: "IllegalStateTransitionError" })
      );
    });
  });

  describe("LEGAL_COMMAND_STATES", () => {
    it("contains all four states", () => {
      const expected: CommandState[] = [
        "in_flight",
        "completed",
        "failed",
        "compensated",
      ];
      for (const s of expected) {
        expect(LEGAL_COMMAND_STATES.has(s)).toBe(true);
      }
    });

    it("has exactly four states", () => {
      expect(LEGAL_COMMAND_STATES.size).toBe(4);
    });
  });
});
