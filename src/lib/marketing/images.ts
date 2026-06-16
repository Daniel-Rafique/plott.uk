/**
 * Central registry of marketing imagery sourced from Unsplash.
 *
 * All photos are licensed under the Unsplash License (free for commercial
 * and editorial use, no attribution required — but we credit photographers
 * in the site footer / data-source line where appropriate).
 *
 * We keep the full CDN URLs here so Next/Image can optimise responsively,
 * and so we can swap individual slots without hunting through components.
 * If/when we ship real product screenshots, replace the `src` of the
 * relevant slot (keep the `alt` and `credit` up to date).
 */

export type MarketingImage = {
  /** Unsplash CDN URL (no transform params — Next/Image adds its own). */
  src: string;
  /** Descriptive alt text for accessibility. */
  alt: string;
  /** Photographer credit for the footer / about page. */
  credit: { name: string; url: string };
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}`;

export const HOME_CHAPTERS = {
  map: {
    src: unsplash("1513635269975-59663e0ac1ad"),
    alt: "Aerial view of Tower Bridge, the River Thames and Canary Wharf at dawn — the kind of patch a BD team draws over in Plott.",
    credit: {
      name: "Benjamin Davies",
      url: "https://unsplash.com/@bendavisual",
    },
  },
  enrichment: {
    src: unsplash("1569235186275-626cb53b83ce"),
    alt: "Vintage library card catalogue drawer, an editorial metaphor for applicant enrichment — matching the right person to every planning record.",
    credit: {
      name: "Maksym Kaharlytskyi",
      url: "https://unsplash.com/@qwitka",
    },
  },
  letter: {
    src: unsplash("1446688568582-55ddb4b37cad"),
    alt: "Antique letterpress type blocks arranged in a case — evoking the craft of a printed, branded outreach letter.",
    credit: {
      name: "Bank Phrom",
      url: "https://unsplash.com/@bank_phrom",
    },
  },
} satisfies Record<string, MarketingImage>;

export const ABOUT_HERO: MarketingImage = {
  src: unsplash("1513026705753-bc3fffca8bf4"),
  alt: "Aerial view of central London at dawn — the living planning record Plott turns into a competitive advantage.",
  credit: {
    name: "Giammarco Boscaro",
    url: "https://unsplash.com/@giamboscaro",
  },
};

export const HOW_IT_WORKS_HERO: MarketingImage = {
  src: unsplash("1523461308130-ee3bdfb7aff8"),
  alt: "Tower Bridge rising through morning mist over the Thames — map-first planning intelligence, end to end.",
  credit: {
    name: "Charles Postiaux",
    url: "https://unsplash.com/@charlycharly",
  },
};

export const HOW_IT_WORKS_AGENT_SECTION: MarketingImage = {
  src: unsplash("1454537468202-b7ff71d51c2e"),
  alt: "Tower Bridge and the City of London at dusk — pipelines that keep running after you have gone home.",
  credit: {
    name: "Luca Micheli",
    url: "https://unsplash.com/@lucamicheli",
  },
};

export const GALLERY_BACKDROPS = [
  {
    src: unsplash("1523461308130-ee3bdfb7aff8"),
    alt: "Tower Bridge emerging from morning fog.",
    credit: { name: "Charles Postiaux", url: "https://unsplash.com/@charlycharly" },
  },
  {
    src: unsplash("1454537468202-b7ff71d51c2e"),
    alt: "Tower Bridge at dusk with the City of London skyline behind.",
    credit: { name: "Luca Micheli", url: "https://unsplash.com/@lucamicheli" },
  },
  {
    src: unsplash("1448906654166-444d494666b3"),
    alt: "St Paul's Cathedral dome seen across the Millennium Bridge.",
    credit: { name: "Karl Moran", url: "https://unsplash.com/@karlmoran" },
  },
  {
    src: unsplash("1516438157453-dab383f58712"),
    alt: "Classical London architecture on Regent Street.",
    credit: { name: "Dil", url: "https://unsplash.com/@thevisualiza" },
  },
  {
    src: unsplash("1480449649358-ee14c6ee0b17"),
    alt: "London rooftops and classical facade under grey sky.",
    credit: { name: "Giammarco", url: "https://unsplash.com/@giamboscaro" },
  },
] satisfies MarketingImage[];
