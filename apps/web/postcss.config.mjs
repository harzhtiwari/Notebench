export default {
  plugins: {
    "@tailwindcss/postcss": {},
    // Resolves the @custom-media definitions from tokens.media.css so
    // `@media (--nb-md)` (and friends) work in hand-written CSS. Tailwind
    // theme breakpoints (sm:/md:/lg:) are the preferred path for components.
    "postcss-custom-media": {},
  },
};
