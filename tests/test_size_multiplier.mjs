import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSizeMultiplier } from "../web/js/field_config.js";

test("saved legacy multipliers become numeric API values", () => {
    for (let factor = 1; factor <= 4; factor++) {
        assert.equal(normalizeSizeMultiplier(`x${factor}`), factor);
    }
    assert.equal(normalizeSizeMultiplier(" X2 "), 2);
});

test("fractional multipliers survive save and reload", () => {
    for (const factor of [0.5, 1, 1.5, 2, 5.5]) {
        const saved = JSON.stringify({ size_multiplier: normalizeSizeMultiplier(factor) });
        assert.equal(normalizeSizeMultiplier(JSON.parse(saved).size_multiplier), factor);
    }
});

test("missing or invalid multipliers retain the default", () => {
    for (const value of [undefined, null, "", "invalid", 0, -1, NaN, Infinity]) {
        assert.equal(normalizeSizeMultiplier(value), 1);
    }
});
