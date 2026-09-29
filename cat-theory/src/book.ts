// The printed contents of the book. Each leaf is one loose page.

export interface PrintedPremise {
  label: string;
  src: string;
  /** Printed gloss after the formula, if any. */
  gloss?: string;
}

export interface Leaf {
  id: string;
  /** Page number printed at the foot (fixed; leaves keep theirs when shuffled). */
  folio: number;
  runningHead: string;
  kind: 'axioms' | 'result';
  /** e.g. "Lemma 2"; how later pages cite it. */
  label?: string;
  /** Printed name after the label, e.g. "(Right identity)". */
  name?: string;
  statement?: string;
  /** Words before and after the displayed statement. */
  lead?: string;
  tail?: string;
  premises: PrintedPremise[];
  premisesGlobal: boolean;
  /** Printed prose around the premises. */
  intro?: string;
  outro?: string;
  /** Faint mirrored text from the other side of the leaf. */
  verso: string[];
}

export const LEAVES: Leaf[] = [
  {
    id: 'axioms',
    folio: 1,
    runningHead: 'GROUPS',
    kind: 'axioms',
    premisesGlobal: true,
    intro:
      'Let G be a set equipped with a binary operation, written (x, y) ↦ xy, a distinguished element e, and a map x ↦ x⁻¹. We suppose that for all x, y, z in G:',
    premises: [
      { label: 'G1', src: '(xy)z = x(yz)' },
      { label: 'G2', src: 'ex = x' },
      { label: 'G3', src: "x'x = e" },
    ],
    outro:
      'Such a G is called a group. The reader will notice that we have asked only for an identity and inverses on the left. It is a pleasant exercise to show that nothing more is needed.',
    verso: ['§1. GROUPS', 'In what follows G denotes a group.', 'The element e is called the identity.'],
  },
  {
    id: 'l1',
    folio: 3,
    runningHead: 'LEFT CANCELLATION',
    kind: 'result',
    label: 'Lemma 1',
    statement: "x'(xy) = y",
    lead: 'For all x, y in G,',
    premises: [],
    premisesGlobal: false,
    verso: ['EXERCISES', '1. Show that ab = ac implies b = c.', '2. Is the converse true?'],
  },
  {
    id: 'l2',
    folio: 5,
    runningHead: 'RIGHT INVERSES',
    kind: 'result',
    label: 'Lemma 2',
    statement: "xx' = e",
    lead: 'For every x in G,',
    tail: 'that is, x⁻¹ is also a right inverse of x.',
    premises: [],
    premisesGlobal: false,
    verso: ['Lemma 2 is less obvious than', 'it appears; the reader should', 'not use commutativity.'],
  },
  {
    id: 'l3',
    folio: 7,
    runningHead: 'THE IDENTITY',
    kind: 'result',
    label: 'Lemma 3',
    statement: 'xe = x',
    lead: 'For every x in G,',
    tail: 'so that e is a two-sided identity.',
    premises: [],
    premisesGlobal: false,
    verso: ['It follows that the identity', 'is unique: if f is another,', 'then e = ef = f.'],
  },
  {
    id: 'l4',
    folio: 9,
    runningHead: 'INVERSES',
    kind: 'result',
    label: 'Lemma 4',
    statement: "(x')' = x",
    lead: 'For every x in G,',
    premises: [],
    premisesGlobal: false,
    verso: ['EXERCISES', '3. Show that e⁻¹ = e.', '4. Show that inverses are unique.'],
  },
  {
    id: 'l5',
    folio: 11,
    runningHead: 'INVERSES',
    kind: 'result',
    label: 'Lemma 5',
    statement: "(xy)' = y'x'",
    lead: 'For all x, y in G,',
    tail: 'the order of the factors being reversed.',
    premises: [],
    premisesGlobal: false,
    verso: ['One puts on socks, then shoes;', 'one takes off shoes, then socks.'],
  },
  {
    id: 't6',
    folio: 13,
    runningHead: 'COMMUTATIVITY',
    kind: 'result',
    label: 'Theorem 6',
    statement: 'xy = yx',
    intro: 'Suppose moreover that every element of G is its own inverse:',
    premises: [{ label: 'H', src: 'xx = e' }],
    premisesGlobal: false,
    lead: 'Then for all x, y in G,',
    tail: 'that is, G is abelian.',
    verso: ['Such groups are called', 'elementary abelian 2-groups.', 'See the exercises.'],
  },
];
