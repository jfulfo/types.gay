// What the book is about: the group axioms (identity and inverses on the
// left only) and one theorem.

export interface AxiomSpec {
  label: string;
  src: string;
  /** Its name in Lean. */
  lean: string;
}

export const AXIOMS: AxiomSpec[] = [
  { label: 'G1', src: '(xy)z = x(yz)', lean: 'assoc' },
  { label: 'G2', src: 'ex = x', lean: 'e_mul' },
  { label: 'G3', src: "x'x = e", lean: 'inv_mul' },
];

export const THEOREM_SRC = "(xy)' = y'x'";
export const THEOREM_LEAN = 'mul_inv_rev';
