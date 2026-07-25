import { describe, expect, it } from "vitest";
import { scopeFromParts } from "../runs/scope-key.js";
import { SCOPE_KIND, WORKING_TREE_REF } from "../schema.js";

const SHAS = {
	baseSha: "1111111111111111111111111111111111111111",
	headSha: "2222222222222222222222222222222222222222",
	mergeBaseSha: "3333333333333333333333333333333333333333",
} as const;

describe("scopeFromParts", () => {
	it("maps committed run columns to a committed scope", () => {
		expect(
			scopeFromParts({
				scopeKind: SCOPE_KIND.COMMITTED,
				workingTreeRef: null,
				...SHAS,
			}),
		).toEqual({ kind: SCOPE_KIND.COMMITTED, ...SHAS });
	});

	it("maps working-tree run columns to a working-tree scope", () => {
		expect(
			scopeFromParts({
				scopeKind: SCOPE_KIND.WORKING_TREE,
				workingTreeRef: WORKING_TREE_REF.STAGED,
				...SHAS,
			}),
		).toEqual({ kind: SCOPE_KIND.WORKING_TREE, ref: WORKING_TREE_REF.STAGED, ...SHAS });
	});

	it("fails loudly for an invalid internal working-tree run", () => {
		expect(() =>
			scopeFromParts({
				scopeKind: SCOPE_KIND.WORKING_TREE,
				workingTreeRef: null,
				...SHAS,
			}),
		).toThrow("Working-tree run is missing its review ref");
	});
});
