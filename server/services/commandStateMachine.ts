export type CommandState = "in_flight" | "completed" | "failed" | "compensated";

export type CommandTransitionTrigger =
  | "handler_success"
  | "handler_failure"
  | "compensation_run";

export type CommandTransition = {
  from: CommandState;
  to: CommandState;
  trigger: CommandTransitionTrigger;
};

const LEGAL_TRANSITIONS: ReadonlyArray<CommandTransition> = Object.freeze([
  { from: "in_flight", to: "completed", trigger: "handler_success" },
  { from: "in_flight", to: "failed", trigger: "handler_failure" },
  { from: "completed", to: "compensated", trigger: "compensation_run" },
  { from: "failed", to: "compensated", trigger: "compensation_run" },
]);

export const LEGAL_COMMAND_STATES: ReadonlySet<CommandState> =
  new Set<CommandState>(["in_flight", "completed", "failed", "compensated"]);

export function canTransition(
  from: CommandState,
  to: CommandState,
  trigger: CommandTransitionTrigger
): boolean {
  return LEGAL_TRANSITIONS.some(
    t => t.from === from && t.to === to && t.trigger === trigger
  );
}

export function assertTransition(
  from: CommandState,
  to: CommandState,
  trigger: CommandTransitionTrigger
): void {
  if (!canTransition(from, to, trigger)) {
    throw new IllegalStateTransitionError(
      `Illegal command state transition: ${from} → ${to} (trigger: ${trigger})`
    );
  }
}

export class IllegalStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalStateTransitionError";
  }
}
