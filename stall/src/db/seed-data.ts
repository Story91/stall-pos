// Static demo data for the "La Esquina" seed. Kept free of logic so seed.ts
// stays readable.

export type CatalogSeed = {
  name: string;
  alias: string;
  priceCents: number;
};

export const CATALOG: CatalogSeed[] = [
  { name: "Taco al pastor", alias: "tacos de pastor", priceCents: 450 },
  { name: "Taco de carnitas", alias: "tacos de carnitas", priceCents: 450 },
  { name: "Taco de barbacoa", alias: "tacos de barbacoa", priceCents: 475 },
  { name: "Quesadilla", alias: "quesadilla", priceCents: 650 },
  { name: "Burrito", alias: "burrito", priceCents: 950 },
  { name: "Torta", alias: "torta", priceCents: 850 },
  { name: "Elote", alias: "elote", priceCents: 400 },
  { name: "Chips and salsa", alias: "totopos", priceCents: 350 },
  { name: "Agua fresca", alias: "agua fresca", priceCents: 300 },
  { name: "Horchata", alias: "horchata", priceCents: 350 },
  { name: "Mexican Coke", alias: "coca de vidrio", priceCents: 300 },
  { name: "Churros", alias: "churros", priceCents: 400 },
];

export type SaleCombo = {
  items: ReadonlyArray<readonly [name: string, qty: number]>;
  en: string;
  es: string;
};

// Realistic orders, cycled deterministically across the history days.
export const SALE_COMBOS: SaleCombo[] = [
  {
    items: [
      ["Taco al pastor", 3],
      ["Horchata", 1],
    ],
    en: "Three al pastor tacos and a horchata",
    es: "Tres tacos de pastor y una horchata",
  },
  {
    items: [
      ["Burrito", 1],
      ["Mexican Coke", 1],
    ],
    en: "One burrito and a Mexican Coke",
    es: "Un burrito y una coca de vidrio",
  },
  {
    items: [
      ["Quesadilla", 2],
      ["Agua fresca", 2],
    ],
    en: "Two quesadillas and two agua frescas",
    es: "Dos quesadillas y dos aguas frescas",
  },
  {
    items: [
      ["Taco de carnitas", 2],
      ["Taco de barbacoa", 2],
      ["Elote", 1],
    ],
    en: "Two carnitas tacos, two barbacoa tacos and an elote",
    es: "Dos tacos de carnitas, dos de barbacoa y un elote",
  },
  {
    items: [
      ["Torta", 1],
      ["Chips and salsa", 1],
      ["Horchata", 1],
    ],
    en: "A torta with chips and salsa and a horchata",
    es: "Una torta con totopos y una horchata",
  },
  {
    items: [
      ["Taco al pastor", 4],
      ["Mexican Coke", 2],
    ],
    en: "Four al pastor tacos and two Mexican Cokes",
    es: "Cuatro tacos de pastor y dos cocas de vidrio",
  },
  {
    items: [
      ["Churros", 2],
      ["Horchata", 2],
    ],
    en: "Two churros and two horchatas",
    es: "Dos churros y dos horchatas",
  },
  {
    items: [
      ["Burrito", 2],
      ["Chips and salsa", 1],
      ["Agua fresca", 2],
    ],
    en: "Two burritos, chips and salsa, and two agua frescas",
    es: "Dos burritos, unos totopos y dos aguas frescas",
  },
];
