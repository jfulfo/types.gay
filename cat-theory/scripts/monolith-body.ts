// Prints the Lean body of the untouched book, e.g. to warm the server's cache after a deploy.
import { AXIOMS, THEOREM_SRC } from '../src/book/theory';
import { buildMonolith } from '../src/engine/doc';
import { leanBody } from '../src/engine/lean';
process.stdout.write(leanBody(buildMonolith(AXIOMS, THEOREM_SRC)));
