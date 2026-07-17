/**
 * ESLint yapılandırması.
 *
 * NOT: paket `eslint . --ext ts,tsx` script'ini taşıyordu ama HİÇBİR config dosyası yoktu →
 * `pnpm lint` her koşuda exit 2 veriyordu ve CI'ın web job'ı bu yüzden hep kırmızıydı.
 * Eklentiler zaten kuruluydu; eksik olan tek şey buydu.
 *
 * Kurallar tsc'nin YAKALAYAMADIKLARINA odaklanır (tip kontrolü ayrı job'da):
 * React Hooks kuralları ve gerçek hata kaynakları. Stil kuralları YOK — biçimlendirme
 * Prettier'ın işi (lint-format job'ı); ikisini çakıştırmak gürültü üretir.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'vite.config.ts', 'public'],
  rules: {
    // Kasıtlı any'ler var (üçüncü parti/dinamik payload'lar); tsc strict zaten koruyor
    '@typescript-eslint/no-explicit-any': 'off',
    // Kullanılmayan değişken GERÇEK bir hata sinyali; _ önekli olanlar kasıtlı
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Boş catch bloklarıyla hata yutmak bu projede tekrarlayan bir hataydı → görünür olsun
    'no-empty': ['warn', { allowEmptyCatch: false }],
  },
};
