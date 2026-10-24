// Formato da planta do Tour 3D (o mesmo que a IA vai extrair de uma planta enviada).
// Tudo em centímetros, origem no canto de cima à esquerda da planta: x para a direita, y para baixo.

/** Retângulo [x0, y0, x1, y1]. */
export type Rect = [number, number, number, number];

export type RoomKind = "quarto" | "suite" | "estar" | "cozinha" | "banho" | "servico" | "circulacao" | "varanda" | "terraco" | "tecnico";

export type Room = {
  id: string;
  name: string;
  kind: RoomKind;
  /** Um ou mais retângulos (cômodo em L = dois retângulos). */
  rects: Rect[];
  /** Cômodos do mesmo grupo não têm parede entre si (sala + cozinha integradas). */
  group?: string;
  /** false = não aparece na lista de cômodos para teletransportar. */
  nav?: boolean;
};

/** Abertura numa parede: horizontal (na linha y = at, de a até b em x) ou vertical (na linha x = at, de a até b em y). */
export type Opening = {
  dir: "h" | "v";
  at: number;
  a: number;
  b: number;
  kind: "door" | "entry" | "glass" | "window";
};

/** Faces: para onde fica a "frente" do móvel (S = para baixo da planta). */
export type Facing = "N" | "S" | "E" | "W";

export type Item = { t: string; x: number; y: number; f?: Facing; w?: number; d?: number; n?: number };

export type FeatureKind = "acustica" | "varanda" | "fechadura" | "ar" | "janela" | "servico" | "hidro";

export type Feature = { kind: FeatureKind; x: number; y: number; h?: number; text?: string };

export type Plan = {
  id: string;
  name: string;
  short: string;
  area: string;
  rooms: Room[];
  openings: Opening[];
  /** Paredes extras soltas [x0,y0,x1,y1] (linha). */
  walls?: Rect[];
  items: Item[];
  features: Feature[];
};

export type Status = "disponivel" | "reservado" | "vendido";

/** short = nome curto da etiqueta no 3D; sem short, o espaço só aparece na galeria do Lazer. */
export type Amenity = { id: string; name: string; short?: string; photo?: string; text?: string };

export type Project = {
  slug: string;
  name: string;
  city: string;
  tagline: string;
  whatsapp: string;
  colors: { primary: string; dark: string; light: string; accent: string };
  plans: Plan[];
  amenities: Amenity[];
  blocks: { id: string; floors: number }[];
  highlights: string[];
};
