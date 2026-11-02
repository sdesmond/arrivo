import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// GitHub Pages project site: https://sdesmond.github.io/arrivo/
export default defineConfig({
  site: "https://sdesmond.github.io",
  base: "/arrivo",
  integrations: [
    starlight({
      title: "Arrivo",
      description: "User guide and self-hosting docs for Arrivo, a travel itinerary planner.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/brand.css", "./src/styles/home.css"],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
        Hero: "./src/components/home/HomeHero.astro",
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/sdesmond/arrivo" }],
      editLink: { baseUrl: "https://github.com/sdesmond/arrivo/edit/main/site/" },
      sidebar: [
        { label: "Get started", slug: "get-started" },
        {
          label: "User guide",
          items: [
            { slug: "guide/trips" },
            { slug: "guide/day-planning" },
            { slug: "guide/map" },
            { slug: "guide/spending" },
            { slug: "guide/documents" },
            { slug: "guide/packing" },
            { slug: "guide/templates" },
            { slug: "guide/sharing" },
            { slug: "guide/travel-history" },
            { slug: "guide/account" },
            { slug: "guide/admin" },
          ],
        },
        {
          label: "Reference",
          items: [{ slug: "reference/roles" }, { slug: "reference/glossary" }],
        },
        { label: "Self-hosting", slug: "self-hosting" },
        {
          label: "Support",
          items: [{ slug: "support/faq" }, { slug: "support/troubleshooting" }, { slug: "changelog" }],
        },
      ],
    }),
  ],
});
