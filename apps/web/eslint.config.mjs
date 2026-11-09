import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships flat-config arrays; spread them directly.
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "src/lib/api-client/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
