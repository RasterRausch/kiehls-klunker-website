import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const productSchema = ({ image }: { image: () => ReturnType<typeof z.any> }) =>
  z.object({
    name: z.string(),
    tagline: z.string().optional(),
    // Englische Übersetzungen — manuell gepflegt bis Etsy-EN-Sync bereitsteht.
    // Fehlt ein Feld, fällt der EN-Shop auf den DE-Inhalt zurück.
    nameEn: z.string().optional(),
    taglineEn: z.string().optional(),
    bodyEn: z.string().optional(),
    category: z.enum(['haarforken', 'haarstaebe', 'haarspangen', 'zopfhalter', 'ohrschmuck']),
    price: z.number(),
    priceDE: z.number().optional(),
    priceUS: z.number().optional(),
    priceWorld: z.number().optional(),
    currency: z.string().default('EUR'),
    stripeProductId: z.string().optional(),
    stripePriceId: z.string().optional(),
    images: z.array(image()),
    material: z.string().optional(),
    weight: z.string().optional(),
    dimensions: z.string().optional(),
    production: z.string().optional(),
    sizes: z.array(z.string()).default([]),
    colors: z.array(z.string()).default([]),
    // Generische Varianten aus Etsy-Inventory (Länge, Farbe, Haartyp, …)
    variants: z.array(z.object({
      name: z.string(),
      values: z.array(z.string()),
    })).default([]),
    available: z.boolean().default(true),
    featured: z.boolean().default(false),
    personalizable: z.boolean().default(false),
    personalizationPrompt: z.string().optional(),
    order: z.number().default(0),
    stock: z.number().int().optional(),
    numFavorers: z.number().int().optional(),
    etsyListingId: z.number().optional(),
    etsyUrl: z.string().optional(),
  });

const products = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/products' }),
  schema: productSchema,
});

// Einzelstücke — bereits verkaufte Unikate, nur zur Inspiration auf
// /einzelstuecke. Kein Preis, keine Varianten, keine Produktseite.
const einzelstuecke = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/einzelstuecke' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      material: z.enum(['Titan', 'Messing', 'Silber', 'Neusilber', 'Bronze']),
      // Zusätzliche Beschreibung zu Stein/Einlage, optional
      stones: z.string().optional(),
      images: z.array(image()).min(1),
      order: z.number().default(0),
      // Wenn Kathrin das Material / den Namen verifizieren muss
      needsReview: z.boolean().default(false),
    }),
});

const reviews = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/reviews' }),
  schema: z.object({
    author: z.string(),
    rating: z.number().int().min(1).max(5),
    date: z.date(),
    productName: z.string().optional(),
    productRef: z.string().optional(),
    source: z.enum(['etsy', 'direct']).default('etsy'),
    verified: z.boolean().default(true),
    featured: z.boolean().default(false),
  }),
});

export const collections = { products, einzelstuecke, reviews };
