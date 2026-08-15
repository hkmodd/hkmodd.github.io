import ScrambledTitle from '@/components/ScrambledTitle';

/** Offset-print section title. Magenta/cyan plates sit under the live scramble. */
export default function ZineTitle({ text, className = '' }: { text: string; className?: string }) {
  return (
    <h2 className={`zine-title ${className}`.trim()} data-text={text}>
      <ScrambledTitle text={text} />
    </h2>
  );
}
