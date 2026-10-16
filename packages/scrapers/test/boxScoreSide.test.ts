import { describe, expect, it } from "vitest";
import { resolveBoxScoreSide } from "../src/plusliga/boxScoreSide";

const match = {
  homeName: "JSW Jastrzębski Węgiel",
  awayName: "BOGDANKA LUK Lublin",
  homeClubSiteId: "26",
  awayClubSiteId: "45",
};

describe("resolveBoxScoreSide", () => {
  it("uses the Player's own Team name first", () => {
    expect(resolveBoxScoreSide({ teamName: "BOGDANKA LUK Lublin", opponentName: "JSW Jastrzębski Węgiel" }, match, [])).toBe("away");
    expect(resolveBoxScoreSide({ teamName: "JSW  Jastrzębski Węgiel", opponentName: "x" }, match, [])).toBe("home");
  });

  it("falls back to the opponent's name when a sponsor renamed the own Team", () => {
    expect(resolveBoxScoreSide({ teamName: "NEW SPONSOR Lublin", opponentName: "JSW Jastrzębski Węgiel" }, match, [])).toBe("away");
    expect(resolveBoxScoreSide({ teamName: "NEW SPONSOR", opponentName: "bogdanka luk lublin" }, match, [])).toBe("home");
  });

  it("falls back to the Club the Player was registered with that Season", () => {
    expect(resolveBoxScoreSide({ teamName: "Renamed A", opponentName: "Renamed B" }, match, ["45"])).toBe("away");
    expect(resolveBoxScoreSide({ teamName: "Renamed A", opponentName: "Renamed B" }, match, ["99", "26"])).toBe("home");
  });

  it("gives up when the Player was with both Clubs or neither", () => {
    expect(resolveBoxScoreSide({ teamName: "Renamed A", opponentName: "Renamed B" }, match, ["26", "45"])).toBeNull();
    expect(resolveBoxScoreSide({ teamName: "Renamed A", opponentName: "Renamed B" }, match, [])).toBeNull();
  });
});
