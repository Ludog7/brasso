import { describe, expect, it } from "vitest";

import * as core from "../../src/index.js";

describe("API publique @brasso/core — surface State Machine (M1-13)", () => {
  it("réexporte la machine, le plan et les timers", () => {
    expect(typeof core.initDayState).toBe("function");
    expect(typeof core.transition).toBe("function");
    expect(typeof core.currentStep).toBe("function");
    expect(typeof core.stepTiming).toBe("function");
    expect(typeof core.defaultDayPlan).toBe("function");
    expect(core.CANONICAL_PHASES).toContain("MASH");
  });

  it("le barrel expose une machine fonctionnelle (fumée)", () => {
    const s = core.initDayState(core.defaultDayPlan());
    const res = core.transition(s, { type: "START_STEP", at: 0 });
    expect(res.state.status).toBe("AWAITING_VALIDATION");
  });
});
