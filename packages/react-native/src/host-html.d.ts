// Ambient type for the generated host bundle. The real module, src/host-html.ts,
// is gitignored and produced by `npm run rn:host`; this stub lets `typecheck` and
// the declaration build (`build:types`) resolve the import when that generated
// file isn't present. When it is present, TypeScript uses it instead (same type).
export const HOST_HTML: string;
