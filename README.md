# Follow the Cash Visualizer

An interactive cash flow visualization tool that demonstrates the sequence: **A → C → D → B/F** for understanding corporate cash flow allocation.

## 🚀 Live Demo

Visit: [https://xuxiguo.github.io/follow-the-cash-visualizer/](https://xuxiguo.github.io/follow-the-cash-visualizer/)

## 📈 Features

- **Interactive Cash Flow Simulation**: Adjust parameters and watch cash flow in real-time
- **Animated Visualization**: SVG-based animation showing cash movements between entities
- **Dual Display Modes**: 
  - Simple tabular output
  - Animated flow diagram
- **Educational Tools**: Built-in self-tests and validation
- **Professional UI**: Clean, responsive design with Tailwind CSS

## 🔄 Cash Flow Sequence

1. **A - Issue Securities**: Financial markets → Firm cash
2. **C - Free Cash Flow**: Assets → Firm cash (can be positive or negative)
3. **D - Taxes & Stakeholders**: Firm cash → Government & Stakeholders (only on positive C)
4. **B - Invest in Assets**: Firm cash → Assets (allocation %)
5. **F - Pay Financial Markets**: Firm cash → Financial markets (allocation %)
6. **Retain**: Remaining cash stays in Firm cash

## 🎛️ Controls

- **Starting Balances**: Set initial firm cash and assets
- **Issue Amount (A)**: New securities issued from financial markets
- **Asset FCF Yield (C)**: Percentage return on assets (can be negative)
- **Tax & Stakeholder Rate (D)**: Percentage of positive cash flow to government/stakeholders
- **Post-C Allocation**: Distribute available cash between:
  - Invest in Assets (B)
  - Pay Financial Markets (F)
  - Retain in Firm Cash (auto-calculated remainder)

## 🛠️ Development

Built with:
- **React 18** + **TypeScript**
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **SVG animations** for cash flow visualization

### Local Development

```bash
npm install
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview
```

## 📊 Educational Context

This visualizer helps students understand:
- Corporate cash flow allocation decisions
- The relationship between operational cash generation and investment/financing decisions
- How cash flows between different corporate stakeholders
- The impact of various financial policies on cash distribution

## 🔬 Validation

The application includes comprehensive self-tests that verify:
- Correct sequence ordering (A → C → D → B/F)
- Proper handling of negative cash flows
- Allocation logic constraints
- Mathematical accuracy of cash flow calculations

---

*Part of FIN3010 Financial Management course materials*

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
