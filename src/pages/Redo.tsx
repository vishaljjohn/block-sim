import { H1 } from '../ui/Shell';
export function Redo(_props: { qids?: string[]; examId?: string }) {
  return (
    <div>
      <H1>Redo</H1>
      <p className="text-sm">This part of Block Sim arrives in the next update.</p>
      <a className="link" href="#/">Back to the Library</a>
    </div>
  );
}
