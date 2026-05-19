import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createElement } from "react";

// GAL-318: render a printable cookbook PDF from a galley's recipes.
// One recipe per page after a cover page; ingredients on the left,
// steps numbered on the right. Pure server-side, no headless browser.

interface Recipe {
  id: string;
  name: string | null;
  description: string | null;
  servings: number | null;
  prep_time: number | null;
  ingredients: Array<{
    id: string;
    name: string;
    amount: number | null;
    unit: string | null;
    sort_order: number | null;
    group_name: string | null;
  }>;
  preparation_steps: Array<{
    id: string;
    step_number: number;
    instruction: string;
  }>;
}

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#252729",
  },
  cover: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
  },
  coverTitle: {
    fontSize: 36,
    marginBottom: 16,
  },
  coverSub: {
    fontSize: 12,
    color: "#474747",
  },
  tocTitle: {
    fontSize: 18,
    marginBottom: 16,
    marginTop: 12,
  },
  tocItem: {
    fontSize: 11,
    marginBottom: 4,
    color: "#252729",
  },
  recipeTitle: {
    fontSize: 22,
    marginBottom: 8,
  },
  recipeMeta: {
    fontSize: 10,
    color: "#474747",
    marginBottom: 16,
  },
  description: {
    fontSize: 10,
    color: "#474747",
    marginBottom: 16,
    lineHeight: 1.4,
  },
  twoCol: {
    flexDirection: "row",
    gap: 24,
  },
  colLeft: { flex: 1 },
  colRight: { flex: 1.4 },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    color: "#474747",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  ingredient: {
    fontSize: 10,
    marginBottom: 4,
    color: "#252729",
  },
  step: {
    fontSize: 10,
    marginBottom: 8,
    color: "#252729",
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#888",
  },
});

function formatAmount(amount: number | null, unit: string | null): string {
  if (amount == null && !unit) return "";
  const numStr =
    amount == null
      ? ""
      : Number.isInteger(amount)
        ? String(amount)
        : amount.toFixed(2).replace(/\.?0+$/, "");
  return [numStr, unit].filter(Boolean).join(" ").trim();
}

function CoverPage({ galleyName }: { galleyName: string }) {
  return createElement(
    Page,
    { size: "A4", style: styles.page },
    createElement(
      View,
      { style: styles.cover },
      createElement(Text, { style: styles.coverTitle }, galleyName),
      createElement(
        Text,
        { style: styles.coverSub },
        "exported from galleybook",
      ),
    ),
    createElement(
      View,
      { style: styles.footer, fixed: true },
      createElement(Text, {}, "galleybook"),
      createElement(
        Text,
        { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${pageNumber} / ${totalPages}` },
      ),
    ),
  );
}

function TocPage({ recipes }: { recipes: Recipe[] }) {
  return createElement(
    Page,
    { size: "A4", style: styles.page },
    createElement(Text, { style: styles.tocTitle }, "Contents"),
    ...recipes.map((r, idx) =>
      createElement(
        Text,
        { key: r.id, style: styles.tocItem },
        `${idx + 1}.  ${r.name ?? "Untitled"}`,
      ),
    ),
    createElement(
      View,
      { style: styles.footer, fixed: true },
      createElement(Text, {}, "galleybook"),
      createElement(
        Text,
        { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${pageNumber} / ${totalPages}` },
      ),
    ),
  );
}

function RecipePage({ recipe }: { recipe: Recipe }) {
  const ingredients = [...recipe.ingredients].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const steps = [...recipe.preparation_steps].sort(
    (a, b) => a.step_number - b.step_number,
  );
  const metaParts: string[] = [];
  if (recipe.servings != null) metaParts.push(`${recipe.servings} servings`);
  if (recipe.prep_time != null) metaParts.push(`${recipe.prep_time} min`);

  return createElement(
    Page,
    { size: "A4", style: styles.page, key: recipe.id },
    createElement(Text, { style: styles.recipeTitle }, recipe.name ?? "Untitled"),
    metaParts.length > 0
      ? createElement(Text, { style: styles.recipeMeta }, metaParts.join(" · "))
      : null,
    recipe.description
      ? createElement(Text, { style: styles.description }, recipe.description)
      : null,
    createElement(
      View,
      { style: styles.twoCol },
      createElement(
        View,
        { style: styles.colLeft },
        createElement(Text, { style: styles.sectionLabel }, "Ingredients"),
        ...ingredients.map((ing) =>
          createElement(
            Text,
            { key: ing.id, style: styles.ingredient },
            `${formatAmount(ing.amount, ing.unit)}${formatAmount(ing.amount, ing.unit) ? "  " : ""}${ing.name}`,
          ),
        ),
      ),
      createElement(
        View,
        { style: styles.colRight },
        createElement(Text, { style: styles.sectionLabel }, "Steps"),
        ...steps.map((s) =>
          createElement(
            Text,
            { key: s.id, style: styles.step },
            `${s.step_number}.  ${s.instruction}`,
          ),
        ),
      ),
    ),
    createElement(
      View,
      { style: styles.footer, fixed: true },
      createElement(Text, {}, "galleybook"),
      createElement(
        Text,
        { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${pageNumber} / ${totalPages}` },
      ),
    ),
  );
}

export async function renderGalleyPdf(input: {
  galleyName: string;
  recipes: Recipe[];
}): Promise<Buffer> {
  const doc = createElement(
    Document,
    {},
    createElement(CoverPage, { galleyName: input.galleyName }),
    input.recipes.length > 0
      ? createElement(TocPage, { recipes: input.recipes })
      : null,
    ...input.recipes.map((r) => createElement(RecipePage, { recipe: r, key: r.id })),
  );
  return renderToBuffer(doc);
}
