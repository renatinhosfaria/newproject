import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  sha256Hex,
} from "../../apps/api/src/idempotency/canonical-json.js";

describe("canonicalJson", () => {
  it("ordena chaves recursivamente sem reordenar arrays", () => {
    expect(
      canonicalJson({
        z: 1,
        a: {
          d: true,
          b: [
            { y: 2, x: 1 },
            { a: "last", c: null },
          ],
        },
      }),
    ).toBe('{"a":{"b":[{"x":1,"y":2},{"a":"last","c":null}],"d":true},"z":1}');
  });

  it("produz o mesmo hash para objetos equivalentes com ordem de propriedades diferente", () => {
    const left = { operation: "POST /api/conversations", body: { b: 2, a: 1 } };
    const right = {
      body: { a: 1, b: 2 },
      operation: "POST /api/conversations",
    };

    expect(sha256Hex(canonicalJson(left))).toBe(
      sha256Hex(canonicalJson(right)),
    );
  });
});
