export function SafeIssueCodeBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
      {code}
    </span>
  );
}
