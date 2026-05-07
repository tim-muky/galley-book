// Single source of truth for the recipe-photos public URL prefix (GAL-297).
// Lets the host change in env without touching seven call sites.

const RECIPE_PHOTOS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos`;

export const recipePhotoUrl = (path: string) => `${RECIPE_PHOTOS_URL}/${path}`;
