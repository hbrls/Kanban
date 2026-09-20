import { describe, expect, it } from "vitest";

import { buildSpreadsheetConditionalVisuals } from "../spreadsheet-conditional-visuals";

describe("spreadsheet conditional formula helpers", () => {
  it("evaluates branch helpers in conditional format formulas", () => {
    const visuals = buildSpreadsheetConditionalVisuals({
      conditionalFormattings: [
        {
          ranges: ["A2:A5"],
          rules: [
            {
              fillColor: "FDE68A",
              formulas: ["=IFS(B2>=90,\"High\",B2>=70,\"Medium\",TRUE,\"Low\")=\"High\""],
              type: "expression",
            },
          ],
        },
        {
          ranges: ["C2:C5"],
          rules: [
            {
              fillColor: "BAE6FD",
              formulas: ["=SWITCH(C2,\"P1\",\"Escalate\",\"P2\",\"Watch\",\"Normal\")=\"Escalate\""],
              type: "expression",
            },
          ],
        },
        {
          ranges: ["D2:D5"],
          rules: [
            {
              fillColor: "C4B5FD",
              formulas: ["=CHOOSE(D2,\"Todo\",\"Doing\",\"Done\")=\"Done\""],
              type: "expression",
            },
          ],
        },
        {
          ranges: ["E2:E5"],
          rules: [
            {
              fillColor: "FECACA",
              formulas: ["=IFNA(E2,\"Missing\")=\"Missing\""],
              type: "expression",
            },
          ],
        },
      ],
      rows: [
        { cells: [{ address: "A2", value: "row2" }, { address: "B2", value: 95 }, { address: "C2", value: "P1" }, { address: "D2", value: 3 }, { address: "E2", value: "#N/A" }], index: 2 },
        { cells: [{ address: "A3", value: "row3" }, { address: "B3", value: 75 }, { address: "C3", value: "P2" }, { address: "D3", value: 2 }, { address: "E3", value: "#VALUE!" }], index: 3 },
        { cells: [{ address: "A4", value: "row4" }, { address: "B4", value: 55 }, { address: "C4", value: "P3" }, { address: "D4", value: 1 }, { address: "E4", value: "Ready" }], index: 4 },
      ],
    });

    expect(visuals.get("2:0")?.background).toBe("#FDE68A");
    expect(visuals.get("3:0")).toBeUndefined();
    expect(visuals.get("4:0")).toBeUndefined();
    expect(visuals.get("2:2")?.background).toBe("#BAE6FD");
    expect(visuals.get("3:2")).toBeUndefined();
    expect(visuals.get("4:2")).toBeUndefined();
    expect(visuals.get("2:3")?.background).toBe("#C4B5FD");
    expect(visuals.get("3:3")).toBeUndefined();
    expect(visuals.get("4:3")).toBeUndefined();
    expect(visuals.get("2:4")?.background).toBe("#FECACA");
    expect(visuals.get("3:4")).toBeUndefined();
    expect(visuals.get("4:4")).toBeUndefined();
  });

  it("evaluates text conversion helpers in conditional format formulas", () => {
    const visuals = buildSpreadsheetConditionalVisuals({
      conditionalFormattings: [
        {
          ranges: ["A2:A5"],
          rules: [
            {
              fillColor: "FDE68A",
              formulas: ["=EXACT(A2,\"Open\")"],
              type: "expression",
            },
          ],
        },
        {
          ranges: ["B2:B5"],
          rules: [
            {
              fillColor: "BAE6FD",
              formulas: ["=VALUE(B2)>=0.8"],
              type: "expression",
            },
          ],
        },
        {
          ranges: ["C2:C5"],
          rules: [
            {
              fillColor: "C4B5FD",
              formulas: ["=SUBSTITUTE(C2,\"RTA\",\"RTA-\")=\"RTA-1001\""],
              type: "expression",
            },
          ],
        },
        {
          ranges: ["D2:D5"],
          rules: [
            {
              fillColor: "FECACA",
              formulas: ["=TEXTJOIN(\"-\",TRUE,D2,E2)=\"APAC-High\""],
              type: "expression",
            },
          ],
        },
        {
          ranges: ["F2:F5"],
          rules: [
            {
              fillColor: "BBF7D0",
              formulas: ["=REPLACE(F2,1,3,\"RTA\")=\"RTA-1001\""],
              type: "expression",
            },
          ],
        },
      ],
      rows: [
        { cells: [{ address: "A2", value: "Open" }, { address: "B2", value: "85%" }, { address: "C2", value: "RTA1001" }, { address: "D2", value: "APAC" }, { address: "E2", value: "High" }, { address: "F2", value: "OLD-1001" }], index: 2 },
        { cells: [{ address: "A3", value: "open" }, { address: "B3", value: "75%" }, { address: "C3", value: "RTB1001" }, { address: "D3", value: "APAC" }, { address: "E3", value: "" }, { address: "F3", value: "OLD-1002" }], index: 3 },
        { cells: [{ address: "A4", value: "Open" }, { address: "B4", value: "1,200" }, { address: "C4", value: "RTA2002" }, { address: "D4", value: "EMEA" }, { address: "E4", value: "High" }, { address: "F4", value: "NEW-2002" }], index: 4 },
      ],
    });

    expect(visuals.get("2:0")?.background).toBe("#FDE68A");
    expect(visuals.get("3:0")).toBeUndefined();
    expect(visuals.get("4:0")?.background).toBe("#FDE68A");
    expect(visuals.get("2:1")?.background).toBe("#BAE6FD");
    expect(visuals.get("3:1")).toBeUndefined();
    expect(visuals.get("4:1")?.background).toBe("#BAE6FD");
    expect(visuals.get("2:2")?.background).toBe("#C4B5FD");
    expect(visuals.get("3:2")).toBeUndefined();
    expect(visuals.get("4:2")).toBeUndefined();
    expect(visuals.get("2:3")?.background).toBe("#FECACA");
    expect(visuals.get("3:3")).toBeUndefined();
    expect(visuals.get("4:3")).toBeUndefined();
    expect(visuals.get("2:5")?.background).toBe("#BBF7D0");
    expect(visuals.get("3:5")).toBeUndefined();
    expect(visuals.get("4:5")).toBeUndefined();
  });
});
