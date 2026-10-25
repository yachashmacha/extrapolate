export function NarrativeLine({ score, line }: { score: number; line: string }) {
  return (
    <span className="narrative-line" data-narrative-score={score}>
      <span className="narrative-score">Narrative {score}/10</span> {line}
    </span>
  );
}
