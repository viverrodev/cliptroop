// Only the connected accounts' numbers (1.15.0): whose numbers they are,
// which rows show, and which posts belong to the account connected now.
import { inAccountTime, sameAccount, visibleRows, type NumbersVisibility } from "../modules/analytics/lib/account-rules";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const page = { externalId: "fb-123", name: "Viverro" };
ok(sameAccount("fb-123", page), "the same id: the same account");
ok(!sameAccount("fb-999", page), "another id: another account");
ok(sameAccount(null, page), "nothing recorded yet: this account's");
ok(sameAccount("name:viverro", page), "kept from before 1.15 by name: the same name (any case)");
ok(!sameAccount("name:old page", page), "another name: another account");
ok(!sameAccount("name:", { externalId: "x", name: "" }), "an empty name never matches");

const vis: NumbersVisibility = { platforms: new Set(["youtube", "facebook"]), since: { youtube: null, facebook: "2026-10-05T12:00:00Z" } };
const rows = [{ platform: "youtube", v: 1 }, { platform: "instagram", v: 2 }, { platform: "facebook", v: 3 }];
ok(visibleRows(rows, vis).map((r) => r.v).join() === "1,3", "a disconnected platform's rows never show");
ok(inAccountTime(vis, "youtube", "2020-01-01T00:00:00Z"), "always the same channel: every post counts");
ok(!inAccountTime(vis, "facebook", "2026-10-01T00:00:00Z"), "posted before the Page was replaced: the old Page's");
ok(inAccountTime(vis, "facebook", "2026-10-06T00:00:00Z"), "posted after: the new Page's");
ok(!inAccountTime(vis, "instagram", "2026-10-06T00:00:00Z"), "not connected now: never");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
