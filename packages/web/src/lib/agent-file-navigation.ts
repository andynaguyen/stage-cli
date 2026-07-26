const SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;
const FILE_SCHEME = "file:";
const LINE_SUFFIX_RE = /:\d+(?::\d+)?$/;

export function resolveChangedFileLink(href: string, filePaths: readonly string[]): string | null {
	if (href.startsWith("//")) return null;
	if (SCHEME_RE.test(href) && !href.startsWith(FILE_SCHEME)) return null;

	let candidate = href;
	if (href.startsWith(FILE_SCHEME)) {
		try {
			candidate = new URL(href).pathname;
		} catch {
			return null;
		}
	}
	const pathEnd = candidate.search(/[?#]/);
	if (pathEnd >= 0) candidate = candidate.slice(0, pathEnd);
	try {
		candidate = decodeURIComponent(candidate);
	} catch {
		return null;
	}
	candidate = candidate.replaceAll("\\", "/").replace(LINE_SUFFIX_RE, "");

	let match: string | null = null;
	for (const filePath of filePaths) {
		if (candidate !== filePath && !candidate.endsWith("/".concat(filePath))) continue;
		if (match !== null) return null;
		match = filePath;
	}
	return match;
}
